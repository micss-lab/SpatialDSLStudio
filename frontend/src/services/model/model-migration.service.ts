import { v4 as uuidv4 } from 'uuid';
import { Model } from '../../models/types';
import { metamodelService } from '../metamodel';
import { modelInheritanceUtilsService } from './model-inheritance-utils.service';
import { modelReferenceService } from './model-reference.service';

/**
 * Service for model migration and cleanup operations
 */
export class ModelMigrationService {
  /**
   * Migrate models from old property names if needed
   */
  migrateModels(models: Model[]): void {
    models.forEach(model => {
      model.elements.forEach(element => {
        if ((element as any).metaClassId && !element.modelElementId) {
          element.modelElementId = (element as any).metaClassId;
          delete (element as any).metaClassId;
        }
        if ((element as any).properties && !element.style) {
          element.style = (element as any).properties;
          delete (element as any).properties;
        }
      });
    });
  }

  /**
   * Migrate newly added attributes from the metamodel to existing model elements on load.
   * This ensures that when you add attributes to a metaclass, existing elements get default values.
   */
  migrateNewAttributesOnLoad(models: Model[]): boolean {
    let changed = false;
    for (const model of models) {
      const metamodel = metamodelService.getMetamodelById(model.conformsTo);
      if (!metamodel) continue;
      for (const element of model.elements) {
        const metaClass = modelInheritanceUtilsService.findMetaClassInMetamodel(metamodel, element.modelElementId);
        if (!metaClass) continue;
        const allAttributes = modelInheritanceUtilsService.getAllAttributes(metaClass, metamodel);
        if (!element.style) {
          element.style = {} as any;
        }
        for (const attr of allAttributes) {
          // If the attribute is missing on the element, initialize it
          if ((element.style as any)[attr.name] === undefined) {
            if (attr.defaultValue !== undefined) {
              (element.style as any)[attr.name] = attr.defaultValue;
            } else {
              const attributeType = typeof attr.type === 'object' ? 'string' : attr.type;
              switch (attributeType) {
                case 'string': (element.style as any)[attr.name] = ''; break;
                case 'number': (element.style as any)[attr.name] = 0; break;
                case 'boolean': (element.style as any)[attr.name] = false; break;
                case 'date': (element.style as any)[attr.name] = new Date().toISOString(); break;
                default: (element.style as any)[attr.name] = ''; break;
              }
            }
            changed = true;
          }
        }
      }
    }
    return changed;
  }

  /**
   * Clean up all models to remove duplicate elements and fix invalid references
   */
  cleanupModels(models: Model[], saveCallback?: () => void): void {
    let modelsChanged = false;
    
    // First, check for duplicate IDs across ALL models (global uniqueness)
    const allElementIds = new Map<string, {modelIndex: number, elementIndex: number}>();
    const duplicateIds = new Set<string>();
    
    // Scan all models to find duplicate IDs
    for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
      const model = models[modelIndex];
      
      for (let elementIndex = 0; elementIndex < model.elements.length; elementIndex++) {
        const element = model.elements[elementIndex];
        
        if (allElementIds.has(element.id)) {
          // We found a duplicate element ID across models
          duplicateIds.add(element.id);
          console.warn(`Found duplicate element ID "${element.id}" in model "${model.name}" and model "${models[allElementIds.get(element.id)!.modelIndex].name}"`);
        } else {
          allElementIds.set(element.id, {modelIndex, elementIndex});
        }
      }
    }
    
