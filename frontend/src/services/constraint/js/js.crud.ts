import { v4 as uuidv4 } from 'uuid';
import { 
  JSConstraint, 
  Metamodel,
  MetaClass,
  Constraint
} from '../../../models/types';
import { JSServiceContext } from './types';
import { validateJSSyntax } from './js.validation';

/**
 * Create a new JavaScript constraint
 */
export function createConstraint(
  context: JSServiceContext,
  metamodelId: string,
  contextClassId: string,
  name: string,
  expression: string,
  description: string = '',
  severity: 'error' | 'warning' | 'info' = 'error'
): JSConstraint | null {
  // Find the metamodel
  const metamodel = context.metamodelService.getMetamodelById(metamodelId);
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
  const validationResult = validateJSSyntax(expression);
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
  if (typeof context.metamodelService.updateMetamodel === 'function') {
    context.metamodelService.updateMetamodel(metamodelId, metamodel);
  }
  
  return constraint;
}

/**
 * Update an existing JavaScript constraint
 */
export function updateConstraint(
  context: JSServiceContext,
  metamodelId: string,
  constraintId: string,
  updates: Partial<JSConstraint>
): JSConstraint | null {
  // Find the metamodel
  const metamodel = context.metamodelService.getMetamodelById(metamodelId);
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
    const validationResult = validateJSSyntax(constraint.expression);
    constraint.isValid = validationResult.valid;
    constraint.errorMessage = validationResult.valid ? undefined : 
      validationResult.issues[0]?.message || 'Invalid JavaScript expression';
  }
  
  // Save the updated metamodel
  context.metamodelService.updateMetamodel(metamodelId, metamodel);
  
  return constraint;
}

/**
 * Delete a JavaScript constraint
 */
export function deleteConstraint(
  context: JSServiceContext,
  metamodelId: string, 
  constraintId: string
): boolean {
  // Find the metamodel
  const metamodel = context.metamodelService.getMetamodelById(metamodelId);
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
export function getConstraintsForMetaClass(
  context: JSServiceContext,
  metamodelId: string, 
  metaClassId: string
): JSConstraint[] {
  // Find the metamodel
  const metamodel = context.metamodelService.getMetamodelById(metamodelId);
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
export function getAllConstraints(
  context: JSServiceContext,
  metamodelId: string
): JSConstraint[] {
  // Find the metamodel
  const metamodel = context.metamodelService.getMetamodelById(metamodelId);
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
