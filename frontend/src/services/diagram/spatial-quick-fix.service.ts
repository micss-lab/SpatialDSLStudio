import { SpatialQuickFixApplied, SpatialQuickFixPreview, SpatialQuickFixRequest } from '../../models/types';
import { apiClient, API_ENDPOINTS } from '../core';
import { modelService } from '../model';
import { modelApiSyncService } from '../model/model-api-sync.service';

const endpoint = (viewId: string) => `${API_ENDPOINTS.DIAGRAMS}/${encodeURIComponent(viewId)}/quick-fixes`;

export const spatialQuickFixService = {
  async preview(viewId: string, modelId: string, request: SpatialQuickFixRequest): Promise<SpatialQuickFixPreview> {
    await modelApiSyncService.waitForPendingSave(modelId);
    return apiClient.post(`${endpoint(viewId)}/preview`, request);
  },

  async apply(viewId: string, modelId: string, request: SpatialQuickFixRequest, expectedPreviewHash: string): Promise<void> {
    await modelApiSyncService.waitForPendingSave(modelId);
    const result = await apiClient.post<SpatialQuickFixApplied>(`${endpoint(viewId)}/apply`, { ...request, expectedPreviewHash });
    modelService.useSavedSpatialQuickFix(result);
  },
};
