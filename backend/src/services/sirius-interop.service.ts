import { ApiError } from '../middleware';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import {
  ConcreteSyntax,
  ConcreteSyntax2D,
  ConcreteSyntaxEdge,
  Diagram,
  DiagramElement,
  MetaClass,
  MetaReference,
  Metamodel,
  Model,
  ModelElement,
  RepresentationDescription,
  RepresentationContainerMapping,
  RepresentationConditionalStyle,
  RepresentationEdgeMapping,
  RepresentationFilter,
  RepresentationLayer,
  RepresentationLayerMapping,
  RepresentationPinMapping,
  SiriusAirdDiagramPreview,
  SiriusAirdImportResult,
  SiriusAirdPreview,
  SiriusCompatibilityReport,
  SiriusExportOptions,
  SiriusExportResult,
  SiriusImportOptions,
  SiriusImportResult,
  SiriusInteropWarning,
  SiriusOdesignPreview,
  SiriusProjectExportResult,
  SiriusSourceFormat,
  UserRole,
  Viewpoint,
} from '../../../shared/types';
import { metamodelService } from './metamodel.service';
import { viewpointService } from './viewpoint.service';
import { modelService } from './model.service';
import { diagramService } from './diagram.service';
import { normalizePosition3D } from '../../../shared/spatial';

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

interface AirdBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AirdLayout {
  bounds?: AirdBounds;
  points?: Array<{ x: number; y: number }>;
  parentElementId?: string;
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
  modelId?: string;
  viewpointId?: string;
  options?: Partial<SiriusImportOptions>;
}

interface ImportAirdInput {
  content: string;
  modelId: string;
  viewpointId?: string;
  options?: Partial<SiriusImportOptions>;
}

interface ExportInput {
  metamodelId: string;
  viewpointIds?: string[];
  options?: Partial<SiriusExportOptions>;
}

interface ExportAirdInput {
  modelId: string;
  diagramIds?: string[];
  options?: Partial<SiriusExportOptions>;
}

interface ExportProjectInput {
  metamodelId: string;
  modelId?: string;
  viewpointIds?: string[];
  diagramIds?: string[];
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
  allTools: 'SIRIUS_TOOL_SECTION_UNSUPPORTED',
  audits: 'SIRIUS_VALIDATION_UNSUPPORTED',
  javaExtensions: 'SIRIUS_JAVA_SERVICES_UNSUPPORTED',
  ownedJavaExtensions: 'SIRIUS_JAVA_SERVICES_UNSUPPORTED',
  ownedRules: 'SIRIUS_VALIDATION_UNSUPPORTED',
  quickFixes: 'SIRIUS_QUICK_FIXES_UNSUPPORTED',
  reusedMappings: 'SIRIUS_REUSED_MAPPINGS_UNSUPPORTED',
  styleCustomizations: 'SIRIUS_CONDITIONAL_STYLES_UNSUPPORTED',
  validationSet: 'SIRIUS_VALIDATION_UNSUPPORTED',
};

const optionalProjectArgs = (projectId?: string): [] | [string] => projectId ? [projectId] : [];

class SiriusInteropService {
  async validate(input: ValidateInput, userId: string, projectId?: string): Promise<SiriusOdesignPreview> {
    const sourceFormat = input.sourceFormat || 'odesign';
    const metamodel = input.metamodelId
      ? await this.getReadableMetamodel(input.metamodelId, userId, projectId)
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

    return this.validateSemanticXml(input.content, sourceFormat);
  }

  /** Validate a Sirius `.aird` session against an already-imported model and viewpoint. */
  async validateAirdView(input: ValidateInput, userId: string, projectId?: string): Promise<SiriusAirdPreview> {
    const options = { ...DEFAULT_IMPORT_OPTIONS, importAird: true, ...input.options };
    const model = input.modelId ? await this.getReadableModel(input.modelId, userId, projectId) : undefined;
    const viewpoint = input.viewpointId
      ? await this.getViewpointForModel(input.viewpointId, model, userId, projectId)
      : undefined;
    return this.parseAird(input.content, model, viewpoint, options);
  }

  async importOdesign(
    input: ImportOdesignInput,
    userId: string,
    userRole: UserRole,
    projectId?: string
  ): Promise<SiriusImportResult> {
    const options = { ...DEFAULT_IMPORT_OPTIONS, ...input.options };
    if (!options.importOdesign) {
      throw new ApiError(400, 'importOdesign must be enabled to import .odesign content');
    }

    const metamodel = await this.getReadableMetamodel(input.metamodelId, userId, projectId);
    const preview = this.parseOdesign(input.content, metamodel, options);

    if (!preview.report.supported) {
      throw new ApiError(400, 'Sirius .odesign is not supported for import');
    }

    if (options.failOnUnsupportedFeatures && preview.report.droppedFeatures.length > 0) {
      throw new ApiError(400, 'Sirius .odesign contains unsupported features');
    }

    const created: Viewpoint[] = [];
    for (const viewpoint of preview.viewpoints) {
      created.push(await viewpointService.create(viewpoint, userId, userRole, ...optionalProjectArgs(projectId)));
    }

    return {
      viewpoints: created,
      report: preview.report,
    };
  }

  async importAird(
    input: ImportAirdInput,
    userId: string,
    userRole: UserRole,
    projectId?: string
  ): Promise<SiriusAirdImportResult> {
    const options = { ...DEFAULT_IMPORT_OPTIONS, importAird: true, ...input.options };
    if (!options.importAird) {
      throw new ApiError(400, 'importAird must be enabled to import .aird content');
    }

    const model = await this.getReadableModel(input.modelId, userId, projectId);
    const viewpoint = input.viewpointId
      ? await this.getViewpointForModel(input.viewpointId, model, userId, projectId)
      : undefined;

    const preview = this.parseAird(input.content, model, viewpoint, options);
    if (!preview.report.supported) {
      throw new ApiError(400, 'Sirius .aird is not supported for import');
    }
    if (options.failOnUnsupportedFeatures && preview.report.droppedFeatures.length > 0) {
      throw new ApiError(400, 'Sirius .aird contains unsupported features');
    }
    if (preview.diagrams.length === 0) {
      throw new ApiError(400, 'Sirius .aird does not contain any importable diagram representations');
    }

    const created: Diagram[] = [];
    for (const diagram of preview.diagrams) {
      created.push(await diagramService.create({
        name: diagram.name,
        modelId: diagram.modelId,
        viewpointId: diagram.viewpointId,
        representationDescriptionId: diagram.representationDescriptionId,
        elements: diagram.elements,
        includedElementIds: diagram.elements.map(element => element.modelElementId),
      }, userId, userRole, ...optionalProjectArgs(projectId)));
    }

    return { diagrams: created, report: preview.report };
  }