    // Fix duplicate IDs by generating new IDs
    if (duplicateIds.size > 0) {
      console.warn(`Found ${duplicateIds.size} duplicate element IDs across models. Regenerating IDs...`);
      
      for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
        const model = models[modelIndex];
        
        for (let elementIndex = 0; elementIndex < model.elements.length; elementIndex++) {
          const element = model.elements[elementIndex];
          
          if (duplicateIds.has(element.id)) {
            // Check if this is the first occurrence of this ID
            const firstOccurrence = allElementIds.get(element.id)!;
            
            // Only regenerate ID if this is not the first occurrence
            if (firstOccurrence.modelIndex !== modelIndex || firstOccurrence.elementIndex !== elementIndex) {
              // Generate a new unique ID for this element
              const oldId = element.id;
              const newId = uuidv4();
              
              console.warn(`Regenerating ID for element in model "${model.name}": ${oldId} -> ${newId}`);
              element.id = newId;
              
              // Update any references to this element within the same model
              modelReferenceService.updateReferencesToElement(model, oldId, newId);
              
              modelsChanged = true;
            }
          }
        }
      }
    }
    
    // Now process each model individually for internal duplicates and dangling references
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      
      // Create a map to track unique elements by ID
      const uniqueElements = new Map();
      const duplicateIds = new Set();
      
      // Find duplicate elements within same model (should be handled by the above, but double-check)
      for (const element of model.elements) {
        if (uniqueElements.has(element.id)) {
          duplicateIds.add(element.id);
        } else {
          uniqueElements.set(element.id, element);
        }
      }
      
      // If duplicates found, rebuild the model with only unique elements
      if (duplicateIds.size > 0) {
        console.warn(`Found ${duplicateIds.size} duplicate elements in model ${model.name}. Cleaning up...`);
        model.elements = Array.from(uniqueElements.values());
        modelsChanged = true;
      }
      
      // Clean up dangling references to non-existent elements
      const elementIds = new Set(model.elements.map(e => e.id));
      let referencesFixed = false;
      
      for (const element of model.elements) {
        for (const [refName, refValue] of Object.entries(element.references)) {
          if (Array.isArray(refValue)) {
            const originalLength = refValue.length;
            element.references[refName] = refValue.filter(id => elementIds.has(id));
            
            if (originalLength !== (element.references[refName]?.length || 0)) {
              referencesFixed = true;
            }
          } else if (refValue !== null && !elementIds.has(refValue as string)) {
            element.references[refName] = null;
            referencesFixed = true;
          }
        }
      }
      
      if (referencesFixed) {
        console.warn(`Fixed dangling references in model ${model.name}`);
        modelsChanged = true;
      }
    }
    
    // Additional cleanup: prune attributes that no longer exist in the metamodel
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const metamodel = metamodelService.getMetamodelById(model.conformsTo);
      if (!metamodel) continue;
      for (const element of model.elements) {
        const metaClass = metamodel.classes.find(c => c.id === element.modelElementId);
        if (!metaClass) continue;
        const allAttributes = modelInheritanceUtilsService.getAllAttributes(metaClass, metamodel);
        const allowedNames = new Set<string>(allAttributes.map(a => a.name));
        // Visualization/UI keys that should be preserved even if not part of the metaclass
        const visualizationAttributes = new Set<string>([
          'position', 'appearance', 'position3D', 'color', 'size', 'linkedModelElementId', 'modelElementRefId'
        ]);
        for (const key of Object.keys(element.style || {})) {
          if (!allowedNames.has(key) && !visualizationAttributes.has(key)) {
            delete (element.style as any)[key];
            modelsChanged = true;
          }
        }
      }
    }

    // Save changes if any models were modified
    if (modelsChanged && saveCallback) {
      saveCallback();
    }
  }

  /**
   * Manually clean up models to fix duplicate elements and references
   */
  cleanupModelsManually(models: Model[], saveCallback: () => void): number {
    let fixedIssueCount = 0;
    
    // Store original length of models to track changes
    const originalModelCounts = models.map(model => model.elements.length);
    
    // Run the cleanup
    this.cleanupModels(models, saveCallback);
    
    // Count how many elements were removed/fixed
    for (let i = 0; i < models.length; i++) {
      fixedIssueCount += Math.abs(originalModelCounts[i] - models[i].elements.length);
    }
    
    return fixedIssueCount;
  }

  /**
   * Remove any duplicate occurrences of the specified element ID
   */
  removeDuplicateElements(models: Model[], elementId: string, saveCallback?: () => void): number {
    let removedCount = 0;
    let foundFirst = false;
    
    // Process all models to find and remove duplicates
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const elementsToRemove: number[] = [];
      
      // First pass: Mark duplicates for removal
      for (let j = 0; j < model.elements.length; j++) {
        const element = model.elements[j];
        
        if (element.id === elementId) {
          if (foundFirst) {
            // This is a duplicate, mark for removal
            elementsToRemove.push(j);
          } else {
            // This is the first occurrence, keep it
            foundFirst = true;
          }
        }
      }
      
      // Second pass: Remove marked elements (in reverse order to maintain indexes)
      for (let j = elementsToRemove.length - 1; j >= 0; j--) {
        const indexToRemove = elementsToRemove[j];
        model.elements.splice(indexToRemove, 1);
        removedCount++;
      }
    }
    
    // Save changes if any elements were removed
    if (removedCount > 0 && saveCallback) {
      saveCallback();
    }
    
    return removedCount;
  }
}

export const modelMigrationService = new ModelMigrationService();
