import { v4 as uuidv4 } from 'uuid';
import { 
  OCLConstraint, 
  Metamodel, 
  MetaClass,
  MetaAttribute,
  MetaReference, 
  Model, 
  ModelElement, 
  OCLValidationResult,
  OCLValidationIssue,
  OCLValidationContext
} from '../models/types';
import { metamodelService } from './metamodel.service';
import { OclEngine } from '@stekoe/ocl.js';

/**
 * Service for managing OCL constraints and validation using @stekoe/ocl.js
 */
class OCLService {
  private oclEngine: OclEngine;
  private registeredMetamodels: Set<string> = new Set();
  private modelService: any;

  constructor() {
    // Initialize OCL.js engine with better type support
    this.oclEngine = OclEngine.create();
    
    // Set a more robust type determiner function that handles arrays and null values properly
    this.oclEngine.setTypeDeterminer((obj: any) => {
      if (obj === null || obj === undefined) {
        return 'OclVoid';
      }
      
      // Handle arrays/collections properly
      if (Array.isArray(obj)) {
        // For empty arrays, return a generic Collection type
        if (obj.length === 0) {
          return 'Collection';
        }
        
        // If array has elements and they have types, use the first element's type
        if (obj[0] && obj[0]._type) {
          return `Collection(${obj[0]._type})`;
        }
        
        return 'Collection(OclAny)';
      }
      
      // If object has _type property, use it
      if (obj._type) {
        return obj._type;
      }
      
      // Default type mapping based on JavaScript type
      const jsType = typeof obj;
      switch (jsType) {
        case 'string': return 'String';
        case 'number': return 'Real';
        case 'boolean': return 'Boolean';
        case 'object': return 'OclAny';
        default: return 'OclAny';
      }
    });

    // Register basic JavaScript types that map to OCL types
    // Use constructor functions rather than direct references for proper instanceof checks
    this.oclEngine.registerTypes({
      "String": String.prototype.constructor,
      "Number": Number.prototype.constructor,
      "Boolean": Boolean.prototype.constructor,
      "Collection": Array.prototype.constructor,
      "Set": Set.prototype.constructor,
      "OclAny": Object.prototype.constructor,
      "OclVoid": null
    });
  }

  /**
   * Register a metamodel with the OCL engine
   * This prepares the OCL engine to validate constraints against this metamodel
   */
  registerMetamodel(metamodel: Metamodel): void {
    // Check if this metamodel is already registered
    if (this.registeredMetamodels.has(metamodel.id)) {
      return;
    }

    try {
      // Create type definitions for all metaclasses
      const types: Record<string, any> = {};
      
      // Create type definitions for each metaclass
      for (const metaClass of metamodel.classes) {
        // Skip if this class was already defined
        if (types[metaClass.name]) {
          console.warn(`Duplicate metaclass name: ${metaClass.name}, skipping definition`);
          continue;
        }

        types[metaClass.name] = {
          properties: {},
          superTypes: []
        };
      }
      
      // Add properties and inheritance to each type
      for (const metaClass of metamodel.classes) {
        // Skip if this class was not defined (should not happen)
        if (!types[metaClass.name]) continue;

        // Add attributes
        for (const attr of metaClass.attributes) {
          types[metaClass.name].properties[attr.name] = {
            type: this.mapTypeToOCL(attr.type),
            many: attr.many
          };
        }
        
        // Add references
        for (const ref of metaClass.references) {
          const targetClass = metamodel.classes.find(c => c.id === ref.target);
          if (targetClass) {
            const isMany = ref.cardinality.upperBound === '*' || 
                        (typeof ref.cardinality.upperBound === 'number' && ref.cardinality.upperBound > 1);
            
            types[metaClass.name].properties[ref.name] = {
              type: targetClass.name,
              many: isMany
            };
          }
        }
        
        // Add inheritance relationships
        if (metaClass.superTypes && metaClass.superTypes.length > 0) {
          for (const superTypeId of metaClass.superTypes) {
            const superClass = metamodel.classes.find(c => c.id === superTypeId);
            if (superClass) {
              types[metaClass.name].superTypes.push(superClass.name);
            }
          }
        }

        // Add special id property
        types[metaClass.name].properties['id'] = {
          type: 'String',
          many: false
        };
      }
      
      // Register all types with the engine
      this.oclEngine.registerTypes(types);

      // Mark this metamodel as registered
      this.registeredMetamodels.add(metamodel.id);
      console.log(`Registered metamodel ${metamodel.name} with OCL engine`);
    } catch (error) {
      console.error('Error registering metamodel with OCL engine:', error);
      throw error;
    }
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
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error('Metamodel not found:', metamodelId);
      return null;
    }

