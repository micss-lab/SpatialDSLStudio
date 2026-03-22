import { Metamodel, MetaReference, MetaAttribute, EPackage } from '../../models/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Adds a new MetaReference to a MetaClass.
 * 
 * @param metamodel The metamodel containing the class
 * @param sourceClassId The ID of the source class
 * @param name The name of the reference
 * @param targetClassId The ID of the target class
 * @param containment Whether the reference is a containment
 * @param lowerBound Lower cardinality bound
 * @param upperBound Upper cardinality bound
 * @param opposite ID of the opposite reference (optional)
 * @param allowSelfReference Whether to allow self-references
 * @param corePackage The core EPackage for referencing meta-classes
 * @returns The created MetaReference or null if creation failed
 */
export function addMetaReference(
  metamodel: Metamodel,
  sourceClassId: string,
  name: string,
  targetClassId: string,
  containment: boolean,
  lowerBound: number,
  upperBound: number | '*',
  opposite: string | undefined,
  allowSelfReference: boolean,
  corePackage: EPackage
): MetaReference | null {
  const sourceClass = metamodel.classes.find(c => c.id === sourceClassId);
  if (!sourceClass) return null;

  const targetClass = metamodel.classes.find(c => c.id === targetClassId);
  if (!targetClass) return null;

  const eReferenceClass = corePackage.classes.find(cls => cls.name === 'EReference');
  if (!eReferenceClass) return null;

  const newReference: MetaReference = {
    id: uuidv4(),
    name,
    eClass: eReferenceClass.id,
    target: targetClassId,
    containment,
    cardinality: {
      lowerBound,
      upperBound
    },
    opposite,
    allowSelfReference,
    attributes: []
  };

  sourceClass.references.push(newReference);
  return newReference;
}

/**
 * Updates an existing MetaReference.
 * 
 * @param metamodel The metamodel containing the reference
 * @param classId The ID of the class containing the reference
 * @param referenceId The ID of the reference to update
 * @param updates Partial updates to apply
 * @returns True if update succeeded, false otherwise
 */
export function updateMetaReference(
  metamodel: Metamodel,
  classId: string,
  referenceId: string,
  updates: Partial<MetaReference>
): boolean {
  const targetClass = metamodel.classes.find(c => c.id === classId);
  if (!targetClass) return false;

  const refIndex = targetClass.references.findIndex(r => r.id === referenceId);
  if (refIndex === -1) return false;

  targetClass.references[refIndex] = {
    ...targetClass.references[refIndex],
    ...updates,
    id: referenceId // Ensure ID doesn't change
  };

  return true;
}

/**
 * Deletes a MetaReference from a MetaClass.
 * Also removes the opposite reference if it exists.
 * 
 * @param metamodel The metamodel containing the reference
 * @param classId The ID of the class containing the reference
 * @param referenceId The ID of the reference to delete
 * @returns True if deletion succeeded, false otherwise
 */
export function deleteMetaReference(
  metamodel: Metamodel,
  classId: string,
  referenceId: string
): boolean {
  const targetClass = metamodel.classes.find(c => c.id === classId);
  if (!targetClass) return false;

  const initialLength = targetClass.references.length;
  
  // Get the reference to delete to check for bidirectional references
  const referenceToDelete = targetClass.references.find(r => r.id === referenceId);
  targetClass.references = targetClass.references.filter(r => r.id !== referenceId);
  
  // If the reference has an opposite, also remove the opposite reference
  if (referenceToDelete && referenceToDelete.opposite) {
    for (const cls of metamodel.classes) {
      const oppositeRefIndex = cls.references.findIndex(r => r.id === referenceToDelete.opposite);
      if (oppositeRefIndex !== -1) {
        cls.references.splice(oppositeRefIndex, 1);
        break;
      }
    }
  }
  
  return initialLength !== targetClass.references.length;
}

/**
 * Adds an attribute to a reference (edge attribute).
 * 
 * @param metamodel The metamodel containing the reference
 * @param classId The ID of the class containing the reference
 * @param referenceId The ID of the reference to add the attribute to
 * @param name The name of the attribute
 * @param type The type of the attribute
 * @param defaultValue The default value (optional)
 * @param required Whether the attribute is required (optional)
 * @param many Whether the attribute is many-valued
 * @param corePackage The core EPackage for referencing meta-classes
 * @returns The created MetaAttribute or null if creation failed
 */
export function addReferenceAttribute(
  metamodel: Metamodel,
  classId: string,
  referenceId: string,
  name: string,
  type: 'string' | 'number' | 'boolean' | 'date',
  defaultValue: any | undefined,
  required: boolean | undefined,
  many: boolean,
  corePackage: EPackage
): MetaAttribute | null {
  const targetClass = metamodel.classes.find(c => c.id === classId);
  if (!targetClass) return null;

  const targetReference = targetClass.references.find(r => r.id === referenceId);
  if (!targetReference) return null;

  const eAttributeClass = corePackage.classes.find(cls => cls.name === 'EAttribute');
  if (!eAttributeClass) return null;

  // Initialize attributes array if it doesn't exist
  if (!targetReference.attributes) {
    targetReference.attributes = [];
  }

  const newAttribute: MetaAttribute = {
    id: uuidv4(),
    name,
    eClass: eAttributeClass.id,
    type,
    defaultValue,
    required,
    many
  };

  targetReference.attributes.push(newAttribute);
  return newAttribute;
}

/**
 * Updates a reference attribute.
 * 
 * @param metamodel The metamodel containing the reference
 * @param classId The ID of the class containing the reference
 * @param referenceId The ID of the reference containing the attribute
 * @param attributeId The ID of the attribute to update
 * @param updates Partial updates to apply
 * @returns True if update succeeded, false otherwise
 */
export function updateReferenceAttribute(
  metamodel: Metamodel,
  classId: string,
  referenceId: string,
  attributeId: string,
  updates: Partial<MetaAttribute>
): boolean {
  const targetClass = metamodel.classes.find(c => c.id === classId);
  if (!targetClass) return false;

  const targetReference = targetClass.references.find(r => r.id === referenceId);
  if (!targetReference || !targetReference.attributes) return false;

  const attributeIndex = targetReference.attributes.findIndex(a => a.id === attributeId);
  if (attributeIndex === -1) return false;

  targetReference.attributes[attributeIndex] = {
    ...targetReference.attributes[attributeIndex],
    ...updates
  };

  return true;
}

/**
 * Deletes a reference attribute.
 * 
 * @param metamodel The metamodel containing the reference
 * @param classId The ID of the class containing the reference
 * @param referenceId The ID of the reference containing the attribute
 * @param attributeId The ID of the attribute to delete
 * @returns True if deletion succeeded, false otherwise
 */
export function deleteReferenceAttribute(
  metamodel: Metamodel,
  classId: string,
  referenceId: string,
  attributeId: string
): boolean {
  const targetClass = metamodel.classes.find(c => c.id === classId);
  if (!targetClass) return false;

  const targetReference = targetClass.references.find(r => r.id === referenceId);
  if (!targetReference || !targetReference.attributes) return false;

  const initialLength = targetReference.attributes.length;
  targetReference.attributes = targetReference.attributes.filter(a => a.id !== attributeId);
  
  return initialLength !== targetReference.attributes.length;
}
