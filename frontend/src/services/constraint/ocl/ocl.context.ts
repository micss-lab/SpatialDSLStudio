import { 
  Model, 
  ModelElement,
  Metamodel
} from '../../../models/types';

/**
 * Prepare model elements for OCL evaluation
 * This builds a proper context object that OCL.js can evaluate against
 */
export function prepareContextForOCL(
  element: ModelElement,
  model: Model,
  metamodel: Metamodel
): any {
  // Get the element's metaclass
  const metaClass = metamodel.classes.find(c => c.id === element.modelElementId);
  if (!metaClass) {
    throw new Error(`MetaClass not found for element ${element.id}`);
  }

  // Create the base context with type information and attribute values.
  // Placement data from element.presentation is exposed too, with style taking precedence.
  const context: any = {
    ...element.presentation,
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
          return prepareContextForOCL(targetElement, model, metamodel);
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
        context[refName] = prepareContextForOCL(targetElement, model, metamodel);
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
