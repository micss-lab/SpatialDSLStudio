import { Diagram, DiagramElement, ModelElement } from '../../models/types';
import { modelService } from '../model';

/**
 * Service for querying and managing diagram elements
 */
export class DiagramElementQueryService {
  /**
   * Get an element by ID from a diagram
   */
  getElementById(diagram: Diagram, elementId: string): DiagramElement | undefined {
    if (!diagram) return undefined;
    return diagram.elements.find(e => e.id === elementId);
  }
  
  /**
   * Get the corresponding model element for a diagram element
   */
  getModelElement(diagram: Diagram, elementId: string): ModelElement | undefined {
    if (!diagram) return undefined;
    
    const diagramElement = diagram.elements.find(e => e.id === elementId);
    if (!diagramElement) return undefined;
    
    const model = modelService.getModelById(diagram.modelId);
    if (!model) return undefined;
    
    return model.elements.find(e => e.id === diagramElement.modelElementId);
  }

  /**
   * Get all diagram elements representing a specific model element
   */
  getDiagramElementsByModelElement(diagram: Diagram, modelElementId: string): DiagramElement[] {
    if (!diagram) return [];
    
    return diagram.elements.filter(e => e.modelElementId === modelElementId);
  }
  
  /**
   * Remove diagram elements when their model element is deleted
   */
  removeElementsForModelElement(
    diagrams: Diagram[],
    modelId: string,
    modelElementId: string,
    saveCallback?: () => void
  ): void {
    const affectedDiagrams = diagrams.filter(d => d.modelId === modelId);
    
    let changed = false;
    affectedDiagrams.forEach(diagram => {
      const initialLength = diagram.elements.length;
      const initialIncludedLength = diagram.includedElementIds?.length || 0;
      diagram.elements = diagram.elements.filter(e => e.modelElementId !== modelElementId);
      diagram.includedElementIds = (diagram.includedElementIds || []).filter(id => id !== modelElementId);
      
      // Also remove edges connected to this model element
      diagram.elements = diagram.elements.filter(e => {
        if (e.type !== 'edge') return true;
        
        // Check if the edge's source or target is connected to the removed model element
        const sourceElement = diagram.elements.find(se => se.id === e.sourceId);
        const targetElement = diagram.elements.find(te => te.id === e.targetId);
        
        return (sourceElement && targetElement);
      });
      
      if (initialLength !== diagram.elements.length || initialIncludedLength !== (diagram.includedElementIds?.length || 0)) {
        changed = true;
      }
    });
    
    if (changed && saveCallback) {
      saveCallback();
    }
  }
}

export const diagramElementQueryService = new DiagramElementQueryService();
