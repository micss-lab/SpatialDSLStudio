import { ApiError } from '../middleware';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import {
  ConcreteSyntax,
  ConcreteSyntax2D,
  ConcreteSyntaxEdge,
  MetaClass,
  MetaReference,
  Metamodel,
  RepresentationDescription,
  RepresentationEdgeMapping,
  RepresentationPinMapping,
  SiriusCompatibilityReport,
  SiriusExportOptions,
  SiriusExportResult,
  SiriusImportOptions,
  SiriusImportResult,
  SiriusInteropWarning,
  SiriusOdesignPreview,
  SiriusSourceFormat,
  UserRole,
  Viewpoint,
} from '../../../shared/types';
import { metamodelService } from './metamodel.service';
import { viewpointService } from './viewpoint.service';

interface XmlNode {
  name: string;
  localName: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
  parent?: XmlNode;
}

interface ParseContext {
  metamodel?: Metamodel;
  report: SiriusCompatibilityReport;
  preserveSiriusIds: boolean;
}

interface ImportOdesignInput {
  content: string;
  metamodelId: string;
  options?: Partial<SiriusImportOptions>;
}

interface ValidateInput {
  content: string;
  sourceFormat?: SiriusSourceFormat;
  metamodelId?: string;
  options?: Partial<SiriusImportOptions>;
}

interface ExportInput {
  metamodelId: string;
  viewpointIds?: string[];
  options?: Partial<SiriusExportOptions>;
}

const MAX_XML_BYTES = 1024 * 1024;
const MAX_ZIP_BYTES = 5 * 1024 * 1024;
const MAX_XML_NODES = 5000;
const MAX_XML_DEPTH = 80;

const DEFAULT_IMPORT_OPTIONS: SiriusImportOptions = {
  importEcore: false,
  importXmi: false,
  importOdesign: true,
  importAird: false,
  failOnUnsupportedFeatures: false,
  preserveSiriusIds: true,
};

const DEFAULT_EXPORT_OPTIONS: SiriusExportOptions = {
  includeEcore: false,
  includeXmi: false,
  includeOdesign: true,
  includeAird: false,
  includeSpatialDslSidecar: false,
  failOnUnsupportedFeatures: false,
};

const UNSUPPORTED_TAG_CODES: Record<string, string> = {
  additionalLayers: 'SIRIUS_LAYERS_UNSUPPORTED',
  allTools: 'SIRIUS_TOOL_SECTION_UNSUPPORTED',
  audits: 'SIRIUS_VALIDATION_UNSUPPORTED',
  conditionalStyles: 'SIRIUS_CONDITIONAL_STYLES_UNSUPPORTED',
  conditionnalStyles: 'SIRIUS_CONDITIONAL_STYLES_UNSUPPORTED',
  filters: 'SIRIUS_FILTERS_UNSUPPORTED',
  javaExtensions: 'SIRIUS_JAVA_SERVICES_UNSUPPORTED',
  ownedJavaExtensions: 'SIRIUS_JAVA_SERVICES_UNSUPPORTED',
  ownedRules: 'SIRIUS_VALIDATION_UNSUPPORTED',
  quickFixes: 'SIRIUS_QUICK_FIXES_UNSUPPORTED',
  reusedMappings: 'SIRIUS_REUSED_MAPPINGS_UNSUPPORTED',
  styleCustomizations: 'SIRIUS_CONDITIONAL_STYLES_UNSUPPORTED',
  validationSet: 'SIRIUS_VALIDATION_UNSUPPORTED',
};

class SiriusInteropService {
  async validate(input: ValidateInput, userId: string): Promise<SiriusOdesignPreview> {
    const sourceFormat = input.sourceFormat || 'odesign';
    const metamodel = input.metamodelId
      ? await this.getReadableMetamodel(input.metamodelId, userId)
      : undefined;

    const options = {
      ...DEFAULT_IMPORT_OPTIONS,
      ...input.options,
    };

    if (sourceFormat === 'odesign') {
      return this.parseOdesign(input.content, metamodel, options);
    }

    if (sourceFormat === 'project-zip') {
      return this.validateProjectZip(input.content, metamodel, options);
    }

    if (sourceFormat === 'aird') {
      return this.validateAird(input.content);
    }

    return this.validateSemanticXml(input.content, sourceFormat);
  }

  async importOdesign(input: ImportOdesignInput, userId: string, userRole: UserRole): Promise<SiriusImportResult> {
    const options = { ...DEFAULT_IMPORT_OPTIONS, ...input.options };
    if (!options.importOdesign) {
      throw new ApiError(400, 'importOdesign must be enabled to import .odesign content');
    }

    const metamodel = await this.getReadableMetamodel(input.metamodelId, userId);
    const preview = this.parseOdesign(input.content, metamodel, options);

    if (!preview.report.supported) {
      throw new ApiError(400, 'Sirius .odesign is not supported for import');
    }

    if (options.failOnUnsupportedFeatures && preview.report.droppedFeatures.length > 0) {
      throw new ApiError(400, 'Sirius .odesign contains unsupported features');
    }

    const created: Viewpoint[] = [];
    for (const viewpoint of preview.viewpoints) {
      created.push(await viewpointService.create(viewpoint, userId, userRole));
    }

    return {
      viewpoints: created,
      report: preview.report,
    };
  }

