import { Model, ModelElement } from '../../models/types';
import { metamodelService } from '../metamodel';
import { modelInheritanceUtilsService } from './model-inheritance-utils.service';

/**
 * Service for managing references between model elements
 */
export class ModelReferenceService {
  private isMetaClassCompatible(metamodel: any, candidateId: string, expectedId: string): boolean {
    if (candidateId === expectedId) return true;

    const visited = new Set<string>();
    const visit = (metaClassId: string): boolean => {
      if (visited.has(metaClassId)) return false;
      visited.add(metaClassId);

      const metaClass = metamodel.classes.find((candidate: any) => candidate.id === metaClassId);
      if (!metaClass) return false;
      return (metaClass.superTypes || []).some((superTypeId: string) => (
        superTypeId === expectedId || visit(superTypeId)
      ));
    };

    return visit(candidateId);
  }

  private removeSingleBidirectionalReference(
    model: Model,
    sourceElement: ModelElement,
    targetId: string,
    oppositeIdentifier: string
  ): void {
    const targetElement = model.elements.find(element => element.id === targetId);
    if (!targetElement) return;

    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    const targetMetaClass = metamodel?.classes.find(candidate => candidate.id === targetElement.modelElementId);
    if (!metamodel || !targetMetaClass) return;

    const oppositeReference = modelInheritanceUtilsService
      .getAllReferences(targetMetaClass, metamodel)
      .find(reference => reference.name === oppositeIdentifier || reference.id === oppositeIdentifier);
    if (!oppositeReference) return;

    const currentValue = targetElement.references[oppositeReference.name];
    if (Array.isArray(currentValue)) {
      targetElement.references[oppositeReference.name] = currentValue.filter(id => id !== sourceElement.id);
    } else if (currentValue === sourceElement.id) {
      targetElement.references[oppositeReference.name] = null;
    }
  }

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
    
    // Find the reference definition, including references inherited from supertypes
    // (e.g. flowsTo is defined on the abstract FlowNode, not on each concrete node class)
    const reference = modelInheritanceUtilsService
      .getAllReferences(sourceMetaClass, metamodel)
      .find(r => r.name === referenceName || r.id === referenceName);
    if (!reference) return false;

    const resolvedReferenceName = reference.name;
    const requestedTargetIds = targetElementId === null
      ? []
      : Array.isArray(targetElementId)
        ? targetElementId
        : [targetElementId];

    // For self-references, check if they're allowed
    if (requestedTargetIds.includes(sourceElementId) && reference.allowSelfReference !== true) {
      console.error('Self-references are not allowed for this reference type');
      return false;
    }

    const hasInvalidTarget = requestedTargetIds.some(targetId => {
      const targetElement = model.elements.find(element => element.id === targetId);
      return !targetElement
        || !this.isMetaClassCompatible(metamodel, targetElement.modelElementId, reference.target);
    });
    if (hasInvalidTarget) {
      console.error('Reference target does not conform to the target metaclass');
      return false;
    }

    // Check if this is for a multi-valued reference (array)
    const isMultiValued = reference.cardinality.upperBound === '*' || 
                          (typeof reference.cardinality.upperBound === 'number' && reference.cardinality.upperBound > 1);

    const previousValue = sourceElement.references[resolvedReferenceName];
    const previousTargetIds = Array.isArray(previousValue) ? previousValue : previousValue ? [previousValue] : [];
    let nextTargetIds: string[] = [];

    // Set the reference value
    if (isMultiValued) {
      // Handle multi-valued references
      if (targetElementId === null) {
        sourceElement.references[resolvedReferenceName] = [];
      } else if (Array.isArray(targetElementId)) {
        nextTargetIds = Array.from(new Set(targetElementId));
        sourceElement.references[resolvedReferenceName] = nextTargetIds;
      } else {
        // Convert single value to array or add to existing array
        const currentValue = sourceElement.references[resolvedReferenceName];
        if (Array.isArray(currentValue)) {
          nextTargetIds = currentValue.includes(targetElementId)
            ? [...currentValue]
            : [...currentValue, targetElementId];
        } else {
          nextTargetIds = [targetElementId];
        }
        sourceElement.references[resolvedReferenceName] = nextTargetIds;
      }
    } else {
      // Handle single-valued references
      const nextTarget = Array.isArray(targetElementId) ? targetElementId[0] || null : targetElementId;
      sourceElement.references[resolvedReferenceName] = nextTarget;
      nextTargetIds = nextTarget ? [nextTarget] : [];
    }

