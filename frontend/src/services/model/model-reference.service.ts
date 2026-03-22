import { Model, ModelElement, MetaReference, Metamodel, MetaClass } from '../../models/types';
import { metamodelService } from '../metamodel';
import { modelInheritanceUtilsService } from './model-inheritance-utils.service';

/**
 * Service for managing references between model elements
 */
export class ModelReferenceService {
  /**
   * Set or update a reference from one model element to another
   */
  setModelElementReference(
    model: Model,
    sourceElementId: string,
    referenceName: string,
    targetElementId: string | string[] | null,
    saveCallback: (modelId: string) => void,
    bendPoints?: Array<{x: number, y: number}>,
    attributes?: Record<string, any>
  ): boolean {
    if (!model) return false;

    const sourceElementIndex = model.elements.findIndex(e => e.id === sourceElementId);
    if (sourceElementIndex === -1) return false;

    // Get the source element
    const sourceElement = model.elements[sourceElementIndex];

    // Get the metamodel for type checking
    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    if (!metamodel) return false;

    // Find the metaclass of the source element
    const sourceMetaClass = metamodel.classes.find(c => c.id === sourceElement.modelElementId);
    if (!sourceMetaClass) return false;
    
    // Find the reference definition
    const reference = sourceMetaClass.references.find(r => r.name === referenceName);
    if (!reference) return false;
    
    // For self-references, check if they're allowed
    if (targetElementId && targetElementId === sourceElementId && reference.allowSelfReference !== true) {
      console.error('Self-references are not allowed for this reference type');
      return false;
    }

    // Check if this is for a multi-valued reference (array)
    const isMultiValued = reference.cardinality.upperBound === '*' || 
                          (typeof reference.cardinality.upperBound === 'number' && reference.cardinality.upperBound > 1);
    
    // Set the reference value
    if (isMultiValued) {
      // Handle multi-valued references
      if (targetElementId === null) {
        sourceElement.references[referenceName] = [];
      } else if (Array.isArray(targetElementId)) {
        sourceElement.references[referenceName] = targetElementId;
      } else {
        // Convert single value to array or add to existing array
        const currentValue = sourceElement.references[referenceName];
        if (Array.isArray(currentValue)) {
          if (!currentValue.includes(targetElementId)) {
            sourceElement.references[referenceName] = [...currentValue, targetElementId];
          }
        } else {
          sourceElement.references[referenceName] = [targetElementId];
        }
      }
    } else {
      // Handle single-valued references
      sourceElement.references[referenceName] = targetElementId;
    }
    
    // Store bend points for visualization if provided
    if (bendPoints && bendPoints.length > 0) {
      // @ts-ignore - References type declaration doesn't know about our custom extensions
      sourceElement.references[`${referenceName}_bendPoints`] = bendPoints;
    }
    
    // Store reference attributes if provided
    if (attributes && Object.keys(attributes).length > 0) {
      // @ts-ignore - References type declaration doesn't know about our custom extensions
      sourceElement.references[`${referenceName}_attributes`] = attributes;
    }
    
    // For bidirectional references, update the target element's reference as well
    if (reference.opposite && targetElementId !== null) {
      this.updateBidirectionalReference(model, sourceElement, targetElementId, referenceName, reference.opposite);
    }

    // Save changes
    saveCallback(model.id);
    
    return true;
  }

  /**
   * Helper to update bidirectional references
   */
  private updateBidirectionalReference(
    model: Model,
    sourceElement: ModelElement,
    targetId: string | string[],
    sourceName: string,
    oppositeName: string
  ): void {
    if (Array.isArray(targetId)) {
      // For multi-valued references, update each target
      targetId.forEach(id => this.updateSingleBidirectionalReference(model, sourceElement, id, sourceName, oppositeName));
    } else {
      // For single-valued references
      this.updateSingleBidirectionalReference(model, sourceElement, targetId, sourceName, oppositeName);
    }
  }

  /**
   * Helper to update a single bidirectional reference
   */
  private updateSingleBidirectionalReference(
    model: Model,
    sourceElement: ModelElement,
    targetId: string,
    sourceName: string,
    oppositeName: string
  ): void {
    // Find the target element
    const targetElement = model.elements.find(e => e.id === targetId);
    if (!targetElement) return;
    
    // Get the target's metaclass
    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    if (!metamodel) return;
    
    const targetMetaClass = metamodel.classes.find(c => c.id === targetElement.modelElementId);
    if (!targetMetaClass) return;
    
    // Find the opposite reference definition
    const oppositeReference = targetMetaClass.references.find(r => r.name === oppositeName);
    if (!oppositeReference) return;
    
    // Check if opposite reference is multi-valued
    const isMultiValued = oppositeReference.cardinality.upperBound === '*' || 
                         (typeof oppositeReference.cardinality.upperBound === 'number' && oppositeReference.cardinality.upperBound > 1);
    
    // Update the opposite reference
    if (isMultiValued) {
      // For multi-valued opposite references
      const currentValue = targetElement.references[oppositeName];
      if (Array.isArray(currentValue)) {
        if (!currentValue.includes(sourceElement.id)) {
          targetElement.references[oppositeName] = [...currentValue, sourceElement.id];
        }
      } else {
        targetElement.references[oppositeName] = [sourceElement.id];
      }
    } else {
      // For single-valued opposite references
      targetElement.references[oppositeName] = sourceElement.id;
    }
  }

  /**
   * Remove all references to a deleted element from other elements in the model
   */
  removeReferencesToElement(model: Model, elementId: string): void {
    // Go through all remaining elements in the model
    for (const element of model.elements) {
      if (element.id === elementId) continue; // Skip the element being deleted
      
      // Check all references in this element
      for (const [refName, refValue] of Object.entries(element.references)) {
        if (Array.isArray(refValue)) {
          // For multi-valued references, filter out the deleted element
          element.references[refName] = refValue.filter(id => id !== elementId);
        } else if (refValue === elementId) {
          // For single-valued references, set to null
          element.references[refName] = null;
        }
      }
    }
  }

  /**
   * Update references after an element ID has changed
   */
  updateReferencesToElement(model: Model, oldId: string, newId: string): void {
    for (const element of model.elements) {
      for (const [refName, refValue] of Object.entries(element.references)) {
        if (Array.isArray(refValue)) {
          // For multi-valued references, replace the old ID with the new ID
          for (let i = 0; i < refValue.length; i++) {
            if (refValue[i] === oldId) {
              refValue[i] = newId;
            }
          }
        } else if (refValue === oldId) {
          // For single-valued references, replace with the new ID
          element.references[refName] = newId;
        }
      }
    }
  }
}

export const modelReferenceService = new ModelReferenceService();
