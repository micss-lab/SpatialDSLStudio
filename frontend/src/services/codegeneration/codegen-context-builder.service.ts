import {
  Diagram,
  DiagramElement,
  Metamodel,
  Model,
  ModelElement
} from '../../models/types';
import { metamodelService } from '../metamodel';
import { modelService } from '../model';
import { codegenInheritanceUtilsService } from './codegen-inheritance-utils.service';

/**
 * Service for building template contexts from diagram and model elements
 */
export class CodegenContextBuilderService {
  private getStableElementSortParts(element: DiagramElement | ModelElement): [string, string, string] {
    const name = element.style?.name || (element as any).name || '';
    return [
      name.toLowerCase(),
      element.modelElementId || '',
      element.id || '',
    ];
  }

  sortElementsForGeneration<T extends DiagramElement | ModelElement>(elements: T[]): T[] {
    return [...elements].sort((left, right) => {
      const leftParts = this.getStableElementSortParts(left);
      const rightParts = this.getStableElementSortParts(right);

      for (let index = 0; index < leftParts.length; index += 1) {
        if (leftParts[index] < rightParts[index]) return -1;
        if (leftParts[index] > rightParts[index]) return 1;
      }

      return 0;
    });
  }

  prepareElementsContext(elements: Array<DiagramElement | ModelElement>): any[] {
    return this.sortElementsForGeneration(elements)
      .map(element => this.prepareSingleElementContext(element));
  }

  /**
   * Prepares a context for a single model element
   * @param element The model element or diagram element
   * @returns A context object with all element properties
   */
  prepareSingleElementContext(element: any): any {
    // Start with basic properties
    const context: any = {
      id: element.id,
      name: element.style?.name || element.name || element.id,
      type: element.modelElementId || element.type,
      metaClassId: element.modelElementId || element.type,
    };

    // Try to resolve the corresponding model element to merge attribute values
    let resolvedModel: Model | undefined;
    let resolvedModelElement: ModelElement | undefined;
    try {
      const allModels = modelService.getAllModels();
      for (const m of allModels) {
        // For diagram elements, use linkedModelElementId to find the actual model element
        if (element.style?.linkedModelElementId) {
          const found = m.elements.find(e => e.id === element.style.linkedModelElementId);
          if (found) {
            resolvedModel = m;
            resolvedModelElement = found;
            break;
          }
        }
        // Fallback: direct id match (model element case - when iterating model elements directly)
        if (element.id) {
          const foundById = m.elements.find(e => e.id === element.id);
          if (foundById) {
            resolvedModel = m;
            resolvedModelElement = foundById;
            break;
          }
        }
      }
    } catch {}
    
    // Try to parse appearance object which may contain 3D properties
    let appearance: any = {};
    if (element.style?.appearance) {
      try {
        appearance = JSON.parse(element.style.appearance);
      } catch (e) {
        console.error('Error parsing appearance:', e);
      }
    }
    if (element.presentation?.appearance) {
      appearance = {
        ...appearance,
        ...element.presentation.appearance
      };
    }

    // Add all attributes from style (diagram or model element style)
    if (element.style) {
      // Process all style properties
      Object.keys(element.style).forEach(key => {
        context[key] = element.style[key];
        
        // Handle special 3D properties
        if (key === 'position3D') {
          // Extract position3D coordinates
          if (element.style.position3D) {
            context.X = element.style.position3D.x;
            context.Y = element.style.position3D.y;
          }
        } else if (key === 'rotationZ') {
          // Extract rotation
          context.RZ = element.style.rotationZ;
        } else if (key === 'widthMm') {
          // Extract width in mm (UI Length control → actual length)
          context.Length = element.style.widthMm;
        } else if (key === 'depthMm') {
          // In 3D mode, depthMm is used for Height (Y-axis)
          context.Height = element.style.depthMm;
        } else if (key === 'heightMm') {
          // In 3D mode, heightMm is used for Width (X-axis)
          context.Width = element.style.heightMm;
        } else if (['x', 'y', 'rz', 'width', 'height', 'length'].includes(key.toLowerCase())) {
          // Also add capitalized version for standard 2D properties
          const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
          context[capitalizedKey] = element.style[key];
        }
      });
    }

    // Model-only code generation reads projection-neutral presentation data from the model.
    // Views may override how an element is displayed, but these values are the model's
    // default concrete placement/dimensions used when no view is involved.
    if (element.presentation) {
      context.presentation = element.presentation;

      if (element.presentation.position3D) {
        context.position3D = element.presentation.position3D;
        if (context.X === undefined) context.X = element.presentation.position3D.x;
        if (context.Y === undefined) context.Y = element.presentation.position3D.y;
      } else if (element.presentation.position2D) {
        context.position2D = element.presentation.position2D;
        if (context.X === undefined) context.X = element.presentation.position2D.x;
        if (context.Y === undefined) context.Y = element.presentation.position2D.y;
      }

      if (element.presentation.rotationZ !== undefined && context.RZ === undefined) {
        context.RZ = element.presentation.rotationZ;
      }

      if (element.presentation.size2D) {
        context.size2D = element.presentation.size2D;
      }

      if (element.presentation.size3D) {
        context.size3D = element.presentation.size3D;
        context.widthMm = context.widthMm ?? element.presentation.size3D.widthMm;
        context.heightMm = context.heightMm ?? element.presentation.size3D.heightMm;
        context.depthMm = context.depthMm ?? element.presentation.size3D.depthMm;

        if (context.Length === undefined) context.Length = element.presentation.size3D.widthMm;
        if (context.Width === undefined) context.Width = element.presentation.size3D.heightMm;
        if (context.Height === undefined) context.Height = element.presentation.size3D.depthMm;
      }
    }

    // If we resolved a model element, merge its style (attribute values) so inherited attributes are accessible
    if (resolvedModelElement && resolvedModelElement.style) {
      Object.keys(resolvedModelElement.style).forEach(attrName => {
        if (context[attrName] === undefined) {
          context[attrName] = resolvedModelElement!.style[attrName];
        }
      });
    }

    // Add properties from appearance if not already set
    if (appearance) {
      // Width (X-axis, from heightMm)
      if (context.Width === undefined && appearance.heightMm !== undefined) {
        context.Width = appearance.heightMm;
      }
      
      // Height (Y-axis, from depthMm)
      if (context.Height === undefined && appearance.depthMm !== undefined) {
        context.Height = appearance.depthMm;
      }
      
      // Length (Z-axis, from widthMm)
      if (context.Length === undefined && appearance.widthMm !== undefined) {
        context.Length = appearance.widthMm;
      }
    }

    // Add direct properties if they exist (for DiagramElements)
    // These are fallbacks if style properties aren't available
    if (element.x !== undefined && context.X === undefined) context.X = element.x;
    if (element.y !== undefined && context.Y === undefined) context.Y = element.y;

    // Add references
    if (element.references) {
      Object.keys(element.references).forEach(key => {
        context[key] = element.references[key];
      });
    }

    // If we have metamodel context for this element, compute an attributes array with values
    if (resolvedModel && resolvedModelElement) {
      const mm = metamodelService.getMetamodelById(resolvedModel.conformsTo);
      if (mm) {
        const metaCls = mm.classes.find(c => c.id === resolvedModelElement!.modelElementId);
        if (metaCls) {
          const flatAttrs = codegenInheritanceUtilsService.getAllAttributes(metaCls, mm);
          context.attributes = flatAttrs.map(attr => ({
            ...attr,
            value: resolvedModelElement!.style ? resolvedModelElement!.style[attr.name] : undefined
          }));
        }
      }
    }

    // Use default values if still undefined
    if (context.Width === undefined) {
      context.Width = 800; // Default heightMm from appearance service
    }
    
    if (context.Length === undefined) {
      context.Length = 500; // Default widthMm from appearance service
    }
    
    if (context.Height === undefined) {
      context.Height = 200; // Default depthMm from appearance service
    }

    return context;
  }

