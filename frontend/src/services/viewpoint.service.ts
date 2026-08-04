import {
  ConcreteSyntax,
  RepresentationContainerMapping,
  RepresentationDescription,
  RepresentationKind,
  RepresentationPropertySection,
  ToolDefinition,
  Viewpoint
} from '../models/types';
import { apiClient, API_ENDPOINTS } from './core';
import { exampleDataService } from './metamodel/exampleData.service';
import { v4 as uuidv4 } from 'uuid';
import {
  validateConcreteSyntaxMapVerticalPlacements,
  validateConcreteSyntaxVerticalPlacement,
} from './spatial';

export interface CreateViewpointPayload {
  id?: string;
  name: string;
  description?: string;
  metamodelId: string;
  representationDescriptions?: RepresentationDescription[];
  sharedConcreteSyntaxByMetaClassId?: Viewpoint['sharedConcreteSyntaxByMetaClassId'];
  isDefault?: boolean;
}

export type UpdateViewpointPayload = Partial<Omit<CreateViewpointPayload, 'id' | 'metamodelId'>>;

const representationKinds = new Set<RepresentationKind>(['diagram', 'table', 'tree']);

const isRecord = (value: unknown): value is Record<string, any> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const validateRepresentationVerticalPlacementPolicies = (
  value: unknown,
  path = 'representationDescription'
): string[] => {
  if (!isRecord(value)) return [];
  const errors: string[] = [];

  if (value.concreteSyntaxByMetaClassId !== undefined) {
    errors.push(...validateConcreteSyntaxMapVerticalPlacements(
      value.concreteSyntaxByMetaClassId,
      `${path}.concreteSyntaxByMetaClassId`
    ));
  }
  if (Array.isArray(value.containerMappings)) {
    value.containerMappings.forEach((mapping: unknown, index: number) => {
      if (isRecord(mapping) && mapping.concreteSyntax !== undefined) {
        errors.push(...validateConcreteSyntaxVerticalPlacement(
          mapping.concreteSyntax,
          `${path}.containerMappings[${index}].concreteSyntax`
        ));
      }
    });
  }
  if (Array.isArray(value.layers)) {
    value.layers.forEach((layer: unknown, layerIndex: number) => {
      if (!isRecord(layer) || !Array.isArray(layer.mappings)) return;
      layer.mappings.forEach((mapping: unknown, mappingIndex: number) => {
        if (isRecord(mapping) && mapping.concreteSyntax !== undefined) {
          errors.push(...validateConcreteSyntaxVerticalPlacement(
            mapping.concreteSyntax,
            `${path}.layers[${layerIndex}].mappings[${mappingIndex}].concreteSyntax`
          ));
        }
      });
    });
  }
  if (Array.isArray(value.conditionalStyles)) {
    value.conditionalStyles.forEach((style: unknown, index: number) => {
      if (isRecord(style) && style.concreteSyntax !== undefined) {
        errors.push(...validateConcreteSyntaxVerticalPlacement(
          style.concreteSyntax,
          `${path}.conditionalStyles[${index}].concreteSyntax`
        ));
      }
    });
  }

  return errors;
};

const validateViewpointVerticalPlacementPolicies = (
  value: unknown,
  path = 'viewpoint'
): string[] => {
  if (!isRecord(value)) return [];
  const errors: string[] = [];
  if (value.sharedConcreteSyntaxByMetaClassId !== undefined) {
    errors.push(...validateConcreteSyntaxMapVerticalPlacements(
      value.sharedConcreteSyntaxByMetaClassId,
      `${path}.sharedConcreteSyntaxByMetaClassId`
    ));
  }
  if (Array.isArray(value.representationDescriptions)) {
    value.representationDescriptions.forEach((description: unknown, index: number) => {
      errors.push(...validateRepresentationVerticalPlacementPolicies(
        description,
        `${path}.representationDescriptions[${index}]`
      ));
    });
  }
  return errors;
};

const requireValidVerticalPlacementPolicies = (errors: string[]): void => {
  if (errors.length > 0) throw new Error(errors[0]);
};

