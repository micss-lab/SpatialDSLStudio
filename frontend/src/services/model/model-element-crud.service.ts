import { v4 as uuidv4 } from 'uuid';
import { Model, ModelElement, ModelElementPresentation } from '../../models/types';
import { metamodelService } from '../metamodel';
import { modelInheritanceUtilsService } from './model-inheritance-utils.service';
import { modelReferenceService } from './model-reference.service';

const pixelDeltaToMm = (pixels: number): number => pixels;

/**
 * Service for CRUD operations on model elements
 */
export class ModelElementCrudService {
  private newlyCreatedElements: Set<string> = new Set();

  private withSyncedSpatialPosition(
    current: ModelElementPresentation | undefined,
    updates: ModelElementPresentation
  ): ModelElementPresentation {
    if (!updates.position2D || updates.position3D || !current?.position2D || !current?.position3D) {
      return updates;
    }

    const deltaX = pixelDeltaToMm(updates.position2D.x - current.position2D.x);
    const deltaY = pixelDeltaToMm(updates.position2D.y - current.position2D.y);

    return {
      ...updates,
      position3D: {
        x: current.position3D.x + deltaX,
        y: current.position3D.y + deltaY,
        z: current.position3D.z,
      },
    };
  }

  /**
   * Add a model element conforming to a metaclass
   */
  addModelElement(
    model: Model,
    metaClassId: string,
    saveCallback: (modelId: string) => void,
    properties: Record<string, any> = {}
  ): ModelElement | null {
    if (!model) return null;

    // Get the metamodel and metaclass to check conformance
    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    if (!metamodel) return null;

    const metaClass = modelInheritanceUtilsService.findMetaClassInMetamodel(metamodel, metaClassId);
    if (!metaClass) return null;

    // Prevent instantiation of abstract classes
    if (metaClass.abstract) {
      console.error(`Cannot instantiate abstract class: ${metaClass.name}`);
      return null;
    }

    // Create the new element
    const newElement: ModelElement = {
      id: uuidv4(),
      modelElementId: metaClassId,
      style: {},
      references: {},
      presentation: {
        position2D: { x: 0, y: 0 },
        size2D: { width: 120, height: 80 },
      }
    };

    // Get all attributes including inherited ones
    const allAttributes = modelInheritanceUtilsService.getAllAttributes(metaClass, metamodel);
    
    // Initialize style with default values from the metaclass and its parents
    allAttributes.forEach(attr => {
      // Use provided value or default from meta-attribute
      if (properties[attr.name] !== undefined) {
        newElement.style[attr.name] = properties[attr.name];
      } else if (attr.defaultValue !== undefined) {
        newElement.style[attr.name] = attr.defaultValue;
      } else {
        // Initialize with appropriate empty value
        const attributeType = typeof attr.type === 'object' ? 'string' : attr.type;
        switch (attributeType) {
          case 'string':
            // For name attribute specifically, use a more descriptive default
            if (attr.name === 'name') {
              newElement.style[attr.name] = `${metaClass.name}_${Date.now().toString().slice(-4)}`;
            } else {
              newElement.style[attr.name] = '';
            }
            break;
          case 'number':
            newElement.style[attr.name] = 0;
            break;
          case 'boolean':
            newElement.style[attr.name] = false;
            break;
          case 'date':
            newElement.style[attr.name] = new Date().toISOString();
            break;
        }
      }
    });

    // Get all references including inherited ones
    const allReferences = modelInheritanceUtilsService.getAllReferences(metaClass, metamodel);
    
    // Initialize references as empty arrays or null
    allReferences.forEach(ref => {
      if (ref.cardinality.upperBound === '*' || ref.cardinality.upperBound > 1) {
        newElement.references[ref.name] = [];
      } else {
        newElement.references[ref.name] = null as any;
      }
    });

    // Add the element to the model without validation - we'll validate it after the user edits it
    // This allows users to create elements that initially don't meet constraints
    model.elements.push(newElement);
    saveCallback(model.id);
    
    // Track this as a newly created element for deferred validation
    this.newlyCreatedElements.add(newElement.id);
    
    return newElement;
  }