  async exportOdesign(input: ExportInput, userId: string): Promise<SiriusExportResult> {
    const options = { ...DEFAULT_EXPORT_OPTIONS, ...input.options };
    if (!options.includeOdesign) {
      throw new ApiError(400, 'includeOdesign must be enabled to export .odesign content');
    }

    const metamodel = await this.getReadableMetamodel(input.metamodelId, userId);
    const allViewpoints = await viewpointService.getAll(userId, input.metamodelId);
    if (input.viewpointIds?.length) {
      const availableIds = new Set(allViewpoints.map(viewpoint => viewpoint.id));
      const missingIds = input.viewpointIds.filter(viewpointId => !availableIds.has(viewpointId));
      if (missingIds.length > 0) {
        throw new ApiError(404, `Requested viewpoint IDs not found: ${missingIds.join(', ')}`);
      }
    }
    const selected = input.viewpointIds?.length
      ? allViewpoints.filter(viewpoint => input.viewpointIds!.includes(viewpoint.id))
      : allViewpoints;

    if (selected.length === 0) {
      throw new ApiError(404, 'No viewpoints found for Sirius .odesign export');
    }

    const report = this.createReport('odesign', 'sirius-project');
    const content = this.buildOdesignXml(metamodel, selected, report);
    if (options.failOnUnsupportedFeatures && report.droppedFeatures.length > 0) {
      throw new ApiError(400, 'SpatialDSL project contains data unsupported by Sirius .odesign export');
    }

    this.finalizeReport(report);
    return {
      filename: `${this.toFileSlug(metamodel.name || 'spatialdsl')}.odesign`,
      content,
      report,
    };
  }

  private async getReadableMetamodel(metamodelId: string, userId: string): Promise<Metamodel> {
    const metamodel = await metamodelService.getById(metamodelId, userId);
    if (!metamodel) {
      throw new ApiError(404, 'Metamodel not found');
    }
    return metamodel;
  }

  private parseOdesign(
    content: string,
    metamodel: Metamodel | undefined,
    options: SiriusImportOptions
  ): SiriusOdesignPreview {
    const root = this.parseXml(content);
    const group = root.children.find(child => child.localName === 'Group') || root.children[0];
    const report = this.createReport('odesign', 'spatialdsl');
    const context: ParseContext = {
      metamodel,
      report,
      preserveSiriusIds: options.preserveSiriusIds,
    };

    this.scanUnsupportedFeatures(root, report);

    if (!group || group.localName !== 'Group') {
      this.addWarning(report, 'warnings', {
        severity: 'warning',
        code: 'SIRIUS_GROUP_NOT_FOUND',
        message: 'Expected a Sirius description:Group root element.',
      });
    }

    const groupName = group ? this.getAttr(group, 'name') : undefined;
    const viewpointNodes = this.childrenByLocal(group || root, 'ownedViewpoints');
    if (viewpointNodes.length === 0) {
      this.addWarning(report, 'unresolvedReferences', {
        severity: 'error',
        code: 'SIRIUS_VIEWPOINTS_NOT_FOUND',
        message: 'No ownedViewpoints were found in the .odesign file.',
      });
    }

    const usedViewpointIds = new Set<string>();
    const viewpoints = viewpointNodes.map((viewpointNode, index) => {
      const sourceId = this.getSourceId(viewpointNode) || this.getAttr(viewpointNode, 'name') || `viewpoint-${index + 1}`;
      const viewpointId = this.uniqueId(
        options.preserveSiriusIds ? this.toStableId(sourceId) : `sirius-viewpoint-${index + 1}`,
        usedViewpointIds
      );
      const representationDescriptions = this.parseRepresentationDescriptions(viewpointNode, viewpointId, context);

      return {
        id: viewpointId,
        name: this.getAttr(viewpointNode, 'name') || `Imported Viewpoint ${index + 1}`,
        description: this.getAttr(viewpointNode, 'documentation'),
        metamodelId: metamodel?.id || '',
        representationDescriptions,
        sharedConcreteSyntaxByMetaClassId: {},
        isDefault: index === 0,
      };
    });

    this.finalizeReport(report);
    return { groupName, viewpoints, report };
  }

  private async validateProjectZip(
    content: string,
    metamodel: Metamodel | undefined,
    options: SiriusImportOptions
  ): Promise<SiriusOdesignPreview> {
    const report = this.createReport('project-zip', 'spatialdsl');
    const buffer = this.decodeZipPayload(content);
    if (buffer.byteLength > MAX_ZIP_BYTES) {
      throw new ApiError(413, 'Sirius project ZIP exceeds the 5 MB compatibility limit');
    }

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch (error) {
      throw new ApiError(400, 'Invalid Sirius project ZIP payload');
    }

    const files = Object.values(zip.files).filter(file => !file.dir);
    for (const file of files) {
      this.assertSafeProjectPath((file as any).unsafeOriginalName || file.name);
    }

    const airdFiles = files.filter(file => file.name.toLowerCase().endsWith('.aird'));
    airdFiles.forEach(file => {
      this.addWarning(report, 'droppedFeatures', {
        severity: 'warning',
        code: 'SIRIUS_DEFERRED_AIRD',
        message: `Sirius session file "${file.name}" was detected but .aird import is deferred.`,
        sourcePath: file.name,
      });
    });

    files
      .filter(file => /\.(ecore|xmi)$/i.test(file.name))
      .forEach(file => {
        this.addWarning(report, 'warnings', {
          severity: 'info',
          code: 'SIRIUS_SEMANTIC_FILE_DELEGATED',
          message: `Semantic file "${file.name}" should be imported through the Ecore/XMI workflow.`,
          sourcePath: file.name,
        });
      });

    const odesignFile = files.find(file => file.name.toLowerCase().endsWith('.odesign'));
    if (!odesignFile) {
      this.addWarning(report, 'unresolvedReferences', {
        severity: 'error',
        code: 'SIRIUS_ODSIGN_NOT_FOUND',
        message: 'The Sirius project ZIP does not contain an .odesign Viewpoint Specification Model.',
      });
      this.finalizeReport(report);
      return { viewpoints: [], report };
    }

    const odesignContent = await odesignFile.async('text');
    const preview = this.parseOdesign(odesignContent, metamodel, options);
    const mergedReport = this.mergeReports(report, preview.report, 'project-zip');
    this.addWarning(mergedReport, 'warnings', {
      severity: 'info',
      code: 'SIRIUS_PROJECT_ZIP_ODSIGN_IMPORTED',
      message: `Validated "${odesignFile.name}" from the Sirius project ZIP.`,
      sourcePath: odesignFile.name,
    });
    this.finalizeReport(mergedReport);

    return {
      groupName: preview.groupName,
      viewpoints: preview.viewpoints,
      report: mergedReport,
    };
  }

