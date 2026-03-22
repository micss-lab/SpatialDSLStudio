import { v4 as uuidv4 } from 'uuid';
import { Diagram } from '../../models/types';
import { modelService } from '../model';

/**
 * Service for importing and exporting diagrams
 */
export class DiagramImportExportService {
  /**
   * Export a diagram to a JSON file
   */
  exportDiagramToJSON(diagram: Diagram): string | null {
    if (!diagram) return null;
    
    // Create a deep copy of the diagram to avoid reference issues
    const diagramCopy = JSON.parse(JSON.stringify(diagram));
    
    // Remap 3D dimension properties to match UI labels for clarity in export
    diagramCopy.elements.forEach((element: any) => {
      if (element.style) {
        // In the 3D diagram UI:
        // - Width (X-axis) is stored as heightMm
        // - Length (Y-axis) is stored as widthMm
        // - Height is stored as depthMm
        // Remap to more intuitive names for export
        if (element.style.heightMm !== undefined) {
          element.style.width = element.style.heightMm;
        }
        if (element.style.widthMm !== undefined) {
          element.style.length = element.style.widthMm;
        }
        if (element.style.depthMm !== undefined) {
          element.style.height = element.style.depthMm;
        }
      }
    });
    
    return JSON.stringify(diagramCopy, null, 2);
  }

  /**
   * Import a diagram from a JSON string
   */
  importDiagramFromJSON(
    jsonData: string,
    saveCallback: (diagram: Diagram) => void
  ): { diagram: Diagram | null; diagrams: Diagram[] } {
    const diagrams: Diagram[] = [];
    
    try {
      const parsedData = JSON.parse(jsonData);
      
      // Validate that it's a diagram object
      if (!parsedData.id || !parsedData.name || !parsedData.modelId || !Array.isArray(parsedData.elements)) {
        console.error('Invalid diagram data format');
        return { diagram: null, diagrams };
      }
      
      // Check if model exists
      const modelExists = modelService.getModelById(parsedData.modelId);
      if (!modelExists) {
        console.error('Referenced model does not exist:', parsedData.modelId);
        return { diagram: null, diagrams };
      }
      
      // Check if a diagram with this ID already exists
      const existingDiagramIndex = diagrams.findIndex(d => d.id === parsedData.id);
      
      // Generate a new ID if this diagram already exists
      if (existingDiagramIndex >= 0) {
        parsedData.id = uuidv4();
        parsedData.name = `${parsedData.name} (Imported)`;
      }
      
      // Add the diagram to the collection
      diagrams.push(parsedData);
      saveCallback(parsedData);
      
      return { diagram: parsedData, diagrams };
    } catch (error) {
      console.error('Error importing diagram:', error);
      return { diagram: null, diagrams };
    }
  }
}

export const diagramImportExportService = new DiagramImportExportService();
