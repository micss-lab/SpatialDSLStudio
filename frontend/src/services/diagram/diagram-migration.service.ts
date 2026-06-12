import { Diagram, MetaClass } from '../../models/types';
import { metamodelService } from '../metamodel';
import { modelService } from '../model';

/**
 * Service for diagram migration and cleanup
 */
export class DiagramMigrationService {
  /**
   * Migrate diagrams from old property names if needed
   */
  migrateDiagrams(diagrams: Diagram[]): void {
    diagrams.forEach(diagram => {
      if ((diagram as any).metamodelId && !diagram.modelId) {
        diagram.modelId = (diagram as any).metamodelId;
        delete (diagram as any).metamodelId;
      }
      if (!diagram.gridSettings) {
        diagram.gridSettings = { sizeX: 20000, sizeY: 20000 };
      }
      if (!Array.isArray(diagram.includedElementIds)) {
        diagram.includedElementIds = [];
      }
      diagram.elements.forEach(element => {
        if ((element as any).properties && !element.style) {
          element.style = (element as any).properties;
          delete (element as any).properties;
        }
        if ((element as any).metaClassId && !element.modelElementId) {
          element.modelElementId = (element as any).metaClassId;
          delete (element as any).metaClassId;
        }
        if (!element.style) {
          element.style = {};
        }
        if (element.type === 'node') {
          const linkedModelElementId = element.style.linkedModelElementId || element.style.modelElementRefId;
          if (linkedModelElementId && !diagram.includedElementIds?.includes(linkedModelElementId)) {
            diagram.includedElementIds?.push(linkedModelElementId);
          }
        }
      });
      diagram.schemaVersion = diagram.schemaVersion || 2;
    });
  }

  /**
   * Prune diagram element styles to remove attributes that no longer exist in the metamodel
   */
  pruneDiagramElementStyles(diagrams: Diagram[]): void {
    // Visualization/UI attributes that are always preserved
    const visualizationAttributes = new Set<string>([
      'position', 'appearance', 'position3D', 'color', 'size', 'linkedModelElementId', 'modelElementRefId',
      'widthMm', 'heightMm', 'depthMm', 'rotationZ' // 3D-specific properties
    ]);

    for (const diagram of diagrams) {
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
}

export const diagramMigrationService = new DiagramMigrationService();