    if (reference.opposite) {
      previousTargetIds
        .filter(targetId => !nextTargetIds.includes(targetId))
        .forEach(targetId => this.removeSingleBidirectionalReference(
          model,
          sourceElement,
          targetId,
          reference.opposite!
        ));
    }
    
    // Store bend points for visualization if provided
    if (bendPoints && bendPoints.length > 0) {
      // @ts-ignore - References type declaration doesn't know about our custom extensions
      sourceElement.references[`${resolvedReferenceName}_bendPoints`] = bendPoints;
    }
    
    // Store reference attributes if provided
    if (attributes && Object.keys(attributes).length > 0) {
      // @ts-ignore - References type declaration doesn't know about our custom extensions
      sourceElement.references[`${resolvedReferenceName}_attributes`] = attributes;
    }
    
    // For bidirectional references, update the target element's reference as well
    if (reference.opposite && nextTargetIds.length > 0) {
      this.updateBidirectionalReference(
        model,
        sourceElement,
        nextTargetIds.filter(targetId => !previousTargetIds.includes(targetId)),
        resolvedReferenceName,
        reference.opposite
      );
    }

    // Save changes
    saveCallback(model.id);
    
    return true;
  }

  removeModelElementReference(
    model: Model,
    sourceElementId: string,
    referenceName: string,
    targetElementId: string,
    saveCallback: (modelId: string) => void
  ): boolean {
    const sourceElement = model.elements.find(element => element.id === sourceElementId);
    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    const sourceMetaClass = metamodel?.classes.find(candidate => candidate.id === sourceElement?.modelElementId);
    if (!sourceElement || !metamodel || !sourceMetaClass) return false;

    const reference = modelInheritanceUtilsService
      .getAllReferences(sourceMetaClass, metamodel)
      .find(candidate => candidate.name === referenceName || candidate.id === referenceName);
    if (!reference) return false;

    const currentValue = sourceElement.references[reference.name];
    if (Array.isArray(currentValue)) {
      if (!currentValue.includes(targetElementId)) return false;
      return this.setModelElementReference(
        model,
        sourceElementId,
        reference.name,
        currentValue.filter(id => id !== targetElementId),
        saveCallback
      );
    }

    if (currentValue !== targetElementId) return false;
    return this.setModelElementReference(model, sourceElementId, reference.name, null, saveCallback);
  }

  reconnectModelElementReference(
    model: Model,
    sourceElementId: string,
    referenceName: string,
    oldTargetElementId: string,
    newTargetElementId: string,
    saveCallback: (modelId: string) => void
  ): boolean {
    const sourceElement = model.elements.find(element => element.id === sourceElementId);
    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    const sourceMetaClass = metamodel?.classes.find(candidate => candidate.id === sourceElement?.modelElementId);
    if (!sourceElement || !metamodel || !sourceMetaClass) return false;

    const reference = modelInheritanceUtilsService
      .getAllReferences(sourceMetaClass, metamodel)
      .find(candidate => candidate.name === referenceName || candidate.id === referenceName);
    if (!reference) return false;

    const currentValue = sourceElement.references[reference.name];
    if (Array.isArray(currentValue)) {
      if (!currentValue.includes(oldTargetElementId)) return false;
      const nextValue = Array.from(new Set(currentValue.map(id => (
        id === oldTargetElementId ? newTargetElementId : id
      ))));
      return this.setModelElementReference(
        model,
        sourceElementId,
        reference.name,
        nextValue,
        saveCallback
      );
    }

    if (currentValue !== oldTargetElementId) return false;
    return this.setModelElementReference(
      model,
      sourceElementId,
      reference.name,
      newTargetElementId,
      saveCallback
    );
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
    
    // Find the opposite reference definition, including inherited references
    const oppositeReference = modelInheritanceUtilsService
      .getAllReferences(targetMetaClass, metamodel)
      .find(r => r.name === oppositeName || r.id === oppositeName);
    if (!oppositeReference) return;
    
    // Check if opposite reference is multi-valued
    const isMultiValued = oppositeReference.cardinality.upperBound === '*' || 
                         (typeof oppositeReference.cardinality.upperBound === 'number' && oppositeReference.cardinality.upperBound > 1);
    
    // Update the opposite reference
    if (isMultiValued) {
      // For multi-valued opposite references
      const currentValue = targetElement.references[oppositeReference.name];
      if (Array.isArray(currentValue)) {
        if (!currentValue.includes(sourceElement.id)) {
          targetElement.references[oppositeReference.name] = [...currentValue, sourceElement.id];
        }
      } else {
        targetElement.references[oppositeReference.name] = [sourceElement.id];
      }
    } else {
      // For single-valued opposite references
      targetElement.references[oppositeReference.name] = sourceElement.id;
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