  private validateAird(content: string): SiriusOdesignPreview {
    const report = this.createReport('aird', 'spatialdsl');
    const root = this.parseXml(content);
    const documentRoot = root.children[0];

    if (!documentRoot || !['DAnalysis', 'analysis'].includes(documentRoot.localName)) {
      this.addWarning(report, 'warnings', {
        severity: 'warning',
        code: 'SIRIUS_AIRD_ROOT_UNEXPECTED',
        message: 'The .aird XML was parsed, but the expected Sirius DAnalysis root was not found.',
      });
    }

    this.addWarning(report, 'droppedFeatures', {
      severity: 'warning',
      code: 'SIRIUS_DEFERRED_AIRD',
      message: 'Sirius .aird session and representation data is recognized but not imported in this compatibility slice.',
      sourcePath: documentRoot ? this.nodePath(documentRoot) : undefined,
      sourceElementId: documentRoot ? this.getSourceId(documentRoot) : undefined,
    });

    this.finalizeReport(report);
    return { viewpoints: [], report };
  }

  private validateSemanticXml(content: string, sourceFormat: SiriusSourceFormat): SiriusOdesignPreview {
    const report = this.createReport(sourceFormat, 'spatialdsl');
    this.parseXml(content);
    this.addWarning(report, 'warnings', {
      severity: 'info',
      code: 'SIRIUS_SEMANTIC_FORMAT_DELEGATED',
      message: `${sourceFormat} files are handled by the semantic Ecore/XMI import workflow, not by the Sirius viewpoint importer.`,
    });
    this.finalizeReport(report);
    return { viewpoints: [], report };
  }

  private parseRepresentationDescriptions(
    viewpointNode: XmlNode,
    viewpointId: string,
    context: ParseContext
  ): RepresentationDescription[] {
    const usedIds = new Set<string>();
    const representations: RepresentationDescription[] = [];
    const nodes = this.childrenByLocal(viewpointNode, 'ownedRepresentations');

    nodes.forEach((node, index) => {
      const type = this.getAttrByLocal(node, 'type') || node.name;
      if (!type.includes('DiagramDescription')) {
        this.addWarning(context.report, 'droppedFeatures', {
          severity: 'warning',
          code: 'SIRIUS_REPRESENTATION_KIND_UNSUPPORTED',
          message: `Only DiagramDescription is supported for .odesign import. Dropped ${type}.`,
          sourcePath: this.nodePath(node),
          sourceElementId: this.getSourceId(node),
        });
        return;
      }

      const sourceId = this.getSourceId(node) || this.getAttr(node, 'name') || `diagram-${index + 1}`;
      const id = this.uniqueId(
        context.preserveSiriusIds ? this.toStableId(sourceId) : `${viewpointId}-diagram-${index + 1}`,
        usedIds
      );
      const mapping = this.parseDiagramMappings(node, context);

      representations.push({
        id,
        name: this.getAttr(node, 'name') || `Imported Diagram ${index + 1}`,
        viewpointId,
        kind: 'diagram',
        visibleMetaClassIds: Array.from(mapping.visibleMetaClassIds),
        creatableMetaClassIds: Array.from(mapping.creatableMetaClassIds),
        ...(Object.keys(mapping.concreteSyntaxByMetaClassId).length > 0 && {
          concreteSyntaxByMetaClassId: mapping.concreteSyntaxByMetaClassId,
        }),
        ...(Object.keys(mapping.concreteSyntaxByReferenceId).length > 0 && {
          concreteSyntaxByReferenceId: mapping.concreteSyntaxByReferenceId,
        }),
        ...(mapping.edgeMappings.length > 0 && { edgeMappings: mapping.edgeMappings }),
        ...(mapping.pinMappings.length > 0 && { pinMappings: mapping.pinMappings }),
        ...(mapping.toolDefinitions.length > 0 && { toolDefinitions: mapping.toolDefinitions }),
        isDefault: representations.length === 0,
      });
    });

    return representations;
  }

