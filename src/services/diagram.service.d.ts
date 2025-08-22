import { Diagram, DiagramElement, ModelElement } from '../models/types';

declare class DiagramService {
  getAllDiagrams(): Diagram[];
  getDiagramById(id: string): Diagram | undefined;
  getDiagramsByModelId(modelId: string): Diagram[];
  createDiagram(name: string, modelId: string): Diagram;
  deleteDiagram(id: string): boolean;
  addElement(
    diagramId: string, 
    modelElementId: string,
    type: 'node' | 'edge',
    x?: number,
    y?: number,
    width?: number,
    height?: number,
    sourceId?: string,
    targetId?: string,
    style?: Record<string, any>
  ): DiagramElement | null;
  updateElement(diagramId: string, elementId: string, updates: Partial<DiagramElement>): boolean;
  deleteElement(diagramId: string, elementId: string): boolean;
  getElementById(diagramId: string, elementId: string): DiagramElement | undefined;
  getModelElement(diagramId: string, elementId: string): ModelElement | undefined;
  getDiagramElementsByModelElement(diagramId: string, modelElementId: string): DiagramElement[];
  removeElementsForModelElement(modelId: string, modelElementId: string): void;
  exportDiagramToJSON(diagramId: string): string | null;
  importDiagramFromJSON(jsonData: string): Diagram | null;
}

export const diagramService: DiagramService; 