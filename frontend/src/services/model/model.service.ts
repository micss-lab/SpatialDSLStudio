import { 
  Model, 
  ModelElement, 
  ModelElementPresentation,
  ValidationResult,
  OCLValidationIssue
} from '../../models/types';
import { oclService } from '../constraint';
import { modelCrudService } from './model-crud.service';
import { modelElementCrudService } from './model-element-crud.service';
import { modelReferenceService } from './model-reference.service';
import { modelValidationService } from './model-validation.service';
import { modelMigrationService } from './model-migration.service';
import { modelApiSyncService } from './model-api-sync.service';

/**
 * Main service that orchestrates all model-related operations
 */
class ModelService {
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Start loading from API
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Load from API only
      await this.loadFromAPI();
    } catch (error) {
      console.error('API load failed:', error);
      // Start with empty state - no localStorage fallback
      modelCrudService.clearModels();
    }
    
    // Clean up any potential duplicate elements in models
    this.cleanupModels();
    
    // Set the model service reference in OCL service to handle circular dependency
    setTimeout(() => {
      oclService.setModelService(this);
    }, 0);
  }

  private async loadFromAPI(): Promise<void> {
    const data = await modelApiSyncService.loadFromAPI();
    if (data && Array.isArray(data)) {
      modelCrudService.setModels(data);
      // Migrate from old property names if needed
      this.migrateModels();
    }
  }

  private migrateModels(): void {
    const models = modelCrudService.getModelsRef();
    modelMigrationService.migrateModels(models);
    modelMigrationService.migrateNewAttributesOnLoad(models);
  }

  private saveToStorage(changedModelId?: string): void {
    // Sync to API only - no localStorage
    if (changedModelId) {
      const model = this.getModelById(changedModelId);
      if (model) {
        modelApiSyncService.syncModelToAPI(model);
        window.dispatchEvent(new CustomEvent('model:changed', { detail: { modelId: changedModelId } }));
        window.dispatchEvent(new Event('storage'));
      }
    }
  }

  // Model CRUD operations
  getAllModels(): Model[] {
    return modelCrudService.getAllModels();
  }

  getModelById(id: string): Model | undefined {
    return modelCrudService.getModelById(id);
  }

  getModelsByMetamodelId(metamodelId: string): Model[] {
    return modelCrudService.getModelsByMetamodelId(metamodelId);
  }

  createModel(name: string, metamodelId: string): Model {
    return modelCrudService.createModel(name, metamodelId, (model) => {
      this.saveToStorage();
      modelApiSyncService.saveModelToAPI(model);
    });
  }

  importModel(modelData: Model): Model {
    if (!modelData.id || !modelData.name || !Array.isArray(modelData.elements)) {
      throw new Error('Invalid model format');
    }

    const metamodelId = modelData.conformsTo || modelData.metamodelId;
    if (!metamodelId) {
      throw new Error('Imported model is missing conformsTo/metamodelId');
    }

    const importedModel: Model = {
      ...modelData,
      metamodelId,
      conformsTo: metamodelId,
      elements: modelData.elements || [],
      connections: modelData.connections || []
    };

    const models = modelCrudService.getModelsRef();
    const existingIndex = models.findIndex(model => model.id === importedModel.id);
    if (existingIndex >= 0) {
      models[existingIndex] = importedModel;
    } else {
      models.push(importedModel);
    }

    this.saveToStorage(importedModel.id);
    return importedModel;
  }

  updateModel(modelId: string, updatedModel: Partial<Model>): Model | undefined {
    return modelCrudService.updateModel(modelId, updatedModel, (id) => this.saveToStorage(id));
  }

  deleteModel(id: string): boolean {
    return modelCrudService.deleteModel(
      id,
      () => this.saveToStorage(),
      (id) => modelApiSyncService.deleteModelFromAPI(id),
      (id) => modelApiSyncService.removeSyncedModel(id)
    );
  }

  // Model element CRUD operations
  addModelElement(
    modelId: string, 
    metaClassId: string,
    properties: Record<string, any> = {}
  ): ModelElement | null {
    const model = this.getModelById(modelId);
    if (!model) return null;

    return modelElementCrudService.addModelElement(
      model,
      metaClassId,
      (id) => this.saveToStorage(id),
      properties
    );
  }

  updateModelElementProperties(
    modelId: string,
    elementId: string,
    properties: Record<string, any>
  ): boolean {
    const model = this.getModelById(modelId);
    if (!model) return false;

    return modelElementCrudService.updateModelElementProperties(
      model,
      elementId,
      properties,
      (id) => this.saveToStorage(id)
    );
  }

  deleteModelElement(modelId: string, elementId: string): boolean {
    const model = this.getModelById(modelId);
    if (!model) return false;

    return modelElementCrudService.deleteModelElement(
      model,
      elementId,
      (id) => this.saveToStorage(id)
    );
  }

  addImportedModelElement(
    modelId: string,
    element: ModelElement
  ): ModelElement | null {
    const model = this.getModelById(modelId);
    if (!model) return null;

    return modelElementCrudService.addImportedModelElement(
      model,
      element,
      (id) => this.saveToStorage(id)
    );
  }

  updateElementPosition(
    modelId: string,
    elementId: string,
    position: { x: number, y: number }
  ): boolean {
    const model = this.getModelById(modelId);
    if (!model) return false;

    return modelElementCrudService.updateElementPosition(
      model,
      elementId,
      position,
      (id) => this.saveToStorage(id)
    );
  }

  updateModelElementPresentation(
    modelId: string,
    elementId: string,
    presentation: ModelElementPresentation
  ): boolean {
    const model = this.getModelById(modelId);
    if (!model) return false;

    return modelElementCrudService.updateModelElementPresentation(
      model,
      elementId,
      presentation,
      (id) => this.saveToStorage(id)
    );
  }

  // Reference operations
  setModelElementReference(
    modelId: string,
    sourceElementId: string,
    referenceName: string,
    targetElementId: string | string[] | null,
    bendPoints?: Array<{x: number, y: number}>,
    attributes?: Record<string, any>
  ): boolean {
    const model = this.getModelById(modelId);
    if (!model) return false;

    return modelReferenceService.setModelElementReference(
      model,
      sourceElementId,
      referenceName,
      targetElementId,
      (id) => this.saveToStorage(id),
      bendPoints,
      attributes
    );
  }

  // Validation operations
  validateModel(modelId: string): ValidationResult {
    const model = this.getModelById(modelId);
    if (!model) {
      return {
        valid: false,
        issues: [{
          severity: 'error',
          message: `Model with ID ${modelId} not found`,
          elementId: modelId
        }]
      };
    }

    return modelValidationService.validateModel(model);
  }

  performConstraintValidation(modelId: string): ValidationResult {
    return this.validateModel(modelId);
  }

  getLastValidationIssues(): OCLValidationIssue[] {
    return modelValidationService.getLastValidationIssues();
  }
  
  clearLastValidationIssues(): void {
    modelValidationService.clearLastValidationIssues();
  }
  
  hasValidationIssues(): boolean {
    return modelValidationService.hasValidationIssues();
  }

  // Migration and cleanup operations
  cleanupModels(): void {
    const models = modelCrudService.getModelsRef();
    modelMigrationService.cleanupModels(models, () => this.saveToStorage());
  }

  cleanupModelsManually(): number {
    const models = modelCrudService.getModelsRef();
    return modelMigrationService.cleanupModelsManually(models, () => this.saveToStorage());
  }

  removeDuplicateElements(elementId: string): number {
    const models = modelCrudService.getModelsRef();
    return modelMigrationService.removeDuplicateElements(models, elementId, () => this.saveToStorage());
  }

  // Circular dependency handlers
  setJSService(service: any): void {
    // Directly set this model service on the provided js service instance
    service.setModelService(this);
  }

  // Cache management
  async clearCacheAndReinitialize(): Promise<void> {
    console.log('ModelService: Clearing cache and reinitializing');
    modelCrudService.clearModels();
    modelApiSyncService.clearSyncState();
    modelValidationService.clearLastValidationIssues();
    modelElementCrudService.clearNewlyCreatedElements();
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  clearCacheLocal(): void {
    console.log('ModelService: Clearing cache locally');
    modelCrudService.clearModels();
    modelApiSyncService.clearSyncState();
    modelValidationService.clearLastValidationIssues();
    modelElementCrudService.clearNewlyCreatedElements();
    this.initPromise = null;
  }
}

export const modelService = new ModelService();