  private parseDiagramMappings(node: XmlNode, context: ParseContext) {
    const visibleMetaClassIds = new Set<string>();
    const creatableMetaClassIds = new Set<string>();
    const concreteSyntaxByMetaClassId: Record<string, ConcreteSyntax> = {};
    const concreteSyntaxByReferenceId: Record<string, ConcreteSyntaxEdge> = {};
    const edgeMappings: RepresentationEdgeMapping[] = [];
    const pinMappings: RepresentationPinMapping[] = [];
    const toolDefinitions: NonNullable<RepresentationDescription['toolDefinitions']> = [];

    const domainClass = this.resolveMetaClass(this.getAttr(node, 'domainClass'), context, node);
    if (domainClass) {
      visibleMetaClassIds.add(domainClass.id);
    }

    const supportedLayers = this.supportedLayerNodes(node, context.report);
    const nodeMappings = this.descendantsIn(supportedLayers, 'nodeMappings')
      .concat(this.descendantsIn(supportedLayers, 'containerMappings'));
    nodeMappings.forEach(mappingNode => {
      const metaClass = this.resolveMetaClass(this.getAttr(mappingNode, 'domainClass'), context, mappingNode);
      if (!metaClass) return;

      visibleMetaClassIds.add(metaClass.id);
      if (!metaClass.abstract) {
        creatableMetaClassIds.add(metaClass.id);
      }

      const concreteSyntax = this.parseNodeStyle(mappingNode);
      if (concreteSyntax) {
        concreteSyntaxByMetaClassId[metaClass.id] = concreteSyntax;
      }
    });

    this.descendantsIn(supportedLayers, 'borderedNodeMappings').forEach((mappingNode, index) => {
      const pinMetaClass = this.resolveMetaClass(this.getAttr(mappingNode, 'domainClass'), context, mappingNode);
      if (!pinMetaClass) return;

      visibleMetaClassIds.add(pinMetaClass.id);
      if (!pinMetaClass.abstract) {
        creatableMetaClassIds.add(pinMetaClass.id);
      }

      const ownerMetaClass = this.resolveOwnerMetaClass(mappingNode, context);
      const pinMapping: RepresentationPinMapping = {
        id: this.toStableId(this.getSourceId(mappingNode) || this.getAttr(mappingNode, 'name') || `pin-${index + 1}`),
        pinMetaClassIds: [pinMetaClass.id],
        ownerMetaClassIds: ownerMetaClass ? [ownerMetaClass.id] : [],
        direction: 'inout',
        allowedSides: ['top', 'right', 'bottom', 'left'],
        defaultSide: 'right',
        defaultOffsetRatio: 0.5,
      };
      pinMappings.push(pinMapping);

      const concreteSyntax = this.parseNodeStyle(mappingNode);
      if (concreteSyntax) {
        concreteSyntaxByMetaClassId[pinMetaClass.id] = concreteSyntax;
      }
    });

    this.descendantsIn(supportedLayers, 'edgeMappings').forEach((mappingNode, index) => {
      const reference = this.resolveReferenceMapping(mappingNode, context);
      const edgeId = this.toStableId(this.getSourceId(mappingNode) || this.getAttr(mappingNode, 'name') || `edge-${index + 1}`);
      const edgeStyle = this.parseEdgeStyle(mappingNode);
      const edgeMapping: RepresentationEdgeMapping = {
        id: edgeId,
        ...(reference && {
          referenceId: reference.id,
          referenceName: reference.name,
        }),
        ...(edgeStyle && { concreteSyntax: edgeStyle }),
      };
      edgeMappings.push(edgeMapping);

      if (reference && edgeStyle) {
        concreteSyntaxByReferenceId[reference.id] = edgeStyle;
      }

      if (!reference) {
        this.addWarning(context.report, 'unresolvedReferences', {
          severity: 'warning',
          code: 'SIRIUS_EDGE_REFERENCE_UNRESOLVED',
          message: `Could not resolve edge mapping "${this.getAttr(mappingNode, 'name') || edgeId}" to a SpatialDSL reference.`,
          sourcePath: this.nodePath(mappingNode),
          sourceElementId: this.getSourceId(mappingNode),
        });
      }
    });

    this.descendantsIn(supportedLayers, 'toolSections').forEach(section => {
      this.children(section).forEach((toolNode, index) => {
        const name = this.getAttr(toolNode, 'name');
        if (!name) return;
        toolDefinitions.push({
          id: this.toStableId(this.getSourceId(toolNode) || name || `tool-${index + 1}`),
          name,
          type: `sirius:${toolNode.localName}`,
          payload: {
            sourcePath: this.nodePath(toolNode),
          },
        });
      });
    });

    return {
      visibleMetaClassIds,
      creatableMetaClassIds,
      concreteSyntaxByMetaClassId,
      concreteSyntaxByReferenceId,
      edgeMappings,
      pinMappings,
      toolDefinitions,
    };
  }

  private parseNodeStyle(mappingNode: XmlNode): ConcreteSyntax | undefined {
    const styleNode = this.children(mappingNode).find(child => child.localName === 'style' || child.localName.endsWith('Style'));
    if (!styleNode) return undefined;

    const type = this.getAttrByLocal(styleNode, 'type') || styleNode.name;
    const fillColor = this.parseColor(
      this.getAttr(styleNode, 'color')
      || this.getAttr(styleNode, 'backgroundColor')
      || this.getAttr(styleNode, 'labelColor')
    );
    const strokeColor = this.parseColor(this.getAttr(styleNode, 'borderColor'));
    const strokeWidth = this.parseNumber(this.getAttr(styleNode, 'borderSizeComputationExpression'));
    const width = this.parseNumber(this.getAttr(styleNode, 'widthComputationExpression'));
    const height = this.parseNumber(this.getAttr(styleNode, 'heightComputationExpression'));

    return {
      two_d: {
        shape: this.resolveShape(type),
        ...(fillColor && { fillColor }),
        ...(strokeColor && { strokeColor }),
        ...(strokeWidth && { strokeWidth }),
        ...(width && height && { defaultSize: { width, height } }),
      },
    };
  }

  private parseEdgeStyle(mappingNode: XmlNode): ConcreteSyntaxEdge | undefined {
    const styleNode = this.children(mappingNode).find(child => child.localName === 'style' || child.localName.endsWith('Style'));
    if (!styleNode) return undefined;

    const lineColor = this.parseColor(this.getAttr(styleNode, 'strokeColor') || this.getAttr(styleNode, 'color'));
    const lineWidth = this.parseNumber(this.getAttr(styleNode, 'sizeComputationExpression'));
    const targetArrow = this.getAttr(styleNode, 'targetArrow') || this.getAttr(styleNode, 'targetArrowStyle');

    return {
      ...(lineColor && { lineColor }),
      ...(lineWidth && { lineWidth }),
      ...(targetArrow && { arrowHead: targetArrow.toLowerCase().includes('diamond') ? 'diamond' : 'filled' }),
    };
  }

