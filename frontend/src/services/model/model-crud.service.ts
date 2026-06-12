import { v4 as uuidv4 } from 'uuid';
import { Model } from '../../models/types';

/**
 * Service for CRUD operations on models
 */
export class ModelCrudService {
  private models: Model[] = [];
  private readonly STORAGE_KEY = 'obeo_like_tool_models';

  /**
   * Get all models
   */
  getAllModels(): Model[] {
    return [...this.models];
  }

  /**
   * Get a model by ID
   */
  getModelById(id: string): Model | undefined {
    return this.models.find(m => m.id === id);
  }

  /**
   * Get models by metamodel ID
   */
  getModelsByMetamodelId(metamodelId: string): Model[] {
    return this.models.filter(m => m.conformsTo === metamodelId);
  }

  /**
   * Create a new model
   */
  createModel(
    name: string, 
    metamodelId: string,
    saveCallback: (model: Model) => void,
    description: string = ''
  ): Model {
    const newModel: Model = {
      id: uuidv4(),
      name,
      description,
      metamodelId,
      elements: [],
      conformsTo: metamodelId
    };
    
    this.models.push(newModel);
    saveCallback(newModel);
    return newModel;
  }

  /**
   * Update a model with new data
   */
  updateModel(
    modelId: string, 
    updatedModel: Partial<Model>,
    saveCallback: (modelId: string) => void
  ): Model | undefined {
    const modelIndex = this.models.findIndex(m => m.id === modelId);
    if (modelIndex === -1) return undefined;
    
    // Update the model with the new data, preserving the ID
    this.models[modelIndex] = {
      ...this.models[modelIndex],
      ...updatedModel,
      id: modelId // Ensure ID doesn't change
    };
    
    saveCallback(modelId);
    return this.models[modelIndex];
  }

  /**
   * Delete a model
   */
  deleteModel(
    id: string,
    saveCallback: () => void,
    deleteCallback: (id: string) => void,
    syncedToDbCallback: (id: string) => void
  ): boolean {
    const initialLength = this.models.length;
    this.models = this.models.filter(m => m.id !== id);
    const result = initialLength !== this.models.length;
    if (result) {
      saveCallback();
      deleteCallback(id);
      syncedToDbCallback(id);
    }
    return result;
  }

  /**
   * Set models (used during initialization)
   */
  setModels(models: Model[]): void {
    this.models = models;
  }

  /**
   * Clear all models
   */
  clearModels(): void {
    this.models = [];
  }

  /**
   * Get models reference (internal use)
   */
  getModelsRef(): Model[] {
    return this.models;
  }
}

export const modelCrudService = new ModelCrudService();
