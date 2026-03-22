import { v4 as uuidv4 } from 'uuid';
import { Diagram, DiagramElement } from '../../models/types';

/**
 * Service for CRUD operations on diagram elements
 */
export class DiagramElementCrudService {
  /**
   * Add a new element to a diagram
   */
  addElement(
    diagram: Diagram,
    modelElementId: string,
    type: 'node' | 'edge',
    saveCallback: (diagramId: string) => void,
    x?: number,
    y?: number,
    width?: number,
    height?: number,
    sourceId?: string,
    targetId?: string,
    style: Record<string, any> = {},
    referenceAttributes: Record<string, any> = {},
    points?: Array<{x: number, y: number}>
  ): DiagramElement | null {
    console.log('Adding element:', {
      diagramId: diagram.id,
      modelElementId,
      type,
      x, y, width, height,
      sourceId, targetId,
      style,
      referenceAttributes,
      points
    });
    
    if (!diagram) {
      console.error('Diagram not found');
      return null;
    }
    
    // Create the new element with a unique ID
    const newElement: DiagramElement = {
      id: uuidv4(),
      modelElementId,
      type,
      style: style || {},
      x,
      y,
      width,
      height,
      sourceId,
      targetId,
      referenceAttributes: referenceAttributes || {},
      points
    };
    
    // Add it to the diagram
    diagram.elements.push(newElement);
    
    saveCallback(diagram.id);
    
    console.log('Element added successfully:', newElement);
    return newElement;
  }

  /**
   * Update a diagram element
   */
  updateElement(
    diagram: Diagram,
    elementId: string,
    updates: Partial<DiagramElement>,
    saveCallback: (diagramId: string) => void
  ): boolean {
    if (!diagram) return false;

    const elementIndex = diagram.elements.findIndex(e => e.id === elementId);
    if (elementIndex === -1) return false;

    // Properly merge the style object to avoid losing existing style properties
    const currentElement = diagram.elements[elementIndex];
    diagram.elements[elementIndex] = {
      ...currentElement,
      ...updates,
      style: {
        ...currentElement.style,
        ...(updates.style || {})
      },
      id: elementId // Ensure ID doesn't change
    };

    saveCallback(diagram.id);
    return true;
  }

  /**
   * Delete a diagram element
   */
  deleteElement(
    diagram: Diagram,
    elementId: string,
    saveCallback: (diagramId: string) => void
  ): boolean {
    if (!diagram) return false;

    const initialLength = diagram.elements.length;
    diagram.elements = diagram.elements.filter(e => e.id !== elementId);
    
    // Also remove edges connected to this element if it's a node
    if (initialLength !== diagram.elements.length) {
      diagram.elements = diagram.elements.filter(e => 
        e.type !== 'edge' || (e.sourceId !== elementId && e.targetId !== elementId)
      );
      saveCallback(diagram.id);
    }

    return initialLength !== diagram.elements.length;
  }
}

export const diagramElementCrudService = new DiagramElementCrudService();
