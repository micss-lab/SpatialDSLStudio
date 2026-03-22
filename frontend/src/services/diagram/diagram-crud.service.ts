import { v4 as uuidv4 } from 'uuid';
import { Diagram } from '../../models/types';

/**
 * Service for CRUD operations on diagrams
 */
export class DiagramCrudService {
  private diagrams: Diagram[] = [];

  /**
   * Get all diagrams
   */
  getAllDiagrams(): Diagram[] {
    return [...this.diagrams];
  }

  /**
   * Get a diagram by ID
   */
  getDiagramById(id: string): Diagram | undefined {
    return this.diagrams.find(d => d.id === id);
  }

  /**
   * Get diagrams by model ID
   */
  getDiagramsByModelId(modelId: string): Diagram[] {
    return this.diagrams.filter(d => d.modelId === modelId);
  }

  /**
   * Create a new diagram
   */
  createDiagram(
    name: string,
    modelId: string,
    saveCallback: (diagram: Diagram) => void
  ): Diagram {
    const newDiagram: Diagram = {
      id: uuidv4(),
      name,
      modelId,
      elements: [],
      gridSettings: {
        sizeX: 20000, // Default 20m
        sizeY: 20000  // Default 20m
      }
    };
    this.diagrams.push(newDiagram);
    saveCallback(newDiagram);
    return newDiagram;
  }

  /**
   * Update grid settings for a diagram
   */
  updateGridSettings(
    diagram: Diagram,
    gridSettings: { sizeX: number; sizeY: number },
    saveCallback: (diagramId: string) => void
  ): boolean {
    if (!diagram) return false;

    diagram.gridSettings = gridSettings;
    saveCallback(diagram.id);
    return true;
  }

  /**
   * Delete a diagram
   */
  deleteDiagram(
    id: string,
    saveCallback: () => void,
    deleteCallback: (id: string) => void,
    syncedToDbCallback: (id: string) => void
  ): boolean {
    const initialLength = this.diagrams.length;
    this.diagrams = this.diagrams.filter(d => d.id !== id);
    const result = initialLength !== this.diagrams.length;
    if (result) {
      saveCallback();
      deleteCallback(id);
      syncedToDbCallback(id);
    }
    return result;
  }

  /**
   * Set diagrams (used during initialization)
   */
  setDiagrams(diagrams: Diagram[]): void {
    this.diagrams = diagrams;
  }

  /**
   * Clear all diagrams
   */
  clearDiagrams(): void {
    this.diagrams = [];
  }

  /**
   * Get diagrams reference (internal use)
   */
  getDiagramsRef(): Diagram[] {
    return this.diagrams;
  }
}

export const diagramCrudService = new DiagramCrudService();