  async exportOdesign(input: ExportInput, userId: string, projectId?: string): Promise<SiriusExportResult> {
    const options = { ...DEFAULT_EXPORT_OPTIONS, ...input.options };
    if (!options.includeOdesign) {
      throw new ApiError(400, 'includeOdesign must be enabled to export .odesign content');
    }

    const metamodel = await this.getReadableMetamodel(input.metamodelId, userId, projectId);
    const allViewpoints = await viewpointService.getAll(userId, input.metamodelId, projectId);
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

  /** Export SpatialDSL views of a model as a Sirius `.aird` session (inverse of importAird). */
  async exportAird(input: ExportAirdInput, userId: string, projectId?: string): Promise<SiriusExportResult> {
    const options = { ...DEFAULT_EXPORT_OPTIONS, ...input.options };
    if (!options.includeAird) {
      throw new ApiError(400, 'includeAird must be enabled to export .aird content');
    }

    const model = await this.getReadableModel(input.modelId, userId, projectId);
    const [allDiagrams, metamodel, viewpoints] = await Promise.all([
      diagramService.getByModelId(input.modelId, userId, projectId),
      this.getReadableMetamodel(model.metamodelId || model.conformsTo, userId, projectId),
      viewpointService.getAll(userId, model.metamodelId || model.conformsTo, projectId),
    ]);
    if (input.diagramIds?.length) {
      const availableIds = new Set(allDiagrams.map(diagram => diagram.id));
      const missingIds = input.diagramIds.filter(diagramId => !availableIds.has(diagramId));
      if (missingIds.length > 0) {
        throw new ApiError(404, `Requested view IDs not found: ${missingIds.join(', ')}`);
      }
    }
    const selected = input.diagramIds?.length
      ? allDiagrams.filter(diagram => input.diagramIds!.includes(diagram.id))
      : allDiagrams;

    if (selected.length === 0) {
      throw new ApiError(404, 'No views found for Sirius .aird export');
    }

    const report = this.createReport('aird', 'sirius-project');
    const preparedDiagrams = selected.map(diagram => this.prepareAirdDiagramForExport(
      diagram,
      model,
      metamodel,
      viewpoints.find(viewpoint => viewpoint.id === diagram.viewpointId)
    ));
    const content = this.buildAirdXml(model, preparedDiagrams, report);
    if (model.elements.some(element => element.presentation?.position3D)) {
      this.addWarning(report, 'warnings', {
        severity: 'warning',
        code: 'SPATIALDSL_AIRD_3D_PRESENTATION_NOT_LOSSLESS',
        message: 'A standalone .aird preserves supported 2D GMF layout but cannot losslessly carry SpatialDSL base elevation or 3D extents. Export the full Sirius project ZIP to include spatialdsl-presentation.json.',
        spatialElementId: model.id,
      });
    }
    if (options.failOnUnsupportedFeatures && report.droppedFeatures.length > 0) {
      throw new ApiError(400, 'SpatialDSL views contain data unsupported by Sirius .aird export');
    }

    this.finalizeReport(report);
    return {
      filename: `${this.toFileSlug(model.name || 'spatialdsl')}.aird`,
      content,
      report,
    };
  }

  /** Build one importable Eclipse Sirius modeling-project ZIP around a primary model. */
  async exportProject(input: ExportProjectInput, userId: string, projectId?: string): Promise<SiriusProjectExportResult> {
    const metamodel = await this.getReadableMetamodel(input.metamodelId, userId, projectId);
    const model = input.modelId
      ? await this.getReadableModel(input.modelId, userId, projectId)
      : (await modelService.getByMetamodelId(input.metamodelId, userId, projectId))[0];
    if (!model) {
      throw new ApiError(404, 'No model found for Sirius project export');
    }
    if ((model.metamodelId || model.conformsTo) !== metamodel.id) {
      throw new ApiError(400, 'The selected model does not conform to the selected metamodel');
    }

    const [allViewpoints, allDiagrams] = await Promise.all([
      viewpointService.getAll(userId, metamodel.id, projectId),
      diagramService.getByModelId(model.id, userId, projectId),
    ]);
    const selectedViewpoints = this.selectByRequestedIds(
      allViewpoints,
      input.viewpointIds,
      'viewpoint'
    );
    const selectedDiagrams = this.selectByRequestedIds(
      allDiagrams,
      input.diagramIds,
      'view'
    );
    if (selectedViewpoints.length === 0) {
      throw new ApiError(404, 'No viewpoints found for Sirius project export');
    }
    if (selectedDiagrams.length === 0) {
      throw new ApiError(404, 'No views found for Sirius project export');
    }

    const selectedViewpointIds = new Set(selectedViewpoints.map(viewpoint => viewpoint.id));
    const missingViewpointIds = Array.from(new Set(selectedDiagrams
      .map(diagram => diagram.viewpointId)
      .filter((id): id is string => Boolean(id) && !selectedViewpointIds.has(id!))));
    if (missingViewpointIds.length > 0) {
      throw new ApiError(400, `Selected views reference viewpoints outside the bundle: ${missingViewpointIds.join(', ')}`);
    }

    const projectSlug = this.toFileSlug(metamodel.name || model.name || 'spatialdsl');
    const metamodelFilename = `${this.toFileSlug(metamodel.name || 'metamodel')}.ecore`;
    const modelFilename = `${this.toFileSlug(model.name || 'model')}.xmi`;
    const odesignFilename = `${this.toFileSlug(metamodel.name || 'viewpoints')}.odesign`;
    const ecorePath = `model/${metamodelFilename}`;
    const xmiPath = `model/${modelFilename}`;
    const odesignPath = `description/${odesignFilename}`;
    const airdPath = 'representations.aird';
    const presentationSidecarPath = 'spatialdsl-presentation.json';
    const report = this.createReport('project-zip', 'sirius-project');

    const odesign = this.buildOdesignXml(metamodel, selectedViewpoints, report);
    const ecore = this.buildEcoreXml(metamodel, report);
    const xmi = this.buildSemanticXmi(model, metamodel, report);
    const preparedDiagrams = selectedDiagrams.map(diagram => this.prepareAirdDiagramForExport(
      diagram,
      model,
      metamodel,
      selectedViewpoints.find(viewpoint => viewpoint.id === diagram.viewpointId)
    ));
    const aird = this.buildAirdXml(model, preparedDiagrams, report, xmiPath, odesignPath);
    const presentationSidecar = this.buildSpatialDslPresentationSidecar(model, selectedDiagrams);
    this.addWarning(report, 'warnings', {
      severity: 'info',
      code: 'SPATIALDSL_PRESENTATION_SIDECAR_EXPORTED',
      message: `Full SpatialDSL placement data is preserved in ${presentationSidecarPath}; Sirius GMF notation remains the 2D interoperability projection.`,
      sourcePath: presentationSidecarPath,
    });
    this.finalizeReport(report);

    const zip = new JSZip();
    zip.file('.project', this.buildEclipseProjectXml(projectSlug));
    zip.file(ecorePath, ecore);
    zip.file(xmiPath, xmi);
    zip.file(odesignPath, odesign);
    zip.file(airdPath, aird);
    zip.file(presentationSidecarPath, presentationSidecar);
    zip.file('compatibility-report.json', JSON.stringify(report, null, 2));
    const content = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
    const entries = ['.project', ecorePath, xmiPath, odesignPath, airdPath, presentationSidecarPath, 'compatibility-report.json'];
    return {
      filename: `${projectSlug}.sirius-project.zip`,
      content,
      entries,
      report,
    };
  }

  private buildSpatialDslPresentationSidecar(model: Model, diagrams: Diagram[]): string {
    const elements = Object.fromEntries(model.elements.flatMap(element => {
      const presentation = element.presentation;
      if (!presentation) return [];
      const position3D = normalizePosition3D(presentation.position3D);
      const spatialPresentation = {
        ...(presentation.position2D && { position2D: presentation.position2D }),
        ...(position3D && { position3D }),
        ...(presentation.size2D && { size2D: presentation.size2D }),
        ...(presentation.size3D && { size3D: presentation.size3D }),
        ...(typeof presentation.rotationZ === 'number' && { rotationZ: presentation.rotationZ }),
      };
      return Object.keys(spatialPresentation).length > 0
        ? [[element.id, spatialPresentation] as const]
        : [];
    }));

    return JSON.stringify({
      schema: 'https://spatialdsl.dev/schemas/presentation-sidecar/v1',
      schemaVersion: 1,
      coordinateContract: {
        units: 'mm',
        position3D: {
          x: 'domain X center',
          y: 'domain Y center',
          z: 'base elevation above project datum',
        },
        size3D: {
          widthMm: 'X extent',
          heightMm: 'Y extent',
          depthMm: 'Z extent',
        },
        rotationZ: 'degrees about +Z',
      },
      model: {
        id: model.id,
        name: model.name,
        metamodelId: model.metamodelId || model.conformsTo,
      },
      elements,
      views: diagrams.map(diagram => ({
        id: diagram.id,
        name: diagram.name,
        viewpointId: diagram.viewpointId,
        representationDescriptionId: diagram.representationDescriptionId,
        includedElementIds: diagram.includedElementIds || [],
      })),
    }, null, 2);
  }

  private selectByRequestedIds<T extends { id: string }>(
    available: T[],
    requestedIds: string[] | undefined,
    label: string
  ): T[] {
    if (!requestedIds?.length) return available;
    const availableIds = new Set(available.map(item => item.id));
    const missingIds = requestedIds.filter(id => !availableIds.has(id));
    if (missingIds.length > 0) {
      throw new ApiError(404, `Requested ${label} IDs not found: ${missingIds.join(', ')}`);
    }
    return available.filter(item => requestedIds.includes(item.id));
  }

  private buildAirdXml(
    model: Model,
    diagrams: Diagram[],
    report: SiriusCompatibilityReport,
    semanticResource = `${this.toFileSlug(model.name || 'model')}.xmi`,
    odesignResource?: string
  ): string {
    const analysisId = `analysis-${this.toFileSlug(model.name || model.id)}`;
    const elementById = new Map(model.elements.map(element => [element.id, element] as const));
    const rootTarget = model.elements[0]?.id;

    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<xmi:XMI xmi:version="2.0"',
      '    xmlns:xmi="http://www.omg.org/XMI"',
      '    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
      '    xmlns:viewpoint="http://www.eclipse.org/sirius/1.1.0"',
      '    xmlns:diagram="http://www.eclipse.org/sirius/diagram/1.1.0"',
      '    xmlns:notation="http://www.eclipse.org/gmf/runtime/1.0.2/notation">',
      `  <viewpoint:DAnalysis xmi:id="${this.escapeXml(analysisId)}">`,
      `    <semanticResources>${this.escapeXml(semanticResource)}</semanticResources>`,
    ];

    // One <ownedViews> per distinct viewpoint, matching how Sirius groups representations.
    const groups = new Map<string, Diagram[]>();
    for (const diagram of diagrams) {
      const key = diagram.viewpointId || '';
      const bucket = groups.get(key);
      if (bucket) bucket.push(diagram);
      else groups.set(key, [diagram]);
    }

    const gmfBlocks: string[] = [];
    let viewIndex = 0;
    for (const [viewpointId, groupDiagrams] of groups) {
      viewIndex += 1;
      const viewpointRef = viewpointId
        ? `${odesignResource ? `${odesignResource}#` : '#'}${viewpointId}`
        : undefined;
      const viewpointAttr = viewpointRef ? ` viewpoint="${this.escapeXml(viewpointRef)}"` : '';
      lines.push(`    <ownedViews xmi:id="${this.escapeXml(`sirius-view-${viewIndex}`)}"${viewpointAttr}>`);
      for (const diagram of groupDiagrams) {
        this.appendAirdRepresentation(
          lines,
          gmfBlocks,
          diagram,
          elementById,
          semanticResource,
          rootTarget,
          report,
          odesignResource
        );
      }
      lines.push('    </ownedViews>');
    }

    lines.push('  </viewpoint:DAnalysis>');
    lines.push(...gmfBlocks);
    lines.push('</xmi:XMI>');
    return `${lines.join('\n')}\n`;
  }

