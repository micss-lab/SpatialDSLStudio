import { 
  Model, 
  ModelElement, 
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
  private tempModelIds: Set<string> = new Set();

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

  private isTempModelId(id: string): boolean {
    return this.tempModelIds.has(id);
  }

  private saveToStorage(changedModelId?: string): void {
    // Sync to API only - no localStorage
    if (changedModelId && !this.isTempModelId(changedModelId)) {
      const model = this.getModelById(changedModelId);
      if (model) {
        modelApiSyncService.syncModelToAPI(model);
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

  createTempModel(name: string, metamodelId: string): Model {
    const tempModel = modelCrudService.createModel(name, metamodelId, () => {
      // Skip persistence for temp models used in testing
    });
    this.tempModelIds.add(tempModel.id);
    return tempModel;
  }

  createModel(name: string, metamodelId: string): Model {
    return modelCrudService.createModel(name, metamodelId, (model) => {
      this.saveToStorage();
      modelApiSyncService.saveModelToAPI(model);
    });
  }

  updateModel(modelId: string, updatedModel: Partial<Model>): Model | undefined {
    return modelCrudService.updateModel(modelId, updatedModel, (id) => this.saveToStorage(id));
  }

  deleteModel(id: string): boolean {
    const isTemp = this.isTempModelId(id);
    if (isTemp) {
      this.tempModelIds.delete(id);
    }
    return modelCrudService.deleteModel(
      id,
      () => {
        if (!isTemp) {
          this.saveToStorage();
        }
      },
      (modelId) => {
        if (!isTemp) {
          modelApiSyncService.deleteModelFromAPI(modelId);
        }
      },
      (modelId) => {
        if (!isTemp) {
          modelApiSyncService.removeSyncedModel(modelId);
        }
      }
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
    this.tempModelIds.clear();
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  clearCacheLocal(): void {
    console.log('ModelService: Clearing cache locally');
    modelCrudService.clearModels();
    modelApiSyncService.clearSyncState();
    modelValidationService.clearLastValidationIssues();
    modelElementCrudService.clearNewlyCreatedElements();
    this.tempModelIds.clear();
    this.initPromise = null;
  }
}

export const modelService = new ModelService();
