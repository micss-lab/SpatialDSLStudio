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
      const importedDiagrams = Array.isArray(parsedData) ? parsedData : [parsedData];
      
      for (const importedDiagram of importedDiagrams) {
        // Validate that it's a diagram/view object.
        if (
          !importedDiagram.id ||
          !importedDiagram.name ||
          !importedDiagram.modelId ||
          !Array.isArray(importedDiagram.elements)
        ) {
          console.error('Invalid diagram data format');
          return { diagram: null, diagrams: [] };
        }

        // Check if model exists
        const modelExists = modelService.getModelById(importedDiagram.modelId);
        if (!modelExists) {
          console.error('Referenced model does not exist:', importedDiagram.modelId);
          return { diagram: null, diagrams: [] };
        }

        const normalizedDiagram: Diagram = {
          ...importedDiagram,
          elements: importedDiagram.elements || [],
          includedElementIds: importedDiagram.includedElementIds || [],
          schemaVersion: importedDiagram.schemaVersion || 2,
          migrationWarnings: importedDiagram.migrationWarnings || []
        };

        diagrams.push(normalizedDiagram);
        saveCallback(normalizedDiagram);
      }
      
      return { diagram: diagrams[0] || null, diagrams };
    } catch (error) {
      console.error('Error importing diagram:', error);
      return { diagram: null, diagrams };
    }
  }
}

export const diagramImportExportService = new DiagramImportExportService();