    const contextClass = metamodel.classes.find(c => c.id === contextClassId);
    if (!contextClass) {
      console.error('Context class not found:', contextClassId);
      return null;
    }

    // Register metamodel with OCL engine if not already registered
    this.ensureMetamodelRegistered(metamodel);

    // Validate the OCL expression syntax (basic validation for now)
    const validationResult = this.validateOCLSyntax(expression, metamodel, contextClass);

    // Create the constraint with all required fields
    const constraint: any = {
      id: uuidv4(),
      name,
      contextClassName: contextClass.name,
      contextClassId,
      expression,
      description,
      isValid: validationResult.valid,
      errorMessage: validationResult.valid ? undefined : validationResult.issues[0]?.message,
      severity,
      type: 'ocl' // ALWAYS include the type field
    };

    // Add constraint to the metaclass
    if (!contextClass.constraints) {
      contextClass.constraints = [];
    }
    contextClass.constraints.push(constraint);

    // Save the updated metamodel
    metamodelService.updateMetamodel(metamodelId, metamodel);

    return constraint;
  }

  /**
   * Update an existing OCL constraint
   */
  updateConstraint(
    metamodelId: string, 
    constraintId: string, 
    updates: Partial<OCLConstraint>
  ): OCLConstraint | null {
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error('Metamodel not found:', metamodelId);
      return null;
    }

    // Find the constraint in any of the metaclasses
    let targetClass: MetaClass | undefined;
    let constraint: OCLConstraint | undefined;

    for (const metaClass of metamodel.classes) {
      if (metaClass.constraints) {
        const foundConstraint = metaClass.constraints.find(c => c.id === constraintId && ('type' in c) && c.type === 'ocl') as OCLConstraint | undefined;
        if (foundConstraint) {
          targetClass = metaClass;
          constraint = foundConstraint;
          break;
        }
      }
    }

    if (!targetClass || !constraint) {
      // Check global metamodel constraints
      if (metamodel.constraints) {
        constraint = metamodel.constraints.find(c => c.id === constraintId && ('type' in c) && c.type === 'ocl') as OCLConstraint | undefined;
        if (constraint) {
          // If we're updating the expression, validate it
          if (updates.expression) {
            const contextClass = metamodel.classes.find(c => c.id === constraint!.contextClassId);
            if (contextClass) {
              const validationResult = this.validateOCLSyntax(updates.expression, metamodel, contextClass);
              (updates as any).isValid = validationResult.valid;
              (updates as any).errorMessage = validationResult.valid ? undefined : validationResult.issues[0]?.message;
            }
          }

          // Ensure we're not changing the type
          if ((updates as any).type && (updates as any).type !== 'ocl') {
            console.warn(`Attempted to change OCL constraint type to '${(updates as any).type}', overriding to 'ocl'`);
            (updates as any).type = 'ocl';
          }

          // Update the constraint
          Object.assign(constraint, updates);
          
          // Save the updated metamodel
          metamodelService.updateMetamodel(metamodelId, metamodel);
          return constraint;
        }
      }

      console.error('Constraint not found:', constraintId);
      return null;
    }

    // Register metamodel with OCL engine if not already registered
    this.ensureMetamodelRegistered(metamodel);

    // If we're updating the expression, validate it
    if (updates.expression) {
      const validationResult = this.validateOCLSyntax(updates.expression, metamodel, targetClass);
      (updates as any).isValid = validationResult.valid;
      (updates as any).errorMessage = validationResult.valid ? undefined : validationResult.issues[0]?.message;
    }

    // Ensure we're not changing the type
    if ((updates as any).type && (updates as any).type !== 'ocl') {
      console.warn(`Attempted to change OCL constraint type to '${(updates as any).type}', overriding to 'ocl'`);
      (updates as any).type = 'ocl';
    }

    // Update the constraint
    Object.assign(constraint, updates);
    
    // Double check that the type field is correct after update
    if ((constraint as any).type !== 'ocl') {
      console.warn('OCLConstraint had incorrect type value after update, fixing to "ocl"');
      (constraint as any).type = 'ocl';
    }
    
    // Save the updated metamodel
    metamodelService.updateMetamodel(metamodelId, metamodel);
    
    return constraint;
  }

  /**
   * Delete an OCL constraint
   */
  deleteConstraint(metamodelId: string, constraintId: string): boolean {
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error('Metamodel not found:', metamodelId);
      return false;
    }

    // Try to find and delete the constraint from any metaclass
    for (const metaClass of metamodel.classes) {
      if (metaClass.constraints) {
        const initialLength = metaClass.constraints.length;
        metaClass.constraints = metaClass.constraints.filter(c => c.id !== constraintId);
        
        if (metaClass.constraints.length !== initialLength) {
          // Constraint was found and deleted
          metamodelService.updateMetamodel(metamodelId, metamodel);
          return true;
        }
      }
    }

    // Check global metamodel constraints
    if (metamodel.constraints) {
      const initialLength = metamodel.constraints.length;
      metamodel.constraints = metamodel.constraints.filter(c => c.id !== constraintId);
      
      if (metamodel.constraints.length !== initialLength) {
        // Constraint was found and deleted
        metamodelService.updateMetamodel(metamodelId, metamodel);
        return true;
      }
    }

    console.error('Constraint not found:', constraintId);
    return false;
  }

  /**
   * Get all constraints for a metaclass
   */
  getConstraintsForMetaClass(metamodelId: string, metaClassId: string): OCLConstraint[] {
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error('Metamodel not found:', metamodelId);
      return [];
    }

    const metaClass = metamodel.classes.find(c => c.id === metaClassId);
    if (!metaClass) {
      console.error('Metaclass not found:', metaClassId);
      return [];
    }

    // Get constraints specific to this metaclass, ONLY OCL type
    const classConstraints = metaClass.constraints ? 
      metaClass.constraints.filter(c => ('type' in c) && c.type === 'ocl') as OCLConstraint[] : 
      [];

    // Get global constraints that apply to this metaclass, ONLY OCL type
    const globalConstraints = (metamodel.constraints || [])
      .filter(c => ('type' in c) && c.type === 'ocl' && c.contextClassId === metaClassId) as OCLConstraint[];

    return [...classConstraints, ...globalConstraints];
  }

  /**
   * Get all constraints for a metamodel
   */
  getAllConstraints(metamodelId: string): OCLConstraint[] {
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      return [];
    }
    
    const constraints: OCLConstraint[] = [];
    
    // Collect constraints from all metaclasses
    for (const cls of metamodel.classes) {
      if (cls.constraints) {
        // Filter out JavaScript constraints and only include OCL constraints
        const oclConstraints = cls.constraints.filter(c => ('type' in c) && c.type === 'ocl') as OCLConstraint[];
        constraints.push(...oclConstraints);
      }
    }
    
    // Also collect global constraints if any
    if (metamodel.constraints) {
      const oclConstraints = metamodel.constraints.filter(c => ('type' in c) && c.type === 'ocl') as OCLConstraint[];
      constraints.push(...oclConstraints);
    }
    
    return constraints;
  }

  /**
   * Ensure a metamodel is registered with the OCL engine
   */
  private ensureMetamodelRegistered(metamodel: Metamodel): void {
    if (!this.registeredMetamodels.has(metamodel.id)) {
      this.registerMetamodel(metamodel);
    }
  }

  /**
   * Validate OCL syntax without evaluating against a model
   * Uses OCL.js for parsing and validation
   */
  validateOCLSyntax(
    expression: string, 
    metamodel: Metamodel, 
    contextClass: MetaClass
  ): OCLValidationResult {
    try {
      // Ensure the metamodel is registered
      this.ensureMetamodelRegistered(metamodel);

      // Prepare the expression for OCL.js (add context if needed)
      let fullExpression = expression;
      
      // Clean input expression and add context if needed
      if (!expression.trim().startsWith('context')) {
        fullExpression = `context ${contextClass.name} inv: ${expression}`;
      }
      
      try {
        // First try to parse with addOclExpression
        try {
          this.oclEngine.addOclExpression(fullExpression);
          
          // If we get here, the expression is valid
          this.oclEngine.removeOclExpression(fullExpression);
          return { valid: true, issues: [] };
        } catch (parseError: any) {
          // If that fails, try with createQuery which has better error reporting
          try {
            // Extract just the constraint part without the context declaration
            let extractedExpression = expression;
            
            // If there's a context declaration, extract the constraint part
            if (expression.includes('context') && expression.includes('inv')) {
              const invIndex = expression.indexOf('inv');
              const colonIndex = expression.indexOf(':', invIndex);
              
              if (colonIndex !== -1) {
                extractedExpression = expression.substring(colonIndex + 1).trim();
              }
            }
            
            // Try creating a query with just the constraint part
            this.oclEngine.createQuery(extractedExpression);
            
            // If we reach here, the query creation worked
            return { valid: true, issues: [] };
          } catch (queryError: any) {
            // Both approaches failed, report the original parse error
            console.error('OCL syntax validation failed:', parseError);
            return {
              valid: false,
              issues: [{
                constraintId: '',
                expression,
                severity: 'error',
                message: parseError instanceof Error ? 
                  this.formatOclError(parseError.message) : 
                  this.formatOclError(String(parseError))
              }]
            };
          }
        }
      } catch (error: any) {
        return {
          valid: false,
          issues: [{
            constraintId: '',
            expression,
            severity: 'error',
            message: error instanceof Error ? 
              this.formatOclError(error.message) : 
              this.formatOclError(String(error))
          }]
        };
      }
    } catch (error: any) {
      return {
        valid: false,
        issues: [{
          constraintId: '',
          expression,
          severity: 'error',
          message: error instanceof Error ? 
            this.formatOclError(error.message) : 
            this.formatOclError(String(error))
        }]
      };
    }
  }
  
  /**
   * Format OCL error messages to be more user-friendly
   */
  private formatOclError(message: string): string {
    // Make common OCL.js error messages more user-friendly
    if (message.includes('instanceof') && message.includes('not callable')) {
      return 'Type error in constraint. Check that collections use proper operations like ->size() and types are correct.';
    }
    
    if (message.includes('undefined') || message.includes('null')) {
      return 'Reference error in constraint. Check that all property and reference names are spelled correctly.';
    }
    
    if (message.includes('cannot read') || message.includes('property') || message.includes('of undefined')) {
      return 'Reference error in constraint. A referenced object or property does not exist.';
    }
    
    if (message.includes('is not a function')) {
      if (message.includes('size')) {
        return 'Collection error in constraint. Make sure you are using ->size() on a collection.';
      }
      return 'Operation error in constraint. Check that all operations are called on the correct type of object.';
    }
    
    return message;
  }

  /**
   * Validate a model against all OCL constraints in its metamodel
   * Implementation to enforce constraints on models
   */
  validateModelAgainstConstraints(
    modelId: string, 
    metamodelId: string
  ): OCLValidationResult {
    const model = this.modelService?.getModelById(modelId);
    if (!model) {
      return {
        valid: false,
        issues: [{
          constraintId: '',
          expression: '',
          severity: 'error',
          message: `Model not found: ${modelId}`
        }]
      };
    }

    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      return {
        valid: false,
        issues: [{
          constraintId: '',
          expression: '',
          severity: 'error',
          message: `Metamodel not found: ${metamodelId}`
        }]
      };
    }

    // Get all constraints - ONLY OCL TYPE
    const allConstraints = this.getAllConstraints(metamodelId);
    const issues: OCLValidationIssue[] = [];

    // Check if there's anything to validate
    if (allConstraints.length === 0) {
      return { valid: true, issues: [] };
    }

    // Register metamodel with OCL engine if not already registered
    this.ensureMetamodelRegistered(metamodel);

    // Group constraints by metaclass
    const constraintsByClass: Record<string, OCLConstraint[]> = {};
    for (const constraint of allConstraints) {
      // STRICT FILTER - skip invalid or non-OCL constraints
      if (!constraint.isValid) continue;
      if (('type' in constraint) && constraint.type !== 'ocl') continue;
      
      if (!constraintsByClass[constraint.contextClassId]) {
        constraintsByClass[constraint.contextClassId] = [];
      }
      constraintsByClass[constraint.contextClassId].push(constraint);
    }

    // Validate each model element against applicable constraints
    for (const element of model.elements) {
      // Get metaclass
      const metaClass = metamodel.classes.find(c => c.id === element.modelElementId);
      if (!metaClass) continue;

      // Get all applicable constraints (including from supertypes)
      const applicableConstraints = this.getApplicableConstraints(metaClass, metamodel, constraintsByClass);
      
      // Evaluate each constraint for this element
      for (const constraint of applicableConstraints) {
        // Additional runtime type check before evaluation
        if (('type' in constraint) && constraint.type !== 'ocl') {
          console.warn(`Skipping non-OCL constraint that was incorrectly filtered: ${constraint.id} - ${constraint.name}`);
          continue;
        }
        
        const result = this.evaluateOCLConstraint(constraint, element, model, metamodel);
        
        if (!result.valid) {
          issues.push(...result.issues.map(issue => ({
            ...issue,
            elementId: element.id,
            constraintId: constraint.id
          })));
        }
      }
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Get all applicable constraints for a metaclass (including inherited ones)
   */
  private getApplicableConstraints(
    metaClass: MetaClass,
    metamodel: Metamodel,
    constraintsByClass: Record<string, OCLConstraint[]>
  ): OCLConstraint[] {
    const result: OCLConstraint[] = [];
    
    // Add constraints directly associated with this metaclass
    if (constraintsByClass[metaClass.id]) {
      result.push(...constraintsByClass[metaClass.id]);
    }
    
    // Add constraints from superclasses recursively
    if (metaClass.superTypes && metaClass.superTypes.length > 0) {
      for (const superTypeId of metaClass.superTypes) {
        const superClass = metamodel.classes.find(c => c.id === superTypeId);
        if (superClass) {
          const superConstraints = this.getApplicableConstraints(superClass, metamodel, constraintsByClass);
          result.push(...superConstraints);
        }
      }
    }
    
    return result;
  }

  /**
   * Map our type system to OCL.js types
   */
  private mapTypeToOCL(type: string): string {
    switch (type) {
      case 'string': return 'String';
      case 'number': return 'Real';
      case 'boolean': return 'Boolean';
      case 'date': return 'String'; // OCL doesn't have a date type, so we map to String
      default: return 'OclAny';
    }
  }

  /**
   * Evaluate an OCL constraint on a model element
   * Implementation that properly uses the OCL.js engine
   */
  private evaluateOCLConstraint(
    constraint: OCLConstraint,
    element: ModelElement,
    model: Model,
    metamodel: Metamodel
  ): OCLValidationResult {
    try {
      // EMERGENCY SAFETY CHECK: Never process JavaScript constraints with OCL engine
      if (('type' in constraint) && constraint.type !== 'ocl') {
        console.error('PREVENTED: Non-OCL constraint attempted to be processed by OCL engine!', constraint);
        return {
          valid: true, // Return valid to prevent errors
          issues: []
        };
      }

      // ADDITIONAL SAFETY CHECK: Check for JavaScript keywords and patterns
      const jsPatterns = [
        'function(', 'function (', '=>', '&&', '||', 
        'var ', 'let ', 'const ', 'return ', 'if(', 'if (', 
        'for(', 'for (', 'while(', 'while (', 'new ', 'this.'
      ];
      
      const containsJSPattern = jsPatterns.some(pattern => 
        constraint.expression.includes(pattern)
      );
      
      if (containsJSPattern) {
        console.error('PREVENTED: JavaScript-like code detected in OCL constraint!', constraint);
        return {
          valid: false,
          issues: [{
            constraintId: constraint.id,
            expression: constraint.expression,
            severity: 'error',
            message: 'This appears to be JavaScript code in an OCL constraint. Please move it to JavaScript constraints.'
          }]
        };
      }

      // If the model element doesn't match the constraint's context class, the constraint doesn't apply
      if (element.modelElementId !== constraint.contextClassId) {
        // Check if the element's metaclass is a subtype of the constraint's context class
        const metaClass = metamodel.classes.find(c => c.id === element.modelElementId);
        if (metaClass && metaClass.superTypes && metaClass.superTypes.includes(constraint.contextClassId)) {
          // This is valid because the element's class is a subtype of the constraint's context class
          // Continue with evaluation
        } else {
          // The constraint doesn't apply to this element (not the right type or subtype)
          return {
            valid: true, // Skip constraint for non-applicable elements
            issues: []
          };
        }
      }

      // Ensure the metamodel is registered
      this.ensureMetamodelRegistered(metamodel);

      // Get the element's metaclass
      const metaClass = metamodel.classes.find(c => c.id === element.modelElementId);
      if (!metaClass) {
        throw new Error(`MetaClass not found for element ${element.id}`);
      }

      // Prepare the model context for OCL evaluation
      const context = this.prepareContextForOCL(element, model, metamodel);
      
      // Clean up any duplicate context declarations if present
      let expression = constraint.expression;
      
      // Extract just the constraint part if it has context declaration
      if (expression.includes('context') && expression.includes('inv')) {
        try {
          // Find the position after 'inv' keyword and the colon
          const invIndex = expression.indexOf('inv');
          const colonIndex = expression.indexOf(':', invIndex);
          
          if (colonIndex !== -1) {
            // Extract just the constraint part
            expression = expression.substring(colonIndex + 1).trim();
          } else {
            // Try to find an implied colon - look for the first word after 'inv'
            const afterInv = expression.substring(invIndex + 3).trim();
            const firstSpace = afterInv.indexOf(' ');
            
            if (firstSpace !== -1) {
              expression = afterInv.substring(firstSpace + 1).trim();
            }
          }
        } catch (error) {
          console.warn('Error parsing constraint expression, will try to evaluate as-is', error);
        }
      }
      
      try {
        // First approach: Use direct query evaluation for better error reporting
        try {
          // Create a query from the extracted expression
          const query = this.oclEngine.createQuery(expression);
          
          // Evaluate the query against the context
          const result = this.oclEngine.evaluateQuery(context, query);
          
          // Check if result is truthy
          if (result) {
            return { valid: true, issues: [] };
          } else {
            return {
              valid: false,
              issues: [{
                constraintId: constraint.id,
                expression: constraint.expression,
                severity: constraint.severity || 'error',
                message: `Constraint '${constraint.name}' violated for element of type ${metaClass.name}`
              }]
            };
          }
        } catch (queryError) {
          console.warn('Error with direct query approach, trying with full constraint', queryError);
          
          // Second approach: Use the full constraint syntax
          // Create the full OCL expression with correct context
          const fullExpression = `context ${metaClass.name} inv ${constraint.name}: ${expression}`;
          
          // Register the expression with OCL engine
          this.oclEngine.addOclExpression(fullExpression);
          
          try {
            // Evaluate the constraint against the prepared context
            const result = this.oclEngine.evaluate(context);
            
            // Clean up by removing the expression after evaluation
            this.oclEngine.removeOclExpression(fullExpression);
            
            // Check the result
            if (result.getResult()) {
              // Constraint is satisfied
              return { valid: true, issues: [] };
            } else {
              // Constraint is violated
              return {
                valid: false,
                issues: [{
                  constraintId: constraint.id,
                  expression: constraint.expression,
                  severity: constraint.severity || 'error',
                  message: `Constraint '${constraint.name}' violated for element of type ${metaClass.name}`
                }]
              };
            }
          } finally {
            // Make sure to clean up
            try {
              this.oclEngine.removeOclExpression(fullExpression);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        }
      } catch (error) {
        console.error('Error evaluating OCL constraint with OCL.js engine:', error);
        
        // Return informative error message
        return {
          valid: false,
          issues: [{
            constraintId: constraint.id,
            expression: constraint.expression,
            severity: 'error',
            message: error instanceof Error ? 
              `Error evaluating constraint: ${error.message}` : 
              `Unknown error evaluating constraint: ${String(error)}`
          }]
        };
      }
    } catch (error) {
      console.error('Error in OCL constraint evaluation setup:', error);
      return {
        valid: false,
        issues: [{
          constraintId: constraint.id,
          expression: constraint.expression,
          severity: 'error',
          message: error instanceof Error ? error.message : String(error)
        }]
      };
    }
  }

  /**
   * Prepare model elements for OCL evaluation
   * This builds a proper context object that OCL.js can evaluate against
   */
  private prepareContextForOCL(
    element: ModelElement,
    model: Model,
    metamodel: Metamodel
  ): any {
    // Get the element's metaclass
    const metaClass = metamodel.classes.find(c => c.id === element.modelElementId);
    if (!metaClass) {
      throw new Error(`MetaClass not found for element ${element.id}`);
    }

    // Create the base context with type information and attribute values
    const context: any = {
      ...element.style,
      id: element.id,
      _type: metaClass.name, // Used by the typeDeterminer function
    };

    // Handle references properly
    for (const refName in element.references) {
      const refValue = element.references[refName];
      
      if (refValue === null || refValue === undefined) {
        // Null reference
        context[refName] = null;
      } else if (Array.isArray(refValue)) {
        // Multi-valued reference - resolve each referenced element
        const resolvedArray = refValue.map(targetId => {
          const targetElement = model.elements.find(e => e.id === targetId);
          if (targetElement) {
            return this.prepareContextForOCL(targetElement, model, metamodel);
          }
          return null;
        }).filter(e => e !== null);
        
        // Ensure the array has OCL collection methods
        if (resolvedArray.length > 0) {
          // Add _type to the array for the typeDeterminer
          Object.defineProperty(resolvedArray, '_type', {
            value: `Collection(${resolvedArray[0]._type || 'OclAny'})`,
            enumerable: false
          });
          
          // Make sure the size() method exists on the array
          // Use proper typing for TypeScript
          (resolvedArray as any).size = function() {
            return this.length;
          };
        }
        
        context[refName] = resolvedArray;
      } else {
        // Single-valued reference - resolve the referenced element
        const targetElement = model.elements.find(e => e.id === refValue);
        if (targetElement) {
          context[refName] = this.prepareContextForOCL(targetElement, model, metamodel);
        } else {
          context[refName] = null;
        }
      }
    }

    // Special handling for collections in the style object
    for (const key in element.style) {
      if (Array.isArray(element.style[key])) {
        const array = element.style[key];
        
        // Add OCL collection methods if they don't exist
        // Use proper typing for TypeScript
        if (!(array as any).size) {
          (array as any).size = function() {
            return this.length;
          };
        }
        
        context[key] = array;
      }
    }

    return context;
  }

  /**
   * Create a query expression directly with OCL.js
   * Useful for ad-hoc OCL expressions
   */
  createOCLQuery(query: string): any {
    try {
      return this.oclEngine.createQuery(query);
    } catch (error) {
      console.error('Error creating OCL query:', error);
      throw error;
    }
  }

  /**
   * Evaluate an OCL query expression on a context object
   */
  evaluateOCLQuery(context: any, expression: any): any {
    try {
      return this.oclEngine.evaluateQuery(context, expression);
    } catch (error) {
      console.error('Error evaluating OCL query:', error);
      throw error;
    }
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
    const model = this.modelService?.getModelById(modelId);
    if (!model) {
      return { valid: true, issues: [] }; // Can't validate without model
    }

    const element = model.elements.find((e: ModelElement) => e.id === elementId);
    if (!element) {
      return { valid: true, issues: [] }; // Can't validate without element
    }

    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    if (!metamodel) {
      return { valid: true, issues: [] }; // Can't validate without metamodel
    }

    // Create a temporary element with the updated properties
    const tempElement = {
      ...element,
      style: {
        ...element.style,
        ...propertiesToUpdate
      }
    };

    // Get all constraints for this element's metaclass
    const metaclass = metamodel.classes.find(c => c.id === element.modelElementId);
    if (!metaclass) {
      return { valid: true, issues: [] }; // Can't validate without metaclass
    }

    // Get constraints by class
    const allConstraints = this.getAllConstraints(metamodel.id);
    const constraintsByClass: Record<string, OCLConstraint[]> = {};
    
    for (const constraint of allConstraints) {
      if (!constraint.isValid) continue;
      
      if (!constraintsByClass[constraint.contextClassId]) {
        constraintsByClass[constraint.contextClassId] = [];
      }
      constraintsByClass[constraint.contextClassId].push(constraint);
    }

    // Get applicable constraints
    const applicableConstraints = this.getApplicableConstraints(
      metaclass, 
      metamodel, 
      constraintsByClass
    );

    // Validate each constraint
    const issues: OCLValidationIssue[] = [];
    
    for (const constraint of applicableConstraints) {
      const result = this.evaluateOCLConstraint(constraint, tempElement, model, metamodel);
      
      if (!result.valid) {
        issues.push(...result.issues);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Set the model service reference (to avoid circular dependency)
   */
  setModelService(modelService: any): void {
    this.modelService = modelService;
  }
}

export const oclService = new OCLService(); 