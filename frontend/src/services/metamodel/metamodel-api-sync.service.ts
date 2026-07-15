import { Metamodel } from '../../models/types';
import { apiClient, API_ENDPOINTS } from '../core';

/**
 * Synchronizes a metamodel to the API using an upsert pattern.
 * Handles race conditions with pending saves.
 * 
 * @param metamodel The metamodel to sync
 * @param syncedToDb Set tracking which metamodels have been synced
 * @param pendingSaves Map of pending save operations
 */
export function syncMetamodelToAPI(
  metamodel: Metamodel,
  syncedToDb: Set<string>,
  pendingSaves: Map<string, Promise<void>>
): void {
  const saveData = {
    id: metamodel.id,
    name: metamodel.name,
    description: metamodel.description,
    uri: metamodel.uri,
    prefix: metamodel.prefix,
    eClass: metamodel.eClass,
    conformsTo: metamodel.conformsTo,
    classes: metamodel.classes,
    enums: metamodel.enums || [],
    constraints: metamodel.constraints,
  };

  // Check if there's a pending save for this metamodel, wait for it first
  const pendingSave = pendingSaves.get(metamodel.id);
  
  const doSave = async (): Promise<void> => {
    if (pendingSave) {
      await pendingSave.catch(() => {}); // Wait for previous save to complete
    }
    
    try {
      if (syncedToDb.has(metamodel.id)) {
        // Metamodel exists in DB, use PUT
        await apiClient.put<Metamodel>(
          `${API_ENDPOINTS.METAMODELS}/${metamodel.id}`,
          saveData
        );
      } else {
        // Metamodel doesn't exist in DB, use POST
        await apiClient.post<Metamodel>(API_ENDPOINTS.METAMODELS, saveData);
        syncedToDb.add(metamodel.id);
      }
    } catch (error: any) {
      // If PUT fails with 404, try POST (metamodel might have been deleted)
      if (error.message?.includes('not found') || error.message?.includes('404')) {
        try {
          await apiClient.post<Metamodel>(API_ENDPOINTS.METAMODELS, saveData);
          syncedToDb.add(metamodel.id);
        } catch (postError) {
          console.error('Error saving metamodel to API (POST fallback):', postError);
        }
      } else {
        console.error('Error syncing metamodel to API:', error);
      }
    } finally {
      pendingSaves.delete(metamodel.id);
    }
  };

  const savePromise = doSave();
  pendingSaves.set(metamodel.id, savePromise);
}

/**
 * Saves a new metamodel to the API.
 * 
 * @param metamodel The metamodel to save
 * @param syncedToDb Set tracking which metamodels have been synced
 * @param pendingSaves Map of pending save operations
 */
export function saveMetamodelToAPI(
  metamodel: Metamodel,
  syncedToDb: Set<string>,
  pendingSaves: Map<string, Promise<void>>
): void {
  const saveData = {
    id: metamodel.id,
    name: metamodel.name,
    description: metamodel.description,
    uri: metamodel.uri,
    prefix: metamodel.prefix,
    eClass: metamodel.eClass,
    conformsTo: metamodel.conformsTo,
    classes: metamodel.classes,
    enums: metamodel.enums || [],
    constraints: metamodel.constraints,
  };

  const savePromise = (async () => {
    try {
      await apiClient.post<Metamodel>(API_ENDPOINTS.METAMODELS, saveData);
      syncedToDb.add(metamodel.id);
    } catch (err) {
      console.error('Error saving metamodel to API:', err);
    } finally {
      pendingSaves.delete(metamodel.id);
    }
  })();
  
  pendingSaves.set(metamodel.id, savePromise);
}

/**
 * Deletes a metamodel from the API.
 *
 * @param id The ID of the metamodel to delete
 * @returns A promise that rejects with the server's reason when deletion is refused
 */
export function deleteMetamodelFromAPI(id: string): Promise<void> {
  return apiClient.delete(`${API_ENDPOINTS.METAMODELS}/${id}`);
}
