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

  private normalizeImportedElement(element: any, index: number): ModelElement {
    const style = {
      ...(element.properties || {}),
      ...(element.style || {}),
    };

    if (!style.position && element.presentation?.position2D) {
      style.position = element.presentation.position2D;
    }

    return {
      ...element,
      id: element.id || `imported-element-${index}`,
      modelElementId: element.modelElementId || element.metaClassId || element.typeId,
      style,
      references: element.references || {},
      ...(element.presentation && { presentation: element.presentation }),
    };
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

  createModel(name: string, metamodelId: string, description: string = ''): Model {
    return modelCrudService.createModel(name, metamodelId, (model) => {
      this.saveToStorage();
      modelApiSyncService.saveModelToAPI(model);
    }, description);
  }

  async importModel(modelData: Model): Promise<Model> {
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
      elements: (modelData.elements || []).map((element, index) => this.normalizeImportedElement(element, index)),
      connections: modelData.connections || []
    };

    const models = modelCrudService.getModelsRef();
    const savedModel = await modelApiSyncService.upsertModelToAPI(importedModel);
    const savedModelIndex = models.findIndex(model => model.id === savedModel.id);
    if (savedModelIndex >= 0) {
      models[savedModelIndex] = savedModel;
    } else {
      models.push(savedModel);
    }

    window.dispatchEvent(new CustomEvent('model:changed', { detail: { modelId: savedModel.id } }));
    window.dispatchEvent(new Event('storage'));
    return savedModel;
  }

  updateModel(modelId: string, updatedModel: Partial<Model>): Model | undefined {
    return modelCrudService.updateModel(modelId, updatedModel, (id) => this.saveToStorage(id));
  }

  async deleteModel(id: string): Promise<boolean> {
    if (!this.getModelById(id)) {
      return false;
    }

    // Let an in-flight save settle first, otherwise its 404 fallback can
    // re-create the model right after we delete it
    await modelApiSyncService.waitForPendingSave(id);

    try {
      await modelApiSyncService.deleteModelFromAPI(id);
    } catch (error) {
      // A model that never reached the database has nothing to delete there;
      // any other refusal (not the owner) must keep the local copy so the UI
      // stays consistent with the server
      const missingRemotely =
        !modelApiSyncService.isSyncedToDb(id) &&
        error instanceof Error &&
        /not found/i.test(error.message);
      if (!missingRemotely) {
        throw error;
      }
    }

    modelApiSyncService.removeSyncedModel(id);
    return modelCrudService.deleteModel(id);
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

  removeModelElementReference(
    modelId: string,
    sourceElementId: string,
    referenceName: string,
    targetElementId: string
  ): boolean {
    const model = this.getModelById(modelId);
    if (!model) return false;

    return modelReferenceService.removeModelElementReference(
      model,
      sourceElementId,
      referenceName,
      targetElementId,
      (id) => this.saveToStorage(id)
    );
  }

  reconnectModelElementReference(
    modelId: string,
    sourceElementId: string,
    referenceName: string,
    oldTargetElementId: string,
    newTargetElementId: string
  ): boolean {
    const model = this.getModelById(modelId);
    if (!model) return false;

    return modelReferenceService.reconnectModelElementReference(
      model,
      sourceElementId,
      referenceName,
      oldTargetElementId,
      newTargetElementId,
      (id) => this.saveToStorage(id)
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
