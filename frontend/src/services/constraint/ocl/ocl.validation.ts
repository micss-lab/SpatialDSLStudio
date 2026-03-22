import { 
  OCLConstraint, 
  OCLValidationResult,
  OCLValidationIssue,
  Model,
  ModelElement,
  Metamodel,
  MetaClass
} from '../../../models/types';
import { OCLServiceContext, ConstraintsByClass, IMetamodelService } from './types';
import { formatOclError, getApplicableConstraints } from './ocl.helpers';
import { ensureMetamodelRegistered } from './ocl.engine';
import { prepareContextForOCL } from './ocl.context';
import { getAllConstraints } from './ocl.crud';

/**
 * Validate OCL syntax without evaluating against a model
 * Uses OCL.js for parsing and validation
 */
export function validateOCLSyntax(
  context: OCLServiceContext,
  metamodel: Metamodel,
  expression: string, 
  contextClass: MetaClass
): OCLValidationResult {
  try {
    // Ensure the metamodel is registered
    ensureMetamodelRegistered(context.oclEngine, context.registeredMetamodels, metamodel);

    // Prepare the expression for OCL.js (add context if needed)
    let fullExpression = expression;
    
    // Clean input expression and add context if needed
    if (!expression.trim().startsWith('context')) {
      fullExpression = `context ${contextClass.name} inv: ${expression}`;
    }
    
    try {
      // First try to parse with addOclExpression
      try {
        context.oclEngine.addOclExpression(fullExpression);
        
        // If we get here, the expression is valid
        context.oclEngine.removeOclExpression(fullExpression);
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
          context.oclEngine.createQuery(extractedExpression);
          
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
                formatOclError(parseError.message) : 
                formatOclError(String(parseError))
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
            formatOclError(error.message) : 
            formatOclError(String(error))
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
          formatOclError(error.message) : 
          formatOclError(String(error))
      }]
    };
  }
}

/**
 * Evaluate an OCL constraint on a model element
 * Implementation that properly uses the OCL.js engine
 */
export function evaluateOCLConstraint(
  context: OCLServiceContext,
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
    ensureMetamodelRegistered(context.oclEngine, context.registeredMetamodels, metamodel);

    // Get the element's metaclass
    const metaClass = metamodel.classes.find(c => c.id === element.modelElementId);
    if (!metaClass) {
      throw new Error(`MetaClass not found for element ${element.id}`);
    }

    // Prepare the model context for OCL evaluation
    const evalContext = prepareContextForOCL(element, model, metamodel);
    
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
        const query = context.oclEngine.createQuery(expression);
        
        // Evaluate the query against the context
        const result = context.oclEngine.evaluateQuery(evalContext, query);
        
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
        context.oclEngine.addOclExpression(fullExpression);
        
        try {
          // Evaluate the constraint against the prepared context
          const result = context.oclEngine.evaluate(evalContext);
          
          // Clean up by removing the expression after evaluation
          context.oclEngine.removeOclExpression(fullExpression);
          
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
            context.oclEngine.removeOclExpression(fullExpression);
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
 * Validate a model against all OCL constraints in its metamodel
 * Implementation to enforce constraints on models
 */
export function validateModelAgainstConstraints(
  context: OCLServiceContext,
  metamodelService: IMetamodelService,
  modelId: string, 
  metamodelId: string
): OCLValidationResult {
  const model = context.modelService?.getModelById(modelId);
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
  const allConstraints = getAllConstraints(metamodelService, metamodelId);
  const issues: OCLValidationIssue[] = [];

  // Check if there's anything to validate
  if (allConstraints.length === 0) {
    return { valid: true, issues: [] };
  }

  // Register metamodel with OCL engine if not already registered
  ensureMetamodelRegistered(context.oclEngine, context.registeredMetamodels, metamodel);

  // Group constraints by metaclass
  const constraintsByClass: ConstraintsByClass = {};
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
    const applicableConstraints = getApplicableConstraints(metaClass, metamodel, constraintsByClass);
    
    // Evaluate each constraint for this element
    for (const constraint of applicableConstraints) {
      // Additional runtime type check before evaluation
      if (('type' in constraint) && constraint.type !== 'ocl') {
        console.warn(`Skipping non-OCL constraint that was incorrectly filtered: ${constraint.id} - ${constraint.name}`);
        continue;
      }
      
      const result = evaluateOCLConstraint(context, constraint, element, model, metamodel);
      
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
 * Validate if a property update would conform to OCL constraints
 * This is a new method that can be called before updating properties
 */
export function validatePropertyUpdate(
  context: OCLServiceContext,
  metamodelService: IMetamodelService,
  modelId: string,
  elementId: string,
  propertiesToUpdate: Record<string, any>
): OCLValidationResult {
  const model = context.modelService?.getModelById(modelId);
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
  const allConstraints = getAllConstraints(metamodelService, metamodel.id);
  const constraintsByClass: ConstraintsByClass = {};
  
  for (const constraint of allConstraints) {
    if (!constraint.isValid) continue;
    
    if (!constraintsByClass[constraint.contextClassId]) {
      constraintsByClass[constraint.contextClassId] = [];
    }
    constraintsByClass[constraint.contextClassId].push(constraint);
  }

  // Get applicable constraints
  const applicableConstraints = getApplicableConstraints(
    metaclass, 
    metamodel, 
    constraintsByClass
  );

  // Validate each constraint
  const issues: OCLValidationIssue[] = [];
  
  for (const constraint of applicableConstraints) {
    const result = evaluateOCLConstraint(context, constraint, tempElement, model, metamodel);
    
    if (!result.valid) {
      issues.push(...result.issues);
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}
