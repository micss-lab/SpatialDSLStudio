import { OclEngine } from '@stekoe/ocl.js';
import { Metamodel } from '../../../models/types';
import { mapTypeToOCL } from './ocl.helpers';

/**
 * Initialize the OCL.js engine with proper type handling
 */
export function initializeOclEngine(): OclEngine {
  // Initialize OCL.js engine with better type support
  const oclEngine = OclEngine.create();
  
  // Set a more robust type determiner function that handles arrays and null values properly
  oclEngine.setTypeDeterminer((obj: any) => {
    if (obj === null || obj === undefined) {
      return 'OclVoid';
    }
    
    // Handle arrays/collections properly
    if (Array.isArray(obj)) {
      // For empty arrays, return a generic Collection type
      if (obj.length === 0) {
        return 'Collection';
      }
      
      // If array has elements and they have types, use the first element's type
      if (obj[0] && obj[0]._type) {
        return `Collection(${obj[0]._type})`;
      }
      
      return 'Collection(OclAny)';
    }
    
    // If object has _type property, use it
    if (obj._type) {
      return obj._type;
    }
    
    // Default type mapping based on JavaScript type
    const jsType = typeof obj;
    switch (jsType) {
      case 'string': return 'String';
      case 'number': return 'Real';
      case 'boolean': return 'Boolean';
      case 'object': return 'OclAny';
      default: return 'OclAny';
    }
  });

  // Register basic JavaScript types that map to OCL types
  // Use constructor functions rather than direct references for proper instanceof checks
  oclEngine.registerTypes({
    "String": String.prototype.constructor,
    "Number": Number.prototype.constructor,
    "Boolean": Boolean.prototype.constructor,
    "Collection": Array.prototype.constructor,
    "Set": Set.prototype.constructor,
    "OclAny": Object.prototype.constructor,
    "OclVoid": null
  });

  return oclEngine;
}

/**
 * Register a metamodel with the OCL engine
 * This prepares the OCL engine to validate constraints against this metamodel
 */
export function registerMetamodel(
  oclEngine: OclEngine,
  registeredMetamodels: Set<string>,
  metamodel: Metamodel
): void {
  // Check if this metamodel is already registered
  if (registeredMetamodels.has(metamodel.id)) {
    return;
  }

  try {
    // Create type definitions for all metaclasses
    const types: Record<string, any> = {};
    
    // Create type definitions for each metaclass
    for (const metaClass of metamodel.classes) {
      // Skip if this class was already defined
      if (types[metaClass.name]) {
        console.warn(`Duplicate metaclass name: ${metaClass.name}, skipping definition`);
        continue;
      }

      types[metaClass.name] = {
        properties: {},
        superTypes: []
      };
    }
    
    // Add properties and inheritance to each type
    for (const metaClass of metamodel.classes) {
      // Skip if this class was not defined (should not happen)
      if (!types[metaClass.name]) continue;

      // Add attributes
      for (const attr of metaClass.attributes) {
        types[metaClass.name].properties[attr.name] = {
          type: mapTypeToOCL(attr.type),
          many: attr.many
        };
      }
      
      // Add references
      for (const ref of metaClass.references) {
        const targetClass = metamodel.classes.find(c => c.id === ref.target);
        if (targetClass) {
          const isMany = ref.cardinality.upperBound === '*' || 
                      (typeof ref.cardinality.upperBound === 'number' && ref.cardinality.upperBound > 1);
          
          types[metaClass.name].properties[ref.name] = {
            type: targetClass.name,
            many: isMany
          };
        }
      }
      
      // Add inheritance relationships
      if (metaClass.superTypes && metaClass.superTypes.length > 0) {
        for (const superTypeId of metaClass.superTypes) {
          const superClass = metamodel.classes.find(c => c.id === superTypeId);
          if (superClass) {
            types[metaClass.name].superTypes.push(superClass.name);
          }
        }
      }

      // Add special id property
      types[metaClass.name].properties['id'] = {
        type: 'String',
        many: false
      };
    }
    
    // Register all types with the engine
    oclEngine.registerTypes(types);

    // Mark this metamodel as registered
    registeredMetamodels.add(metamodel.id);
    console.log(`Registered metamodel ${metamodel.name} with OCL engine`);
  } catch (error) {
    console.error('Error registering metamodel with OCL engine:', error);
    throw error;
  }
}

/**
 * Ensure a metamodel is registered with the OCL engine
 */
export function ensureMetamodelRegistered(
  oclEngine: OclEngine,
  registeredMetamodels: Set<string>,
  metamodel: Metamodel
): void {
  if (!registeredMetamodels.has(metamodel.id)) {
    registerMetamodel(oclEngine, registeredMetamodels, metamodel);
  }
}
