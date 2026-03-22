import { Model } from '../../models/types';
import { apiClient, API_ENDPOINTS } from '../core';

/**
 * Service for API synchronization of models
 */
export class ModelApiSyncService {
  private syncedToDb: Set<string> = new Set();
  private pendingSaves: Map<string, Promise<void>> = new Map();

  /**
   * Load models from API
   */
  async loadFromAPI(): Promise<Model[]> {
    const data = await apiClient.get<Model[]>(API_ENDPOINTS.MODELS);
    if (data && Array.isArray(data)) {
      // Mark all loaded models as synced to DB
      data.forEach(m => this.syncedToDb.add(m.id));
      return data;
    }
    return [];
  }

  /**
   * Sync a model to API using upsert pattern (handles race conditions)
   */
  syncModelToAPI(model: Model): void {
    const saveData = {
      id: model.id,
      name: model.name,
      metamodelId: model.metamodelId,
      conformsTo: model.conformsTo,
      elements: model.elements,
      connections: model.connections,
    };

    // Check if there's a pending save for this model, wait for it first
    const pendingSave = this.pendingSaves.get(model.id);
    
    const doSave = async (): Promise<void> => {
      if (pendingSave) {
        await pendingSave.catch(() => {}); // Wait for previous save to complete
      }
      
      try {
        if (this.syncedToDb.has(model.id)) {
          // Model exists in DB, use PUT
          await apiClient.put<Model>(
            `${API_ENDPOINTS.MODELS}/${model.id}`,
            {
              name: model.name,
              elements: model.elements,
              connections: model.connections,
            }
          );
        } else {
          // Model doesn't exist in DB, use POST
          await apiClient.post<Model>(API_ENDPOINTS.MODELS, saveData);
          this.syncedToDb.add(model.id);
        }
      } catch (error: any) {
        // If PUT fails with 404, try POST (model might have been deleted)
        if (error.message?.includes('not found') || error.message?.includes('404')) {
          try {
            await apiClient.post<Model>(API_ENDPOINTS.MODELS, saveData);
            this.syncedToDb.add(model.id);
          } catch (postError) {
            console.error('Error saving model to API (POST fallback):', postError);
          }
        } else {
          console.error('Error syncing model to API:', error);
        }
      } finally {
        this.pendingSaves.delete(model.id);
      }
    };

    const savePromise = doSave();
    this.pendingSaves.set(model.id, savePromise);
  }

  /**
   * Save a single model to API (for initial creation)
   */
  saveModelToAPI(model: Model): void {
    const saveData = {
      id: model.id,
      name: model.name,
      metamodelId: model.metamodelId,
      conformsTo: model.conformsTo,
      elements: model.elements,
      connections: model.connections,
    };

    const savePromise = (async () => {
      try {
        await apiClient.post<Model>(API_ENDPOINTS.MODELS, saveData);
        this.syncedToDb.add(model.id);
      } catch (err) {
        console.error('Error saving model to API:', err);
      } finally {
        this.pendingSaves.delete(model.id);
      }
    })();
    
    this.pendingSaves.set(model.id, savePromise);
  }

  /**
   * Update a model in API (fire and forget) - now uses sync method
   */
  updateModelInAPI(model: Model): void {
    this.syncModelToAPI(model);
  }

  /**
   * Delete a model from API (fire and forget)
   */
  deleteModelFromAPI(id: string): void {
    apiClient.delete(`${API_ENDPOINTS.MODELS}/${id}`)
      .catch(err => console.error('Error deleting model from API:', err));
  }

  /**
   * Remove model from synced tracking
   */
  removeSyncedModel(id: string): void {
    this.syncedToDb.delete(id);
  }

  /**
   * Clear sync state
   */
  clearSyncState(): void {
    this.syncedToDb.clear();
    this.pendingSaves.clear();
  }

  /**
   * Check if model is synced to database
   */
  isSyncedToDb(id: string): boolean {
    return this.syncedToDb.has(id);
  }
}

export const modelApiSyncService = new ModelApiSyncService();