const normalizeName = (value: unknown, fieldName: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
};

const uniqueStringIds = (value: unknown, fieldName: string): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  const ids: string[] = [];
  value.forEach(item => {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error(`${fieldName} must contain string IDs`);
    }
    const id = item.trim();
    if (!ids.includes(id)) ids.push(id);
  });
  return ids;
};

const normalizeContainerMappings = (
  value: unknown,
  fieldName: string
): RepresentationContainerMapping[] => {
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array`);

  const seenIds = new Set<string>();
  return value.map((mapping, index) => {
    if (!isRecord(mapping)) throw new Error(`${fieldName}[${index}] must be an object`);

    const id = typeof mapping.id === 'string' && mapping.id.trim() ? mapping.id.trim() : uuidv4();
    if (seenIds.has(id)) throw new Error(`${fieldName} IDs must be unique`);
    seenIds.add(id);

    const containerMetaClassId = normalizeName(
      mapping.containerMetaClassId,
      `${fieldName}[${index}].containerMetaClassId`
    );
    const containmentReferenceId = normalizeName(
      mapping.containmentReferenceId,
      `${fieldName}[${index}].containmentReferenceId`
    );
    if (mapping.concreteSyntax !== undefined && !isRecord(mapping.concreteSyntax)) {
      throw new Error(`${fieldName}[${index}].concreteSyntax must be an object`);
    }
    if (mapping.concreteSyntax !== undefined) {
      requireValidVerticalPlacementPolicies(validateConcreteSyntaxVerticalPlacement(
        mapping.concreteSyntax,
        `${fieldName}[${index}].concreteSyntax`
      ));
    }

    return {
      id,
      containerMetaClassId,
      containmentReferenceId,
      ...(mapping.childMetaClassIds !== undefined && {
        childMetaClassIds: uniqueStringIds(mapping.childMetaClassIds, `${fieldName}[${index}].childMetaClassIds`),
      }),
      ...(mapping.concreteSyntax !== undefined && {
        concreteSyntax: mapping.concreteSyntax as ConcreteSyntax,
      }),
    };
  });
};

const normalizePropertySections = (
  value: unknown,
  fieldName: string
): RepresentationPropertySection[] => {
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array`);

  const seenIds = new Set<string>();
  return value.map((section, index) => {
    if (!isRecord(section)) throw new Error(`${fieldName}[${index}] must be an object`);

    const id = typeof section.id === 'string' && section.id.trim() ? section.id.trim() : uuidv4();
    if (seenIds.has(id)) throw new Error(`${fieldName} IDs must be unique`);
    seenIds.add(id);

    return {
      id,
      name: normalizeName(section.name, `${fieldName}[${index}].name`),
      ...(section.metaClassIds !== undefined && {
        metaClassIds: uniqueStringIds(section.metaClassIds, `${fieldName}[${index}].metaClassIds`),
      }),
      ...(section.attributeNames !== undefined && {
        attributeNames: uniqueStringIds(section.attributeNames, `${fieldName}[${index}].attributeNames`),
      }),
      ...(section.referenceNames !== undefined && {
        referenceNames: uniqueStringIds(section.referenceNames, `${fieldName}[${index}].referenceNames`),
      }),
    };
  });
};

