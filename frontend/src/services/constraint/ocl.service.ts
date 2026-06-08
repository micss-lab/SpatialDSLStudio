import { OCLConstraint, OCLValidationResult } from '../../models/types';
import { metamodelService } from '../metamodel';
import { OclEngine } from '@stekoe/ocl.js';

// Import types and modules
import { IMetamodelService } from './ocl/types';
import { initializeOclEngine, registerMetamodel } from './ocl/ocl.engine';
import * as oclCrud from './ocl/ocl.crud';
import * as oclValidation from './ocl/ocl.validation';
import * as oclQuery from './ocl/ocl.query';

/**
 * Service for managing OCL constraints and validation using @stekoe/ocl.js
 * 
 * Refactored into modular components for better maintainability:
 * - ocl/ocl.engine.ts: Engine initialization and metamodel registration
 * - ocl/ocl.crud.ts: CRUD operations
 * - ocl/ocl.validation.ts: Validation and evaluation logic
 * - ocl/ocl.context.ts: Context preparation
 * - ocl/ocl.query.ts: Query operations
 * - ocl/ocl.helpers.ts: Utility functions
 */
class OCLService {
  private oclEngine: OclEngine;
  private registeredMetamodels: Set<string> = new Set();
  private modelService: any;
  private metamodelService: IMetamodelService = metamodelService;

  constructor() {
    // Initialize OCL.js engine with better type support
    this.oclEngine = initializeOclEngine();
  }

  /**
   * Get service context for delegated functions
   */
  private get context() {
    return {
      oclEngine: this.oclEngine,
      registeredMetamodels: this.registeredMetamodels,
      modelService: this.modelService
    };
  }

  /**
   * Register a metamodel with the OCL engine
   * This prepares the OCL engine to validate constraints against this metamodel
   */
  registerMetamodel(metamodel: any): void {
    registerMetamodel(this.oclEngine, this.registeredMetamodels, metamodel);
  }

  /**
   * Create a new OCL constraint for a metaclass
   */
  createConstraint(
    metamodelId: string,
    contextClassId: string,
    name: string,
    expression: string,
    description: string = '',
    severity: 'error' | 'warning' | 'info' = 'error'
  ): OCLConstraint | null {
    // Get metamodel and context class for validation
    const metamodel = this.metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error('Metamodel not found:', metamodelId);
      return null;
    }

    const contextClass = metamodel.classes.find(c => c.id === contextClassId);
    if (!contextClass) {
      console.error('Context class not found:', contextClassId);
      return null;
    }

    // Validate syntax before creating
    const validationResult = this.validateOCLSyntax(expression, metamodel, contextClass);

    return oclCrud.createConstraint(
      this.context,
      this.metamodelService,
      metamodelId,
      contextClassId,
      name,
      expression,
      description,
      severity,
      validationResult
    );
  }

  /**
   * Update an existing OCL constraint
   */
  updateConstraint(
    metamodelId: string, 
    constraintId: string, 
    updates: Partial<OCLConstraint>
  ): OCLConstraint | null {
    // If updating expression, validate it first
    if (updates.expression) {
      const metamodel = this.metamodelService.getMetamodelById(metamodelId);
      if (metamodel) {
        // Find the constraint to get its context class
        let contextClass: any = null;
        for (const metaClass of metamodel.classes) {
          if (metaClass.constraints) {
            const constraint = metaClass.constraints.find(c => c.id === constraintId);
            if (constraint) {
              contextClass = metaClass;
              break;
            }
          }
        }

        if (contextClass) {
          const validationResult = this.validateOCLSyntax(updates.expression, metamodel, contextClass);
          (updates as any).isValid = validationResult.valid;
          (updates as any).errorMessage = validationResult.valid ? undefined : validationResult.issues[0]?.message;
        }
      }
    }

    return oclCrud.updateConstraint(
      this.context,
      this.metamodelService,
      metamodelId,
      constraintId,
      updates
    );
  }

  /**
   * Delete an OCL constraint
   */
  deleteConstraint(metamodelId: string, constraintId: string): boolean {
    return oclCrud.deleteConstraint(
      this.metamodelService,
      metamodelId,
      constraintId
    );
  }

  /**
   * Get all constraints for a metaclass
   */
  getConstraintsForMetaClass(metamodelId: string, metaClassId: string): OCLConstraint[] {
    return oclCrud.getConstraintsForMetaClass(
      this.metamodelService,
      metamodelId,
      metaClassId
    );
  }

  /**
   * Get all constraints for a metamodel
   */
  getAllConstraints(metamodelId: string): OCLConstraint[] {
    return oclCrud.getAllConstraints(
      this.metamodelService,
      metamodelId
    );
  }

  /**
   * Validate OCL syntax without evaluating against a model
   * Uses OCL.js for parsing and validation
   */
  validateOCLSyntax(
    expression: string, 
    metamodel: any, 
    contextClass: any
  ): OCLValidationResult {
    return oclValidation.validateOCLSyntax(
      this.context,
      metamodel,
      expression,
      contextClass
    );
  }

  /**
   * Validate a model against all OCL constraints in its metamodel
   * Implementation to enforce constraints on models
   */
  validateModelAgainstConstraints(
    modelId: string, 
    metamodelId: string
  ): OCLValidationResult {
    return oclValidation.validateModelAgainstConstraints(
      this.context,
      this.metamodelService,
      modelId,
      metamodelId
    );
  }

  /**
   * Validate if a property update would conform to OCL constraints
   * This is a new method that can be called before updating properties
   */
  validatePropertyUpdate(
    modelId: string,
    elementId: string,
    propertiesToUpdate: Record<string, any>
  ): OCLValidationResult {
    return oclValidation.validatePropertyUpdate(
      this.context,
      this.metamodelService,
      modelId,
      elementId,
      propertiesToUpdate
    );
  }

  /**
   * Create a query expression directly with OCL.js
   * Useful for ad-hoc OCL expressions
   */
  createOCLQuery(query: string): any {
    return oclQuery.createOCLQuery(this.context, query);
  }

  /**
   * Evaluate an OCL query expression on a context object
   */
  evaluateOCLQuery(context: any, expression: any): any {
    return oclQuery.evaluateOCLQuery(this.context, context, expression);
  }

  /**
   * Set the model service reference (to avoid circular dependency)
   */
  setModelService(modelService: any): void {
    this.modelService = modelService;
  }
}

export const oclService = new OCLService(); 
