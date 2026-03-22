import { 
  JSConstraint, 
  JSValidationResult,
  Model,
  ModelElement,
  Metamodel,
  ValidationIssue
} from '../../../models/types';
import { JSServiceContext, ConstraintsByClass } from './types';
import { formatJSError } from './js.helpers';
import { prepareContextForJS, createJSSandbox, evaluateInSandbox } from './js.sandbox';

/**
 * Validate JavaScript syntax without evaluating against a model
 */
export function validateJSSyntax(expression: string): JSValidationResult {
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
          message: formatJSError(error instanceof Error ? error.message : String(error)),
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
 * Validate a model element against a JavaScript constraint
 * This uses a secure sandbox to evaluate the JavaScript code
 */
export function evaluateJSConstraint(
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
    const context = prepareContextForJS(element, model, metamodel);
    
    // Create a secure sandbox for evaluating the JavaScript expression
    const sandbox = createJSSandbox(context, model);
    
    // Evaluate the constraint
    const isValid = evaluateInSandbox(constraint.expression, sandbox);
    
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
 * Get constraints applicable to a specific element type
 */
export function getApplicableJSConstraints(
  metaClassId: string,
  constraintsByClass: ConstraintsByClass,
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
 * Validate model elements against JavaScript constraints
 * 
 * @param context Service context with model and metamodel services
 * @param model The model to validate
 * @param metamodel The metamodel containing the constraints
 * @param issues The array of validation issues to append to
 */
export function validateJSConstraints(
  context: JSServiceContext,
  model: Model, 
  metamodel: Metamodel, 
  issues: ValidationIssue[]
): void {
  console.log('JSService.validateJSConstraints called', { 
    modelServiceSet: !!context.modelService,
    modelId: model?.id,
    metamodelId: metamodel?.id,
    currentIssuesCount: issues?.length
  });
  
  if (!context.modelService) {
    console.error('Model service not set');
    return;
  }
  
  try {
    // Organize constraints by metaclass for more efficient processing
    const constraintsByClass: ConstraintsByClass = {};
    
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
      const applicableConstraints = getApplicableJSConstraints(
        element.modelElementId,
        constraintsByClass,
        globalConstraints
      );
      
      // Evaluate each constraint
      for (const constraint of applicableConstraints) {
        const result = evaluateJSConstraint(constraint, element, model, metamodel);
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