  /**
   * Prepares a multi-element context for template generation
   */
  prepareMultiElementContext(elements: Array<DiagramElement | ModelElement>, diagram: Diagram, metamodel: Metamodel): any {
    const context: any = {};
    
    // Group elements by metamodel class ID
    const elementsByClass: Record<string, any[]> = {};
    // Group elements by metaclass name
    const elementsByClassName: Record<string, any[]> = {};
    
    // Create a map of metaclass IDs to names for quick lookup
    const metaclassIdToName: Record<string, string> = {};
    metamodel.classes.forEach(cls => {
      metaclassIdToName[cls.id] = cls.name;
    });
    
    console.log('Metaclass ID to Name mapping:', metaclassIdToName);
    
    // First, index all elements by their name for direct access
    this.sortElementsForGeneration(elements).forEach(element => {
      const name = element.style.name;
      if (!name) return;
      
      // Create an element context
      const elementContext = this.prepareSingleElementContext(element);
      
      // Add to the context by name
      context[name] = elementContext;
      
      // Group by class type (using ID)
      const modelElementId = element.modelElementId;
      if (!elementsByClass[modelElementId]) {
        elementsByClass[modelElementId] = [];
      }
      elementsByClass[modelElementId].push(elementContext);
      
      // Group by class name if we can find it
      const metaclassName = metaclassIdToName[modelElementId];
      if (metaclassName) {
        if (!elementsByClassName[metaclassName]) {
          elementsByClassName[metaclassName] = [];
        }
        elementsByClassName[metaclassName].push(elementContext);
      }
    });
    
    // Add all elements by class groups 
    context.elementsByClass = elementsByClass;
    context.elementsByClassName = elementsByClassName;
    
    // Count elements by type (using IDs)
    context.countByClass = {};
    Object.keys(elementsByClass).forEach(key => {
      context.countByClass[key] = elementsByClass[key].length;
    });
    
    // Count elements by class name
    context.countByClassName = {};
    Object.keys(elementsByClassName).forEach(key => {
      context.countByClassName[key] = elementsByClassName[key].length;
    });
    
    // Debug logging to help identify the correct structure
    console.log('Multi-element context created:', {
      "Number of named elements": Object.keys(context).length - 4, // Subtract elementsByClass, elementsByClassName, countByClass, countByClassName
      "Element class groups by ID": Object.keys(elementsByClass),
      "Element counts by ID": context.countByClass,
      "Element class groups by name": Object.keys(elementsByClassName),
      "Element counts by name": context.countByClassName,
      "Sample element names": Object.keys(context).filter(key => !['elementsByClass', 'elementsByClassName', 'countByClass', 'countByClassName'].includes(key)).slice(0, 5)
    });
    
    return context;
  }
}

export const codegenContextBuilderService = new CodegenContextBuilderService();
