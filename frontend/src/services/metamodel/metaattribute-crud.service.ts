import { Metamodel, MetaAttribute, EPackage } from '../../models/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Adds a new MetaAttribute to a MetaClass.
 * 
 * @param metamodel The metamodel containing the class
 * @param classId The ID of the class to add the attribute to
 * @param name The name of the attribute
 * @param type The type of the attribute
 * @param defaultValue The default value (optional)
 * @param required Whether the attribute is required (optional)
 * @param many Whether the attribute is many-valued
 * @param corePackage The core EPackage for referencing meta-classes
 * @returns The created MetaAttribute or null if creation failed
 */
export function addMetaAttribute(
  metamodel: Metamodel,
  classId: string,
  name: string,
  type: 'string' | 'number' | 'boolean' | 'date',
  defaultValue: any | undefined,
  required: boolean | undefined,
  many: boolean,
  corePackage: EPackage
): MetaAttribute | null {
  const targetClass = metamodel.classes.find(c => c.id === classId);
  if (!targetClass) return null;

  const eAttributeClass = corePackage.classes.find(cls => cls.name === 'EAttribute');

  const newAttribute: MetaAttribute = {
    id: uuidv4(),
    name,
    eClass: eAttributeClass ? eAttributeClass.id : '',
    type,
    defaultValue,
    required,
    many
  };

  targetClass.attributes.push(newAttribute);
  return newAttribute;
}

/**
 * Updates an existing MetaAttribute.
 * 
 * @param metamodel The metamodel containing the attribute
 * @param classId The ID of the class containing the attribute
 * @param attributeId The ID of the attribute to update
 * @param updates Partial updates to apply
 * @returns True if update succeeded, false otherwise
 */
export function updateMetaAttribute(
  metamodel: Metamodel,
  classId: string,
  attributeId: string,
  updates: Partial<MetaAttribute>
): boolean {
  const targetClass = metamodel.classes.find(c => c.id === classId);
  if (!targetClass) return false;

  const attrIndex = targetClass.attributes.findIndex(a => a.id === attributeId);
  if (attrIndex === -1) return false;

  targetClass.attributes[attrIndex] = {
    ...targetClass.attributes[attrIndex],
    ...updates,
    id: attributeId // Ensure ID doesn't change
  };

  return true;
}

/**
 * Deletes a MetaAttribute from a MetaClass.
 * 
 * @param metamodel The metamodel containing the attribute
 * @param classId The ID of the class containing the attribute
 * @param attributeId The ID of the attribute to delete
 * @returns True if deletion succeeded, false otherwise
 */
export function deleteMetaAttribute(
  metamodel: Metamodel,
  classId: string,
  attributeId: string
): boolean {
  const targetClass = metamodel.classes.find(c => c.id === classId);
  if (!targetClass) return false;

  const initialLength = targetClass.attributes.length;
  targetClass.attributes = targetClass.attributes.filter(a => a.id !== attributeId);
  
  return initialLength !== targetClass.attributes.length;
}
