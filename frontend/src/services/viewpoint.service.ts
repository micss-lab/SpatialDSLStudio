import {
  RepresentationDescription,
  RepresentationKind,
  Viewpoint
} from '../models/types';
import { apiClient, API_ENDPOINTS } from './core';
import { exampleDataService } from './metamodel/exampleData.service';
import { v4 as uuidv4 } from 'uuid';

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

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : uuidv4(),
    name: normalizeName(value.name, `representationDescriptions[${index}].name`),
    description: typeof value.description === 'string' ? value.description : undefined,
    viewpointId,
    kind,
    visibleMetaClassIds: uniqueStringIds(value.visibleMetaClassIds, `representationDescriptions[${index}].visibleMetaClassIds`),
    creatableMetaClassIds: uniqueStringIds(value.creatableMetaClassIds, `representationDescriptions[${index}].creatableMetaClassIds`),
    ...(value.concreteSyntaxByMetaClassId !== undefined && { concreteSyntaxByMetaClassId: value.concreteSyntaxByMetaClassId }),
    ...(value.concreteSyntaxByReferenceId !== undefined && { concreteSyntaxByReferenceId: value.concreteSyntaxByReferenceId }),
    ...(value.edgeMappings !== undefined && { edgeMappings: value.edgeMappings }),
    ...(value.pinMappings !== undefined && { pinMappings: value.pinMappings }),
    ...(value.toolDefinitions !== undefined && { toolDefinitions: value.toolDefinitions }),
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
  // Seed the cache with this session's example bundle plus the fixed-id
  // fixtures: accounts that seeded before ids were remapped still resolve
  // their example views against the fixture ids.
  private viewpoints: Viewpoint[] = [
    ...exampleDataService.getExampleViewpoints(),
    ...exampleDataService.getLegacyExampleViewpoints(),
  ];

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

  async getDefaultViewpoint(metamodelId: string): Promise<Viewpoint> {
    const viewpoint = await apiClient.get<Viewpoint>(
      `${API_ENDPOINTS.VIEWPOINTS}/default?metamodelId=${encodeURIComponent(metamodelId)}`
    );
    this.mergeViewpoints([viewpoint]);
    return viewpoint;
  }

  async createViewpoint(payload: CreateViewpointPayload): Promise<Viewpoint> {
    const viewpoint = await apiClient.post<Viewpoint>(API_ENDPOINTS.VIEWPOINTS, payload);
    this.mergeViewpoints([viewpoint]);
    return viewpoint;
  }

  async updateViewpoint(id: string, payload: UpdateViewpointPayload): Promise<Viewpoint> {
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
