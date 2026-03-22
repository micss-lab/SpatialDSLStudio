import { MetaClass, MetaAttribute, MetaReference, Metamodel } from '../../models/types';

/**
 * Utilities for handling inheritance in metamodels
 */
export class ModelInheritanceUtilsService {
  /**
   * Get all attributes including inherited ones
   */
  getAllAttributes(metaClass: MetaClass, metamodel: Metamodel): MetaAttribute[] {
    const allAttributes: MetaAttribute[] = [...metaClass.attributes];
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
    const uniqueAttributes: MetaAttribute[] = [];
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
  }

  /**
   * Get all references including inherited ones
   */
  getAllReferences(metaClass: MetaClass, metamodel: Metamodel): MetaReference[] {
    const allReferences: MetaReference[] = [...metaClass.references];
    const processedClasses = new Set<string>([metaClass.id]); // Prevent infinite recursion
    
    // Function to recursively collect references from parent classes
    const collectInheritedReferences = (currentClass: MetaClass) => {
      if (currentClass.superTypes && currentClass.superTypes.length > 0) {
        for (const superTypeId of currentClass.superTypes) {
          // Avoid circular inheritance
          if (processedClasses.has(superTypeId)) continue;
          processedClasses.add(superTypeId);
          
          const superClass = metamodel.classes.find(c => c.id === superTypeId);
          if (superClass) {
            // Add all references from the parent class
            allReferences.push(...superClass.references);
            // Recursively collect from the parent's parents
            collectInheritedReferences(superClass);
          }
        }
      }
    };
    
    collectInheritedReferences(metaClass);
    
    // Remove duplicates based on reference name (child class references override parent class references)
    const uniqueReferences: MetaReference[] = [];
    const seenNames = new Set<string>();
    
    // Process in reverse order so child class references take precedence
    for (let i = allReferences.length - 1; i >= 0; i--) {
      const ref = allReferences[i];
      if (!seenNames.has(ref.name)) {
        seenNames.add(ref.name);
        uniqueReferences.unshift(ref); // Add to beginning to maintain order
      }
    }
    
    return uniqueReferences;
  }

  /**
   * Check if a class is a subtype of another
   */
  isSubtypeOf(classId: string, superClassId: string, metamodel: Metamodel | undefined): boolean {
    if (!metamodel) return false;
    if (classId === superClassId) return true;
    
    const cls = metamodel.classes.find(c => c.id === classId);
    if (!cls || !cls.superTypes) return false;
    
    return cls.superTypes.some(superTypeId => 
      this.isSubtypeOf(superTypeId, superClassId, metamodel)
    );
  }

  /**
   * Find a metaclass in a metamodel
   */
  findMetaClassInMetamodel(metamodel: Metamodel, metaClassId: string): MetaClass | null {
    const directClass = metamodel.classes.find(c => c.id === metaClassId);
    return directClass || null;
  }
}

export const modelInheritanceUtilsService = new ModelInheritanceUtilsService();
