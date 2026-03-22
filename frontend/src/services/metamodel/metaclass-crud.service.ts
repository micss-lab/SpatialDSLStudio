import { Metamodel, MetaClass, EPackage } from '../../models/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Adds a new MetaClass to a metamodel.
 * Automatically creates a default 'name' attribute for the class.
 * 
 * @param metamodel The metamodel to add the class to
 * @param name The name of the new class
 * @param abstract Whether the class is abstract
 * @param corePackage The core EPackage for referencing meta-classes
 * @returns The created MetaClass or null if creation failed
 */
export function addMetaClass(
  metamodel: Metamodel,
  name: string,
  abstract: boolean,
  corePackage: EPackage
): MetaClass | null {
  if (!corePackage) {
    console.error('Core package not found');
    return null;
  }
  
  const eClassClass = corePackage.classes.find(cls => cls.name === 'EClass');
  if (!eClassClass) {
    console.error('EClass not found in core package');
    return null;
  }
  
  const eAttributeClass = corePackage.classes.find(cls => cls.name === 'EAttribute');
  if (!eAttributeClass) {
    console.error('EAttribute not found in core package');
    return null;
  }

  // Create the class first
  const newClassId = uuidv4();
  const newClass: MetaClass = {
    id: newClassId,
    name,
    eClass: eClassClass.id,
    abstract,
    superTypes: [],
    attributes: [],
    references: [],
    constraints: []
  };

  // Create a name attribute
  const nameAttributeId = uuidv4();
  const nameAttribute = {
    id: nameAttributeId,
    name: 'name',
    eClass: eAttributeClass.id,
    type: 'string' as const,
    defaultValue: '',
    required: true,
    many: false
  };
  
  // Add the name attribute to the class attributes
  newClass.attributes = [nameAttribute];
  
  console.log('Created metaclass with name attribute:', {
    class: newClass,
    nameAttribute: nameAttribute
  });

  // Add the new class to the metamodel
  metamodel.classes.push(newClass);
  
  return newClass;
}

/**
 * Updates an existing MetaClass.
 * 
 * @param metamodel The metamodel containing the class
 * @param classId The ID of the class to update
 * @param updates Partial updates to apply
 * @returns True if update succeeded, false otherwise
 */
export function updateMetaClass(
  metamodel: Metamodel,
  classId: string,
  updates: Partial<MetaClass>
): boolean {
  const classIndex = metamodel.classes.findIndex(c => c.id === classId);
  if (classIndex === -1) return false;

  metamodel.classes[classIndex] = {
    ...metamodel.classes[classIndex],
    ...updates,
    id: classId // Ensure ID doesn't change
  };

  return true;
}

/**
 * Deletes a MetaClass from a metamodel.
 * Also removes all references to this class from other classes.
 * 
 * @param metamodel The metamodel containing the class
 * @param classId The ID of the class to delete
 * @returns True if deletion succeeded, false otherwise
 */
export function deleteMetaClass(
  metamodel: Metamodel,
  classId: string
): boolean {
  const initialLength = metamodel.classes.length;
  metamodel.classes = metamodel.classes.filter(c => c.id !== classId);
  
  // Also remove references to this class
  metamodel.classes.forEach(cls => {
    cls.references = cls.references.filter(ref => ref.target !== classId);
    cls.superTypes = cls.superTypes.filter(st => st !== classId);
  });

  return initialLength !== metamodel.classes.length;
}
