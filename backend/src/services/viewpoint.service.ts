import prisma from '../config/database';
import { ApiError } from '../middleware';
import { v4 as uuidv4 } from 'uuid';
import {
  ConcreteSyntax,
  ConcreteSyntaxEdge,
  CreateViewpointRequest,
  MetaClass,
  MetaReference,
  Metamodel,
  RepresentationConditionalStyle,
  RepresentationDescription,
  RepresentationFilter,
  RepresentationLayer,
  RepresentationLayerMapping,
  ToolDefinition,
  UpdateViewpointRequest,
  UserRole,
  Viewpoint
} from '../../../shared/types';
import { sharingService } from './sharing.service';
import { canPerformOperation } from '../middleware/permissions';
import {
  validateConcreteSyntaxMapVerticalPlacements,
  validateConcreteSyntaxVerticalPlacement,
} from '../../../shared/spatial';

const REPRESENTATION_KINDS = new Set(['diagram', 'table', 'tree']);
const ATTACHMENT_SIDES = new Set(['top', 'right', 'bottom', 'left']);
const PIN_DIRECTIONS = new Set(['input', 'output', 'inout']);
const TOOL_TYPES = new Set(['create-node', 'create-edge', 'delete', 'direct-edit', 'reconnect']);
const LAYER_MAPPING_KINDS = new Set(['node', 'container', 'bordered-node', 'edge']);
const FILTER_RULE_KINDS = new Set(['mapping', 'variable']);
const FILTER_KINDS = new Set(['hide', 'collapse']);

class ViewpointService {
  private assertValidConcreteSyntax(value: unknown, path: string): void {
    const errors = validateConcreteSyntaxVerticalPlacement(value, path);
    if (errors.length > 0) throw new ApiError(400, errors[0]);
  }

  private assertValidConcreteSyntaxMap(value: unknown, path: string): void {
    const errors = validateConcreteSyntaxMapVerticalPlacements(value, path);
    if (errors.length > 0) throw new ApiError(400, errors[0]);
  }

  private mapToMetamodel(row: any): Metamodel {
    return {
      id: row.id,
      name: row.name,
      eClass: row.eClass || '',
      uri: row.uri,
      prefix: row.prefix,
      classes: (row.classes as unknown as MetaClass[]) || [],
      enums: row.enums || [],
      constraints: row.constraints || [],
      conformsTo: row.conformsToId,
    };
  }

  private mapToViewpoint(row: any): Viewpoint {
    return {
      id: row.id,
      projectId: row.projectId || undefined,
      name: row.name,
      description: row.description || undefined,
      metamodelId: row.metamodelId,
      representationDescriptions: (row.representationDescriptions as RepresentationDescription[]) || [],
      sharedConcreteSyntaxByMetaClassId: (row.sharedConcreteSyntax as Record<string, ConcreteSyntax>) || {},
      isDefault: row.isDefault,
    };
  }

  private buildDefaultRepresentationDescription(viewpointId: string, metamodel: Metamodel): RepresentationDescription {
    const visibleMetaClassIds = metamodel.classes.map(metaClass => metaClass.id);
    const creatableMetaClassIds = metamodel.classes
      .filter(metaClass => !metaClass.abstract)
      .map(metaClass => metaClass.id);
    const concreteSyntaxByMetaClassId: Record<string, ConcreteSyntax> = {};
    const concreteSyntaxByReferenceId: Record<string, ConcreteSyntaxEdge> = {};

    for (const metaClass of metamodel.classes) {
      if (metaClass.concreteSyntax) {
        concreteSyntaxByMetaClassId[metaClass.id] = metaClass.concreteSyntax;
      }

      for (const reference of metaClass.references || []) {
        if ((reference as MetaReference).concreteSyntax) {
          concreteSyntaxByReferenceId[reference.id] = (reference as MetaReference).concreteSyntax!;
        }
      }
    }

    this.assertValidConcreteSyntaxMap(
      concreteSyntaxByMetaClassId,
      'representationDescriptions[0].concreteSyntaxByMetaClassId'
    );

    return {
      id: uuidv4(),
      name: 'Default Diagram',
      viewpointId,
      kind: 'diagram',
      visibleMetaClassIds,
      creatableMetaClassIds,
      concreteSyntaxByMetaClassId,
      concreteSyntaxByReferenceId,
      isDefault: true,
    };
  }

  private async assertCanReadMetamodel(metamodelId: string, userId: string): Promise<void> {
    const access = await sharingService.checkAccess('METAMODEL', metamodelId, userId);
    if (!access.hasAccess) {
      throw new ApiError(404, 'Metamodel not found');
    }
  }

  private async assertCanEditMetamodel(metamodelId: string, userId: string, userRole: UserRole): Promise<any> {
    if (!canPerformOperation(userRole, 'metamodel', 'create')) {
      throw new ApiError(403, 'Your role does not allow editing viewpoints');
    }

    const access = await sharingService.checkAccess('METAMODEL', metamodelId, userId);
    if (!access.hasAccess) {
      throw new ApiError(404, 'Metamodel not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this metamodel');
    }

    const metamodel = await prisma.metamodel.findFirst({ where: { id: metamodelId } });
    if (!metamodel) {
      throw new ApiError(404, 'Metamodel not found');
    }

    return metamodel;
  }

  private normalizeName(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new ApiError(400, `${fieldName} is required`);
    }

    const name = value.trim();
    if (!name) {
      throw new ApiError(400, `${fieldName} is required`);
    }

