import { CodeGenerationProject } from '../../models/types';
import { apiClient, API_ENDPOINTS } from '../core';

/**
 * Service for synchronizing code generation projects with the API
 */
export class CodegenApiSyncService {
  // Track which project IDs are already in the database
  private syncedToDb: Set<string> = new Set();
  // Track pending saves to prevent race conditions
  private pendingSaves: Map<string, Promise<void>> = new Map();

  async initializeFromAPI(projects: CodeGenerationProject[]): Promise<CodeGenerationProject[]> {
    try {
      // Load projects from API
      const apiProjects = await apiClient.get<CodeGenerationProject[]>(API_ENDPOINTS.CODEGEN_PROJECTS);
      if (apiProjects && apiProjects.length > 0) {
        // Mark all loaded projects as synced
        apiProjects.forEach(p => this.syncedToDb.add(p.id));
        console.log('Loaded code generation projects from API:', apiProjects.length, 'projects');
        return apiProjects;
      } else {
        // Start with empty state when API returns no data
        console.log('No code generation projects in API, starting with empty state');
        return [];
      }
    } catch (error) {
      console.warn('Could not load from API, starting with empty state:', error);
      return [];
    }
  }

  async syncProjectToAPI(project: CodeGenerationProject): Promise<void> {
    // Check for pending save and wait for it
    const pendingSave = this.pendingSaves.get(project.id);
    if (pendingSave) {
      await pendingSave;
    }
    
    const savePromise = (async () => {
      try {
        if (this.syncedToDb.has(project.id)) {
          // Already in DB, use PUT
          await apiClient.put(`${API_ENDPOINTS.CODEGEN_PROJECTS}/${project.id}`, project);
        } else {
          // New project, use POST with the project's ID
          await apiClient.post(API_ENDPOINTS.CODEGEN_PROJECTS, {
            id: project.id,
            name: project.name,
            description: project.description,
            targetMetamodelId: project.targetMetamodelId,
            templates: project.templates,
            isExample: project.isExample
          });
          this.syncedToDb.add(project.id);
        }
      } catch (error) {
        console.error('Error syncing project to API:', error);
      } finally {
        this.pendingSaves.delete(project.id);
      }
    })();
    
    this.pendingSaves.set(project.id, savePromise);
    await savePromise;
  }

  async syncAllToAPI(projects: CodeGenerationProject[]): Promise<void> {
    for (const project of projects) {
      await this.syncProjectToAPI(project);
    }
  }

  clearCache(): void {
    this.syncedToDb.clear();
    this.pendingSaves.clear();
  }
}

export const codegenApiSyncService = new CodegenApiSyncService();
