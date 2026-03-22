/**
 * Helper utilities for OCL constraint service
 */

/**
 * Format OCL error messages to be more user-friendly
 */
export function formatOclError(message: string): string {
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
 * Map our type system to OCL.js types
 */
export function mapTypeToOCL(type: string): string {
  switch (type) {
    case 'string': return 'String';
    case 'number': return 'Real';
    case 'boolean': return 'Boolean';
    case 'date': return 'String'; // OCL doesn't have a date type, so we map to String
    default: return 'OclAny';
  }
}

/**
 * Get all applicable constraints for a metaclass (including inherited ones)
 */
export function getApplicableConstraints(
  metaClass: any,
  metamodel: any,
  constraintsByClass: Record<string, any[]>
): any[] {
  const result: any[] = [];
  
  // Add constraints directly associated with this metaclass
  if (constraintsByClass[metaClass.id]) {
    result.push(...constraintsByClass[metaClass.id]);
  }
  
  // Add constraints from superclasses recursively
  if (metaClass.superTypes && metaClass.superTypes.length > 0) {
    for (const superTypeId of metaClass.superTypes) {
      const superClass = metamodel.classes.find((c: any) => c.id === superTypeId);
      if (superClass) {
        const superConstraints = getApplicableConstraints(superClass, metamodel, constraintsByClass);
        result.push(...superConstraints);
      }
    }
  }
  
  return result;
}