    return name;
  }

  private nameKey(value: string): string {
    return value.trim().toLowerCase();
  }

  private uniqueStringIds(values: unknown, fieldName: string): string[] {
    if (values === undefined) {
      return [];
    }

    if (!Array.isArray(values)) {
      throw new ApiError(400, `${fieldName} must be an array`);
    }

    const ids: string[] = [];
    for (const value of values) {
      if (typeof value !== 'string' || !value.trim()) {
        throw new ApiError(400, `${fieldName} must contain non-empty string IDs`);
      }
      const id = value.trim();
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }

    return ids;
  }

  private normalizePinMappings(value: unknown): RepresentationDescription['pinMappings'] {
    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw new ApiError(400, 'pinMappings must be an array');
    }

    return value.map((mapping, index) => {
      if (!mapping || typeof mapping !== 'object') {
        throw new ApiError(400, `pinMappings[${index}] must be an object`);
      }

      const candidate = mapping as Record<string, any>;
      const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : uuidv4();
      const pinMetaClassIds = this.uniqueStringIds(candidate.pinMetaClassIds, `pinMappings[${index}].pinMetaClassIds`);
      const ownerMetaClassIds = this.uniqueStringIds(candidate.ownerMetaClassIds, `pinMappings[${index}].ownerMetaClassIds`);

      if (pinMetaClassIds.length === 0) {
        throw new ApiError(400, `pinMappings[${index}].pinMetaClassIds must not be empty`);
      }

      if (ownerMetaClassIds.length === 0) {
        throw new ApiError(400, `pinMappings[${index}].ownerMetaClassIds must not be empty`);
      }

      const allowedSides = candidate.allowedSides === undefined
        ? undefined
        : this.uniqueStringIds(candidate.allowedSides, `pinMappings[${index}].allowedSides`);
      if (allowedSides?.some(side => !ATTACHMENT_SIDES.has(side))) {
        throw new ApiError(400, `pinMappings[${index}].allowedSides contains an invalid side`);
      }

      if (candidate.defaultSide !== undefined && !ATTACHMENT_SIDES.has(candidate.defaultSide)) {
        throw new ApiError(400, `pinMappings[${index}].defaultSide is invalid`);
      }

      if (
        candidate.defaultSide !== undefined
        && allowedSides?.length
        && !allowedSides.includes(candidate.defaultSide)
      ) {
        throw new ApiError(400, `pinMappings[${index}].defaultSide must be one of allowedSides`);
      }

      if (
        candidate.defaultOffsetRatio !== undefined
        && (
          typeof candidate.defaultOffsetRatio !== 'number'
          || !Number.isFinite(candidate.defaultOffsetRatio)
          || candidate.defaultOffsetRatio < 0
          || candidate.defaultOffsetRatio > 1
        )
      ) {
        throw new ApiError(400, `pinMappings[${index}].defaultOffsetRatio must be between 0 and 1`);
      }

      if (candidate.direction !== undefined && !PIN_DIRECTIONS.has(candidate.direction)) {
        throw new ApiError(400, `pinMappings[${index}].direction is invalid`);
      }

      return {
        id,
        pinMetaClassIds,
        ownerMetaClassIds,
        ...(typeof candidate.attachmentReferenceName === 'string' && candidate.attachmentReferenceName.trim() && {
          attachmentReferenceName: candidate.attachmentReferenceName.trim(),
        }),
        ...(candidate.direction !== undefined && { direction: candidate.direction }),
        ...(allowedSides !== undefined && { allowedSides: allowedSides as Array<'top' | 'right' | 'bottom' | 'left'> }),
        ...(candidate.defaultSide !== undefined && { defaultSide: candidate.defaultSide }),
        ...(candidate.defaultOffsetRatio !== undefined && { defaultOffsetRatio: candidate.defaultOffsetRatio }),
      };
    });
  }

  private normalizeContainerMappings(value: unknown): RepresentationDescription['containerMappings'] {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      throw new ApiError(400, 'containerMappings must be an array');
    }

    const seenIds = new Set<string>();
    return value.map((mapping, index) => {
      if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
        throw new ApiError(400, `containerMappings[${index}] must be an object`);
      }

      const candidate = mapping as Record<string, any>;
      const id = typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id.trim()
        : uuidv4();
      if (seenIds.has(id)) {
        throw new ApiError(400, 'Container mapping IDs must be unique within a representation');
      }
      seenIds.add(id);

      if (typeof candidate.containerMetaClassId !== 'string' || !candidate.containerMetaClassId.trim()) {
        throw new ApiError(400, `containerMappings[${index}].containerMetaClassId is required`);
      }
      if (typeof candidate.containmentReferenceId !== 'string' || !candidate.containmentReferenceId.trim()) {
        throw new ApiError(400, `containerMappings[${index}].containmentReferenceId is required`);
      }
      if (
        candidate.concreteSyntax !== undefined
        && (!candidate.concreteSyntax || typeof candidate.concreteSyntax !== 'object' || Array.isArray(candidate.concreteSyntax))
      ) {
        throw new ApiError(400, `containerMappings[${index}].concreteSyntax must be an object`);
      }
      if (candidate.concreteSyntax !== undefined) {
        this.assertValidConcreteSyntax(
          candidate.concreteSyntax,
          `containerMappings[${index}].concreteSyntax`
        );
      }

      return {
        id,
        containerMetaClassId: candidate.containerMetaClassId.trim(),
        containmentReferenceId: candidate.containmentReferenceId.trim(),
        ...(candidate.childMetaClassIds !== undefined && {
          childMetaClassIds: this.uniqueStringIds(
            candidate.childMetaClassIds,
            `containerMappings[${index}].childMetaClassIds`
          ),
        }),
        ...(candidate.concreteSyntax !== undefined && { concreteSyntax: candidate.concreteSyntax }),
      };
    });
  }

  private normalizePropertySections(value: unknown): RepresentationDescription['propertySections'] {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      throw new ApiError(400, 'propertySections must be an array');
    }

    const seenIds = new Set<string>();
    return value.map((section, index) => {
      if (!section || typeof section !== 'object' || Array.isArray(section)) {
        throw new ApiError(400, `propertySections[${index}] must be an object`);
      }

      const candidate = section as Record<string, any>;
      const id = typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id.trim()
        : uuidv4();
      if (seenIds.has(id)) {
        throw new ApiError(400, 'Property section IDs must be unique within a representation');
      }
      seenIds.add(id);

      return {
        id,
        name: this.normalizeName(candidate.name, `propertySections[${index}].name`),
        ...(candidate.metaClassIds !== undefined && {
          metaClassIds: this.uniqueStringIds(candidate.metaClassIds, `propertySections[${index}].metaClassIds`),
        }),
        ...(candidate.attributeNames !== undefined && {
          attributeNames: this.uniqueStringIds(candidate.attributeNames, `propertySections[${index}].attributeNames`),
        }),
        ...(candidate.referenceNames !== undefined && {
          referenceNames: this.uniqueStringIds(candidate.referenceNames, `propertySections[${index}].referenceNames`),
        }),
      };
    });
  }

  private normalizeConditionalStyles(value: unknown): RepresentationConditionalStyle[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      throw new ApiError(400, 'conditionalStyles must be an array');
    }

    const seenIds = new Set<string>();
    return value.map((style, index) => {
      if (!style || typeof style !== 'object' || Array.isArray(style)) {
        throw new ApiError(400, `conditionalStyles[${index}] must be an object`);
      }
      const candidate = style as Record<string, any>;
      const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : uuidv4();
      if (seenIds.has(id)) {
        throw new ApiError(400, 'Conditional style IDs must be unique within a representation');
      }
      seenIds.add(id);
      if (typeof candidate.mappingId !== 'string' || !candidate.mappingId.trim()) {
        throw new ApiError(400, `conditionalStyles[${index}].mappingId is required`);
      }
      if (!LAYER_MAPPING_KINDS.has(candidate.mappingKind)) {
        throw new ApiError(400, `conditionalStyles[${index}].mappingKind is invalid`);
      }
      if (typeof candidate.predicateExpression !== 'string') {
        throw new ApiError(400, `conditionalStyles[${index}].predicateExpression must be a string`);
      }
      if (candidate.enabled !== undefined && typeof candidate.enabled !== 'boolean') {
        throw new ApiError(400, `conditionalStyles[${index}].enabled must be boolean`);
      }
      for (const key of ['concreteSyntax', 'edgeConcreteSyntax']) {
        if (candidate[key] !== undefined && (!candidate[key] || typeof candidate[key] !== 'object' || Array.isArray(candidate[key]))) {
          throw new ApiError(400, `conditionalStyles[${index}].${key} must be an object`);
        }
      }
      if (candidate.concreteSyntax !== undefined) {
        this.assertValidConcreteSyntax(
          candidate.concreteSyntax,
          `conditionalStyles[${index}].concreteSyntax`
        );
      }
      return {
        id,
        mappingId: candidate.mappingId.trim(),
        mappingKind: candidate.mappingKind,
        ...(typeof candidate.metaClassId === 'string' && candidate.metaClassId.trim() && { metaClassId: candidate.metaClassId.trim() }),
        ...(typeof candidate.referenceId === 'string' && candidate.referenceId.trim() && { referenceId: candidate.referenceId.trim() }),
        predicateExpression: candidate.predicateExpression,
        ...(candidate.enabled !== undefined && { enabled: candidate.enabled }),
        ...(candidate.concreteSyntax !== undefined && { concreteSyntax: candidate.concreteSyntax }),
        ...(candidate.edgeConcreteSyntax !== undefined && { edgeConcreteSyntax: candidate.edgeConcreteSyntax }),
      } as RepresentationConditionalStyle;
    });
  }

  private normalizeLayers(value: unknown): RepresentationLayer[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      throw new ApiError(400, 'layers must be an array');
    }

    const seenIds = new Set<string>();
    return value.map((layer, layerIndex) => {
      if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
        throw new ApiError(400, `layers[${layerIndex}] must be an object`);
      }
      const candidate = layer as Record<string, any>;
      const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : uuidv4();
      if (seenIds.has(id)) {
        throw new ApiError(400, 'Layer IDs must be unique within a representation');
      }
      seenIds.add(id);
      const name = this.normalizeName(candidate.name, `layers[${layerIndex}].name`);
      for (const key of ['optional', 'activeByDefault', 'enabled']) {
        if (candidate[key] !== undefined && typeof candidate[key] !== 'boolean') {
          throw new ApiError(400, `layers[${layerIndex}].${key} must be boolean`);
        }
      }
      if (candidate.mappings !== undefined && !Array.isArray(candidate.mappings)) {
        throw new ApiError(400, `layers[${layerIndex}].mappings must be an array`);
      }
      const mappingIds = new Set<string>();
      const mappings = (candidate.mappings || []).map((mapping: unknown, mappingIndex: number) => {
        if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
          throw new ApiError(400, `layers[${layerIndex}].mappings[${mappingIndex}] must be an object`);
        }
        const mappingCandidate = mapping as Record<string, any>;
        const mappingId = typeof mappingCandidate.id === 'string' && mappingCandidate.id.trim()
          ? mappingCandidate.id.trim()
          : uuidv4();
        if (mappingIds.has(mappingId)) {
          throw new ApiError(400, `layers[${layerIndex}] mapping IDs must be unique`);
        }
        mappingIds.add(mappingId);
        if (!LAYER_MAPPING_KINDS.has(mappingCandidate.kind)) {
          throw new ApiError(400, `layers[${layerIndex}].mappings[${mappingIndex}].kind is invalid`);
        }
        for (const key of ['concreteSyntax', 'edgeConcreteSyntax']) {
          if (mappingCandidate[key] !== undefined && (!mappingCandidate[key] || typeof mappingCandidate[key] !== 'object' || Array.isArray(mappingCandidate[key]))) {
            throw new ApiError(400, `layers[${layerIndex}].mappings[${mappingIndex}].${key} must be an object`);
          }
        }
        if (mappingCandidate.concreteSyntax !== undefined) {
          this.assertValidConcreteSyntax(
            mappingCandidate.concreteSyntax,
            `layers[${layerIndex}].mappings[${mappingIndex}].concreteSyntax`
          );
        }
        const optionalString = (key: string) => (
          typeof mappingCandidate[key] === 'string' && mappingCandidate[key].trim()
            ? mappingCandidate[key].trim()
            : undefined
        );
        return {
          id: mappingId,
          name: this.normalizeName(mappingCandidate.name, `layers[${layerIndex}].mappings[${mappingIndex}].name`),
          kind: mappingCandidate.kind,
          ...(optionalString('parentMappingId') && { parentMappingId: optionalString('parentMappingId') }),
          ...(optionalString('metaClassId') && { metaClassId: optionalString('metaClassId') }),
          ...(optionalString('referenceId') && { referenceId: optionalString('referenceId') }),
          ...(optionalString('semanticCandidatesExpression') && { semanticCandidatesExpression: optionalString('semanticCandidatesExpression') }),
          ...(optionalString('targetFinderExpression') && { targetFinderExpression: optionalString('targetFinderExpression') }),
          ...(mappingCandidate.concreteSyntax !== undefined && { concreteSyntax: mappingCandidate.concreteSyntax }),
          ...(mappingCandidate.edgeConcreteSyntax !== undefined && { edgeConcreteSyntax: mappingCandidate.edgeConcreteSyntax }),
        } as RepresentationLayerMapping;
      });
      return {
        id,
        name,
        ...(typeof candidate.label === 'string' && candidate.label.trim() && { label: candidate.label.trim() }),
        ...(candidate.optional !== undefined && { optional: candidate.optional }),
        ...(candidate.activeByDefault !== undefined && { activeByDefault: candidate.activeByDefault }),
        ...(candidate.enabled !== undefined && { enabled: candidate.enabled }),
        ...(candidate.mappings !== undefined && { mappings }),
      } as RepresentationLayer;
    });
  }

  private normalizeFilters(value: unknown): RepresentationFilter[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      throw new ApiError(400, 'filters must be an array');
    }

    const seenIds = new Set<string>();
    return value.map((filter, filterIndex) => {
      if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
        throw new ApiError(400, `filters[${filterIndex}] must be an object`);
      }
      const candidate = filter as Record<string, any>;
      const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : uuidv4();
      if (seenIds.has(id)) {
        throw new ApiError(400, 'Filter IDs must be unique within a representation');
      }
      seenIds.add(id);
      if (candidate.enabled !== undefined && typeof candidate.enabled !== 'boolean') {
        throw new ApiError(400, `filters[${filterIndex}].enabled must be boolean`);
      }
      if (!Array.isArray(candidate.rules)) {
        throw new ApiError(400, `filters[${filterIndex}].rules must be an array`);
      }
      const ruleIds = new Set<string>();
      const rules = candidate.rules.map((rule: unknown, ruleIndex: number) => {
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
          throw new ApiError(400, `filters[${filterIndex}].rules[${ruleIndex}] must be an object`);
        }
        const ruleCandidate = rule as Record<string, any>;
        const ruleId = typeof ruleCandidate.id === 'string' && ruleCandidate.id.trim()
          ? ruleCandidate.id.trim()
          : uuidv4();
        if (ruleIds.has(ruleId)) {
          throw new ApiError(400, `filters[${filterIndex}] rule IDs must be unique`);
        }
        ruleIds.add(ruleId);
        if (!FILTER_RULE_KINDS.has(ruleCandidate.kind)) {
          throw new ApiError(400, `filters[${filterIndex}].rules[${ruleIndex}].kind is invalid`);
        }
        if (ruleCandidate.filterKind !== undefined && !FILTER_KINDS.has(ruleCandidate.filterKind)) {
          throw new ApiError(400, `filters[${filterIndex}].rules[${ruleIndex}].filterKind is invalid`);
        }
        const optionalString = (key: string) => (
          typeof ruleCandidate[key] === 'string' && ruleCandidate[key].trim()
            ? ruleCandidate[key].trim()
            : undefined
        );
        return {
          id: ruleId,
          kind: ruleCandidate.kind,
          ...(ruleCandidate.filterKind !== undefined && { filterKind: ruleCandidate.filterKind }),
          ...(ruleCandidate.mappingIds !== undefined && {
            mappingIds: this.uniqueStringIds(ruleCandidate.mappingIds, `filters[${filterIndex}].rules[${ruleIndex}].mappingIds`),
          }),
          ...(ruleCandidate.mappingReferences !== undefined && {
            mappingReferences: this.uniqueStringIds(ruleCandidate.mappingReferences, `filters[${filterIndex}].rules[${ruleIndex}].mappingReferences`),
          }),
          ...(optionalString('semanticConditionExpression') && { semanticConditionExpression: optionalString('semanticConditionExpression') }),
          ...(optionalString('viewConditionExpression') && { viewConditionExpression: optionalString('viewConditionExpression') }),
        };
      });
      return {
        id,
        name: this.normalizeName(candidate.name, `filters[${filterIndex}].name`),
        ...(candidate.enabled !== undefined && { enabled: candidate.enabled }),
        rules,
      } as RepresentationFilter;
    });
  }

  private normalizeToolDefinitions(value: unknown): ToolDefinition[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      throw new ApiError(400, 'toolDefinitions must be an array');
    }

    const seenIds = new Set<string>();
    return value.map((tool, toolIndex) => {
      if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
        throw new ApiError(400, `toolDefinitions[${toolIndex}] must be an object`);
      }

      const candidate = tool as Record<string, any>;
      const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : uuidv4();
      if (seenIds.has(id)) {
        throw new ApiError(400, 'Tool definition IDs must be unique within a representation');
      }
      seenIds.add(id);

      if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
        throw new ApiError(400, `toolDefinitions[${toolIndex}].name is required`);
      }

      const legacyType = candidate.type === 'node'
        ? 'create-node'
        : candidate.type === 'edge'
          ? 'create-edge'
          : candidate.type;
      const type = typeof legacyType === 'string' && legacyType.trim()
        ? legacyType.trim()
        : 'create-node';
      if (!TOOL_TYPES.has(type) && !type.startsWith('sirius:')) {
        throw new ApiError(400, `toolDefinitions[${toolIndex}].type is not supported`);
      }

      let payload: ToolDefinition['payload'];
      if (candidate.payload !== undefined) {
        if (!candidate.payload || typeof candidate.payload !== 'object' || Array.isArray(candidate.payload)) {
          throw new ApiError(400, `toolDefinitions[${toolIndex}].payload must be an object`);
        }

        const rawOperations = candidate.payload.operations;
        if (rawOperations !== undefined && !Array.isArray(rawOperations)) {
          throw new ApiError(400, `toolDefinitions[${toolIndex}].payload.operations must be an array`);
        }
        if ((rawOperations || []).length > 50) {
          throw new ApiError(400, `toolDefinitions[${toolIndex}].payload.operations exceeds the 50-operation limit`);
        }

        const attributeNames = new Set<string>();
        const operations = (rawOperations || []).map((operation: unknown, operationIndex: number) => {
          if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
            throw new ApiError(400, `toolDefinitions[${toolIndex}].payload.operations[${operationIndex}] must be an object`);
          }

          const operationCandidate = operation as Record<string, unknown>;
          if (operationCandidate.type !== 'set-attribute') {
            throw new ApiError(400, `toolDefinitions[${toolIndex}].payload.operations[${operationIndex}].type is not supported`);
          }
          if (typeof operationCandidate.attributeName !== 'string' || !operationCandidate.attributeName.trim()) {
            throw new ApiError(400, `toolDefinitions[${toolIndex}].payload.operations[${operationIndex}].attributeName is required`);
          }
          const attributeName = operationCandidate.attributeName.trim();
          if (attributeNames.has(attributeName)) {
            throw new ApiError(400, `toolDefinitions[${toolIndex}] initializes attribute "${attributeName}" more than once`);
          }
          attributeNames.add(attributeName);

          const operationValue = operationCandidate.value;
          const isSafeScalar = operationValue === null
            || typeof operationValue === 'string'
            || typeof operationValue === 'boolean'
            || (typeof operationValue === 'number' && Number.isFinite(operationValue));
          if (!isSafeScalar) {
            throw new ApiError(400, `toolDefinitions[${toolIndex}].payload.operations[${operationIndex}].value must be a scalar or null`);
          }

          return {
            type: 'set-attribute' as const,
            attributeName,
            value: operationValue as string | number | boolean | null,
          };
        });

        if (operations.length > 0 && type !== 'create-node') {
          throw new ApiError(400, 'set-attribute operations are only supported on create-node tools');
        }

        payload = {
          ...candidate.payload,
          ...(rawOperations !== undefined && { operations }),
        };
      }

      return {
        id,
        name: candidate.name.trim(),
        type,
        ...(typeof candidate.metaClassId === 'string' && candidate.metaClassId.trim() && {
          metaClassId: candidate.metaClassId.trim(),
        }),
        ...(typeof candidate.referenceId === 'string' && candidate.referenceId.trim() && {
          referenceId: candidate.referenceId.trim(),
        }),
        ...(payload !== undefined && { payload }),
      };
    });
  }

  private normalizeRepresentationDescriptions(
    viewpointId: string,
    descriptions: unknown
  ): RepresentationDescription[] {
    if (descriptions === undefined) {
      return [];
    }

    if (!Array.isArray(descriptions)) {
      throw new ApiError(400, 'representationDescriptions must be an array');
    }

    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const defaultByKind = new Set<string>();

    const normalized = descriptions.map((description, index) => {
      if (!description || typeof description !== 'object') {
        throw new ApiError(400, `representationDescriptions[${index}] must be an object`);
      }

      const candidate = description as Record<string, any>;
      const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : uuidv4();
      if (seenIds.has(id)) {
        throw new ApiError(400, 'Representation description IDs must be unique within a viewpoint');
      }
      seenIds.add(id);

      const name = this.normalizeName(candidate.name, 'Representation description name');
      const nameKey = this.nameKey(name);
      if (seenNames.has(nameKey)) {
        throw new ApiError(409, 'Representation description name must be unique within a viewpoint');
      }
      seenNames.add(nameKey);

      if (typeof candidate.kind !== 'string' || !REPRESENTATION_KINDS.has(candidate.kind)) {
        throw new ApiError(400, 'Representation description kind must be diagram, table, or tree');
      }

      const isDefault = candidate.isDefault === true && !defaultByKind.has(candidate.kind);
      if (isDefault) {
        defaultByKind.add(candidate.kind);
      }

      const containerMappings = this.normalizeContainerMappings(candidate.containerMappings);
      if (containerMappings?.length && candidate.kind !== 'diagram') {
        throw new ApiError(400, 'containerMappings are only supported on diagram representations');
      }
      const propertySections = this.normalizePropertySections(candidate.propertySections);
      if (propertySections?.length && candidate.kind !== 'diagram') {
        throw new ApiError(400, 'propertySections are only supported on diagram representations');
      }
      const layers = this.normalizeLayers(candidate.layers);
      const filters = this.normalizeFilters(candidate.filters);
      const conditionalStyles = this.normalizeConditionalStyles(candidate.conditionalStyles);
      if (
        candidate.kind !== 'diagram'
        && ((layers?.length || 0) + (filters?.length || 0) + (conditionalStyles?.length || 0) > 0)
      ) {
        throw new ApiError(400, 'layers, filters, and conditionalStyles are only supported on diagram representations');
      }
      if (candidate.concreteSyntaxByMetaClassId !== undefined) {
        this.assertValidConcreteSyntaxMap(
          candidate.concreteSyntaxByMetaClassId,
          `representationDescriptions[${index}].concreteSyntaxByMetaClassId`
        );
      }

      return {
        id,
        name,
        ...(typeof candidate.description === 'string' && { description: candidate.description }),
        viewpointId,
        kind: candidate.kind,
        visibleMetaClassIds: this.uniqueStringIds(candidate.visibleMetaClassIds, 'visibleMetaClassIds'),
        creatableMetaClassIds: this.uniqueStringIds(candidate.creatableMetaClassIds, 'creatableMetaClassIds'),
        ...(candidate.tableColumns !== undefined && {
          tableColumns: this.uniqueStringIds(candidate.tableColumns, 'tableColumns'),
        }),
        ...(candidate.concreteSyntaxByMetaClassId !== undefined && {
          concreteSyntaxByMetaClassId: candidate.concreteSyntaxByMetaClassId,
        }),
        ...(candidate.concreteSyntaxByReferenceId !== undefined && {
          concreteSyntaxByReferenceId: candidate.concreteSyntaxByReferenceId,
        }),
        ...(containerMappings !== undefined && { containerMappings }),
        ...(propertySections !== undefined && { propertySections }),
        ...(candidate.edgeMappings !== undefined && { edgeMappings: candidate.edgeMappings }),
        ...(candidate.pinMappings !== undefined && {
          pinMappings: this.normalizePinMappings(candidate.pinMappings),
        }),
        ...(layers !== undefined && { layers }),
        ...(filters !== undefined && { filters }),
        ...(conditionalStyles !== undefined && { conditionalStyles }),
        ...(candidate.toolDefinitions !== undefined && {
          toolDefinitions: this.normalizeToolDefinitions(candidate.toolDefinitions),
        }),
        isDefault,
      } as RepresentationDescription;
    });

    if (!normalized.some(description => description.kind === 'diagram' && description.isDefault)) {
      const firstDiagram = normalized.find(description => description.kind === 'diagram');
      if (firstDiagram) {
        firstDiagram.isDefault = true;
      }
    }

    return normalized;
  }

  private async assertUniqueViewpointName(
    metamodelId: string,
    name: string,
    excludeViewpointId?: string
  ): Promise<void> {
    const existing = await prisma.viewpoint.findMany({
      where: { metamodelId },
      select: { id: true, name: true },
    });

    const nameKey = this.nameKey(name);
    if (existing.some(viewpoint => viewpoint.id !== excludeViewpointId && this.nameKey(viewpoint.name) === nameKey)) {
      throw new ApiError(409, 'Viewpoint name must be unique within this metamodel');
    }
  }

  private async generateUniqueDefaultName(metamodelId: string): Promise<string> {
    const existing = await prisma.viewpoint.findMany({
      where: { metamodelId },
      select: { name: true },
    });
    const existingNames = new Set(existing.map(viewpoint => this.nameKey(viewpoint.name)));

    if (!existingNames.has(this.nameKey('Default'))) {
      return 'Default';
    }

    let suffix = 2;
    while (existingNames.has(this.nameKey(`Default ${suffix}`))) {
      suffix += 1;
    }

    return `Default ${suffix}`;
  }

  async getAll(userId: string, metamodelId?: string, projectId?: string): Promise<Viewpoint[]> {
    if (metamodelId) {
      await this.assertCanReadMetamodel(metamodelId, userId);
    }

    if (projectId) {
      if (metamodelId) {
        const metamodel = await prisma.metamodel.findFirst({ where: { id: metamodelId, projectId } });
        if (!metamodel) throw new ApiError(404, 'Metamodel not found in this project');
      }
      const projectViewpoints = await prisma.viewpoint.findMany({
        where: { projectId, ...(metamodelId && { metamodelId }) },
        orderBy: [{ metamodelId: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
      });
      return projectViewpoints.map(row => this.mapToViewpoint(row));
    }

    // Platform admins see and can edit every viewpoint on the platform.
    if (await sharingService.isAdmin(userId)) {
      const allViewpoints = await prisma.viewpoint.findMany({
        where: metamodelId ? { metamodelId } : {},
        orderBy: [{ metamodelId: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
      });
      return allViewpoints.map(row => this.mapToViewpoint(row));
    }

    const ownedMetamodelIds = await prisma.metamodel.findMany({
      where: metamodelId ? { id: metamodelId, userId } : { userId },
      select: { id: true },
    });

    const sharedResources = await prisma.sharedResource.findMany({
      where: {
        sharedWithId: userId,
        resourceType: 'METAMODEL',
        ...(metamodelId ? { resourceId: metamodelId } : {}),
      },
      select: { resourceId: true },
    });

    const accessibleMetamodelIds = Array.from(new Set([
      ...ownedMetamodelIds.map(row => row.id),
      ...sharedResources.map(resource => resource.resourceId),
    ]));

    if (accessibleMetamodelIds.length === 0) {
      return [];
    }

    const viewpoints = await prisma.viewpoint.findMany({
      where: {
        metamodelId: { in: accessibleMetamodelIds },
      },
      orderBy: [{ metamodelId: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
    });

    return viewpoints.map(row => this.mapToViewpoint(row));
  }

  async getById(id: string, userId: string, projectId?: string): Promise<Viewpoint | null> {
    const viewpoint = await prisma.viewpoint.findFirst({ where: { id, ...(projectId && { projectId }) } });
    if (!viewpoint) return null;

    const access = await sharingService.checkAccess('METAMODEL', viewpoint.metamodelId, userId);
    if (!access.hasAccess) return null;

    return this.mapToViewpoint(viewpoint);
  }

  async getDefaultForMetamodel(metamodelId: string, userId: string, projectId?: string): Promise<Viewpoint> {
    await this.assertCanReadMetamodel(metamodelId, userId);

    const existing = await prisma.viewpoint.findFirst({
      where: { metamodelId, isDefault: true, ...(projectId && { projectId }) },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      return this.mapToViewpoint(existing);
    }

    // Project-scoped reads must never create language definitions. A DSL
    // Designer can explicitly create the generated default through the POST
    // endpoint; Modelers then consume it when creating Views.
    if (projectId) {
      throw new ApiError(404, 'No default viewpoint exists for this metamodel');
    }

    const metamodelRow = await prisma.metamodel.findFirst({
      where: { id: metamodelId },
    });
    if (!metamodelRow) {
      throw new ApiError(404, 'Metamodel not found');
    }

    const metamodel = this.mapToMetamodel(metamodelRow);
    const viewpointId = uuidv4();
    const representationDescription = this.buildDefaultRepresentationDescription(viewpointId, metamodel);

    const defaultName = await this.generateUniqueDefaultName(metamodelId);
    const created = await prisma.viewpoint.create({
      data: {
        id: viewpointId,
        name: defaultName,
        description: 'Default modeling perspective generated from the metamodel.',
        metamodelId,
        representationDescriptions: [representationDescription] as any,
        sharedConcreteSyntax: {} as any,
        isDefault: true,
        userId: metamodelRow.userId,
      },
    });

    return this.mapToViewpoint(created);
  }

  async createDefaultForMetamodel(
    metamodelId: string,
    userId: string,
    userRole: UserRole,
    projectId?: string
  ): Promise<Viewpoint> {
    const metamodelRow = await this.assertCanEditMetamodel(metamodelId, userId, userRole);
    if (projectId && metamodelRow.projectId !== projectId) {
      throw new ApiError(404, 'Metamodel not found in this project');
    }

    const existing = await prisma.viewpoint.findFirst({
      where: { metamodelId, isDefault: true, ...(projectId && { projectId }) },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return this.mapToViewpoint(existing);

    const metamodel = this.mapToMetamodel(metamodelRow);
    const viewpointId = uuidv4();
    const representationDescription = this.buildDefaultRepresentationDescription(viewpointId, metamodel);
    const defaultName = await this.generateUniqueDefaultName(metamodelId);
    const created = await prisma.viewpoint.create({
      data: {
        id: viewpointId,
        name: defaultName,
        description: 'Default modeling perspective generated from the metamodel.',
        metamodelId,
        representationDescriptions: [representationDescription] as any,
        sharedConcreteSyntax: {} as any,
        isDefault: true,
        userId,
        projectId,
      },
    });

    return this.mapToViewpoint(created);
  }

  async create(data: CreateViewpointRequest, userId: string, userRole: UserRole, projectId?: string): Promise<Viewpoint> {
    const metamodelRow = await this.assertCanEditMetamodel(data.metamodelId, userId, userRole);
    if (projectId && metamodelRow.projectId !== projectId) {
      throw new ApiError(400, 'Referenced metamodel is not in this project');
    }

    const viewpointId = data.id || uuidv4();
    const name = this.normalizeName(data.name, 'Name');
    await this.assertUniqueViewpointName(data.metamodelId, name);
    const representationDescriptions = this.normalizeRepresentationDescriptions(
      viewpointId,
      data.representationDescriptions || []
    );
    const sharedConcreteSyntax = data.sharedConcreteSyntaxByMetaClassId || {};
    this.assertValidConcreteSyntaxMap(
      sharedConcreteSyntax,
      'sharedConcreteSyntaxByMetaClassId'
    );
    const isDefault = data.isDefault === true;

    const createOperation = prisma.viewpoint.create({
      data: {
        id: viewpointId,
        name,
        description: data.description,
        metamodelId: data.metamodelId,
        representationDescriptions: representationDescriptions as any,
        sharedConcreteSyntax: sharedConcreteSyntax as any,
        isDefault,
        userId: projectId ? userId : metamodelRow.userId,
        projectId,
      },
    });

    const created = isDefault
      ? (await prisma.$transaction([
          prisma.viewpoint.updateMany({
            where: { metamodelId: data.metamodelId, id: { not: viewpointId }, isDefault: true },
            data: { isDefault: false },
          }),
          createOperation,
        ]))[1]
      : await createOperation;

    return this.mapToViewpoint(created);
  }

  async update(id: string, data: UpdateViewpointRequest, userId: string, userRole: UserRole, projectId?: string): Promise<Viewpoint> {
    const existing = await prisma.viewpoint.findFirst({ where: { id, ...(projectId && { projectId }) } });
    if (!existing) {
      throw new ApiError(404, 'Viewpoint not found');
    }

    await this.assertCanEditMetamodel(existing.metamodelId, userId, userRole);

    const nextName = data.name !== undefined ? this.normalizeName(data.name, 'Name') : undefined;
    if (nextName !== undefined) {
      await this.assertUniqueViewpointName(existing.metamodelId, nextName, id);
    }

    const representationDescriptions = data.representationDescriptions !== undefined
      ? this.normalizeRepresentationDescriptions(id, data.representationDescriptions)
      : undefined;
    if (data.sharedConcreteSyntaxByMetaClassId !== undefined) {
      this.assertValidConcreteSyntaxMap(
        data.sharedConcreteSyntaxByMetaClassId,
        'sharedConcreteSyntaxByMetaClassId'
      );
    }

    const updateOperation = prisma.viewpoint.update({
      where: { id },
      data: {
        ...(nextName !== undefined && { name: nextName }),
        ...(data.description !== undefined && { description: data.description }),
        ...(representationDescriptions !== undefined && { representationDescriptions: representationDescriptions as any }),
        ...(data.sharedConcreteSyntaxByMetaClassId !== undefined && {
          sharedConcreteSyntax: data.sharedConcreteSyntaxByMetaClassId as any,
        }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault === true }),
      },
    });

    const updated = data.isDefault === true
      ? (await prisma.$transaction([
          prisma.viewpoint.updateMany({
            where: { metamodelId: existing.metamodelId, id: { not: id }, isDefault: true },
            data: { isDefault: false },
          }),
          updateOperation,
        ]))[1]
      : await updateOperation;

    return this.mapToViewpoint(updated);
  }

  async delete(id: string, userId: string, userRole: UserRole, projectId?: string): Promise<void> {
    const existing = await prisma.viewpoint.findFirst({ where: { id, ...(projectId && { projectId }) } });
    if (!existing) {
      throw new ApiError(404, 'Viewpoint not found');
    }

    await this.assertCanEditMetamodel(existing.metamodelId, userId, userRole);

    await prisma.viewpoint.delete({ where: { id } });
  }

  getRepresentationDescription(viewpoint: Viewpoint, representationDescriptionId?: string): RepresentationDescription | undefined {
    if (representationDescriptionId) {
      return viewpoint.representationDescriptions.find(description => description.id === representationDescriptionId);
    }

    return viewpoint.representationDescriptions.find(description => description.isDefault && description.kind === 'diagram')
      || viewpoint.representationDescriptions.find(description => description.kind === 'diagram')
      || viewpoint.representationDescriptions[0];
  }

  async resolveDiagramRepresentation(
    modelId: string,
    userId: string,
    viewpointId?: string,
    representationDescriptionId?: string,
    projectId?: string
  ): Promise<{ viewpoint: Viewpoint; representationDescription: RepresentationDescription }> {
    const model = await prisma.model.findFirst({ where: { id: modelId, ...(projectId && { projectId }) } });
    if (!model) {
      throw new ApiError(404, 'Model not found');
    }

    let viewpoint = viewpointId
      ? await this.getById(viewpointId, userId, projectId)
      : await this.getDefaultForMetamodel(model.conformsToId, userId, projectId);

    if (!viewpoint) {
      throw new ApiError(400, 'Selected viewpoint not found');
    }

    if (viewpoint.metamodelId !== model.conformsToId) {
      throw new ApiError(400, 'Selected viewpoint does not belong to the model metamodel');
    }

    const representationDescription = this.getRepresentationDescription(viewpoint, representationDescriptionId);
    if (!representationDescription) {
      throw new ApiError(400, 'Selected representation description not found');
    }

    return { viewpoint, representationDescription };
  }

  async addRepresentationDescription(
    viewpointId: string,
    description: RepresentationDescription,
    userId: string,
    userRole: UserRole
  ): Promise<Viewpoint> {
    const existing = await prisma.viewpoint.findFirst({ where: { id: viewpointId } });
    if (!existing) {
      throw new ApiError(404, 'Viewpoint not found');
    }

    const descriptions = ((existing.representationDescriptions as unknown as RepresentationDescription[]) || []);
    await this.assertCanEditMetamodel(existing.metamodelId, userId, userRole);

    return this.update(
      viewpointId,
      { representationDescriptions: [...descriptions, { ...description, viewpointId }] },
      userId,
      userRole
    );
  }

  async updateRepresentationDescription(
    viewpointId: string,
    representationDescriptionId: string,
    data: Partial<RepresentationDescription>,
    userId: string,
    userRole: UserRole
  ): Promise<Viewpoint> {
    const existing = await prisma.viewpoint.findFirst({ where: { id: viewpointId } });
    if (!existing) {
      throw new ApiError(404, 'Viewpoint not found');
    }

    await this.assertCanEditMetamodel(existing.metamodelId, userId, userRole);

    const descriptions = ((existing.representationDescriptions as unknown as RepresentationDescription[]) || []);
    const index = descriptions.findIndex(description => description.id === representationDescriptionId);
    if (index === -1) {
      throw new ApiError(404, 'Representation description not found');
    }

    descriptions[index] = {
      ...descriptions[index],
      ...data,
      id: representationDescriptionId,
      viewpointId,
    };

    return this.update(viewpointId, { representationDescriptions: descriptions }, userId, userRole);
  }

  async deleteRepresentationDescription(
    viewpointId: string,
    representationDescriptionId: string,
    userId: string,
    userRole: UserRole
  ): Promise<Viewpoint> {
    const existing = await prisma.viewpoint.findFirst({ where: { id: viewpointId } });
    if (!existing) {
      throw new ApiError(404, 'Viewpoint not found');
    }

    await this.assertCanEditMetamodel(existing.metamodelId, userId, userRole);

    const existingDescriptions = ((existing.representationDescriptions as unknown as RepresentationDescription[]) || []);
    if (!existingDescriptions.some(description => description.id === representationDescriptionId)) {
      throw new ApiError(404, 'Representation description not found');
    }

    const descriptions = existingDescriptions.filter(description => description.id !== representationDescriptionId);

    return this.update(viewpointId, { representationDescriptions: descriptions }, userId, userRole);
  }
}

export const viewpointService = new ViewpointService();
export default viewpointService;
