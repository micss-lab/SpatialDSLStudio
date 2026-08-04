import { Diagram } from '../../models/types';
import { modelService } from '../model';
import { normalizePosition3D } from '../spatial';

const finiteStyleFields = ['widthMm', 'heightMm', 'depthMm', 'rotationZ'];

const normalizeSpatialStyle = (style: Record<string, any>, path: string): Record<string, any> => {
  const normalized = { ...style };
  if (style.position3D !== undefined) {
    const position3D = normalizePosition3D(style.position3D);
    if (!position3D) {
      throw new Error(`${path}.position3D must contain finite X, Y, and optional Z numbers`);
    }
    normalized.position3D = position3D;
  }
  finiteStyleFields.forEach(field => {
    if (
      style[field] !== undefined
      && (typeof style[field] !== 'number' || !Number.isFinite(style[field]))
    ) {
      throw new Error(`${path}.${field} must be a finite number`);
    }
  });
  return normalized;
};

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
    try {
      diagramCopy.elements.forEach((element: any, index: number) => {
        if (element.style) {
          element.style = normalizeSpatialStyle(element.style, `elements[${index}].style`);
          // Persisted extents are X=widthMm, Y=heightMm, Z=depthMm. Keep the
          // friendlier legacy aliases in exported diagram JSON.
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
    } catch (error) {
      console.error('Cannot export malformed diagram spatial data:', error);
      return null;
    }
    
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
          elements: (importedDiagram.elements || []).map((element: any, index: number) => ({
            ...element,
            style: normalizeSpatialStyle(element.style || {}, `elements[${index}].style`),
          })),
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