  private resolveOwnerMetaClass(mappingNode: XmlNode, context: ParseContext): MetaClass | undefined {
    let cursor = mappingNode.parent;
    while (cursor) {
      if (cursor.localName === 'nodeMappings' || cursor.localName === 'containerMappings') {
        return this.resolveMetaClass(this.getAttr(cursor, 'domainClass'), context, cursor);
      }
      cursor = cursor.parent;
    }
    return undefined;
  }

  private resolveMetaClass(value: string | undefined, context: ParseContext, node: XmlNode): MetaClass | undefined {
    if (!value) return undefined;
    if (!context.metamodel) {
      this.addWarning(context.report, 'unresolvedReferences', {
        severity: 'warning',
        code: 'SIRIUS_METAMODEL_NOT_SUPPLIED',
        message: `Cannot resolve Sirius domain class "${value}" without a metamodel.`,
        sourcePath: this.nodePath(node),
        sourceElementId: this.getSourceId(node),
      });
      return undefined;
    }

    const normalized = this.normalizeQualifiedName(value);
    const match = context.metamodel.classes.find(metaClass => {
      const candidates = [
        metaClass.id,
        metaClass.name,
        `${context.metamodel!.prefix}::${metaClass.name}`,
        `${context.metamodel!.uri}#//${metaClass.name}`,
      ];
      return candidates.some(candidate => this.normalizeQualifiedName(candidate) === normalized);
    });

    if (!match) {
      this.addWarning(context.report, 'unresolvedReferences', {
        severity: 'warning',
        code: 'SIRIUS_DOMAIN_CLASS_UNRESOLVED',
        message: `Could not resolve Sirius domain class "${value}" in metamodel "${context.metamodel.name}".`,
        sourcePath: this.nodePath(node),
        sourceElementId: this.getSourceId(node),
      });
    }

    return match;
  }

  private resolveReferenceMapping(mappingNode: XmlNode, context: ParseContext): MetaReference | undefined {
    if (!context.metamodel) return undefined;
    const referenceName = this.extractFeatureName(
      this.getAttr(mappingNode, 'targetFinderExpression')
      || this.getAttr(mappingNode, 'sourceFinderExpression')
      || this.getAttr(mappingNode, 'semanticCandidatesExpression')
      || this.getAttr(mappingNode, 'name')
    );
    if (!referenceName) return undefined;

    for (const metaClass of context.metamodel.classes) {
      const reference = (metaClass.references || []).find(candidate => (
        candidate.id === referenceName
        || candidate.name === referenceName
        || this.normalizeQualifiedName(candidate.name) === this.normalizeQualifiedName(referenceName)
      ));
      if (reference) return reference;
    }

    return undefined;
  }

  private buildOdesignXml(metamodel: Metamodel, viewpoints: Viewpoint[], report: SiriusCompatibilityReport): string {
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<description:Group xmi:version="2.0"',
      '    xmlns:xmi="http://www.omg.org/XMI"',
      '    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
      '    xmlns:description="http://www.eclipse.org/sirius/description/1.1.0"',
      '    xmlns:diagram="http://www.eclipse.org/sirius/diagram/description/1.1.0"',
      `    name="${this.escapeXml(metamodel.name)}">`,
    ];

