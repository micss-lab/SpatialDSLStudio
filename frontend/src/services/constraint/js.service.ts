import { 
  JSConstraint, 
  JSValidationResult, 
  Model, 
  ModelElement,
  Metamodel,
  ValidationIssue
} from '../../models/types';
import { metamodelService } from '../metamodel';

// Import types and modules
import { IModelService, IMetamodelService } from './js/types';
import * as jsCrud from './js/js.crud';
import * as jsValidation from './js/js.validation';
import { addCollectionMethods } from './js/js.helpers';

/**
 * Service for managing JavaScript constraints
 * This service complements the OCL service by providing constraint validation
 * using JavaScript code.
 * 
 * Refactored into modular components for better maintainability:
 * - js/js.crud.ts: CRUD operations
 * - js/js.validation.ts: Validation and evaluation
 * - js/js.sandbox.ts: Sandbox execution environment
 * - js/js.helpers.ts: Utility functions
 */
class JSService {
  private _modelService: IModelService | null = null;
  private metamodelService: IMetamodelService = metamodelService;
  
  // Add getter for testing in App.tsx
  get modelService(): IModelService | null {
    return this._modelService;
  }
  
  /**
   * Set the model service reference for retrieving model elements
   */
  setModelService(service: IModelService): void {
    console.log('JSService.setModelService called with service', !!service);
    this._modelService = service;
    console.log('JSService.modelService is now set:', !!this._modelService);
  }

  /**
   * Get service context for delegated functions
   */
  private get context() {
    return {
      metamodelService: this.metamodelService,
      modelService: this._modelService
    };
  }
  
  /**
   * Create a new JavaScript constraint
   */
  createConstraint(
    metamodelId: string,
    contextClassId: string,
    name: string,
    expression: string,
    description: string = '',
    severity: 'error' | 'warning' | 'info' = 'error'
  ): JSConstraint | null {
    return jsCrud.createConstraint(
      this.context,
      metamodelId,
      contextClassId,
      name,
      expression,
      description,
      severity
    );
  }
  
  /**
   * Update an existing JavaScript constraint
   */
  updateConstraint(
    metamodelId: string,
    constraintId: string,
    updates: Partial<JSConstraint>
  ): JSConstraint | null {
    return jsCrud.updateConstraint(
      this.context,
      metamodelId,
      constraintId,
      updates
    );
  }
  
  /**
   * Delete a JavaScript constraint
   */
  deleteConstraint(metamodelId: string, constraintId: string): boolean {
    return jsCrud.deleteConstraint(
      this.context,
      metamodelId,
      constraintId
    );
  }
  
  /**
   * Get all JavaScript constraints for a specific metaclass
   */
  getConstraintsForMetaClass(metamodelId: string, metaClassId: string): JSConstraint[] {
    return jsCrud.getConstraintsForMetaClass(
      this.context,
      metamodelId,
      metaClassId
    );
  }
  
  /**
   * Get all JavaScript constraints in a metamodel
   */
  getAllConstraints(metamodelId: string): JSConstraint[] {
    return jsCrud.getAllConstraints(
      this.context,
      metamodelId
    );
  }
  
  /**
   * Validate JavaScript syntax without evaluating against a model
   */
  validateJSSyntax(expression: string): JSValidationResult {
    return jsValidation.validateJSSyntax(expression);
  }
  
  /**
   * Validate a model element against a JavaScript constraint
   * This uses a secure sandbox to evaluate the JavaScript code
   */
  evaluateJSConstraint(
    constraint: JSConstraint,
    element: ModelElement,
    model: Model,
    metamodel: Metamodel
  ): JSValidationResult {
    return jsValidation.evaluateJSConstraint(
      constraint,
      element,
      model,
      metamodel
    );
  }
  
  /**
   * Validate model elements against JavaScript constraints
   * 
   * @param model The model to validate
   * @param metamodel The metamodel containing the constraints
   * @param issues The array of validation issues to append to
   */
  validateJSConstraints(model: Model, metamodel: Metamodel, issues: ValidationIssue[]): void {
    jsValidation.validateJSConstraints(
      this.context,
      model,
      metamodel,
      issues
    );
  }
  
  /**
   * Add convenience methods for collections
   * This adds OCL-like operations to JavaScript arrays
   */
  private addCollectionMethods(arr: any[]): void {
    addCollectionMethods(arr);
  }
}

// Create and export the service instance
export const jsService = new JSService(); 