  private buildEclipseProjectXml(projectName: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<projectDescription>
  <name>${this.escapeXml(projectName)}</name>
  <comment>Generated by SpatialDSL Studio</comment>
  <projects/>
  <buildSpec/>
  <natures>
    <nature>org.eclipse.sirius.nature.modelingproject</nature>
  </natures>
</projectDescription>
`;
  }

  private buildEcoreXml(metamodel: Metamodel, report: SiriusCompatibilityReport): string {
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<ecore:EPackage xmi:version="2.0"',
      '    xmlns:xmi="http://www.omg.org/XMI"',
      '    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
      '    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"',
      `    name="${this.escapeXml(metamodel.name)}"`,
      `    nsPrefix="${this.escapeXml(metamodel.prefix)}"`,
      `    nsURI="${this.escapeXml(metamodel.uri)}">`,
    ];

    metamodel.classes.forEach(metaClass => {
      const superTypes = (metaClass.superTypes || [])
        .map(id => metamodel.classes.find(candidate => candidate.id === id))
        .filter((candidate): candidate is MetaClass => Boolean(candidate))
        .map(candidate => `#//${candidate.name}`)
        .join(' ');
      lines.push(
        `  <eClassifiers xsi:type="ecore:EClass" name="${this.escapeXml(metaClass.name)}"` +
        `${metaClass.abstract ? ' abstract="true"' : ''}` +
        `${superTypes ? ` eSuperTypes="${this.escapeXml(superTypes)}"` : ''}>`
      );
      (metaClass.constraints || [])
        .filter(constraint => constraint.type === 'ocl')
        .forEach(constraint => {
          lines.push('    <eAnnotations source="http://www.eclipse.org/emf/2002/Ecore/OCL">');
          lines.push(`      <details key="${this.escapeXml(constraint.name || 'invariant')}" value="${this.escapeXml(constraint.expression)}"/>`);
          lines.push('    </eAnnotations>');
      });
      (metaClass.attributes || []).forEach(attribute => {
        const attributeType = attribute.type;
        let eType = 'ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString';
        if (typeof attributeType === 'object') {
          const metaEnum = (metamodel.enums || []).find(candidate => candidate.id === attributeType.enumId);
          if (metaEnum) eType = `#//${metaEnum.name}`;
        } else if (attributeType === 'number') {
          eType = 'ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EDouble';
        } else if (attributeType === 'boolean') {
          eType = 'ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EBoolean';
        } else if (attributeType === 'date') {
          eType = 'ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EDate';
        }
        const upperBound = attribute.many ? ' upperBound="-1"' : '';
        const lowerBound = attribute.required ? ' lowerBound="1"' : '';
        const defaultValue = attribute.defaultValue !== undefined && attribute.defaultValue !== ''
          ? ` defaultValueLiteral="${this.escapeXml(String(attribute.defaultValue))}"`
          : '';
        lines.push(`    <eStructuralFeatures xsi:type="ecore:EAttribute" name="${this.escapeXml(attribute.name)}" eType="${this.escapeXml(eType)}"${upperBound}${lowerBound}${defaultValue}/>`);
      });
      (metaClass.references || []).forEach(reference => {
        const target = metamodel.classes.find(candidate => candidate.id === reference.target);
        if (!target) {
          this.addWarning(report, 'unresolvedReferences', {
            severity: 'error',
            code: 'SPATIALDSL_ECORE_REFERENCE_TARGET_UNRESOLVED',
            message: `EReference ${metaClass.name}.${reference.name} targets unknown metaclass ${reference.target}.`,
            spatialElementId: reference.id,
          });
          return;
        }
        const upperBound = reference.cardinality?.upperBound === '*'
          ? ' upperBound="-1"'
          : typeof reference.cardinality?.upperBound === 'number'
            ? ` upperBound="${reference.cardinality.upperBound}"`
            : '';
        const lowerBound = (reference.cardinality?.lowerBound || 0) > 0
          ? ` lowerBound="${reference.cardinality.lowerBound}"`
          : '';
        const opposite = reference.opposite
          ? this.ecoreOppositeFragment(metamodel, reference.opposite)
          : undefined;
        lines.push(
          `    <eStructuralFeatures xsi:type="ecore:EReference" name="${this.escapeXml(reference.name)}"` +
          ` eType="#//${this.escapeXml(target.name)}"${upperBound}${lowerBound}` +
          ` containment="${reference.containment}"${opposite ? ` eOpposite="${this.escapeXml(opposite)}"` : ''}/>`
        );
      });
      lines.push('  </eClassifiers>');
    });

    (metamodel.enums || []).forEach(metaEnum => {
      lines.push(`  <eClassifiers xsi:type="ecore:EEnum" name="${this.escapeXml(metaEnum.name)}">`);
      metaEnum.literals.forEach((literal, index) => {
        const value = literal.value !== undefined && literal.value !== index
          ? ` value="${literal.value}"`
          : '';
        const serializedLiteral = literal.literal && literal.literal !== literal.name
          ? ` literal="${this.escapeXml(literal.literal)}"`
          : '';
        lines.push(`    <eLiterals name="${this.escapeXml(literal.name)}"${value}${serializedLiteral}/>`);
      });
      lines.push('  </eClassifiers>');
    });
    lines.push('</ecore:EPackage>');
    return `${lines.join('\n')}\n`;
  }

  private ecoreOppositeFragment(metamodel: Metamodel, oppositeId: string): string | undefined {
    for (const metaClass of metamodel.classes) {
      const reference = (metaClass.references || []).find(candidate => candidate.id === oppositeId);
      if (reference) return `#//${metaClass.name}/${reference.name}`;
    }
    return undefined;
  }

  private buildSemanticXmi(
    model: Model,
    metamodel: Metamodel,
    report: SiriusCompatibilityReport
  ): string {
    const elementById = new Map(model.elements.map(element => [element.id, element] as const));
    const classById = new Map(metamodel.classes.map(metaClass => [metaClass.id, metaClass] as const));
    const referenceTargets = (element: ModelElement, reference: MetaReference): string[] => {
      const raw = element.references?.[reference.name] ?? element.references?.[reference.id];
      const targets = Array.isArray(raw) ? [...raw] : raw ? [raw] : [];
      (model.connections || [])
        .filter(connection => (
          connection.sourceId === element.id
          && (
            connection.referenceId === reference.id
            || connection.referenceName === reference.name
            || connection.type === reference.name
          )
        ))
        .forEach(connection => {
          if (!targets.includes(connection.targetId)) targets.push(connection.targetId);
        });
      return targets;
    };
    const containmentParents = new Set<string>();
    model.elements.forEach(element => {
      const metaClass = classById.get(element.modelElementId);
      if (!metaClass) return;
      this.getAllMetaReferences(metaClass, metamodel)
        .filter(reference => reference.containment)
        .flatMap(reference => referenceTargets(element, reference))
        .forEach(targetId => containmentParents.add(targetId));
    });
    let roots = model.elements.filter(element => !containmentParents.has(element.id));
    if (roots.length === 0 && model.elements.length > 0) {
      roots = [model.elements[0]];
      this.addWarning(report, 'warnings', {
        severity: 'warning',
        code: 'SPATIALDSL_XMI_CONTAINMENT_CYCLE',
        message: 'No semantic root was found; the first model element was used as the XMI root.',
        spatialElementId: model.elements[0].id,
      });
    }
    if (roots.length === 0) {
      this.addWarning(report, 'unresolvedReferences', {
        severity: 'error',
        code: 'SPATIALDSL_XMI_ROOT_NOT_FOUND',
        message: 'The selected model has no semantic elements to export.',
        spatialElementId: model.id,
      });
    }

    const visited = new Set<string>();
    const serializeElement = (
      element: ModelElement,
      tag: string,
      indent: string,
      declaredClassId?: string,
      root = false
    ): string[] => {
      if (visited.has(element.id)) return [];
      visited.add(element.id);
      const metaClass = classById.get(element.modelElementId);
      if (!metaClass) {
        this.addWarning(report, 'unresolvedReferences', {
          severity: 'error',
          code: 'SPATIALDSL_XMI_METACLASS_UNRESOLVED',
          message: `Model element ${element.id} references unknown metaclass ${element.modelElementId}.`,
          spatialElementId: element.id,
        });
        return [];
      }

      const attributes = [`xmi:id="${this.escapeXml(element.id)}"`];
      this.getAllMetaAttributes(metaClass, metamodel).forEach(attribute => {
        const value = element.style?.[attribute.name]
          ?? (attribute.name === 'name' ? element.name : undefined);
        if (value !== undefined && value !== null && value !== '') {
          attributes.push(`${attribute.name}="${this.escapeXml(String(value))}"`);
        }
      });
      this.getAllMetaReferences(metaClass, metamodel)
        .filter(reference => !reference.containment)
        .forEach(reference => {
          const targets = referenceTargets(element, reference);
          const resolved = targets.filter(targetId => elementById.has(targetId));
          const missing = targets.filter(targetId => !elementById.has(targetId));
          if (resolved.length > 0) attributes.push(`${reference.name}="${this.escapeXml(resolved.join(' '))}"`);
          missing.forEach(targetId => this.addWarning(report, 'unresolvedReferences', {
            severity: 'warning',
            code: 'SPATIALDSL_XMI_REFERENCE_TARGET_UNRESOLVED',
            message: `${element.id}.${reference.name} targets missing element ${targetId}.`,
            spatialElementId: element.id,
          }));
        });
      if (root) {
        attributes.unshift(
          'xmi:version="2.0"',
          'xmlns:xmi="http://www.omg.org/XMI"',
          'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
          `xmlns:${metamodel.prefix}="${this.escapeXml(metamodel.uri)}"`
        );
      }
      if (declaredClassId && declaredClassId !== element.modelElementId) {
        attributes.push(`xsi:type="${this.escapeXml(`${metamodel.prefix}:${metaClass.name}`)}"`);
      }

      const children: string[] = [];
      this.getAllMetaReferences(metaClass, metamodel)
        .filter(reference => reference.containment)
        .forEach(reference => {
          referenceTargets(element, reference).forEach(targetId => {
            const child = elementById.get(targetId);
            if (!child) {
              this.addWarning(report, 'unresolvedReferences', {
                severity: 'warning',
                code: 'SPATIALDSL_XMI_CONTAINMENT_TARGET_UNRESOLVED',
                message: `${element.id}.${reference.name} targets missing element ${targetId}.`,
                spatialElementId: element.id,
              });
              return;
            }
            children.push(...serializeElement(child, reference.name, indent + '  ', reference.target));
          });
        });
      if (children.length === 0) {
        return [`${indent}<${tag} ${attributes.join(' ')}/>`];
      }
      return [
        `${indent}<${tag} ${attributes.join(' ')}>`,
        ...children,
        `${indent}</${tag}>`,
      ];
    };

    const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
    if (roots.length === 1) {
      const rootClass = classById.get(roots[0].modelElementId);
      if (rootClass) {
        lines.push(...serializeElement(
          roots[0],
          `${metamodel.prefix}:${rootClass.name}`,
          '',
          undefined,
          true
        ));
      }
    } else {
      lines.push(
        '<xmi:XMI xmi:version="2.0"',
        '    xmlns:xmi="http://www.omg.org/XMI"',
        '    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        `    xmlns:${metamodel.prefix}="${this.escapeXml(metamodel.uri)}">`
      );
      roots.forEach(root => {
        const metaClass = classById.get(root.modelElementId);
        if (metaClass) lines.push(...serializeElement(root, `${metamodel.prefix}:${metaClass.name}`, '  '));
      });
      lines.push('</xmi:XMI>');
    }
    if (model.elements.some(element => element.presentation && Object.keys(element.presentation).length > 0)) {
      this.addWarning(report, 'warnings', {
        severity: 'info',
        code: 'SPATIALDSL_XMI_PRESENTATION_IN_AIRD',
        message: 'Semantic XMI excludes presentation metadata; bundled .aird GMF notation carries the 2D layout and spatialdsl-presentation.json carries the lossless SpatialDSL pose.',
        spatialElementId: model.id,
      });
    }
    return `${lines.join('\n')}\n`;
  }

  private getAllMetaAttributes(metaClass: MetaClass, metamodel: Metamodel): MetaClass['attributes'] {
    const attributes = [...(metaClass.attributes || [])];
    const visited = new Set<string>([metaClass.id]);
    const visit = (candidate: MetaClass) => {
      (candidate.superTypes || []).forEach(superTypeId => {
        if (visited.has(superTypeId)) return;
        visited.add(superTypeId);
        const superType = metamodel.classes.find(item => item.id === superTypeId);
        if (superType) {
          attributes.unshift(...(superType.attributes || []));
          visit(superType);
        }
      });
    };
    visit(metaClass);
    const names = new Set<string>();
    return attributes.filter(attribute => {
      if (names.has(attribute.name)) return false;
      names.add(attribute.name);
      return true;
    });
  }

  /**
   * Convert the canonical projection storage shape into the legacy flat element
   * list consumed by the `.aird` serializer, then derive visual containment from
   * the representation mapping. Native views normally persist membership and
   * model presentation rather than materialized DiagramElements.
   */
  private prepareAirdDiagramForExport(
    diagram: Diagram,
    model: Model,
    metamodel: Metamodel,
    viewpoint?: Viewpoint
  ): Diagram {
    const semanticById = new Map(model.elements.map(element => [element.id, element] as const));
    const resolveSemanticId = (element: DiagramElement): string | undefined => {
      const linkedId = element.style?.linkedModelElementId || element.style?.modelElementRefId;
      return [element.modelElementId, linkedId, element.id]
        .find(candidate => typeof candidate === 'string' && semanticById.has(candidate));
    };

    const elements = (diagram.elements || []).map(element => {
      if (element.type !== 'node') return { ...element };
      const semanticId = resolveSemanticId(element);
      return {
        ...element,
        ...(semanticId && { modelElementId: semanticId }),
        style: { ...(element.style || {}) },
      };
    });
    const usedElementIds = new Set(elements.map(element => element.id));
    const representedSemanticIds = new Set(elements
      .filter(element => element.type === 'node')
      .map(resolveSemanticId)
      .filter((id): id is string => Boolean(id)));

    for (const semanticId of diagram.includedElementIds || []) {
      const semantic = semanticById.get(semanticId);
      if (!semantic || representedSemanticIds.has(semanticId)) continue;
      const position = semantic.presentation?.position2D || semantic.style?.position || { x: 0, y: 0 };
      const size = semantic.presentation?.size2D || { width: 120, height: 80 };
      elements.push({
        id: this.uniqueId(`${diagram.id}-${semantic.id}`, usedElementIds),
        type: 'node',
        modelElementId: semantic.id,
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        style: {
          linkedModelElementId: semantic.id,
          name: semantic.name || semantic.style?.name,
        },
      });
      representedSemanticIds.add(semanticId);
    }

    const description = viewpoint?.representationDescriptions.find(candidate => (
      candidate.id === diagram.representationDescriptionId
    ));
    const mappings = description?.containerMappings || [];
    if (mappings.length === 0) return { ...diagram, elements };

    const nodes = elements.filter((element): element is DiagramElement => element.type === 'node');
    const nodeBySemanticId = new Map(nodes
      .map(node => [resolveSemanticId(node), node] as const)
      .filter((entry): entry is [string, DiagramElement] => Boolean(entry[0])));
    const assignedParents = new Set(nodes.filter(node => node.parentId).map(node => node.id));

    for (const mapping of mappings) {
      for (const containerSemantic of model.elements) {
        if (!this.isMetaClassCompatible(
          containerSemantic.modelElementId,
          [mapping.containerMetaClassId],
          metamodel
        )) continue;

        const containerNode = nodeBySemanticId.get(containerSemantic.id);
        if (!containerNode) continue;
        const containerClass = metamodel.classes.find(candidate => (
          candidate.id === containerSemantic.modelElementId
        ));
        if (!containerClass) continue;
        const reference = this.getAllMetaReferences(containerClass, metamodel).find(candidate => (
          candidate.containment
          && (
            candidate.id === mapping.containmentReferenceId
            || candidate.name === mapping.containmentReferenceId
          )
        ));
        if (!reference) continue;

        containerNode.containerMappingId = mapping.id;
        const rawTargets = containerSemantic.references?.[reference.name]
          ?? containerSemantic.references?.[reference.id];
        const targetIds = Array.isArray(rawTargets) ? rawTargets : rawTargets ? [rawTargets] : [];

        for (const targetId of targetIds) {
          const childSemantic = semanticById.get(targetId);
          const childNode = nodeBySemanticId.get(targetId);
          if (!childSemantic || !childNode || childNode.id === containerNode.id || assignedParents.has(childNode.id)) {
            continue;
          }
          const allowedChildIds = mapping.childMetaClassIds?.length
            ? mapping.childMetaClassIds
            : [reference.target];
          if (!this.isMetaClassCompatible(childSemantic.modelElementId, allowedChildIds, metamodel)) continue;
          const isPin = description?.pinMappings?.some(pinMapping => (
            this.isMetaClassCompatible(childSemantic.modelElementId, pinMapping.pinMetaClassIds, metamodel)
          ));
          if (isPin) continue;

          childNode.parentId = containerNode.id;
          assignedParents.add(childNode.id);
        }
      }
    }

    return { ...diagram, elements };
  }

  private isMetaClassCompatible(actualId: string, expectedIds: string[], metamodel: Metamodel): boolean {
    if (expectedIds.includes(actualId)) return true;
    const visited = new Set<string>();
    const visit = (metaClassId: string): boolean => {
      if (visited.has(metaClassId)) return false;
      visited.add(metaClassId);
      const metaClass = metamodel.classes.find(candidate => candidate.id === metaClassId);
      return Boolean(metaClass?.superTypes?.some(superTypeId => (
        expectedIds.includes(superTypeId) || visit(superTypeId)
      )));
    };
    return visit(actualId);
  }

  private appendAirdRepresentation(
    lines: string[],
    gmfBlocks: string[],
    diagram: Diagram,
    elementById: Map<string, ModelElement>,
    semanticResource: string,
    rootTarget: string | undefined,
    report: SiriusCompatibilityReport,
    odesignResource?: string
  ): void {
    const reprId = diagram.id;
    const descriptionAttr = diagram.representationDescriptionId
      ? ` description="${this.escapeXml(`${odesignResource ? `${odesignResource}#` : '#'}${diagram.representationDescriptionId}`)}"`
      : '';
    const targetAttr = rootTarget ? ` target="${this.escapeXml(`${semanticResource}#${rootTarget}`)}"` : '';

    lines.push(
      `      <ownedRepresentations xsi:type="diagram:DSemanticDiagram" xmi:id="${this.escapeXml(reprId)}"` +
      ` name="${this.escapeXml(diagram.name)}" uid="${this.escapeXml(reprId)}"${targetAttr}${descriptionAttr}>`
    );

    const exportedNodeIds = new Set<string>();
    const exportedNodes: DiagramElement[] = [];
    const gmfNodeLines: string[] = [];
    const gmfEdgeLines: string[] = [];

    const semanticName = (element: DiagramElement): string => {
      const model = elementById.get(element.modelElementId);
      return model?.name || (model?.style?.name as string) || element.modelElementId;
    };
    const diagramElementById = new Map(diagram.elements.map(element => [element.id, element] as const));
    const mappingAttr = (element: DiagramElement, suffix: 'node' | 'edge'): string => {
      if (!diagram.representationDescriptionId) return '';
      if (suffix === 'node') {
        if (element.containerMappingId) {
          return ` mapping="#${this.escapeXml(element.containerMappingId)}"`;
        }
        const semantic = elementById.get(element.modelElementId);
        const metaClassId = semantic?.modelElementId || element.modelElementId;
        const parent = element.parentId ? diagramElementById.get(element.parentId) : undefined;
        if (parent?.containerMappingId) {
          return ` mapping="#${this.escapeXml(`${parent.containerMappingId}-${metaClassId}-node`)}"`;
        }
        return ` mapping="#${this.escapeXml(`${diagram.representationDescriptionId}-${metaClassId}-node`)}"`;
      }
      return ` mapping="#${this.escapeXml(`${diagram.representationDescriptionId}-${element.modelElementId}-edge`)}"`;
    };

    // Nodes first so edges can reference them.
    for (const element of diagram.elements.filter(candidate => candidate.type === 'node')) {
      if (!elementById.has(element.modelElementId)) {
        this.addWarning(report, 'unresolvedReferences', {
          severity: 'warning',
          code: 'SPATIALDSL_AIRD_NODE_TARGET_UNRESOLVED',
          message: `View node "${element.id}" references model element "${element.modelElementId}" which is not in model "${diagram.modelId}"; the node was dropped.`,
          spatialElementId: element.id,
        });
        continue;
      }
      exportedNodeIds.add(element.id);
      exportedNodes.push(element);
      lines.push(
        `        <ownedDiagramElements xmi:id="${this.escapeXml(element.id)}"` +
        ` name="${this.escapeXml(semanticName(element))}"` +
        ` target="${this.escapeXml(`${semanticResource}#${element.modelElementId}`)}"${mappingAttr(element, 'node')}/>`
      );

    }

    const exportedNodeById = new Map(exportedNodes.map(element => [element.id, element]));
    const childrenByParent = new Map<string, DiagramElement[]>();
    exportedNodes.forEach(element => {
      if (!element.parentId || !exportedNodeById.has(element.parentId) || element.parentId === element.id) return;
      const children = childrenByParent.get(element.parentId) || [];
      children.push(element);
      childrenByParent.set(element.parentId, children);
    });
    const renderedNodes = new Set<string>();
    const appendGmfNode = (element: DiagramElement, indent: string, path: Set<string>) => {
      if (renderedNodes.has(element.id) || path.has(element.id)) return;
      renderedNodes.add(element.id);
      const nextPath = new Set(path);
      nextPath.add(element.id);
      const parent = element.parentId ? exportedNodeById.get(element.parentId) : undefined;
      const localX = (element.x ?? 0) - (parent?.x ?? 0);
      const localY = (element.y ?? 0) - (parent?.y ?? 0);
      const hasBounds = element.x !== undefined || element.y !== undefined;

      gmfNodeLines.push(
        `${indent}<children xsi:type="notation:Node" xmi:id="${this.escapeXml(`gmf-${element.id}`)}" element="#${this.escapeXml(element.id)}">`
      );
      if (hasBounds) {
        gmfNodeLines.push(
          `${indent}  <layoutConstraint xsi:type="notation:Bounds" x="${localX}" y="${localY}"` +
          ` width="${element.width ?? 0}" height="${element.height ?? 0}"/>`
        );
      }
      (childrenByParent.get(element.id) || []).forEach(child => (
        appendGmfNode(child, `${indent}  `, nextPath)
      ));
      gmfNodeLines.push(`${indent}</children>`);
    };
    exportedNodes
      .filter(element => !element.parentId || !exportedNodeById.has(element.parentId))
      .forEach(element => appendGmfNode(element, '    ', new Set<string>()));
    exportedNodes
      .filter(element => !renderedNodes.has(element.id))
      .forEach(element => appendGmfNode(element, '    ', new Set<string>()));

    // Edges reference already-exported nodes.
    for (const element of diagram.elements.filter(candidate => candidate.type === 'edge')) {
      if (!elementById.has(element.modelElementId)) {
        this.addWarning(report, 'unresolvedReferences', {
          severity: 'warning',
          code: 'SPATIALDSL_AIRD_EDGE_TARGET_UNRESOLVED',
          message: `View edge "${element.id}" references model element "${element.modelElementId}" which is not in model "${diagram.modelId}"; the edge was dropped.`,
          spatialElementId: element.id,
        });
        continue;
      }
      if (!element.sourceId || !element.targetId || !exportedNodeIds.has(element.sourceId) || !exportedNodeIds.has(element.targetId)) {
        this.addWarning(report, 'droppedFeatures', {
          severity: 'warning',
          code: 'SPATIALDSL_AIRD_EDGE_ENDPOINT_MISSING',
          message: `View edge "${element.id}" has an unresolved source/target node and was dropped.`,
          spatialElementId: element.id,
        });
        continue;
      }
      lines.push(
        `        <ownedDiagramElements xmi:id="${this.escapeXml(element.id)}"` +
        ` name="${this.escapeXml(semanticName(element))}"` +
        ` target="${this.escapeXml(`${semanticResource}#${element.modelElementId}`)}"${mappingAttr(element, 'edge')}` +
        ` sourceNode="#${this.escapeXml(element.sourceId)}" targetNode="#${this.escapeXml(element.targetId)}"/>`
      );

      const openTag =
        `    <edges xsi:type="notation:Edge" xmi:id="${this.escapeXml(`gmf-${element.id}`)}" element="#${this.escapeXml(element.id)}"` +
        ` source="${this.escapeXml(`gmf-${element.sourceId}`)}" target="${this.escapeXml(`gmf-${element.targetId}`)}">`;
      if (element.points && element.points.length > 0) {
        gmfEdgeLines.push(openTag);
        for (const point of element.points) {
          gmfEdgeLines.push(`      <points x="${point.x}" y="${point.y}"/>`);
        }
        gmfEdgeLines.push('    </edges>');
      } else {
        gmfEdgeLines.push(openTag.replace(/>$/, '/>'));
      }
    }

    lines.push('      </ownedRepresentations>');

    gmfBlocks.push(`  <notation:Diagram xmi:id="${this.escapeXml(`gmf-${reprId}`)}" type="Sirius" element="#${this.escapeXml(reprId)}">`);
    gmfBlocks.push(...gmfNodeLines, ...gmfEdgeLines);
    gmfBlocks.push('  </notation:Diagram>');
  }

  private async getReadableMetamodel(metamodelId: string, userId: string, projectId?: string): Promise<Metamodel> {
    const metamodel = await metamodelService.getById(metamodelId, userId, projectId);
    if (!metamodel) {
      throw new ApiError(404, 'Metamodel not found');
    }
    return metamodel;
  }

  private async getReadableModel(modelId: string, userId: string, projectId?: string): Promise<Model> {
    const model = await modelService.getById(modelId, userId, projectId);
    if (!model) {
      throw new ApiError(404, 'Model not found');
    }
    return model;
  }

  /** Resolve the target viewpoint, preferring one already attached to the model's metamodel. */
  private async getViewpointForModel(
    viewpointId: string,
    model: Model | undefined,
    userId: string,
    projectId?: string
  ): Promise<Viewpoint | undefined> {
    const viewpoints = await viewpointService.getAll(userId, model?.metamodelId, projectId);
    const match = viewpoints.find(viewpoint => viewpoint.id === viewpointId);
    if (!match) {
      throw new ApiError(404, 'Viewpoint not found for the supplied model');
    }
    return match;
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

    const presentationSidecars = files.filter(file => (
      file.name.split('/').pop()?.toLowerCase() === 'spatialdsl-presentation.json'
    ));
    if (presentationSidecars.length === 0) {
      this.addWarning(report, 'warnings', {
        severity: 'warning',
        code: 'SPATIALDSL_PRESENTATION_SIDECAR_MISSING',
        message: 'No spatialdsl-presentation.json was found. Sirius 2D layout can still be imported, but SpatialDSL elevation and 3D extents cannot be restored losslessly.',
      });
    } else if (presentationSidecars.length > 1) {
      this.addWarning(report, 'unresolvedReferences', {
        severity: 'error',
        code: 'SPATIALDSL_PRESENTATION_SIDECAR_AMBIGUOUS',
        message: 'The project ZIP contains more than one spatialdsl-presentation.json sidecar.',
      });
    } else {
      const sidecarFile = presentationSidecars[0];
      try {
        const sidecar = JSON.parse(await sidecarFile.async('text')) as Record<string, any>;
        const elements = sidecar.elements;
        const positionsAreCanonical = elements && typeof elements === 'object' && !Array.isArray(elements)
          && Object.values(elements).every((entry: any) => {
            if (!entry?.position3D) return true;
            const normalized = normalizePosition3D(entry.position3D);
            return Boolean(normalized) && typeof entry.position3D.z === 'number';
          });
        if (sidecar.schemaVersion !== 1 || !sidecar.model?.id || !positionsAreCanonical) {
          throw new Error('unsupported or malformed sidecar schema');
        }
        this.addWarning(report, 'warnings', {
          severity: 'info',
          code: 'SPATIALDSL_PRESENTATION_SIDECAR_RECOGNIZED',
          message: `Validated lossless SpatialDSL presentation data from "${sidecarFile.name}".`,
          sourcePath: sidecarFile.name,
        });
      } catch (error) {
        this.addWarning(report, 'unresolvedReferences', {
          severity: 'error',
          code: 'SPATIALDSL_PRESENTATION_SIDECAR_INVALID',
          message: `Could not validate "${sidecarFile.name}" as a SpatialDSL presentation sidecar.`,
          sourcePath: sidecarFile.name,
        });
      }
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

  private parseAird(
    content: string,
    model: Model | undefined,
    viewpoint: Viewpoint | undefined,
    _options: SiriusImportOptions
  ): SiriusAirdPreview {
    const report = this.createReport('aird', 'spatialdsl');
    const root = this.parseXml(content);
    const allNodes = this.walk(root);

    const hasAnalysis = allNodes.some(node => ['DAnalysis', 'analysis'].includes(node.localName));
    if (!hasAnalysis) {
      this.addWarning(report, 'warnings', {
        severity: 'warning',
        code: 'SIRIUS_AIRD_ROOT_UNEXPECTED',
        message: 'The .aird XML was parsed, but no Sirius DAnalysis element was found.',
      });
    }

    if (!model) {
      this.addWarning(report, 'unresolvedReferences', {
        severity: 'error',
        code: 'SIRIUS_AIRD_MODEL_REQUIRED',
        message: 'Importing a Sirius .aird view requires an already-imported SpatialDSL model to resolve semantic targets.',
      });
      this.finalizeReport(report);
      return { diagrams: [], report };
    }

    if (!viewpoint) {
      this.addWarning(report, 'warnings', {
        severity: 'warning',
        code: 'SIRIUS_AIRD_VIEWPOINT_NOT_SUPPLIED',
        message: 'No viewpoint was supplied; imported views will not be linked to a representation description.',
      });
    }

    const layoutByElementId = this.indexAirdLayout(allNodes);
    const semanticDiagrams = allNodes.filter(node => this.isSemanticDiagram(node));
    if (semanticDiagrams.length === 0) {
      this.addWarning(report, 'unresolvedReferences', {
        severity: 'error',
        code: 'SIRIUS_AIRD_NO_DIAGRAMS',
        message: 'No DSemanticDiagram representations were found in the .aird session.',
      });
    }

    const diagrams = semanticDiagrams.map((diagramNode, index) =>
      this.buildAirdDiagram(diagramNode, index, model, viewpoint, layoutByElementId, report)
    );

    this.finalizeReport(report);
    return { diagrams, report };
  }

  private buildAirdDiagram(
    diagramNode: XmlNode,
    index: number,
    model: Model,
    viewpoint: Viewpoint | undefined,
    layoutByElementId: Map<string, AirdLayout>,
    report: SiriusCompatibilityReport
  ): SiriusAirdDiagramPreview {
    const sourceRepresentationId = this.getSourceId(diagramNode) || this.getAttr(diagramNode, 'uid') || `diagram-${index + 1}`;
    const name = this.getAttr(diagramNode, 'name') || `Imported View ${index + 1}`;
    const representationDescriptionId = this.resolveRepresentationDescriptionId(diagramNode, viewpoint, report);

    const ddeNodes = this.descendantsByLocal(diagramNode, 'ownedDiagramElements');
    const usedElementIds = new Set<string>();
    const ddeIdToElementId = new Map<string, string>();
    const elements: DiagramElement[] = [];

    // Nodes first so edges can resolve their endpoints to created element ids.
    ddeNodes
      .filter(dde => !this.isDiagramElementEdge(dde, viewpoint))
      .forEach((dde, nodeIndex) => {
        const ddeId = this.getSourceId(dde) || `node-${nodeIndex + 1}`;
        const modelElementId = this.resolveSemanticTarget(this.getAttr(dde, 'target'), dde, model, report);
        if (!modelElementId) return;

        const elementId = this.uniqueId(this.toStableId(ddeId), usedElementIds);
        ddeIdToElementId.set(ddeId, elementId);
        const bounds = layoutByElementId.get(ddeId)?.bounds;
        elements.push({
          id: elementId,
          type: 'node',
          modelElementId,
          ...(bounds && { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }),
          style: {},
        });
      });

    ddeNodes
      .filter(dde => !this.isDiagramElementEdge(dde, viewpoint))
      .forEach(dde => {
        const ddeId = this.getSourceId(dde);
        if (!ddeId) return;
        const elementId = ddeIdToElementId.get(ddeId);
        const parentDdeId = layoutByElementId.get(ddeId)?.parentElementId;
        const parentId = parentDdeId ? ddeIdToElementId.get(parentDdeId) : undefined;
        if (!elementId || !parentId || elementId === parentId) return;
        const element = elements.find(candidate => candidate.id === elementId);
        if (element) element.parentId = parentId;
      });

    ddeNodes
      .filter(dde => this.isDiagramElementEdge(dde, viewpoint))
      .forEach((dde, edgeIndex) => {
        const ddeId = this.getSourceId(dde) || `edge-${edgeIndex + 1}`;
        const modelElementId = this.resolveSemanticTarget(this.getAttr(dde, 'target'), dde, model, report);
        if (!modelElementId) return;

        const sourceRef = this.fragmentOf(this.getAttr(dde, 'sourceNode') || this.getAttr(dde, 'source'));
        const targetRef = this.fragmentOf(this.getAttr(dde, 'targetNode'));
        const sourceId = sourceRef ? ddeIdToElementId.get(sourceRef) : undefined;
        const targetId = targetRef ? ddeIdToElementId.get(targetRef) : undefined;
        if (!sourceId || !targetId) {
          this.addWarning(report, 'unresolvedReferences', {
            severity: 'warning',
            code: 'SIRIUS_AIRD_EDGE_ENDPOINT_UNRESOLVED',
            message: `Edge "${this.getAttr(dde, 'name') || ddeId}" could not resolve its source/target node and was dropped.`,
            sourcePath: this.nodePath(dde),
            sourceElementId: ddeId,
          });
          return;
        }

        const elementId = this.uniqueId(this.toStableId(ddeId), usedElementIds);
        const points = layoutByElementId.get(ddeId)?.points;
        elements.push({
          id: elementId,
          type: 'edge',
          modelElementId,
          sourceId,
          targetId,
          ...(points && points.length > 0 && { points }),
          style: {},
        });
      });

    return {
      name,
      modelId: model.id,
      viewpointId: viewpoint?.id,
      ...(representationDescriptionId && { representationDescriptionId }),
      elements,
      sourceRepresentationId,
    };
  }

  private resolveRepresentationDescriptionId(
    diagramNode: XmlNode,
    viewpoint: Viewpoint | undefined,
    report: SiriusCompatibilityReport
  ): string | undefined {
    if (!viewpoint) return undefined;
    const ref = this.fragmentOf(this.getAttr(diagramNode, 'description'));
    const descriptions = viewpoint.representationDescriptions || [];
    if (!ref) {
      return descriptions[0]?.id;
    }

    const normalizedRef = this.normalizeQualifiedName(ref);
    const match = descriptions.find(description => (
      description.id === ref
      || description.id === this.toStableId(ref)
      || this.normalizeQualifiedName(description.name) === normalizedRef
    ));
    if (match) return match.id;

    this.addWarning(report, 'unresolvedReferences', {
      severity: 'warning',
      code: 'SIRIUS_AIRD_REPRESENTATION_UNRESOLVED',
      message: `Could not resolve Sirius diagram description "${ref}" in viewpoint "${viewpoint.name}".`,
      sourcePath: this.nodePath(diagramNode),
      sourceElementId: this.getSourceId(diagramNode),
    });
    return descriptions[0]?.id;
  }

  private resolveSemanticTarget(
    targetRef: string | undefined,
    node: XmlNode,
    model: Model,
    report: SiriusCompatibilityReport
  ): string | undefined {
    const frag = this.fragmentOf(targetRef);
    if (!frag) {
      this.addWarning(report, 'unresolvedReferences', {
        severity: 'warning',
        code: 'SIRIUS_AIRD_TARGET_MISSING',
        message: `Diagram element "${this.getAttr(node, 'name') || this.getSourceId(node) || 'unnamed'}" has no semantic target and was dropped.`,
        sourcePath: this.nodePath(node),
        sourceElementId: this.getSourceId(node),
      });
      return undefined;
    }

    const byId = model.elements.find((element: ModelElement) => element.id === frag);
    if (byId) return byId.id;

    const name = this.getAttr(node, 'name');
    if (name) {
      const byName = model.elements.filter((element: ModelElement) => element.name === name);
      if (byName.length === 1) return byName[0].id;
      if (byName.length > 1) {
        this.addWarning(report, 'unresolvedReferences', {
          severity: 'warning',
          code: 'SIRIUS_AIRD_TARGET_AMBIGUOUS',
          message: `Semantic target "${frag}" matched multiple model elements named "${name}"; the element was dropped.`,
          sourcePath: this.nodePath(node),
          sourceElementId: this.getSourceId(node),
        });
        return undefined;
      }
    }

    this.addWarning(report, 'unresolvedReferences', {
      severity: 'warning',
      code: 'SIRIUS_AIRD_TARGET_UNRESOLVED',
      message: `Could not resolve Sirius semantic target "${frag}" in model "${model.name}"; the element was dropped.`,
      sourcePath: this.nodePath(node),
      sourceElementId: this.getSourceId(node),
    });
    return undefined;
  }

  private indexAirdLayout(allNodes: XmlNode[]): Map<string, AirdLayout> {
    const layout = new Map<string, AirdLayout>();
    for (const node of allNodes) {
      const type = this.getAttrByLocal(node, 'type') || node.name;
      const isGmfNode = /notation:Node|Node$/.test(type) && node.localName !== 'ownedDiagramElements';
      const isGmfEdge = /notation:Edge|Edge$/.test(type) && node.localName !== 'ownedDiagramElements';
      if (!isGmfNode && !isGmfEdge) continue;

      const elementRef = this.fragmentOf(this.getAttr(node, 'element'));
      if (!elementRef) continue;

      const entry = layout.get(elementRef) || {};
      if (isGmfNode) {
        const bounds = this.parseAirdBounds(node);
        if (bounds) entry.bounds = bounds;
        let parent = node.parent;
        while (parent) {
          const parentType = this.getAttrByLocal(parent, 'type') || parent.name;
          const isParentGmfNode = /notation:Node|Node$/.test(parentType)
            && parent.localName !== 'ownedDiagramElements';
          if (isParentGmfNode) {
            const parentElementId = this.fragmentOf(this.getAttr(parent, 'element'));
            if (parentElementId && parentElementId !== elementRef) {
              entry.parentElementId = parentElementId;
            }
            break;
          }
          parent = parent.parent;
        }
      } else {
        const points = this.parseAirdWaypoints(node);
        if (points.length > 0) entry.points = points;
      }
      layout.set(elementRef, entry);
    }

    const resolved = new Set<string>();
    const resolving = new Set<string>();
    const resolveBounds = (elementId: string): AirdBounds | undefined => {
      const entry = layout.get(elementId);
      if (!entry?.bounds || resolved.has(elementId)) return entry?.bounds;
      if (resolving.has(elementId)) return entry.bounds;
      resolving.add(elementId);
      if (entry.parentElementId) {
        const parentBounds = resolveBounds(entry.parentElementId);
        if (parentBounds) {
          entry.bounds = {
            ...entry.bounds,
            x: parentBounds.x + entry.bounds.x,
            y: parentBounds.y + entry.bounds.y,
          };
        }
      }
      resolving.delete(elementId);
      resolved.add(elementId);
      return entry.bounds;
    };
    Array.from(layout.keys()).forEach(resolveBounds);
    return layout;
  }

  private parseAirdBounds(gmfNode: XmlNode): AirdBounds | undefined {
    const constraint = this.children(gmfNode).find(child => child.localName === 'layoutConstraint') || gmfNode;
    const x = this.parseCoordinate(this.getAttr(constraint, 'x'));
    const y = this.parseCoordinate(this.getAttr(constraint, 'y'));
    const width = this.parseNumber(this.getAttr(constraint, 'width'));
    const height = this.parseNumber(this.getAttr(constraint, 'height'));
    if (x === undefined && y === undefined && width === undefined && height === undefined) {
      return undefined;
    }
    return { x: x ?? 0, y: y ?? 0, width: width ?? 120, height: height ?? 80 };
  }

  private parseAirdWaypoints(gmfEdge: XmlNode): Array<{ x: number; y: number }> {
    return this.descendantsByLocal(gmfEdge, 'points')
      .concat(this.descendantsByLocal(gmfEdge, 'waypoints'))
      .map(point => ({
        x: this.parseCoordinate(this.getAttr(point, 'x')),
        y: this.parseCoordinate(this.getAttr(point, 'y')),
      }))
      .filter((point): point is { x: number; y: number } => point.x !== undefined && point.y !== undefined);
  }

  private isSemanticDiagram(node: XmlNode): boolean {
    if (node.localName === 'DSemanticDiagram') return true;
    const type = this.getAttrByLocal(node, 'type');
    return Boolean(type && type.includes('DSemanticDiagram'));
  }

  private isDiagramElementEdge(node: XmlNode, viewpoint: Viewpoint | undefined): boolean {
    if (this.getAttr(node, 'sourceNode') || this.getAttr(node, 'targetNode')) return true;
    const type = this.getAttrByLocal(node, 'type') || node.name;
    if (/edge/i.test(type)) return true;

    const mappingFrag = this.fragmentOf(this.getAttr(node, 'mapping'));
    if (mappingFrag && viewpoint) {
      return (viewpoint.representationDescriptions || []).some(description =>
        (description.edgeMappings || []).some(edgeMapping => (
          edgeMapping.id === mappingFrag
          || edgeMapping.id === this.toStableId(mappingFrag)
          || edgeMapping.referenceName === mappingFrag
        ))
      );
    }
    return false;
  }

  private fragmentOf(ref?: string): string | undefined {
    if (!ref) return undefined;
    const trimmed = ref.trim();
    if (!trimmed) return undefined;
    if (trimmed.includes('#')) {
      const fragment = trimmed.slice(trimmed.lastIndexOf('#') + 1);
      return fragment || undefined;
    }
    if (trimmed.startsWith('//')) {
      // GMF structural paths (e.g. //@ownedDiagramElements.0) are not resolvable here.
      return undefined;
    }
    return trimmed;
  }

  private parseCoordinate(value?: string): number | undefined {
    if (value === undefined || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
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
        ...(mapping.containerMappings.length > 0 && { containerMappings: mapping.containerMappings }),
        ...(mapping.edgeMappings.length > 0 && { edgeMappings: mapping.edgeMappings }),
        ...(mapping.pinMappings.length > 0 && { pinMappings: mapping.pinMappings }),
        ...(mapping.layers.length > 0 && { layers: mapping.layers }),
        ...(mapping.filters.length > 0 && { filters: mapping.filters }),
        ...(mapping.conditionalStyles.length > 0 && { conditionalStyles: mapping.conditionalStyles }),
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
    const containerMappings: RepresentationContainerMapping[] = [];
    const edgeMappings: RepresentationEdgeMapping[] = [];
    const pinMappings: RepresentationPinMapping[] = [];
    const layers: RepresentationLayer[] = [];
    const filters: RepresentationFilter[] = [];
    const conditionalStyles: RepresentationConditionalStyle[] = [];
    const toolDefinitions: NonNullable<RepresentationDescription['toolDefinitions']> = [];

    const domainClass = this.resolveMetaClass(this.getAttr(node, 'domainClass'), context, node);
    if (domainClass) {
      visibleMetaClassIds.add(domainClass.id);
    }

    const supportedLayers = this.supportedLayerNodes(node, context.report);
    const siriusContainerMappings = this.descendantsIn(supportedLayers, 'containerMappings')
      .concat(this.descendantsIn(supportedLayers, 'subContainerMappings'));
    const nodeMappings = this.descendantsIn(supportedLayers, 'nodeMappings')
      .concat(this.descendantsIn(supportedLayers, 'subNodeMappings'))
      .concat(siriusContainerMappings);
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

      conditionalStyles.push(...this.parseConditionalStyles(
        mappingNode,
        metaClass.id,
        undefined
      ));
    });

    siriusContainerMappings.forEach((mappingNode, index) => {
      const containerMetaClass = this.resolveMetaClass(this.getAttr(mappingNode, 'domainClass'), context, mappingNode);
      if (!containerMetaClass) return;

      const childMappingNodes = this.children(mappingNode).filter(child => (
        child.localName === 'subNodeMappings'
        || child.localName === 'nodeMappings'
        || child.localName === 'subContainerMappings'
        || child.localName === 'containerMappings'
      ));
      const containmentReference = this.resolveContainerReference(
        mappingNode,
        childMappingNodes,
        containerMetaClass,
        context
      );
      if (!containmentReference) {
        this.addWarning(context.report, 'unresolvedReferences', {
          severity: 'warning',
          code: 'SIRIUS_CONTAINER_REFERENCE_UNRESOLVED',
          message: `Could not resolve container mapping "${this.getAttr(mappingNode, 'name') || containerMetaClass.name}" to a containment reference on ${containerMetaClass.name}.`,
          sourcePath: this.nodePath(mappingNode),
          sourceElementId: this.getSourceId(mappingNode),
        });
        return;
      }

      const childMetaClassIds = Array.from(new Set(childMappingNodes
        .map(child => this.resolveMetaClass(this.getAttr(child, 'domainClass'), context, child)?.id)
        .filter((id): id is string => Boolean(id))));
      const concreteSyntax = this.parseNodeStyle(mappingNode);
      containerMappings.push({
        id: this.toStableId(
          this.getSourceId(mappingNode)
          || this.getAttr(mappingNode, 'name')
          || `container-${index + 1}`
        ),
        containerMetaClassId: containerMetaClass.id,
        containmentReferenceId: containmentReference.id,
        childMetaClassIds: childMetaClassIds.length > 0
          ? childMetaClassIds
          : [containmentReference.target],
        ...(concreteSyntax && { concreteSyntax }),
      });
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


      conditionalStyles.push(...this.parseConditionalStyles(
        mappingNode,
        pinMetaClass.id,
        undefined
      ));
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

      conditionalStyles.push(...this.parseConditionalStyles(
        mappingNode,
        undefined,
        reference?.id
      ));

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

    this.childrenByLocal(node, 'additionalLayers').forEach((layerNode, index) => {
      layers.push(this.parseAdditionalLayer(layerNode, index, context));
    });

    this.childrenByLocal(node, 'filters').forEach((filterNode, index) => {
      filters.push(this.parseRepresentationFilter(filterNode, index));
    });

    return {
      visibleMetaClassIds,
      creatableMetaClassIds,
      concreteSyntaxByMetaClassId,
      concreteSyntaxByReferenceId,
      containerMappings,
      edgeMappings,
      pinMappings,
      layers,
      filters,
      conditionalStyles,
      toolDefinitions,
    };
  }

  private parseConditionalStyles(
    mappingNode: XmlNode,
    metaClassId?: string,
    referenceId?: string
  ): RepresentationConditionalStyle[] {
    const mappingId = this.toStableId(
      this.getSourceId(mappingNode)
      || this.getAttr(mappingNode, 'name')
      || mappingNode.localName
    );
    const mappingKind = this.mappingKind(mappingNode.localName);
    return this.children(mappingNode)
      .filter(child => child.localName === 'conditionnalStyles' || child.localName === 'conditionalStyles')
      .map((styleNode, index) => {
        const sourceId = this.getSourceId(styleNode) || `${mappingId}-conditional-${index + 1}`;
        const predicateExpression = this.getAttr(styleNode, 'predicateExpression') || '';
        if (mappingKind === 'edge') {
          return {
            id: this.toStableId(sourceId),
            mappingId,
            mappingKind,
            ...(referenceId && { referenceId }),
            predicateExpression,
            enabled: true,
            ...(this.parseEdgeStyle(styleNode) && { edgeConcreteSyntax: this.parseEdgeStyle(styleNode) }),
          };
        }
        return {
          id: this.toStableId(sourceId),
          mappingId,
          mappingKind,
          ...(metaClassId && { metaClassId }),
          predicateExpression,
          enabled: true,
          ...(this.parseNodeStyle(styleNode) && { concreteSyntax: this.parseNodeStyle(styleNode) }),
        };
      });
  }

  private parseAdditionalLayer(
    layerNode: XmlNode,
    index: number,
    context: ParseContext
  ): RepresentationLayer {
    const layerId = this.toStableId(
      this.getSourceId(layerNode)
      || this.getAttr(layerNode, 'name')
      || `layer-${index + 1}`
    );
    const mappingNames = new Set([
      'nodeMappings',
      'subNodeMappings',
      'containerMappings',
      'subContainerMappings',
      'borderedNodeMappings',
      'edgeMappings',
    ]);
    const mappings = this.walk(layerNode)
      .filter(candidate => candidate !== layerNode && mappingNames.has(candidate.localName))
      .map((mappingNode, mappingIndex): RepresentationLayerMapping => {
        const id = this.toStableId(
          this.getSourceId(mappingNode)
          || this.getAttr(mappingNode, 'name')
          || `${layerId}-mapping-${mappingIndex + 1}`
        );
        const parent = mappingNode.parent && mappingNames.has(mappingNode.parent.localName)
          ? mappingNode.parent
          : undefined;
        const kind = this.mappingKind(mappingNode.localName);
        const metaClass = kind === 'edge'
          ? undefined
          : this.resolveMetaClass(this.getAttr(mappingNode, 'domainClass'), context, mappingNode);
        const reference = kind === 'edge'
          ? this.resolveReferenceMapping(mappingNode, context)
          : undefined;
        return {
          id,
          name: this.getAttr(mappingNode, 'name') || `Mapping ${mappingIndex + 1}`,
          kind,
          ...(parent && {
            parentMappingId: this.toStableId(
              this.getSourceId(parent) || this.getAttr(parent, 'name') || parent.localName
            ),
          }),
          ...(metaClass && { metaClassId: metaClass.id }),
          ...(reference && { referenceId: reference.id }),
          ...(this.getAttr(mappingNode, 'semanticCandidatesExpression') && {
            semanticCandidatesExpression: this.getAttr(mappingNode, 'semanticCandidatesExpression'),
          }),
          ...(this.getAttr(mappingNode, 'targetFinderExpression') && {
            targetFinderExpression: this.getAttr(mappingNode, 'targetFinderExpression'),
          }),
          ...(kind === 'edge'
            ? (this.parseEdgeStyle(mappingNode) && { edgeConcreteSyntax: this.parseEdgeStyle(mappingNode) })
            : (this.parseNodeStyle(mappingNode) && { concreteSyntax: this.parseNodeStyle(mappingNode) })),
        };
      });

    const activeByDefault = this.getAttr(layerNode, 'activeByDefault') === 'true';
    const optional = this.getAttr(layerNode, 'optional') !== 'false';
    return {
      id: layerId,
      name: this.getAttr(layerNode, 'name') || `Layer ${index + 1}`,
      ...(this.getAttr(layerNode, 'label') && { label: this.getAttr(layerNode, 'label') }),
      optional,
      activeByDefault,
      enabled: !optional || activeByDefault,
      mappings,
    };
  }

  private parseRepresentationFilter(filterNode: XmlNode, index: number): RepresentationFilter {
    const filterId = this.toStableId(
      this.getSourceId(filterNode)
      || this.getAttr(filterNode, 'name')
      || `filter-${index + 1}`
    );
    const nestedRules = this.childrenByLocal(filterNode, 'filters');
    const ruleNodes = nestedRules.length > 0 ? nestedRules : [filterNode];
    return {
      id: filterId,
      name: this.getAttr(filterNode, 'name') || `Filter ${index + 1}`,
      enabled: true,
      rules: ruleNodes.map((ruleNode, ruleIndex) => {
        const type = (this.getAttrByLocal(ruleNode, 'type') || '').toLowerCase();
        const mappingReferences = (this.getAttr(ruleNode, 'mappings') || '')
          .split(/\s+/)
          .filter(Boolean);
        return {
          id: this.toStableId(
            this.getSourceId(ruleNode) || `${filterId}-rule-${ruleIndex + 1}`
          ),
          kind: type.includes('variable') ? 'variable' : 'mapping',
          ...(this.getAttr(ruleNode, 'filterKind') && {
            filterKind: this.getAttr(ruleNode, 'filterKind')!.toLowerCase() === 'collapse'
              ? 'collapse' as const
              : 'hide' as const,
          }),
          ...(mappingReferences.length > 0 && {
            mappingReferences,
            mappingIds: mappingReferences.map(reference => this.mappingIdFromReference(reference)),
          }),
          ...(this.getAttr(ruleNode, 'semanticConditionExpression') && {
            semanticConditionExpression: this.getAttr(ruleNode, 'semanticConditionExpression'),
          }),
          ...(this.getAttr(ruleNode, 'viewConditionExpression') && {
            viewConditionExpression: this.getAttr(ruleNode, 'viewConditionExpression'),
          }),
        };
      }),
    };
  }

  private mappingKind(localName: string): RepresentationLayerMapping['kind'] {
    if (localName === 'edgeMappings') return 'edge';
    if (localName === 'containerMappings' || localName === 'subContainerMappings') return 'container';
    if (localName === 'borderedNodeMappings') return 'bordered-node';
    return 'node';
  }

  private mappingIdFromReference(reference: string): string {
    const names = Array.from(reference.matchAll(/\[name='([^']+)'\]/g));
    const encodedName = names[names.length - 1]?.[1];
    if (!encodedName) return this.toStableId(reference);
    try {
      return this.toStableId(decodeURIComponent(encodedName));
    } catch {
      return this.toStableId(encodedName);
    }
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

  private resolveContainerReference(
    mappingNode: XmlNode,
    childMappingNodes: XmlNode[],
    containerMetaClass: MetaClass,
    context: ParseContext
  ): MetaReference | undefined {
    if (!context.metamodel) return undefined;

    const expressions = [
      ...childMappingNodes.flatMap(child => [
        this.getAttr(child, 'semanticCandidatesExpression'),
        this.getAttr(child, 'semanticElements'),
      ]),
      this.getAttr(mappingNode, 'childrenExpression'),
      this.getAttr(mappingNode, 'semanticCandidatesExpression'),
      this.getAttr(mappingNode, 'containmentReference'),
    ];
    const featureNames = expressions
      .map(expression => this.extractFeatureName(expression))
      .filter((name): name is string => Boolean(name));

    const references = this.getAllMetaReferences(containerMetaClass, context.metamodel)
      .filter(reference => reference.containment);
    return references.find(reference => featureNames.some(name => (
      reference.id === name
      || reference.name === name
      || this.normalizeQualifiedName(reference.name) === this.normalizeQualifiedName(name)
    ))) || (references.length === 1 ? references[0] : undefined);
  }

  private getAllMetaReferences(metaClass: MetaClass, metamodel: Metamodel): MetaReference[] {
    const references: MetaReference[] = [...(metaClass.references || [])];
    const visited = new Set<string>([metaClass.id]);
    const visit = (candidate: MetaClass) => {
      for (const superTypeId of candidate.superTypes || []) {
        if (visited.has(superTypeId)) continue;
        visited.add(superTypeId);
        const superType = metamodel.classes.find(item => item.id === superTypeId);
        if (superType) {
          references.push(...(superType.references || []));
          visit(superType);
        }
      }
    };
    visit(metaClass);

    const seenNames = new Set<string>();
    return references.filter(reference => {
      if (seenNames.has(reference.name)) return false;
      seenNames.add(reference.name);
      return true;
    });
  }

  private buildOdesignXml(metamodel: Metamodel, viewpoints: Viewpoint[], report: SiriusCompatibilityReport): string {
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<description:Group xmi:version="2.0"',
      '    xmlns:xmi="http://www.omg.org/XMI"',
      '    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
      '    xmlns:description="http://www.eclipse.org/sirius/description/1.1.0"',
      '    xmlns:diagram="http://www.eclipse.org/sirius/diagram/description/1.1.0"',
      '    xmlns:filter="http://www.eclipse.org/sirius/diagram/description/filter/1.1.0"',
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
        this.appendRepresentationFilters(lines, description);
        lines.push('      <defaultLayer name="Default">');

        const pinMappings = description.pinMappings || [];
        const pinMetaClassIds = new Set(pinMappings.flatMap(pinMapping => pinMapping.pinMetaClassIds));
        const emittedPinKeys = new Set<string>();
        const appendPinMappings = (ownerMetaClassId: string, indent: string) => {
          pinMappings
            .filter(pinMapping => pinMapping.ownerMetaClassIds.includes(ownerMetaClassId))
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
                lines.push(`${indent}<borderedNodeMappings xmi:id="${this.escapeXml(`${description.id}-${pinMapping.id}-${pinMetaClass.id}`)}" name="${this.escapeXml(pinMetaClass.name)}" domainClass="${this.escapeXml(this.toSiriusDomainClass(metamodel, pinMetaClass))}">`);
                lines.push(`${indent}  ${this.buildNodeStyleXml(pinSyntax)}`);
                this.appendConditionalNodeStyles(
                  lines,
                  description,
                  indent + '  ',
                  'bordered-node',
                  pinMetaClass.id
                );
                lines.push(`${indent}</borderedNodeMappings>`);
                emittedPinKeys.add(`${pinMapping.id}:${pinMetaClass.id}`);
              });
            });
        };

        const resolvedContainerMappings = (description.containerMappings || []).flatMap(mapping => {
          const containerMetaClass = metamodel.classes.find(candidate => candidate.id === mapping.containerMetaClassId);
          const containmentReference = containerMetaClass
            ? this.getAllMetaReferences(containerMetaClass, metamodel).find(reference => (
                reference.containment
                && (
                  reference.id === mapping.containmentReferenceId
                  || reference.name === mapping.containmentReferenceId
                )
              ))
            : undefined;
          if (!containerMetaClass || !containmentReference) {
            this.addWarning(report, 'unresolvedReferences', {
              severity: 'warning',
              code: 'SPATIALDSL_CONTAINER_MAPPING_UNRESOLVED',
              message: `Container mapping "${mapping.id}" does not resolve to a container metaclass and containment reference.`,
              spatialElementId: mapping.id,
            });
            return [];
          }
          return [{ mapping, containerMetaClass, containmentReference }];
        });
        const containerMetaClassIds = new Set(resolvedContainerMappings.map(entry => entry.containerMetaClass.id));
        const containedMetaClassIds = new Set(resolvedContainerMappings.flatMap(entry => (
          entry.mapping.childMetaClassIds?.length
            ? entry.mapping.childMetaClassIds
            : [entry.containmentReference.target]
        )));

        description.visibleMetaClassIds.forEach(metaClassId => {
          if (
            pinMetaClassIds.has(metaClassId)
            || containerMetaClassIds.has(metaClassId)
            || containedMetaClassIds.has(metaClassId)
          ) {
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
          this.appendConditionalNodeStyles(lines, description, '          ', 'node', metaClass.id);
          appendPinMappings(metaClass.id, '          ');

          lines.push('        </nodeMappings>');
        });

        resolvedContainerMappings.forEach(({ mapping, containerMetaClass, containmentReference }) => {
          const syntax = mapping.concreteSyntax
            || description.concreteSyntaxByMetaClassId?.[containerMetaClass.id]
            || containerMetaClass.concreteSyntax;
          lines.push(`        <containerMappings xmi:id="${this.escapeXml(mapping.id)}" name="${this.escapeXml(containerMetaClass.name)}" domainClass="${this.escapeXml(this.toSiriusDomainClass(metamodel, containerMetaClass))}">`);
          lines.push(`          ${this.buildNodeStyleXml(syntax)}`);
          this.appendConditionalNodeStyles(
            lines,
            description,
            '          ',
            'container',
            containerMetaClass.id,
            mapping.id
          );
          appendPinMappings(containerMetaClass.id, '          ');

          const childMetaClassIds = mapping.childMetaClassIds?.length
            ? mapping.childMetaClassIds
            : [containmentReference.target];
          childMetaClassIds.forEach(childMetaClassId => {
            const childMetaClass = metamodel.classes.find(candidate => candidate.id === childMetaClassId);
            if (!childMetaClass) {
              this.addWarning(report, 'unresolvedReferences', {
                severity: 'warning',
                code: 'SPATIALDSL_CONTAINER_CHILD_UNRESOLVED',
                message: `Container mapping "${mapping.id}" references unknown child metaclass "${childMetaClassId}".`,
                spatialElementId: childMetaClassId,
              });
              return;
            }
            const childSyntax = description.concreteSyntaxByMetaClassId?.[childMetaClass.id]
              || childMetaClass.concreteSyntax;
            lines.push(`          <subNodeMappings xmi:id="${this.escapeXml(`${mapping.id}-${childMetaClass.id}-node`)}" name="${this.escapeXml(childMetaClass.name)}" domainClass="${this.escapeXml(this.toSiriusDomainClass(metamodel, childMetaClass))}" semanticCandidatesExpression="feature:${this.escapeXml(containmentReference.name)}">`);
            lines.push(`            ${this.buildNodeStyleXml(childSyntax)}`);
            this.appendConditionalNodeStyles(lines, description, '            ', 'node', childMetaClass.id);
            appendPinMappings(childMetaClass.id, '            ');
            lines.push('          </subNodeMappings>');
          });
          lines.push('        </containerMappings>');
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
          this.appendConditionalEdgeStyles(lines, description, '          ', reference.id);
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
        this.appendAdditionalLayers(lines, metamodel, description, report);
        lines.push('    </ownedRepresentations>');
      });

      lines.push('  </ownedViewpoints>');
    });

    lines.push('</description:Group>');
    return lines.join('\n');
  }

  private appendRepresentationFilters(
    lines: string[],
    description: RepresentationDescription
  ): void {
    (description.filters || [])
      .filter(filter => filter.enabled !== false)
      .forEach(filter => {
        lines.push(`      <filters xmi:id="${this.escapeXml(filter.id)}" xsi:type="filter:CompositeFilterDescription" name="${this.escapeXml(filter.name)}">`);
        filter.rules.forEach(rule => {
          const type = rule.kind === 'variable' ? 'VariableFilter' : 'MappingFilter';
          const filterKind = rule.filterKind
            ? ` filterKind="${rule.filterKind.toUpperCase()}"`
            : '';
          const mappingReferences = (rule.mappingReferences || rule.mappingIds || []).join(' ');
          const mappings = mappingReferences
            ? ` mappings="${this.escapeXml(mappingReferences)}"`
            : '';
          const semanticCondition = rule.semanticConditionExpression
            ? ` semanticConditionExpression="${this.escapeXml(rule.semanticConditionExpression)}"`
            : '';
          const viewCondition = rule.viewConditionExpression
            ? ` viewConditionExpression="${this.escapeXml(rule.viewConditionExpression)}"`
            : '';
          lines.push(`        <filters xmi:id="${this.escapeXml(rule.id)}" xsi:type="filter:${type}"${filterKind}${mappings}${semanticCondition}${viewCondition}/>`);
        });
        lines.push('      </filters>');
      });
  }

  private appendConditionalNodeStyles(
    lines: string[],
    description: RepresentationDescription,
    indent: string,
    mappingKind: RepresentationConditionalStyle['mappingKind'],
    metaClassId: string,
    mappingId?: string
  ): void {
    (description.conditionalStyles || [])
      .filter(style => (
        style.enabled !== false
        && (
          (mappingId !== undefined && style.mappingId === mappingId)
          || (
            style.metaClassId === metaClassId
            && (
              style.mappingKind === mappingKind
              || (mappingKind === 'container' && style.mappingKind === 'node')
            )
          )
        )
      ))
      .forEach(style => {
        lines.push(`${indent}<conditionnalStyles xmi:id="${this.escapeXml(style.id)}" predicateExpression="${this.escapeXml(style.predicateExpression)}">`);
        lines.push(`${indent}  ${this.buildNodeStyleXml(style.concreteSyntax)}`);
        lines.push(`${indent}</conditionnalStyles>`);
      });
  }

  private appendConditionalEdgeStyles(
    lines: string[],
    description: RepresentationDescription,
    indent: string,
    referenceId: string,
    mappingId?: string
  ): void {
    (description.conditionalStyles || [])
      .filter(style => (
        style.enabled !== false
        && style.mappingKind === 'edge'
        && (style.referenceId === referenceId || (mappingId !== undefined && style.mappingId === mappingId))
      ))
      .forEach(style => {
        lines.push(`${indent}<conditionnalStyles xmi:id="${this.escapeXml(style.id)}" predicateExpression="${this.escapeXml(style.predicateExpression)}">`);
        lines.push(`${indent}  ${this.buildEdgeStyleXml(style.edgeConcreteSyntax)}`);
        lines.push(`${indent}</conditionnalStyles>`);
      });
  }

  private appendAdditionalLayers(
    lines: string[],
    metamodel: Metamodel,
    description: RepresentationDescription,
    report: SiriusCompatibilityReport
  ): void {
    (description.layers || []).forEach(layer => {
      const label = layer.label ? ` label="${this.escapeXml(layer.label)}"` : '';
      const optional = layer.optional === false ? ' optional="false"' : '';
      const activeByDefault = (layer.enabled ?? layer.activeByDefault)
        ? ' activeByDefault="true"'
        : '';
      lines.push(`      <additionalLayers xmi:id="${this.escapeXml(layer.id)}" name="${this.escapeXml(layer.name)}"${label}${optional}${activeByDefault}>`);

      const mappings = layer.mappings || [];
      const ids = new Set(mappings.map(mapping => mapping.id));
      const roots = mappings.filter(mapping => !mapping.parentMappingId || !ids.has(mapping.parentMappingId));
      const appendMapping = (mapping: RepresentationLayerMapping, indent: string) => {
        const metaClass = mapping.metaClassId
          ? metamodel.classes.find(candidate => candidate.id === mapping.metaClassId)
          : undefined;
        const reference = mapping.referenceId ? this.findReference(metamodel, mapping.referenceId) : undefined;
        if (mapping.metaClassId && !metaClass) {
          this.addWarning(report, 'unresolvedReferences', {
            severity: 'warning',
            code: 'SPATIALDSL_LAYER_METACLASS_UNRESOLVED',
            message: `Layer mapping "${mapping.name}" references unknown metaclass "${mapping.metaClassId}".`,
            spatialElementId: mapping.id,
          });
        }
        if (mapping.referenceId && !reference) {
          this.addWarning(report, 'unresolvedReferences', {
            severity: 'warning',
            code: 'SPATIALDSL_LAYER_REFERENCE_UNRESOLVED',
            message: `Layer mapping "${mapping.name}" references unknown reference "${mapping.referenceId}".`,
            spatialElementId: mapping.id,
          });
        }

        const tag = mapping.kind === 'edge'
          ? 'edgeMappings'
          : mapping.kind === 'container'
            ? 'containerMappings'
            : mapping.kind === 'bordered-node'
              ? 'borderedNodeMappings'
              : 'nodeMappings';
        const domainClass = metaClass
          ? ` domainClass="${this.escapeXml(this.toSiriusDomainClass(metamodel, metaClass))}"`
          : '';
        const semanticCandidates = mapping.semanticCandidatesExpression
          ? ` semanticCandidatesExpression="${this.escapeXml(mapping.semanticCandidatesExpression)}"`
          : '';
        const targetFinder = mapping.targetFinderExpression || (reference ? `feature:${reference.name}` : undefined);
        const targetFinderAttr = targetFinder
          ? ` targetFinderExpression="${this.escapeXml(targetFinder)}"`
          : '';
        lines.push(`${indent}<${tag} xmi:id="${this.escapeXml(mapping.id)}" name="${this.escapeXml(mapping.name)}"${domainClass}${semanticCandidates}${targetFinderAttr}>`);
        lines.push(`${indent}  ${mapping.kind === 'edge'
          ? this.buildEdgeStyleXml(mapping.edgeConcreteSyntax)
          : this.buildNodeStyleXml(mapping.concreteSyntax)}`);
        if (mapping.kind === 'edge' && reference) {
          this.appendConditionalEdgeStyles(lines, description, indent + '  ', reference.id, mapping.id);
        } else if (metaClass) {
          this.appendConditionalNodeStyles(
            lines,
            description,
            indent + '  ',
            mapping.kind,
            metaClass.id,
            mapping.id
          );
        }
        mappings
          .filter(child => child.parentMappingId === mapping.id)
          .forEach(child => appendMapping(child, indent + '  '));
        lines.push(`${indent}</${tag}>`);
      };
      roots.forEach(mapping => appendMapping(mapping, '        '));
      lines.push('      </additionalLayers>');
    });
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
