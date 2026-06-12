import { v4 as uuidv4 } from 'uuid';
import { OCLConstraint, MetaClass, OCLValidationResult } from '../../../models/types';
import { OCLServiceContext, IMetamodelService } from './types';
import { ensureMetamodelRegistered } from './ocl.engine';

/**
 * Create a new OCL constraint for a metaclass
 * Accepts validation results to avoid circular dependencies
 */
export function createConstraint(
  context: OCLServiceContext,
  metamodelService: IMetamodelService,
  metamodelId: string,
  contextClassId: string,
  name: string,
  expression: string,
  description: string = '',
  severity: 'error' | 'warning' | 'info' = 'error',
  validationResult?: OCLValidationResult
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
  ensureMetamodelRegistered(context.oclEngine, context.registeredMetamodels, metamodel);

  // Create the constraint with all required fields
  const constraint: any = {
    id: uuidv4(),
    name,
    contextClassName: contextClass.name,
    contextClassId,
    expression,
    description,
    isValid: validationResult ? validationResult.valid : true,
    errorMessage: validationResult && !validationResult.valid ? validationResult.issues[0]?.message : undefined,
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
 * Validation should be done before calling this function to avoid circular dependencies
 */
export function updateConstraint(
  context: OCLServiceContext,
  metamodelService: IMetamodelService,
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
  ensureMetamodelRegistered(context.oclEngine, context.registeredMetamodels, metamodel);

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
export function deleteConstraint(
  metamodelService: IMetamodelService,
  metamodelId: string, 
  constraintId: string
): boolean {
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
export function getConstraintsForMetaClass(
  metamodelService: IMetamodelService,
  metamodelId: string, 
  metaClassId: string
): OCLConstraint[] {
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
export function getAllConstraints(
  metamodelService: IMetamodelService,
  metamodelId: string
): OCLConstraint[] {
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