  /**
   * Update a model element's style properties
   */
  updateModelElementProperties(
    model: Model,
    elementId: string,
    properties: Record<string, any>,
    saveCallback: (modelId: string) => void
  ): boolean {
    if (!model) return false;

    const elementIndex = model.elements.findIndex(e => e.id === elementId);
    if (elementIndex === -1) return false;

    // Check if this is a newly created element being edited for the first time
    const isNewlyCreatedElement = this.newlyCreatedElements.has(elementId);
    
    // Update the element (removed validation check as per user's request)
    model.elements[elementIndex].style = {
      ...model.elements[elementIndex].style,
      ...properties
    };

    // If this was a newly created element, remove it from tracking after first edit
    if (isNewlyCreatedElement) {
      this.newlyCreatedElements.delete(elementId);
    }

    saveCallback(model.id);
    return true;
  }

  /**
   * Delete a model element
   */
  deleteModelElement(
    model: Model,
    elementId: string,
    saveCallback: (modelId: string) => void
  ): boolean {
    if (!model) return false;
    
    const elementIndex = model.elements.findIndex(e => e.id === elementId);
    if (elementIndex === -1) return false;
    
    // Get the element to be deleted
    const elementToDelete = model.elements[elementIndex];
    
    // Remove all references to this element from other elements in this model
    modelReferenceService.removeReferencesToElement(model, elementToDelete.id);
    
    // Remove the element
    model.elements.splice(elementIndex, 1);
    
    // Save changes
    saveCallback(model.id);
    
    return true;
  }

  /**
   * Add an imported model element (with existing ID and properties)
   */
  addImportedModelElement(
    model: Model,
    element: ModelElement,
    saveCallback: (modelId: string) => void
  ): ModelElement | null {
    if (!model) return null;

    // Add the element directly
    model.elements.push(element);
    saveCallback(model.id);
    return element;
  }

  /**
   * Update the position of a model element
   */
  updateElementPosition(
    model: Model,
    elementId: string,
    position: { x: number, y: number },
    saveCallback: (modelId: string) => void
  ): boolean {
    if (!model) return false;

    const element = model.elements.find(e => e.id === elementId);
    if (!element) return false;

    const presentation = this.withSyncedSpatialPosition(element.presentation, {
      position2D: position
    });

    element.presentation = {
      ...(element.presentation || {}),
      position2D: presentation.position2D,
      position3D: presentation.position3D || element.presentation?.position3D,
    };
    element.style = {
      ...(element.style || {}),
      position
    };

    saveCallback(model.id);
    return true;
  }

  /**
   * Update canonical presentation metadata for a model element
   */
  updateModelElementPresentation(
    model: Model,
    elementId: string,
    presentation: ModelElementPresentation,
    saveCallback: (modelId: string) => void
  ): boolean {
    if (!model) return false;

    const element = model.elements.find(e => e.id === elementId);
    if (!element) return false;

    const syncedPresentation = this.withSyncedSpatialPosition(element.presentation, presentation);

    element.presentation = {
      ...(element.presentation || {}),
      ...syncedPresentation,
      position2D: syncedPresentation.position2D || element.presentation?.position2D,
      position3D: syncedPresentation.position3D || element.presentation?.position3D,
      size2D: syncedPresentation.size2D || element.presentation?.size2D,
      size3D: syncedPresentation.size3D || element.presentation?.size3D,
      appearance: Object.prototype.hasOwnProperty.call(syncedPresentation, 'appearance')
        ? syncedPresentation.appearance
        : element.presentation?.appearance,
    };

    saveCallback(model.id);
    return true;
  }

  /**
   * Clear newly created elements tracking
   */
  clearNewlyCreatedElements(): void {
    this.newlyCreatedElements.clear();
  }
}

export const modelElementCrudService = new ModelElementCrudService();
