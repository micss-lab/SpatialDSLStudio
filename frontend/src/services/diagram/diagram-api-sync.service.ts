import { Diagram, ModelElement, ModelElementPresentation } from '../../models/types';
import { apiClient, API_ENDPOINTS } from '../core';

/**
 * Service for API synchronization of diagrams
 */
export class DiagramApiSyncService {
  private syncedToDb: Set<string> = new Set();
  private pendingSaves: Map<string, Promise<void>> = new Map();

  /**
   * Load diagrams from API
   */
  async loadFromAPI(): Promise<Diagram[]> {
    const data = await apiClient.get<Diagram[]>(API_ENDPOINTS.DIAGRAMS);
    if (data && Array.isArray(data)) {
      // Mark all loaded diagrams as synced to DB
      data.forEach(d => this.syncedToDb.add(d.id));
      return data;
    }
    return [];
  }

  /**
   * Sync a diagram to API using upsert pattern (handles race conditions)
   */
  syncDiagramToAPI(diagram: Diagram): void {
    const saveData = {
      id: diagram.id,
      name: diagram.name,
      modelId: diagram.modelId,
      viewpointId: diagram.viewpointId,
      representationDescriptionId: diagram.representationDescriptionId,
      elements: diagram.elements,
      includedElementIds: diagram.includedElementIds || [],
      gridSettings: diagram.gridSettings,
    };

    // Check if there's a pending save for this diagram, wait for it first
    const pendingSave = this.pendingSaves.get(diagram.id);
    
    const doSave = async (): Promise<void> => {
      if (pendingSave) {
        await pendingSave.catch(() => {}); // Wait for previous save to complete
      }
      
      try {
        if (this.syncedToDb.has(diagram.id)) {
          // Diagram exists in DB, use PUT
          await apiClient.put<Diagram>(
            `${API_ENDPOINTS.DIAGRAMS}/${diagram.id}`,
            {
              name: diagram.name,
              viewpointId: diagram.viewpointId,
              representationDescriptionId: diagram.representationDescriptionId,
              elements: diagram.elements,
              includedElementIds: diagram.includedElementIds || [],
              gridSettings: diagram.gridSettings,
              schemaVersion: diagram.schemaVersion || 2,
              migrationWarnings: diagram.migrationWarnings || [],
            }
          );
        } else {
          // Diagram doesn't exist in DB, use POST
          await apiClient.post<Diagram>(API_ENDPOINTS.DIAGRAMS, saveData);
          this.syncedToDb.add(diagram.id);
        }
      } catch (error: any) {
        // If PUT fails with 404, try POST (diagram might have been deleted)
        if (error.message?.includes('not found') || error.message?.includes('404')) {
          try {
            await apiClient.post<Diagram>(API_ENDPOINTS.DIAGRAMS, saveData);
            this.syncedToDb.add(diagram.id);
          } catch (postError) {
            console.error('Error saving diagram to API (POST fallback):', postError);
          }
        } else {
          console.error('Error syncing diagram to API:', error);
        }
      } finally {
        this.pendingSaves.delete(diagram.id);
      }
    };

    const savePromise = doSave();
    this.pendingSaves.set(diagram.id, savePromise);
  }

  /**
   * Save a single diagram to API (for initial creation)
   */
  saveDiagramToAPI(diagram: Diagram): void {
    const saveData = {
      id: diagram.id,
      name: diagram.name,
      modelId: diagram.modelId,
      viewpointId: diagram.viewpointId,
      representationDescriptionId: diagram.representationDescriptionId,
      elements: diagram.elements,
      includedElementIds: diagram.includedElementIds || [],
      gridSettings: diagram.gridSettings,
      schemaVersion: diagram.schemaVersion || 2,
      migrationWarnings: diagram.migrationWarnings || [],
    };

    const savePromise = (async () => {
      try {
        await apiClient.post<Diagram>(API_ENDPOINTS.DIAGRAMS, saveData);
        this.syncedToDb.add(diagram.id);
      } catch (err) {
        console.error('Error saving diagram to API:', err);
      } finally {
        this.pendingSaves.delete(diagram.id);
      }
    })();
    
    this.pendingSaves.set(diagram.id, savePromise);
  }

  /**
   * Update a diagram in API (fire and forget) - now uses sync method
   */
  updateDiagramInAPI(diagram: Diagram): void {
    this.syncDiagramToAPI(diagram);
  }

  async createModelElementInView(
    diagramId: string,
    metaClassId: string,
    presentation?: ModelElementPresentation,
    style?: Record<string, any>
  ): Promise<{ diagram: Diagram; modelElement: ModelElement }> {
    const result = await apiClient.post<{ diagram: Diagram; modelElement: ModelElement }>(
      `${API_ENDPOINTS.DIAGRAMS}/${diagramId}/model-elements/create`,
      {
        metaClassId,
        ...(presentation ? { presentation } : {}),
        ...(style ? { style } : {}),
      }
    );
    this.syncedToDb.add(result.diagram.id);
    return result;
  }

  async updateModelElementPresentation(
    diagramId: string,
    modelElementId: string,
    presentation: ModelElementPresentation
  ): Promise<Diagram> {
    const diagram = await apiClient.put<Diagram>(
      `${API_ENDPOINTS.DIAGRAMS}/${diagramId}/model-elements/${modelElementId}/presentation`,
      presentation
    );
    this.syncedToDb.add(diagram.id);
    return diagram;
  }

  /**
   * Delete a diagram from API (fire and forget)
   */
  deleteDiagramFromAPI(id: string): void {
    apiClient.delete(`${API_ENDPOINTS.DIAGRAMS}/${id}`)
      .catch(err => console.error('Error deleting diagram from API:', err));
  }

  /**
   * Remove diagram from synced tracking
   */
  removeSyncedDiagram(id: string): void {
    this.syncedToDb.delete(id);
  }

  /**
   * Clear sync state
   */
  clearSyncState(): void {
    this.syncedToDb.clear();
    this.pendingSaves.clear();
  }
}

export const diagramApiSyncService = new DiagramApiSyncService();