const normalizeToolDefinitions = (value: unknown, fieldName: string): ToolDefinition[] => {
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array`);

  const seenIds = new Set<string>();
  return value.map((tool, toolIndex) => {
    if (!isRecord(tool)) throw new Error(`${fieldName}[${toolIndex}] must be an object`);

    const id = typeof tool.id === 'string' && tool.id.trim() ? tool.id.trim() : uuidv4();
    if (seenIds.has(id)) throw new Error(`${fieldName} IDs must be unique`);
    seenIds.add(id);

    const name = normalizeName(tool.name, `${fieldName}[${toolIndex}].name`);
    const legacyType = tool.type === 'node' ? 'create-node' : tool.type === 'edge' ? 'create-edge' : tool.type;
    const type = typeof legacyType === 'string' && legacyType.trim() ? legacyType.trim() : 'create-node';
    const supported = ['create-node', 'create-edge', 'delete', 'direct-edit', 'reconnect'].includes(type)
      || type.startsWith('sirius:');
    if (!supported) throw new Error(`${fieldName}[${toolIndex}].type is not supported`);

    let payload: ToolDefinition['payload'];
    if (tool.payload !== undefined) {
      if (!isRecord(tool.payload)) throw new Error(`${fieldName}[${toolIndex}].payload must be an object`);
      const rawOperations = tool.payload.operations;
      if (rawOperations !== undefined && !Array.isArray(rawOperations)) {
        throw new Error(`${fieldName}[${toolIndex}].payload.operations must be an array`);
      }
      if ((rawOperations || []).length > 50) {
        throw new Error(`${fieldName}[${toolIndex}].payload.operations exceeds the 50-operation limit`);
      }

      const attributeNames = new Set<string>();
      const operations = (rawOperations || []).map((operation: unknown, operationIndex: number) => {
        if (!isRecord(operation) || operation.type !== 'set-attribute') {
          throw new Error(`${fieldName}[${toolIndex}].payload.operations[${operationIndex}] must be set-attribute`);
        }
        const attributeName = normalizeName(
          operation.attributeName,
          `${fieldName}[${toolIndex}].payload.operations[${operationIndex}].attributeName`
        );
        if (attributeNames.has(attributeName)) {
          throw new Error(`${fieldName}[${toolIndex}] initializes attribute "${attributeName}" more than once`);
        }
        attributeNames.add(attributeName);

        const operationValue = operation.value;
        const isSafeScalar = operationValue === null
          || typeof operationValue === 'string'
          || typeof operationValue === 'boolean'
          || (typeof operationValue === 'number' && Number.isFinite(operationValue));
        if (!isSafeScalar) {
          throw new Error(`${fieldName}[${toolIndex}].payload.operations[${operationIndex}].value must be a scalar or null`);
        }

        return {
          type: 'set-attribute' as const,
          attributeName,
          value: operationValue as string | number | boolean | null,
        };
      });
      if (operations.length > 0 && type !== 'create-node') {
        throw new Error(`${fieldName}[${toolIndex}] can only set attributes on create-node`);
      }

      payload = {
        ...tool.payload,
        ...(rawOperations !== undefined && { operations }),
      };
    }

    return {
      id,
      name,
      type,
      ...(typeof tool.metaClassId === 'string' && tool.metaClassId.trim() && { metaClassId: tool.metaClassId.trim() }),
      ...(typeof tool.referenceId === 'string' && tool.referenceId.trim() && { referenceId: tool.referenceId.trim() }),
      ...(payload !== undefined && { payload }),
    };
  });
};

const normalizeRepresentationDescription = (
  value: unknown,
  viewpointId: string,
  index: number
): RepresentationDescription => {
  if (!isRecord(value)) {
    throw new Error(`representationDescriptions[${index}] must be an object`);
  }

  const kind = value.kind || 'diagram';
  if (!representationKinds.has(kind)) {
    throw new Error(`representationDescriptions[${index}].kind must be diagram, table, or tree`);
  }

  const containerMappings = value.containerMappings === undefined
    ? undefined
    : normalizeContainerMappings(
      value.containerMappings,
      `representationDescriptions[${index}].containerMappings`
    );
  if (containerMappings?.length && kind !== 'diagram') {
    throw new Error(`representationDescriptions[${index}].containerMappings are only supported on diagrams`);
  }
  const propertySections = value.propertySections === undefined
    ? undefined
    : normalizePropertySections(
      value.propertySections,
      `representationDescriptions[${index}].propertySections`
    );
  if (propertySections?.length && kind !== 'diagram') {
    throw new Error(`representationDescriptions[${index}].propertySections are only supported on diagrams`);
  }
  requireValidVerticalPlacementPolicies(validateRepresentationVerticalPlacementPolicies(
    value,
    `representationDescriptions[${index}]`
  ));

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : uuidv4(),
    name: normalizeName(value.name, `representationDescriptions[${index}].name`),
    description: typeof value.description === 'string' ? value.description : undefined,
    viewpointId,
    kind,
    visibleMetaClassIds: uniqueStringIds(value.visibleMetaClassIds, `representationDescriptions[${index}].visibleMetaClassIds`),
    creatableMetaClassIds: uniqueStringIds(value.creatableMetaClassIds, `representationDescriptions[${index}].creatableMetaClassIds`),
    ...(value.tableColumns !== undefined && {
      tableColumns: uniqueStringIds(value.tableColumns, `representationDescriptions[${index}].tableColumns`),
    }),
    ...(value.concreteSyntaxByMetaClassId !== undefined && { concreteSyntaxByMetaClassId: value.concreteSyntaxByMetaClassId }),
    ...(value.concreteSyntaxByReferenceId !== undefined && { concreteSyntaxByReferenceId: value.concreteSyntaxByReferenceId }),
    ...(containerMappings !== undefined && { containerMappings }),
    ...(propertySections !== undefined && { propertySections }),
    ...(value.edgeMappings !== undefined && { edgeMappings: value.edgeMappings }),
    ...(value.pinMappings !== undefined && { pinMappings: value.pinMappings }),
    ...(value.toolDefinitions !== undefined && {
      toolDefinitions: normalizeToolDefinitions(
        value.toolDefinitions,
        `representationDescriptions[${index}].toolDefinitions`
      ),
    }),
    isDefault: value.isDefault === true,
  };
};

const normalizeImportedViewpoint = (value: unknown, metamodelId: string, index: number): Viewpoint => {
  if (!isRecord(value)) {
    throw new Error(`viewpoints[${index}] must be an object`);
  }

  if (typeof value.metamodelId === 'string' && value.metamodelId && value.metamodelId !== metamodelId) {
    throw new Error(`viewpoints[${index}] belongs to a different metamodel`);
  }

  const viewpointId = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : uuidv4();
  const representationDescriptions = value.representationDescriptions === undefined
    ? []
    : value.representationDescriptions;

  if (!Array.isArray(representationDescriptions)) {
    throw new Error(`viewpoints[${index}].representationDescriptions must be an array`);
  }
  if (
    value.sharedConcreteSyntaxByMetaClassId !== undefined
    && !isRecord(value.sharedConcreteSyntaxByMetaClassId)
  ) {
    throw new Error(`viewpoints[${index}].sharedConcreteSyntaxByMetaClassId must be an object`);
  }
  requireValidVerticalPlacementPolicies(validateViewpointVerticalPlacementPolicies(
    value,
    `viewpoints[${index}]`
  ));

  return {
    id: viewpointId,
    name: normalizeName(value.name, `viewpoints[${index}].name`),
    description: typeof value.description === 'string' ? value.description : undefined,
    metamodelId,
    representationDescriptions: representationDescriptions.map((description, descriptionIndex) => (
      normalizeRepresentationDescription(description, viewpointId, descriptionIndex)
    )),
    sharedConcreteSyntaxByMetaClassId: isRecord(value.sharedConcreteSyntaxByMetaClassId)
      ? value.sharedConcreteSyntaxByMetaClassId
      : {},
    isDefault: value.isDefault === true,
  };
};

const withViewpointId = (
  viewpoint: Viewpoint,
  viewpointId: string
): Viewpoint => ({
  ...viewpoint,
  id: viewpointId,
  representationDescriptions: viewpoint.representationDescriptions.map(description => ({
    ...description,
    viewpointId,
  })),
});

class ViewpointService {
  private viewpoints: Viewpoint[] = this.getInitialViewpoints();

  private getInitialViewpoints(): Viewpoint[] {
    // Example viewpoints are a compatibility aid for the old, unscoped
    // workspace. Project sessions must start empty and load only their own
    // viewpoint definitions from the project API.
    if (apiClient.getProjectId()) return [];

    return [
      ...exampleDataService.getExampleViewpoints(),
      ...exampleDataService.getLegacyExampleViewpoints(),
    ];
  }

  getCachedViewpoints(metamodelId?: string): Viewpoint[] {
    return this.viewpoints.filter(viewpoint => !metamodelId || viewpoint.metamodelId === metamodelId);
  }

  async loadViewpoints(metamodelId?: string): Promise<Viewpoint[]> {
    const endpoint = metamodelId
      ? `${API_ENDPOINTS.VIEWPOINTS}?metamodelId=${encodeURIComponent(metamodelId)}`
      : API_ENDPOINTS.VIEWPOINTS;
    const viewpoints = await apiClient.get<Viewpoint[]>(endpoint);
    this.mergeViewpoints(viewpoints);
    return viewpoints;
  }

  async clearCacheAndReinitialize(): Promise<void> {
    this.clearCacheLocal();
    await this.loadViewpoints();
  }

  clearCacheLocal(): void {
    this.viewpoints = this.getInitialViewpoints();
  }

  async getDefaultViewpoint(metamodelId: string): Promise<Viewpoint> {
    const viewpoint = await apiClient.get<Viewpoint>(
      `${API_ENDPOINTS.VIEWPOINTS}/default?metamodelId=${encodeURIComponent(metamodelId)}`
    );
    this.mergeViewpoints([viewpoint]);
    return viewpoint;
  }

  async createDefaultViewpoint(metamodelId: string): Promise<Viewpoint> {
    const viewpoint = await apiClient.post<Viewpoint>(`${API_ENDPOINTS.VIEWPOINTS}/default`, { metamodelId });
    this.mergeViewpoints([viewpoint]);
    return viewpoint;
  }

  async createViewpoint(payload: CreateViewpointPayload): Promise<Viewpoint> {
    requireValidVerticalPlacementPolicies(validateViewpointVerticalPlacementPolicies(payload));
    const viewpoint = await apiClient.post<Viewpoint>(API_ENDPOINTS.VIEWPOINTS, payload);
    this.mergeViewpoints([viewpoint]);
    return viewpoint;
  }

  async updateViewpoint(id: string, payload: UpdateViewpointPayload): Promise<Viewpoint> {
    requireValidVerticalPlacementPolicies(validateViewpointVerticalPlacementPolicies(payload));
    const viewpoint = await apiClient.put<Viewpoint>(`${API_ENDPOINTS.VIEWPOINTS}/${id}`, payload);
    this.mergeViewpoints([viewpoint]);
    return viewpoint;
  }

  async deleteViewpoint(id: string): Promise<void> {
    await apiClient.delete(`${API_ENDPOINTS.VIEWPOINTS}/${id}`);
    this.viewpoints = this.viewpoints.filter(viewpoint => viewpoint.id !== id);
  }

  async createRepresentationDescription(
    viewpointId: string,
    payload: RepresentationDescription
  ): Promise<Viewpoint> {
    requireValidVerticalPlacementPolicies(validateRepresentationVerticalPlacementPolicies(payload));
    const viewpoint = await apiClient.post<Viewpoint>(
      `${API_ENDPOINTS.VIEWPOINTS}/${viewpointId}/representation-descriptions`,
      payload
    );
    this.mergeViewpoints([viewpoint]);
    return viewpoint;
  }

  async updateRepresentationDescription(
    viewpointId: string,
    representationDescriptionId: string,
    payload: Partial<RepresentationDescription>
  ): Promise<Viewpoint> {
    requireValidVerticalPlacementPolicies(validateRepresentationVerticalPlacementPolicies(payload));
    const viewpoint = await apiClient.put<Viewpoint>(
      `${API_ENDPOINTS.VIEWPOINTS}/${viewpointId}/representation-descriptions/${representationDescriptionId}`,
      payload
    );
    this.mergeViewpoints([viewpoint]);
    return viewpoint;
  }

  async deleteRepresentationDescription(
    viewpointId: string,
    representationDescriptionId: string
  ): Promise<Viewpoint> {
    const viewpoint = await apiClient.delete<Viewpoint>(
      `${API_ENDPOINTS.VIEWPOINTS}/${viewpointId}/representation-descriptions/${representationDescriptionId}`
    );
    this.mergeViewpoints([viewpoint]);
    return viewpoint;
  }

  parseViewpointsJson(content: string, metamodelId: string): Viewpoint[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('Invalid viewpoint JSON file');
    }

    const rawViewpoints = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.viewpoints)
        ? parsed.viewpoints
        : isRecord(parsed)
          ? [parsed]
          : [];

    if (rawViewpoints.length === 0) {
      throw new Error('Viewpoint JSON must contain a viewpoint object, a viewpoint array, or a { "viewpoints": [] } object');
    }

    return rawViewpoints.map((viewpoint, index) => normalizeImportedViewpoint(viewpoint, metamodelId, index));
  }

  async importViewpointsJson(content: string, metamodelId: string): Promise<Viewpoint[]> {
    const importedViewpoints = this.parseViewpointsJson(content, metamodelId);
    const existingViewpoints = await this.loadViewpoints(metamodelId).catch(() => this.getCachedViewpoints(metamodelId));
    const existingById = new Map(existingViewpoints.map(viewpoint => [viewpoint.id, viewpoint]));
    const existingByName = new Map(existingViewpoints.map(viewpoint => [viewpoint.name.trim().toLowerCase(), viewpoint]));
    const saved: Viewpoint[] = [];

    for (const importedViewpoint of importedViewpoints) {
      const existing = existingById.get(importedViewpoint.id)
        || existingByName.get(importedViewpoint.name.trim().toLowerCase());

      if (existing) {
        const payload = withViewpointId(importedViewpoint, existing.id);
        const updated = await this.updateViewpoint(existing.id, {
          name: payload.name,
          description: payload.description,
          representationDescriptions: payload.representationDescriptions,
          sharedConcreteSyntaxByMetaClassId: payload.sharedConcreteSyntaxByMetaClassId,
          isDefault: payload.isDefault,
        });
        saved.push(updated);
      } else {
        const created = await this.createViewpoint(importedViewpoint);
        saved.push(created);
      }
    }

    return saved;
  }

  resolveRepresentationDescription(diagram: { viewpointId?: string; representationDescriptionId?: string }): {
    viewpoint?: Viewpoint;
    representationDescription?: RepresentationDescription;
  } {
    const viewpoint = this.viewpoints.find(candidate => candidate.id === diagram.viewpointId);
    const representationDescription = viewpoint?.representationDescriptions.find(
      candidate => candidate.id === diagram.representationDescriptionId
    ) || viewpoint?.representationDescriptions.find(candidate => candidate.isDefault && candidate.kind === 'diagram')
      || viewpoint?.representationDescriptions.find(candidate => candidate.kind === 'diagram');

    return { viewpoint, representationDescription };
  }

  resolveDefaultForMetamodel(metamodelId?: string): {
    viewpoint?: Viewpoint;
    representationDescription?: RepresentationDescription;
  } {
    if (!metamodelId) return {};

    const viewpoint = this.viewpoints.find(candidate => candidate.metamodelId === metamodelId && candidate.isDefault)
      || this.viewpoints.find(candidate => candidate.metamodelId === metamodelId);
    const representationDescription = viewpoint?.representationDescriptions.find(
      candidate => candidate.isDefault && candidate.kind === 'diagram'
    ) || viewpoint?.representationDescriptions.find(candidate => candidate.kind === 'diagram');

    return { viewpoint, representationDescription };
  }

  private mergeViewpoints(viewpoints: Viewpoint[]): void {
    const byId = new Map(this.viewpoints.map(viewpoint => [viewpoint.id, viewpoint]));
    viewpoints.forEach(viewpoint => byId.set(viewpoint.id, viewpoint));
    this.viewpoints = Array.from(byId.values());
  }
}

export const viewpointService = new ViewpointService();
export default viewpointService;