    viewpoints.forEach(viewpoint => {
      lines.push(`  <ownedViewpoints xmi:id="${this.escapeXml(viewpoint.id)}" name="${this.escapeXml(viewpoint.name)}" modelFileExtension="${this.escapeXml(metamodel.prefix || metamodel.name)}">`);

      viewpoint.representationDescriptions.forEach(description => {
        if (description.kind !== 'diagram') {
          this.addWarning(report, 'droppedFeatures', {
            severity: 'warning',
            code: 'SPATIALDSL_REPRESENTATION_KIND_UNSUPPORTED',
            message: `Sirius .odesign export currently supports diagram descriptions only. Dropped ${description.kind} "${description.name}".`,
            spatialElementId: description.id,
          });
          return;
        }

        const domainClass = this.resolveExportDomainClass(metamodel, description);
        lines.push(`    <ownedRepresentations xmi:id="${this.escapeXml(description.id)}" xsi:type="diagram:DiagramDescription" name="${this.escapeXml(description.name)}"${domainClass ? ` domainClass="${this.escapeXml(domainClass)}"` : ''}>`);
        lines.push('      <defaultLayer name="Default">');

        const pinMappings = description.pinMappings || [];
        const pinMetaClassIds = new Set(pinMappings.flatMap(pinMapping => pinMapping.pinMetaClassIds));
        const emittedPinKeys = new Set<string>();

        description.visibleMetaClassIds.forEach(metaClassId => {
          if (pinMetaClassIds.has(metaClassId)) {
            return;
          }

          const metaClass = metamodel.classes.find(candidate => candidate.id === metaClassId);
          if (!metaClass) {
            this.addWarning(report, 'unresolvedReferences', {
              severity: 'warning',
              code: 'SPATIALDSL_METACLASS_UNRESOLVED',
              message: `Representation "${description.name}" references unknown metaclass "${metaClassId}".`,
              spatialElementId: metaClassId,
            });
            return;
          }

          const syntax = description.concreteSyntaxByMetaClassId?.[metaClass.id] || metaClass.concreteSyntax;
          lines.push(`        <nodeMappings xmi:id="${this.escapeXml(`${description.id}-${metaClass.id}-node`)}" name="${this.escapeXml(metaClass.name)}" domainClass="${this.escapeXml(this.toSiriusDomainClass(metamodel, metaClass))}">`);
          lines.push(`          ${this.buildNodeStyleXml(syntax)}`);

          pinMappings
            .filter(pinMapping => pinMapping.ownerMetaClassIds.includes(metaClass.id))
            .forEach(pinMapping => {
              pinMapping.pinMetaClassIds.forEach(pinMetaClassId => {
                const pinMetaClass = metamodel.classes.find(candidate => candidate.id === pinMetaClassId);
                if (!pinMetaClass) {
                  this.addWarning(report, 'unresolvedReferences', {
                    severity: 'warning',
                    code: 'SPATIALDSL_PIN_METACLASS_UNRESOLVED',
                    message: `Pin mapping "${pinMapping.id}" references unknown metaclass "${pinMetaClassId}".`,
                    spatialElementId: pinMetaClassId,
                  });
                  return;
                }
                const pinSyntax = description.concreteSyntaxByMetaClassId?.[pinMetaClass.id] || pinMetaClass.concreteSyntax;
                lines.push(`          <borderedNodeMappings xmi:id="${this.escapeXml(`${description.id}-${pinMapping.id}-${pinMetaClass.id}`)}" name="${this.escapeXml(pinMetaClass.name)}" domainClass="${this.escapeXml(this.toSiriusDomainClass(metamodel, pinMetaClass))}">`);
                lines.push(`            ${this.buildNodeStyleXml(pinSyntax)}`);
                lines.push('          </borderedNodeMappings>');
                emittedPinKeys.add(`${pinMapping.id}:${pinMetaClass.id}`);
              });
            });

          lines.push('        </nodeMappings>');
        });

        pinMappings.forEach(pinMapping => {
          pinMapping.pinMetaClassIds.forEach(pinMetaClassId => {
            if (emittedPinKeys.has(`${pinMapping.id}:${pinMetaClassId}`)) return;
            this.addWarning(report, 'droppedFeatures', {
              severity: 'warning',
              code: 'SPATIALDSL_PIN_OWNER_UNRESOLVED',
              message: `Pin mapping "${pinMapping.id}" could not be attached to an exported owner mapping.`,
              spatialElementId: pinMapping.id,
            });
          });
        });

        const edgeMappings = description.edgeMappings || [];
        const referenceIds = new Set(edgeMappings.map(mapping => mapping.referenceId).filter(Boolean));
        Object.keys(description.concreteSyntaxByReferenceId || {}).forEach(referenceId => referenceIds.add(referenceId));

        Array.from(referenceIds).forEach(referenceId => {
          const reference = this.findReference(metamodel, referenceId!);
          if (!reference) {
            this.addWarning(report, 'unresolvedReferences', {
              severity: 'warning',
              code: 'SPATIALDSL_REFERENCE_UNRESOLVED',
              message: `Representation "${description.name}" references unknown edge reference "${referenceId}".`,
              spatialElementId: referenceId,
            });
            return;
          }
          const syntax = description.concreteSyntaxByReferenceId?.[reference.id]
            || edgeMappings.find(mapping => mapping.referenceId === reference.id)?.concreteSyntax;
          lines.push(`        <edgeMappings xmi:id="${this.escapeXml(`${description.id}-${reference.id}-edge`)}" name="${this.escapeXml(reference.name)}" targetFinderExpression="feature:${this.escapeXml(reference.name)}">`);
          lines.push(`          ${this.buildEdgeStyleXml(syntax)}`);
          lines.push('        </edgeMappings>');
        });

        if (description.toolDefinitions?.length) {
          lines.push('        <toolSections name="Tools">');
          description.toolDefinitions.forEach(tool => {
            lines.push(`          <ownedTools xmi:id="${this.escapeXml(tool.id)}" name="${this.escapeXml(tool.name)}"/>`);
          });
          lines.push('        </toolSections>');
        }

        lines.push('      </defaultLayer>');
        lines.push('    </ownedRepresentations>');
      });

      lines.push('  </ownedViewpoints>');
    });

