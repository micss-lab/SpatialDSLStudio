import {
  RepresentationDescription,
  Viewpoint
} from '../models/types';
import { apiClient, API_ENDPOINTS } from './core';
import { exampleDataService } from './metamodel/exampleData.service';

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

class ViewpointService {
  private viewpoints: Viewpoint[] = exampleDataService.getExampleViewpoints();

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
