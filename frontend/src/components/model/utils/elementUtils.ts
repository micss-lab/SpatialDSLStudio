// Element utility functions
import { ModelElement, MetaClass, Metamodel } from '../../../models/types';

/**
 * Get all attributes including inherited ones from parent classes
 * Extracted from VisualModelEditor.tsx
 */
export const getAllAttributes = (metaClass: MetaClass, metamodel: Metamodel): any[] => {
  const allAttributes: any[] = [...metaClass.attributes];
  const processedClasses = new Set<string>([metaClass.id]); // Prevent infinite recursion
  
  // Function to recursively collect attributes from parent classes
  const collectInheritedAttributes = (currentClass: MetaClass) => {
    if (currentClass.superTypes && currentClass.superTypes.length > 0) {
      for (const superTypeId of currentClass.superTypes) {
        // Avoid circular inheritance
        if (processedClasses.has(superTypeId)) continue;
        processedClasses.add(superTypeId);
        
        const superClass = metamodel.classes.find(c => c.id === superTypeId);
        if (superClass) {
          // Add all attributes from the parent class
          allAttributes.push(...superClass.attributes);
          // Recursively collect from the parent's parents
          collectInheritedAttributes(superClass);
        }
      }
    }
  };
  
  collectInheritedAttributes(metaClass);
  
  // Remove duplicates based on attribute name (child class attributes override parent class attributes)
  const uniqueAttributes: any[] = [];
  const seenNames = new Set<string>();
  
  // Process in reverse order so child class attributes take precedence
  for (let i = allAttributes.length - 1; i >= 0; i--) {
    const attr = allAttributes[i];
    if (!seenNames.has(attr.name)) {
      seenNames.add(attr.name);
      uniqueAttributes.unshift(attr); // Add to beginning to maintain order
    }
  }
  
  return uniqueAttributes;
};

/**
 * Get the metaclass for a given model element
 * Extracted from VisualModelEditor.tsx
 */
export const getMetaClassForElement = (
  element: ModelElement,
  metamodel: Metamodel | null
): MetaClass | undefined => {
  if (!metamodel) return undefined;
  return metamodel.classes.find(c => c.id === element.modelElementId);
};

/**
 * Calculate element dimensions based on properties
 * Extracted from VisualModelEditor.tsx
 */
export const calculateElementDimensions = (element: ModelElement) => {
  const width = 200;
  const headerHeight = 30;
  const attributeHeight = 20;
  
  // Calculate height based on number of properties
  const propertiesCount = Object.keys(element.style).filter(key => key !== 'position').length;
  const height = Math.max(headerHeight + (propertiesCount * attributeHeight) + 10, 50); // Ensure minimum height
  
  return { width, height, headerHeight, attributeHeight, propertiesCount };
};
