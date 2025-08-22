import { Diagram, DiagramElement, ModelElement, Model } from '../models/types';
import { metamodelService } from './metamodel.service';
import { MetaClass, MetaAttribute, Metamodel } from '../models/types';
import { v4 as uuidv4 } from 'uuid';
import { modelService } from './model.service';

class DiagramService {
  private diagrams: Diagram[] = [];
  private readonly STORAGE_KEY = 'obeo_like_tool_diagrams';

  constructor() {
    // Load diagrams from localStorage if available
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const storedData = localStorage.getItem(this.STORAGE_KEY);
      if (storedData) {
        this.diagrams = JSON.parse(storedData);

        // Migrate diagrams to use modelId instead of metamodelId if needed
        this.diagrams.forEach(diagram => {
          // Migrate metamodelId to modelId
          if ((diagram as any).metamodelId && !diagram.modelId) {
            diagram.modelId = (diagram as any).metamodelId;
            delete (diagram as any).metamodelId;
          }

          // Add default grid settings if they don't exist
          if (!diagram.gridSettings) {
            diagram.gridSettings = {
              sizeX: 20000, // Default 20m
              sizeY: 20000  // Default 20m
            };
          }

          // Migrate diagram elements: properties field to style field
          diagram.elements.forEach(element => {
            // If element has properties but no style, move properties to style
            if ((element as any).properties && !element.style) {
              element.style = (element as any).properties;
              delete (element as any).properties;
            }
            
            // If element has metaClassId but no modelElementId, copy it
            if ((element as any).metaClassId && !element.modelElementId) {
              element.modelElementId = (element as any).metaClassId;
              delete (element as any).metaClassId;
            }

            // Ensure style exists
            if (!element.style) {
              element.style = {};
            }
          });
        });

        // Prune diagram element styles that refer to removed metamodel attributes
        this.pruneDiagramElementStyles();

        // Save the updated diagrams
        this.saveToStorage();
      }
    } catch (error) {
      console.error('Error loading diagrams from localStorage:', error);
      this.diagrams = [];
    }
  }

  // Prune diagram element styles to remove attributes that no longer exist in the metamodel
  private pruneDiagramElementStyles(): void {
    // Visualization/UI attributes that are always preserved
    const visualizationAttributes = new Set<string>([
      'position', 'appearance', 'position3D', 'color', 'size', 'linkedModelElementId', 'modelElementRefId'
    ]);

    for (const diagram of this.diagrams) {
      const model = modelService.getModelById(diagram.modelId);
      if (!model) continue;

      const metamodel = metamodelService.getMetamodelById(model.conformsTo);
      if (!metamodel) continue;

      for (const element of diagram.elements) {
        const targetMetaClass = metamodel.classes.find(c => c.id === element.modelElementId);
        if (!targetMetaClass) continue;

        // Collect allowed attribute names from this class and its ancestors
        const allowedNames = new Set<string>();
        const collectAttributes = (cls: MetaClass) => {
          if (!cls) return;
          cls.attributes.forEach(a => allowedNames.add(a.name));
          if (cls.superTypes && cls.superTypes.length > 0) {
            for (const superId of cls.superTypes) {
              const superClass = metamodel.classes.find(c => c.id === superId);
              if (superClass) collectAttributes(superClass);
            }
          }
        };
        collectAttributes(targetMetaClass);

        // Prune keys not in allowed names or visualization attributes
        for (const key of Object.keys(element.style || {})) {
          if (!allowedNames.has(key) && !visualizationAttributes.has(key)) {
            delete (element.style as any)[key];
          }
        }
      }
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.diagrams));
    } catch (error) {
      console.error('Error saving diagrams to localStorage:', error);
    }
  }

  getAllDiagrams(): Diagram[] {
    return [...this.diagrams];
  }

  getDiagramById(id: string): Diagram | undefined {
    return this.diagrams.find(d => d.id === id);
  }

  getDiagramsByModelId(modelId: string): Diagram[] {
    return this.diagrams.filter(d => d.modelId === modelId);
  }

  createDiagram(name: string, modelId: string): Diagram {
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
    this.saveToStorage();
    return newDiagram;
  }

  deleteDiagram(id: string): boolean {
    const initialLength = this.diagrams.length;
    this.diagrams = this.diagrams.filter(d => d.id !== id);
    const result = initialLength !== this.diagrams.length;
    if (result) {
      this.saveToStorage();
    }
    return result;
  }

  /**
   * Add a new element to a diagram
   * @param diagramId The diagram ID
   * @param modelElementId The model element ID (metaclass) 
   * @param type The element type ('node' or 'edge')
   * @param x X position (optional)
   * @param y Y position (optional)
   * @param width Width (optional)
   * @param height Height (optional)
   * @param sourceId Source element ID for edges (optional)
   * @param targetId Target element ID for edges (optional)
   * @param style Style properties (optional)
   * @param referenceAttributes Attributes for references (optional)
   * @param points Control points for edge routing (optional)
   * @returns The newly created element or null if diagram not found
   */
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
    style: Record<string, any> = {},
    referenceAttributes: Record<string, any> = {},
    points?: Array<{x: number, y: number}>
  ): DiagramElement | null {
    console.log('Adding element:', {
      diagramId,
      modelElementId,
      type,
      x, y, width, height,
      sourceId, targetId,
      style,
      referenceAttributes,
      points
    });
    
    const diagramIndex = this.diagrams.findIndex(d => d.id === diagramId);
    if (diagramIndex === -1) {
      console.error('Diagram not found:', diagramId);
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
    const diagram = { ...this.diagrams[diagramIndex] };
    diagram.elements.push(newElement);
    
    // Update the diagram in our collection
    this.diagrams[diagramIndex] = diagram;
    this.saveToStorage();
    
    console.log('Element added successfully:', newElement);
    return newElement;
  }

  updateElement(diagramId: string, elementId: string, updates: Partial<DiagramElement>): boolean {
    const diagram = this.getDiagramById(diagramId);
    if (!diagram) return false;

    const elementIndex = diagram.elements.findIndex(e => e.id === elementId);
    if (elementIndex === -1) return false;

    diagram.elements[elementIndex] = {
      ...diagram.elements[elementIndex],
      ...updates,
      id: elementId // Ensure ID doesn't change
    };

    this.saveToStorage();
    return true;
  }

  updateGridSettings(diagramId: string, gridSettings: { sizeX: number; sizeY: number }): boolean {
    const diagram = this.getDiagramById(diagramId);
    if (!diagram) return false;

    diagram.gridSettings = gridSettings;
    this.saveToStorage();
    return true;
  }

  deleteElement(diagramId: string, elementId: string): boolean {
    const diagram = this.getDiagramById(diagramId);
    if (!diagram) return false;

    const initialLength = diagram.elements.length;
    diagram.elements = diagram.elements.filter(e => e.id !== elementId);
    
    // Also remove edges connected to this element if it's a node
    if (initialLength !== diagram.elements.length) {
      diagram.elements = diagram.elements.filter(e => 
        e.type !== 'edge' || (e.sourceId !== elementId && e.targetId !== elementId)
      );
      this.saveToStorage();
    }

    return initialLength !== diagram.elements.length;
  }

  getElementById(diagramId: string, elementId: string): DiagramElement | undefined {
    const diagram = this.getDiagramById(diagramId);
    if (!diagram) return undefined;
    return diagram.elements.find(e => e.id === elementId);
  }
  
  // Get the corresponding model element for a diagram element
  getModelElement(diagramId: string, elementId: string): ModelElement | undefined {
    const diagram = this.getDiagramById(diagramId);
    if (!diagram) return undefined;
    
    const diagramElement = diagram.elements.find(e => e.id === elementId);
    if (!diagramElement) return undefined;
    
    const model = modelService.getModelById(diagram.modelId);
    if (!model) return undefined;
    
    return model.elements.find(e => e.id === diagramElement.modelElementId);
  }

  // Get all diagram elements representing a specific model element
  getDiagramElementsByModelElement(diagramId: string, modelElementId: string): DiagramElement[] {
    const diagram = this.getDiagramById(diagramId);
    if (!diagram) return [];
    
    return diagram.elements.filter(e => e.modelElementId === modelElementId);
  }
  
  // Remove diagram elements when their model element is deleted
  removeElementsForModelElement(modelId: string, modelElementId: string): void {
    const affectedDiagrams = this.getDiagramsByModelId(modelId);
    
    let changed = false;
    affectedDiagrams.forEach(diagram => {
      const initialLength = diagram.elements.length;
      diagram.elements = diagram.elements.filter(e => e.modelElementId !== modelElementId);
      
      // Also remove edges connected to this model element
      diagram.elements = diagram.elements.filter(e => {
        if (e.type !== 'edge') return true;
        
        // Check if the edge's source or target is connected to the removed model element
        const sourceElement = diagram.elements.find(se => se.id === e.sourceId);
        const targetElement = diagram.elements.find(te => te.id === e.targetId);
        
        return (sourceElement && targetElement);
      });
      
      if (initialLength !== diagram.elements.length) {
        changed = true;
      }
    });
    
    if (changed) {
      this.saveToStorage();
    }
  }

  /**
   * Export a diagram to a JSON file
   * @param diagramId The ID of the diagram to export
   * @returns JSON string of the diagram or null if diagram not found
   */
  exportDiagramToJSON(diagramId: string): string | null {
    const diagram = this.getDiagramById(diagramId);
    if (!diagram) return null;
    
    // Create a deep copy of the diagram to avoid reference issues
    const diagramCopy = JSON.parse(JSON.stringify(diagram));
    return JSON.stringify(diagramCopy, null, 2);
  }

  /**
   * Import a diagram from a JSON string
   * @param jsonData JSON string containing the diagram data
   * @returns The imported diagram or null if the import failed
   */
  importDiagramFromJSON(jsonData: string): Diagram | null {
    try {
      const parsedData = JSON.parse(jsonData);
      
      // Validate that it's a diagram object
      if (!parsedData.id || !parsedData.name || !parsedData.modelId || !Array.isArray(parsedData.elements)) {
        console.error('Invalid diagram data format');
        return null;
      }
      
      // Check if model exists
      const modelExists = modelService.getModelById(parsedData.modelId);
      if (!modelExists) {
        console.error('Referenced model does not exist:', parsedData.modelId);
        return null;
      }
      
      // Check if a diagram with this ID already exists
      const existingDiagramIndex = this.diagrams.findIndex(d => d.id === parsedData.id);
      
      // Generate a new ID if this diagram already exists
      if (existingDiagramIndex >= 0) {
        parsedData.id = uuidv4();
        parsedData.name = `${parsedData.name} (Imported)`;
      }
      
      // Add the diagram to the collection
      this.diagrams.push(parsedData);
      this.saveToStorage();
      
      return parsedData;
    } catch (error) {
      console.error('Error importing diagram:', error);
      return null;
    }
  }
}

export const diagramService = new DiagramService(); 