    lines.push('</description:Group>');
    return lines.join('\n');
  }

  private parseXml(content: string): XmlNode {
    if (!content || typeof content !== 'string') {
      throw new ApiError(400, 'XML content is required');
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_XML_BYTES) {
      throw new ApiError(413, 'XML content exceeds the 1 MB Sirius compatibility limit');
    }
    if (/<!DOCTYPE/i.test(content) || /<!ENTITY/i.test(content)) {
      throw new ApiError(400, 'DOCTYPE and ENTITY declarations are not allowed in Sirius XML imports');
    }

    let nodeCount = 0;
    const documentNode: XmlNode = {
      name: '#document',
      localName: '#document',
      attributes: {},
      children: [],
      text: '',
    };

    const parser = new DOMParser({
      onError: (level, message) => {
        throw new Error(`${level}: ${message}`);
      },
    });

    let xmlDocument: any;
    try {
      xmlDocument = parser.parseFromString(content, 'application/xml');
    } catch (error: any) {
      throw new ApiError(400, `Malformed XML: ${error.message || 'parse failed'}`);
    }

    const convertChildren = (sourceNode: any, parent: XmlNode, depth: number): void => {
      if (depth > MAX_XML_DEPTH) {
        throw new ApiError(400, 'XML content exceeds the Sirius compatibility depth limit');
      }

      for (let index = 0; index < sourceNode.childNodes.length; index += 1) {
        const child = sourceNode.childNodes.item(index);
        if (child.nodeType === 3 || child.nodeType === 4) {
          parent.text += child.nodeValue || '';
          continue;
        }

        if (child.nodeType !== 1) {
          continue;
        }

        nodeCount += 1;
        if (nodeCount > MAX_XML_NODES) {
          throw new ApiError(400, 'XML content exceeds the Sirius compatibility node limit');
        }

        const attributes: Record<string, string> = {};
        if (child.attributes) {
          for (let attrIndex = 0; attrIndex < child.attributes.length; attrIndex += 1) {
            const attribute = child.attributes.item(attrIndex);
            if (attribute) {
              attributes[attribute.nodeName] = attribute.nodeValue || '';
            }
          }
        }

        const nodeName = child.nodeName || '';
        const node: XmlNode = {
          name: nodeName,
          localName: child.localName || this.localName(nodeName),
          attributes,
          children: [],
          text: '',
          parent,
        };
        parent.children.push(node);
        convertChildren(child, node, depth + 1);
        node.text = node.text.trim();
      }
    };

    convertChildren(xmlDocument, documentNode, 0);
    return documentNode;
  }

  private scanUnsupportedFeatures(root: XmlNode, report: SiriusCompatibilityReport): void {
    const seen = new Set<string>();
    for (const node of this.walk(root)) {
      const code = UNSUPPORTED_TAG_CODES[node.localName];
      if (code && !seen.has(`${code}:${this.nodePath(node)}`)) {
        seen.add(`${code}:${this.nodePath(node)}`);
        this.addWarning(report, 'droppedFeatures', {
          severity: 'warning',
          code,
          message: `Sirius ${node.localName} is not imported by the current compatibility subset.`,
          sourcePath: this.nodePath(node),
          sourceElementId: this.getSourceId(node),
        });
      }

      for (const [attributeName, value] of Object.entries(node.attributes)) {
        if (/java:|service:/i.test(value)) {
          this.addWarning(report, 'droppedFeatures', {
            severity: 'warning',
            code: 'SIRIUS_SERVICE_EXPRESSION_UNSUPPORTED',
            message: `Service-backed expression "${attributeName}" is not imported.`,
            sourcePath: this.nodePath(node),
            sourceElementId: this.getSourceId(node),
          });
        }
        if (/aql:|ocl:/i.test(value) && !this.extractFeatureName(value)) {
          this.addWarning(report, 'warnings', {
            severity: 'warning',
            code: 'SIRIUS_EXPRESSION_IMPORTED_AS_TRACE_ONLY',
            message: `Expression "${attributeName}" is retained only in the compatibility report for this import subset.`,
            sourcePath: this.nodePath(node),
            sourceElementId: this.getSourceId(node),
          });
        }
      }
    }
  }

  private buildNodeStyleXml(syntax?: ConcreteSyntax): string {
    const twoD = syntax?.two_d;
    const color = twoD?.fillColor || '#f8fafc';
    const borderColor = twoD?.strokeColor || '#334155';
    return `<style xsi:type="${this.toSiriusNodeStyleType(twoD?.shape)}" color="${this.escapeXml(color)}" borderColor="${this.escapeXml(borderColor)}"/>`;
  }

  private buildEdgeStyleXml(syntax?: ConcreteSyntaxEdge): string {
    const color = syntax?.lineColor || '#334155';
    const targetArrow = this.toSiriusTargetArrow(syntax?.arrowHead);
    return `<style xsi:type="diagram:EdgeStyleDescription" strokeColor="${this.escapeXml(color)}" targetArrow="${targetArrow}"/>`;
  }

  private resolveExportDomainClass(metamodel: Metamodel, description: RepresentationDescription): string | undefined {
    const firstClassId = description.visibleMetaClassIds[0] || description.creatableMetaClassIds[0];
    const metaClass = metamodel.classes.find(candidate => candidate.id === firstClassId);
    return metaClass ? this.toSiriusDomainClass(metamodel, metaClass) : undefined;
  }

  private toSiriusDomainClass(metamodel: Metamodel, metaClass: MetaClass): string {
    return metamodel.prefix ? `${metamodel.prefix}::${metaClass.name}` : metaClass.name;
  }

  private findReference(metamodel: Metamodel, referenceId: string): MetaReference | undefined {
    for (const metaClass of metamodel.classes) {
      const reference = (metaClass.references || []).find(candidate => candidate.id === referenceId);
      if (reference) return reference;
    }
    return undefined;
  }

  private createReport(sourceFormat: SiriusSourceFormat, targetFormat: SiriusCompatibilityReport['targetFormat']): SiriusCompatibilityReport {
    return {
      sourceFormat,
      targetFormat,
      supported: true,
      warnings: [],
      droppedFeatures: [],
      unresolvedReferences: [],
    };
  }

  private mergeReports(
    base: SiriusCompatibilityReport,
    next: SiriusCompatibilityReport,
    sourceFormat: SiriusSourceFormat
  ): SiriusCompatibilityReport {
    return {
      sourceFormat,
      targetFormat: base.targetFormat,
      supported: base.supported && next.supported,
      warnings: [...base.warnings, ...next.warnings],
      droppedFeatures: [...base.droppedFeatures, ...next.droppedFeatures],
      unresolvedReferences: [...base.unresolvedReferences, ...next.unresolvedReferences],
    };
  }

  private addWarning(
    report: SiriusCompatibilityReport,
    bucket: 'warnings' | 'droppedFeatures' | 'unresolvedReferences',
    warning: SiriusInteropWarning
  ): void {
    report[bucket].push(warning);
  }

  private finalizeReport(report: SiriusCompatibilityReport): void {
    const hasErrors = [...report.warnings, ...report.droppedFeatures, ...report.unresolvedReferences]
      .some(warning => warning.severity === 'error');
    report.supported = !hasErrors;
  }

  private descendantsByLocal(node: XmlNode, localName: string): XmlNode[] {
    return this.walk(node).filter(candidate => candidate !== node && candidate.localName === localName);
  }

  private descendantsIn(nodes: XmlNode[], localName: string): XmlNode[] {
    return nodes.flatMap(node => this.descendantsByLocal(node, localName));
  }

  private supportedLayerNodes(diagramNode: XmlNode, report: SiriusCompatibilityReport): XmlNode[] {
    const defaultLayers = this.childrenByLocal(diagramNode, 'defaultLayer');
    if (defaultLayers.length === 0) {
      this.addWarning(report, 'warnings', {
        severity: 'warning',
        code: 'SIRIUS_DEFAULT_LAYER_NOT_FOUND',
        message: `DiagramDescription "${this.getAttr(diagramNode, 'name') || this.getSourceId(diagramNode) || 'unnamed'}" has no defaultLayer; mappings were skipped.`,
        sourcePath: this.nodePath(diagramNode),
        sourceElementId: this.getSourceId(diagramNode),
      });
    }
    return defaultLayers;
  }

  private childrenByLocal(node: XmlNode, localName: string): XmlNode[] {
    return this.children(node).filter(child => child.localName === localName);
  }

  private children(node: XmlNode): XmlNode[] {
    return node?.children || [];
  }

  private walk(node: XmlNode): XmlNode[] {
    const result: XmlNode[] = [node];
    for (const child of node.children || []) {
      result.push(...this.walk(child));
    }
    return result;
  }

  private getAttr(node: XmlNode, name: string): string | undefined {
    return node.attributes[name];
  }

  private getAttrByLocal(node: XmlNode, localName: string): string | undefined {
    const entry = Object.entries(node.attributes).find(([name]) => this.localName(name) === localName);
    return entry?.[1];
  }

  private getSourceId(node: XmlNode): string | undefined {
    return this.getAttr(node, 'xmi:id') || this.getAttr(node, 'id');
  }

  private nodePath(node: XmlNode): string {
    const segments: string[] = [];
    let cursor: XmlNode | undefined = node;
    while (cursor && cursor.localName !== '#document') {
      segments.unshift(cursor.localName);
      cursor = cursor.parent;
    }
    return segments.join('/');
  }

  private localName(name: string): string {
    return name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name;
  }

  private normalizeQualifiedName(value: string): string {
    return value.trim().replace(/^#\/\//, '').replace(/^.*::/, '').replace(/^.*#\/\//, '').toLowerCase();
  }

  private extractFeatureName(value?: string): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    const featureMatch = trimmed.match(/^feature:([A-Za-z_][\w.-]*)$/);
    if (featureMatch) return featureMatch[1];
    const selfFeatureMatch = trimmed.match(/^(?:aql:)?self\.([A-Za-z_][\w.-]*)$/);
    if (selfFeatureMatch) return selfFeatureMatch[1];
    if (/^[A-Za-z_][\w.-]*$/.test(trimmed)) return trimmed;
    return undefined;
  }

  private resolveShape(type: string): ConcreteSyntax2D['shape'] {
    const normalized = type.toLowerCase();
    if (normalized.includes('ellipse')) return 'ellipse';
    if (normalized.includes('lozenge') || normalized.includes('diamond')) return 'diamond';
    if (normalized.includes('dot')) return 'circle';
    if (normalized.includes('container')) return 'rectangle';
    return 'rectangle';
  }

  private toSiriusNodeStyleType(shape?: ConcreteSyntax2D['shape']): string {
    switch (shape) {
      case 'circle':
      case 'ellipse':
        return 'diagram:EllipseDescription';
      case 'diamond':
        return 'diagram:LozengeNodeDescription';
      case 'square':
      case 'rectangle':
      case 'default':
      case undefined:
        return 'diagram:SquareDescription';
      default:
        return 'diagram:SquareDescription';
    }
  }

  private toSiriusTargetArrow(arrowHead?: ConcreteSyntaxEdge['arrowHead']): string {
    switch (arrowHead) {
      case 'none':
        return 'NoDecoration';
      case 'diamond':
        return 'OutputFillClosedArrow';
      case 'open':
      case 'filled':
      case undefined:
        return 'InputArrow';
      default:
        return 'InputArrow';
    }
  }

  private parseColor(value?: string): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed;
    const rgb = trimmed.match(/^(\d{1,3}),(\d{1,3}),(\d{1,3})$/);
    if (rgb) {
      return `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})`;
    }
    return undefined;
  }

  private parseNumber(value?: string): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  private toStableId(value: string): string {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return normalized ? `sirius-${normalized}` : 'sirius-imported';
  }

  private uniqueId(base: string, usedIds: Set<string>): string {
    let candidate = base;
    let index = 2;
    while (usedIds.has(candidate)) {
      candidate = `${base}-${index}`;
      index += 1;
    }
    usedIds.add(candidate);
    return candidate;
  }

  private toFileSlug(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'spatialdsl';
  }

  private decodeZipPayload(content: string): Buffer {
    const encoded = content.trim().startsWith('data:')
      ? content.slice(content.indexOf(',') + 1)
      : content.trim();
    const normalized = encoded.replace(/\s+/g, '');
    if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
      throw new ApiError(400, 'project-zip content must be a base64-encoded ZIP payload');
    }
    return Buffer.from(normalized, 'base64');
  }

  private assertSafeProjectPath(path: string): void {
    if (!path || path.includes('\\') || path.includes('\0') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
      throw new ApiError(400, `Unsafe Sirius project ZIP path: ${path}`);
    }

    const segments = path.split('/');
    if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
      throw new ApiError(400, `Unsafe Sirius project ZIP path: ${path}`);
    }
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

export const siriusInteropService = new SiriusInteropService();
