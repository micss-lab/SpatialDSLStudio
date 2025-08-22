import { v4 as uuidv4 } from 'uuid';
import { 
  JSConstraint, 
  JSValidationResult, 
  Metamodel, 
  MetaClass, 
  Model, 
  ModelElement,
  ValidationIssue,
  JSValidationIssue,
  Constraint
} from '../models/types';
// Removed import of modelService to break circular dependency
import { metamodelService } from './metamodel.service';

// Define interfaces to avoid circular dependencies
interface IModelService {
  getModelById(id: string): Model | undefined;
  // Add other methods as needed
}

interface IMetamodelService {
  getMetamodelById(id: string): Metamodel | undefined;
  updateMetamodel(id: string, metamodel: Metamodel): void;
}

/**
 * Service for managing JavaScript constraints
 * This service complements the OCL service by providing constraint validation
 * using JavaScript code.
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
    // Find the metamodel
    const metamodel = this.metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error(`Metamodel with id ${metamodelId} not found`);
      return null;
    }
    
    // Find the context class
    const contextClass = metamodel.classes.find((c: MetaClass) => c.id === contextClassId);
    if (!contextClass) {
      console.error(`Context class with id ${contextClassId} not found`);
      return null;
    }
    
    // Create the constraint
    const constraint: JSConstraint = {
      id: uuidv4(),
      name,
      contextClassName: contextClass.name,
      contextClassId,
      expression,
      description,
      isValid: true, // We'll validate it later
      type: 'javascript',
      severity,
    };
    
    // Validate the constraint
    const validationResult = this.validateJSSyntax(constraint.expression);
    if (!validationResult.valid) {
      constraint.isValid = false;
      constraint.errorMessage = validationResult.issues[0]?.message || 'Invalid JavaScript expression';
    }
    
    // Add the constraint to the context class
    if (!contextClass.constraints) {
      contextClass.constraints = [];
    }
    
    // Check if this constraint already exists to avoid duplicates
    const existingConstraintIndex = contextClass.constraints.findIndex(c => 
      c.id === constraint.id || (c.name === constraint.name && c.contextClassId === constraint.contextClassId)
    );
    
    if (existingConstraintIndex !== -1) {
      // Replace existing constraint
      contextClass.constraints[existingConstraintIndex] = constraint;
    } else {
      // Add new constraint
      contextClass.constraints.push(constraint);
    }
    
    // Double check that the type is correct (defensive programming)
    if ('type' in constraint && constraint.type !== 'javascript') {
      console.warn('JSConstraint had incorrect type value, fixing to "javascript"');
      constraint.type = 'javascript';
    }
    
    // Ensure the metamodel is updated in metamodelService
    if (typeof this.metamodelService.updateMetamodel === 'function') {
      this.metamodelService.updateMetamodel(metamodelId, metamodel);
    }
    
    return constraint;
  }
  
  /**
   * Update an existing JavaScript constraint
   */
  updateConstraint(
    metamodelId: string,
    constraintId: string,
    updates: Partial<JSConstraint>
  ): JSConstraint | null {
    // Find the metamodel
    const metamodel = this.metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error(`Metamodel with id ${metamodelId} not found`);
      return null;
    }
    
    // Find the constraint in any class
    let constraint: JSConstraint | undefined;
    let containerClass: MetaClass | undefined;
    
    for (const cls of metamodel.classes) {
      if (cls.constraints) {
        const found = cls.constraints.find((c: Constraint) => c.id === constraintId && 'type' in c && c.type === 'javascript') as JSConstraint | undefined;
        if (found) {
          constraint = found;
          containerClass = cls;
          break;
        }
      }
    }
    
    // Also check global constraints
    if (!constraint && metamodel.constraints) {
      const found = metamodel.constraints.find((c: Constraint) => c.id === constraintId && 'type' in c && c.type === 'javascript') as JSConstraint | undefined;
      if (found) {
        constraint = found;
      }
    }
    
    if (!constraint) {
      console.error(`Constraint with id ${constraintId} not found`);
      return null;
    }
    
    // Ensure type remains 'javascript' regardless of what updates contain
    if (updates.type !== undefined && updates.type !== 'javascript') {
      console.warn(`Attempted to change JS constraint type to '${updates.type}', overriding to 'javascript'`);
      updates.type = 'javascript';
    }
    
    // Update the constraint
    Object.assign(constraint, updates);
    
    // Double check that the type is correct after update (defensive programming)
    if (constraint.type !== 'javascript') {
      console.warn('JSConstraint had incorrect type value after update, fixing to "javascript"');
      constraint.type = 'javascript';
    }
    
    // Validate if the expression was updated
    if (updates.expression !== undefined) {
      const validationResult = this.validateJSSyntax(constraint.expression);
      constraint.isValid = validationResult.valid;
      constraint.errorMessage = validationResult.valid ? undefined : 
        validationResult.issues[0]?.message || 'Invalid JavaScript expression';
    }
    
    // Save the updated metamodel
    this.metamodelService.updateMetamodel(metamodelId, metamodel);
    
    return constraint;
  }
  
  /**
   * Delete a JavaScript constraint
   */
  deleteConstraint(metamodelId: string, constraintId: string): boolean {
    // Find the metamodel
    const metamodel = this.metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error(`Metamodel with id ${metamodelId} not found`);
      return false;
    }
    
    // Try to delete from classes
    for (const cls of metamodel.classes) {
      if (cls.constraints) {
        const initialLength = cls.constraints.length;
        cls.constraints = cls.constraints.filter((c: Constraint) => !(c.id === constraintId && 'type' in c && c.type === 'javascript'));
        if (cls.constraints.length < initialLength) {
          return true;
        }
      }
    }
    
    // Try to delete from global constraints
    if (metamodel.constraints) {
      const initialLength = metamodel.constraints.length;
      metamodel.constraints = metamodel.constraints.filter((c: Constraint) => !(c.id === constraintId && 'type' in c && c.type === 'javascript'));
      if (metamodel.constraints.length < initialLength) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get all JavaScript constraints for a specific metaclass
   */
  getConstraintsForMetaClass(metamodelId: string, metaClassId: string): JSConstraint[] {
    // Find the metamodel
    const metamodel = this.metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error(`Metamodel with id ${metamodelId} not found`);
      return [];
    }
    
    // Find the class
    const cls = metamodel.classes.find((c: MetaClass) => c.id === metaClassId);
    if (!cls) {
      console.error(`Class with id ${metaClassId} not found`);
      return [];
    }
    
    // Get the constraints
    const constraints: JSConstraint[] = [];
    if (cls.constraints) {
      for (const c of cls.constraints) {
        if ('type' in c && c.type === 'javascript') {
          constraints.push(c as JSConstraint);
        }
      }
    }
    
    return constraints;
  }
  
  /**
   * Get all JavaScript constraints in a metamodel
   */
  getAllConstraints(metamodelId: string): JSConstraint[] {
    // Find the metamodel
    const metamodel = this.metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error(`Metamodel with id ${metamodelId} not found`);
      return [];
    }
    
    // Get constraints from all classes
    const constraints: JSConstraint[] = [];
    for (const cls of metamodel.classes) {
      if (cls.constraints) {
        for (const c of cls.constraints) {
          if ('type' in c && c.type === 'javascript') {
            constraints.push(c as JSConstraint);
          }
        }
      }
    }
    
    // Get global constraints
    if (metamodel.constraints) {
      for (const c of metamodel.constraints) {
        if ('type' in c && c.type === 'javascript') {
          constraints.push(c as JSConstraint);
        }
      }
    }
    
    return constraints;
  }
  
  /**
   * Validate JavaScript syntax without evaluating against a model
   */
  validateJSSyntax(expression: string): JSValidationResult {
    const result: JSValidationResult = {
      valid: true,
      issues: []
    };
    
    console.log('Validating JS syntax:', JSON.stringify(expression));
    
    try {
      // First try to parse the expression as a complex function body
      try {
        const functionBody = `
          "use strict";
          try {
            const self = {};
            ${expression}
            return true;
          } catch (e) {
            return false;
          }
        `;
        new Function(functionBody);
      } catch (complexError) {
        console.log('Complex validation failed, trying simple expression');
        // If that fails, try to parse it as a simple expression
        try {
          new Function('self', `return (${expression});`);
        } catch (error) {
          result.valid = false;
          result.issues.push({
            severity: 'error',
            message: this.formatJSError(error instanceof Error ? error.message : String(error)),
            constraintId: 'syntax-check',
            expression
          });
        }
      }
    } catch (outerError) {
      console.error('Error in validateJSSyntax:', outerError);
      result.valid = false;
      result.issues.push({
        severity: 'error',
        message: `Syntax validation error: ${outerError instanceof Error ? outerError.message : String(outerError)}`,
        constraintId: 'syntax-check',
        expression
      });
    }
    
    console.log('JS syntax validation result:', result.valid ? 'Valid' : 'Invalid', 
                result.issues.length ? result.issues[0].message : '');
    return result;
  }
  
  /**
   * Format JavaScript error messages to be more user-friendly
   */
  private formatJSError(message: string): string {
    // Clean up common syntax error messages
    if (message.includes('Unexpected token')) {
      return `Syntax error: ${message}`;
    }
    if (message.includes('Unexpected end of input')) {
      return 'Syntax error: Unexpected end of expression. Check for missing closing brackets, parentheses, or quotes.';
    }
    return message;
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
    const result: JSValidationResult = {
      valid: true,
      issues: []
    };
    
    if (!constraint.isValid) {
      result.valid = false;
      result.issues.push({
        severity: constraint.severity,
        message: constraint.errorMessage || 'Invalid constraint syntax',
        elementId: element.id,
        constraintId: constraint.id,
        expression: constraint.expression
      });
      return result;
    }
    
    try {
      console.log(`Evaluating constraint "${constraint.name}" on element ${element.id} (${element.modelElementId})`);
      
      // Prepare the element for JavaScript evaluation
      const context = this.prepareContextForJS(element, model, metamodel);
      
      // Create a secure sandbox for evaluating the JavaScript expression
      const sandbox = this.createJSSandbox(context, model);
      
      // Evaluate the constraint
      const isValid = this.evaluateInSandbox(constraint.expression, sandbox);
      
      if (isValid !== true) {
        result.valid = false;
        result.issues.push({
          severity: constraint.severity,
          message: typeof isValid === 'string' ? isValid : `Constraint '${constraint.name}' failed`,
          elementId: element.id,
          constraintId: constraint.id,
          expression: constraint.expression
        });
      }
    } catch (error) {
      console.error(`Error evaluating constraint "${constraint.name}"`, error);
      result.valid = false;
      result.issues.push({
        severity: constraint.severity,
        message: `Error evaluating constraint "${constraint.name}": ${error instanceof Error ? error.message : String(error)}`,
        elementId: element.id,
        constraintId: constraint.id,
        expression: constraint.expression
      });
    }
    
    return result;
  }
  
  /**
   * Prepare context for JavaScript evaluation
   */
  private prepareContextForJS(
    element: ModelElement,
    model: Model,
    metamodel: Metamodel
  ): Record<string, any> {
    // Create a clean context
    const context: Record<string, any> = {
      self: {
        ...element.style,
        id: element.id,
        type: element.modelElementId
      },
      model: {
        id: model.id,
        name: model.name,
        elements: model.elements.map(e => ({
          id: e.id,
          type: e.modelElementId,
          ...e.style
        }))
      },
      metamodel: {
        id: metamodel.id,
        name: metamodel.name
      }
    };

    // Add all directly referenced elements
    if (element.references) {
      Object.entries(element.references).forEach(([refName, refValue]) => {
        if (refValue) {
          if (Array.isArray(refValue)) {
            // For multi-valued references
            context.self[refName] = refValue.map(refId => {
              const refElement = model.elements.find(e => e.id === refId);
              if (refElement) {
                return {
                  ...refElement.style,
                  id: refElement.id,
                  type: refElement.modelElementId
                };
              }
              return null;
            }).filter(Boolean);
          } else {
            // For single-valued references
            const refElement = model.elements.find(e => e.id === refValue);
            if (refElement) {
              context.self[refName] = {
                ...refElement.style,
                id: refElement.id,
                type: refElement.modelElementId
              };
            }
          }
        }
      });
    }

    return context;
  }
  
  /**
   * Creates a sandbox environment for safely evaluating JavaScript constraints
   */
  private createJSSandbox(
    context: Record<string, any>,
    model: Model
  ): Record<string, any> {
    // Create a new sandbox with restricted access
    const sandbox: Record<string, any> = {
      ...context,
      // Add utility functions
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      decodeURI,
      decodeURIComponent,
      encodeURI,
      encodeURIComponent,
      Math,
      Date,
      String,
      Number,
      Array,
      Object,
      Boolean,
      RegExp,
      JSON,
      Error,
      // Add model access methods
      findElementById: (id: string) => {
        return model.elements.find(e => e.id === id);
      },
      findElementsByType: (metaClassId: string) => {
        return model.elements.filter(e => e.modelElementId === metaClassId);
      },
      // For debugging
      console: {
        log: (...args: any[]) => console.log('JS Constraint log:', ...args)
      }
    };

    // Log about current element
    console.log('Creating sandbox for element:', context.self);

    // Special handling for common variable names that might be used in constraints
    // Add any model elements with style.name property to the global scope for easier access
    // Also create lowercase version of metaclass name as a reference to self
    if (context.self) {
      // Get the metaclass name for this element (if available)
      const metaClass = context.metamodel ? 
        context.metamodel.classes?.find((c: any) => c.id === context.self.type) : null;
      
      if (metaClass) {
        const className = metaClass.name.toLowerCase();
        console.log(`Adding ${className} as reference to self`);
        
        // Create a variable with the lowercase metaclass name that refers to self
        // For example, if metaclass name is "Cafeteria", create a variable "cafeteria" = self
        sandbox[className] = context.self;
      }
    }

    if (model.elements) {
      console.log('Adding named elements to sandbox:');
      for (const element of model.elements) {
        if (element.style && typeof element.style.name === 'string' && element.style.name.trim()) {
          // Make the element accessible via its name for convenience
          const safeName = element.style.name.trim().replace(/[^a-zA-Z0-9_]/g, '_');
          
          // Only add if it's a valid JavaScript identifier and doesn't conflict with existing properties
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(safeName) && !(safeName in sandbox)) {
            console.log(`  - Adding ${safeName} for element ${element.id}`);
            sandbox[safeName] = element;
          }
        }
      }
    }

    return sandbox;
  }
  
  /**
   * Safely evaluate a JavaScript expression in a sandbox
   * Returns true if constraint passes, or an error message string if it fails
   */
  private evaluateInSandbox(expression: string, sandbox: Record<string, any>): boolean | string {
    try {
      // Debug: Log the available variables in the sandbox and the exact constraint expression
      console.log('Evaluating expression:', JSON.stringify(expression));
      console.log('Available vars in sandbox:', Object.keys(sandbox));
      console.log('Self in sandbox:', sandbox.self ? Object.keys(sandbox.self) : 'not defined');
      
      // Show the actual values of attributes that might be referenced in the expression
      if (sandbox.self) {
        const keys = Object.keys(sandbox.self);
        for (const key of keys) {
          if (typeof sandbox.self[key] !== 'object' || sandbox.self[key] === null) {
            console.log(`  - ${key}: ${sandbox.self[key]} (type: ${typeof sandbox.self[key]})`);
          }
        }
      }
      
      // Check if the expression is simple or complex (contains control structures)
      const isSimpleExpression = !expression.includes('return') && 
                                !expression.includes('if') && 
                                !expression.includes('for');
      
      // Create a safer function body
      let functionBody;
      
      if (isSimpleExpression) {
        // For simple expressions, just return the result directly
        functionBody = `
          "use strict";
          try {
            const self = arguments[0];
            console.log('JS constraint evaluating with self:', self ? {id: self.id, type: self.type} : 'undefined');
            return (${expression});
          } catch (err) {
            console.error('Error in constraint simple expression:', err);
            return { valid: false, message: "Runtime error: " + err.message };
          }
        `;
      } else {
        // For complex expressions with if/return statements
        functionBody = `
          "use strict";
          try {
            const self = arguments[0];
            console.log('JS constraint evaluating with self:', self ? {id: self.id, type: self.type} : 'undefined');
            
            // Complex function with explicit return
            ${expression}
            
            // Default return true if no explicit return in complex function
            return true;
          } catch (err) {
            console.error('Error in constraint complex expression:', err);
            return { valid: false, message: "Runtime error: " + err.message };
          }
        `;
      }
      
      console.log('Function body:', functionBody);
      
      try {
        // Create a function using the sandbox as context
        const constraintFunction = new Function(...Object.keys(sandbox), functionBody);
        
        // Call the function with the sandbox variables
        const result = constraintFunction(...Object.values(sandbox));
        
        // Handle various return value formats
        if (result === true || result === undefined) {
          return true;
        } else if (result === false) {
          return "Constraint failed";
        } else if (typeof result === 'object' && result !== null) {
          if ('valid' in result) {
            if (result.valid === true) {
              return true;
            } else {
              return result.message || "Constraint failed";
            }
          }
        }
        
        return "Constraint returned an invalid result: " + String(result);
      } catch (fnError) {
        console.error('Error creating or running constraint function:', fnError);
        return `Runtime error: ${fnError instanceof Error ? fnError.message : String(fnError)}`;
      }
    } catch (error) {
      console.error('Error in evaluateInSandbox outer block:', error);
      return `Runtime error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  
  /**
   * Validate model elements against JavaScript constraints
   * 
   * @param model The model to validate
   * @param metamodel The metamodel containing the constraints
   * @param issues The array of validation issues to append to
   */
  validateJSConstraints(model: Model, metamodel: Metamodel, issues: ValidationIssue[]): void {
    console.log('JSService.validateJSConstraints called', { 
      modelServiceSet: !!this._modelService,
      modelId: model?.id,
      metamodelId: metamodel?.id,
      currentIssuesCount: issues?.length
    });
    
    if (!this._modelService) {
      console.error('Model service not set');
      return;
    }
    
    try {
      // Organize constraints by metaclass for more efficient processing
      const constraintsByClass: Record<string, JSConstraint[]> = {};
      
      // Collect constraints from classes
      for (const cls of metamodel.classes) {
        if (cls.constraints) {
          const jsConstraints = cls.constraints.filter(c => 'type' in c && c.type === 'javascript') as JSConstraint[];
          if (jsConstraints.length > 0) {
            constraintsByClass[cls.id] = jsConstraints;
          }
        }
      }
      
      // Collect global constraints
      const globalConstraints: JSConstraint[] = [];
      if (metamodel.constraints) {
        for (const c of metamodel.constraints) {
          if ('type' in c && c.type === 'javascript') {
            globalConstraints.push(c as JSConstraint);
          }
        }
      }
      
      // Validate each model element against applicable constraints
      for (const element of model.elements) {
        // Get constraints for this element's type
        const applicableConstraints = this.getApplicableJSConstraints(
          element.modelElementId,
          constraintsByClass,
          globalConstraints
        );
        
        // Evaluate each constraint
        for (const constraint of applicableConstraints) {
          const result = this.evaluateJSConstraint(constraint, element, model, metamodel);
          if (!result.valid) {
            // Add issues to the result
            issues.push(...result.issues);
          }
        }
      }
    } catch (error) {
      console.error('Error validating JS constraints:', error);
    }
  }
  
  /**
   * Get constraints applicable to a specific element type
   */
  private getApplicableJSConstraints(
    metaClassId: string,
    constraintsByClass: Record<string, JSConstraint[]>,
    globalConstraints: JSConstraint[]
  ): JSConstraint[] {
    const result: JSConstraint[] = [];
    
    // Add constraints for this class
    if (constraintsByClass[metaClassId]) {
      result.push(...constraintsByClass[metaClassId]);
    }
    
    // Add global constraints
    result.push(...globalConstraints);
    
    return result;
  }
  
  /**
   * Add convenience methods for collections
   * This adds OCL-like operations to JavaScript arrays
   */
  private addCollectionMethods(arr: any[]): void {
    // Add methods that are similar to OCL collection operations
    Object.defineProperties(arr, {
      size: {
        get: function() { return this.length; }
      },
      isEmpty: {
        get: function() { return this.length === 0; }
      },
      notEmpty: {
        get: function() { return this.length > 0; }
      },
      includes: {
        value: function(item: any) { return this.includes(item); }
      },
      excludes: {
        value: function(item: any) { return !this.includes(item); }
      },
      includesAll: {
        value: function(items: any[]) { 
          return items.every((item: any) => this.includes(item)); 
        }
      },
      excludesAll: {
        value: function(items: any[]) { 
          return items.every((item: any) => !this.includes(item)); 
        }
      },
      count: {
        value: function(predicate: (item: any) => boolean) { 
          return this.filter(predicate).length; 
        }
      },
      exists: {
        value: function(predicate: (item: any) => boolean) { 
          return this.some(predicate); 
        }
      },
      forAll: {
        value: function(predicate: (item: any) => boolean) { 
          return this.every(predicate); 
        }
      },
      select: {
        value: function(predicate: (item: any) => boolean) { 
          return this.filter(predicate); 
        }
      },
      reject: {
        value: function(predicate: (item: any) => boolean) { 
          return this.filter((item: any) => !predicate(item)); 
        }
      },
      collect: {
        value: function(mapper: (item: any) => any) { 
          return this.map(mapper); 
        }
      },
      sum: {
        value: function() { 
          return this.reduce((a: number, b: number) => a + b, 0); 
        }
      },
      any: {
        value: function(predicate: (item: any) => boolean) { 
          return this.find(predicate); 
        }
      },
      one: {
        value: function(predicate: (item: any) => boolean) { 
          return this.filter(predicate).length === 1; 
        }
      }
    });
  }
}

// Create and export the service instance
export const jsService = new JSService(); 