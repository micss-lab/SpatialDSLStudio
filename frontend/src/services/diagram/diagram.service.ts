import {
  Diagram,
  DiagramElement,
  MetaClass,
  MetaReference,
  Metamodel,
  ModelElement,
  ModelElementPresentation,
  RepresentationDescription,
  RepresentationPinMapping,
} from '../../models/types';
import { diagramCrudService } from './diagram-crud.service';
import { diagramElementCrudService } from './diagram-element-crud.service';
import { diagramElementQueryService } from './diagram-element-query.service';
import { diagramMigrationService } from './diagram-migration.service';
import { diagramApiSyncService } from './diagram-api-sync.service';
import { diagramImportExportService } from './diagram-import-export.service';
import { viewProjectionService } from './view-projection.service';
import { modelService } from '../model';
import { viewpointService } from '../viewpoint.service';
import { metamodelService } from '../metamodel';

/**
 * Main service that orchestrates all diagram-related operations
 */
export interface PinCreationOption {
  mappingId: string;
  pinMetaClassId: string;
  pinMetaClassName: string;
  ownerElementId: string;
  label: string;
  direction?: RepresentationPinMapping['direction'];
  defaultSide: NonNullable<ModelElementPresentation['attachmentSide']>;
  defaultOffsetRatio: number;
}

export interface PinAttachmentDetails {
  isPin: boolean;
  ownerElementId?: string;
  allowedSides?: NonNullable<RepresentationPinMapping['allowedSides']>;
  defaultSide?: ModelElementPresentation['attachmentSide'];
  defaultOffsetRatio?: number;
}

class DiagramService {
  private initPromise: Promise<void> | null = null;

  private async initialize(): Promise<void> {
    try {
      // Load from API only
      await this.loadFromAPI();
    } catch (error) {
      console.error('API load failed:', error);
      // Start with empty state - no localStorage fallback
      diagramCrudService.clearDiagrams();
    }
  }

  private async loadFromAPI(): Promise<void> {
    const [data] = await Promise.all([
      diagramApiSyncService.loadFromAPI(),
      viewpointService.loadViewpoints().catch(error => {
        console.error('Viewpoint load failed:', error);
        return [];
      }),
    ]);
    if (data && Array.isArray(data)) {
      diagramCrudService.setDiagrams(data);
      this.migrateDiagrams();
    }
  }

  private migrateDiagrams(): void {
    const diagrams = diagramCrudService.getDiagramsRef();
    diagramMigrationService.migrateDiagrams(diagrams);
    diagramMigrationService.pruneDiagramElementStyles(diagrams);
  }

  private saveToStorage(changedDiagramId?: string): void {
    // Sync to API only - no localStorage
    if (changedDiagramId) {
      const diagram = diagramCrudService.getDiagramById(changedDiagramId);
      if (diagram) {
        diagramApiSyncService.syncDiagramToAPI(diagram);
        window.dispatchEvent(new CustomEvent('view:changed', { detail: { diagramId: changedDiagramId } }));
        window.dispatchEvent(new Event('storage'));
      }
    }
  }

  // Diagram CRUD operations
  getAllDiagrams(): Diagram[] {
    return diagramCrudService.getAllDiagrams().map(diagram => viewProjectionService.materializeDiagram(diagram));
  }

  getDiagramById(id: string): Diagram | undefined {
    const diagram = diagramCrudService.getDiagramById(id);
    return diagram ? viewProjectionService.materializeDiagram(diagram) : undefined;
  }

  getDiagramsByModelId(modelId: string): Diagram[] {
    return diagramCrudService.getDiagramsByModelId(modelId).map(diagram => viewProjectionService.materializeDiagram(diagram));
  }

  createDiagram(
    name: string,
    modelId: string,
    options: { viewpointId?: string; representationDescriptionId?: string; description?: string } = {}
  ): Diagram {
    return diagramCrudService.createDiagram(name, modelId, (diagram) => {
      this.saveToStorage();
      diagramApiSyncService.saveDiagramToAPI(diagram);
    }, options);
  }

  deleteDiagram(id: string): boolean {
    return diagramCrudService.deleteDiagram(
      id,
      () => this.saveToStorage(),
      (id) => diagramApiSyncService.deleteDiagramFromAPI(id),
      (id) => diagramApiSyncService.removeSyncedDiagram(id)
    );
  }

  updateGridSettings(diagramId: string, gridSettings: { sizeX: number; sizeY: number }): boolean {
    const diagram = diagramCrudService.getDiagramById(diagramId);
    if (!diagram) return false;

    return diagramCrudService.updateGridSettings(
      diagram,
      gridSettings,
      (id) => this.saveToStorage(id)
    );
  }

  // Element CRUD operations
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
    const diagram = diagramCrudService.getDiagramById(diagramId);
    if (!diagram) return null;

    if (type === 'node') {
      const model = modelService.getModelById(diagram.modelId);
      const targetModelElement = model?.elements.find(element => element.id === modelElementId || element.id === style.linkedModelElementId);

      if (model && targetModelElement) {
        const added = this.addModelElementToView(diagramId, targetModelElement.id, {
          position2D: {
            x: typeof x === 'number' ? x : 0,
            y: typeof y === 'number' ? y : 0,
          },
          size2D: {
            width: typeof width === 'number' ? width : 120,
            height: typeof height === 'number' ? height : 80,
          },
          ...(style.position3D ? { position3D: style.position3D } : {}),
          ...(typeof style.rotationZ === 'number' ? { rotationZ: style.rotationZ } : {}),
          ...(
            ['widthMm', 'heightMm', 'depthMm'].some(key => typeof style[key] === 'number')
              ? {
                size3D: {
                  widthMm: typeof style.widthMm === 'number' ? style.widthMm : 500,
                  heightMm: typeof style.heightMm === 'number' ? style.heightMm : 800,
                  depthMm: typeof style.depthMm === 'number' ? style.depthMm : 200,
                }
              }
              : {}
          ),
        });

        if (!added) return null;
        const updatedDiagram = this.getDiagramById(diagramId);
        return updatedDiagram?.elements.find(element => element.id === targetModelElement.id) || null;
      }
    }

    if (type === 'edge' && sourceId && targetId) {
      const model = modelService.getModelById(diagram.modelId);
      if (model) {
        const existingConnections = model.connections || [];
        if (!existingConnections.some(connection => connection.id === modelElementId || (
          connection.sourceId === sourceId &&
          connection.targetId === targetId &&
          (connection.referenceId === modelElementId || connection.referenceName === style.name)
        ))) {
          modelService.updateModel(diagram.modelId, {
            connections: [
              ...existingConnections,
              {
                id: modelElementId || `${sourceId}-${targetId}`,
                sourceId,
                targetId,
                referenceId: modelElementId,
                referenceName: style.name,
                type: style.name || modelElementId,
                attributes: referenceAttributes,
                bendPoints2D: points,
              }
            ]
          });
        }
        return this.getDiagramById(diagramId)?.elements.find(element => element.sourceId === sourceId && element.targetId === targetId) || null;
      }
    }

    return diagramElementCrudService.addElement(
      diagram,
      modelElementId,
      type,
      (id) => this.saveToStorage(id),
      x, y, width, height,
      sourceId, targetId,
      style,
      referenceAttributes,
      points
    );
  }

  /**
   * Spatial languages persist one position per projection (2D canvas vs 3D world) that
   * share the same millimeter ground-plane values. Keep the two fields in sync: a 3D move
   * always mirrors to position2D, while a 2D move mirrors to position3D only when the
   * element already carries a world-space position, so pure 2D notations never gain one.
   *
   * Exception: legacy spatial examples keep a schematic diagram layout whose 2D
   * coordinates intentionally differ from the world-space millimeters. Mirroring across
   * such a record would clobber one projection with the other's units, so write-through
   * applies only when the stored fields are absent or already aligned.
   */
  private applyPositionWriteThrough(
    modelElement: ModelElement | undefined,
    presentation: ModelElementPresentation
  ): ModelElementPresentation {
    const existing2D = modelElement?.presentation?.position2D;
    const existing3D = modelElement?.presentation?.position3D;
    const aligned =
      !existing2D ||
      !existing3D ||
      (existing2D.x === existing3D.x && existing2D.y === existing3D.y);
    if (!aligned) return presentation;
    if (presentation.position3D && !presentation.position2D) {
      return {
        ...presentation,
        position2D: { x: presentation.position3D.x, y: presentation.position3D.y },
      };
    }
    if (
      presentation.position2D &&
      !presentation.position3D &&
      modelElement?.presentation?.position3D
    ) {
      return {
        ...presentation,
        position3D: { x: presentation.position2D.x, y: presentation.position2D.y },
      };
    }
    return presentation;
  }

  updateElement(diagramId: string, elementId: string, updates: Partial<DiagramElement>): boolean {
    const diagram = diagramCrudService.getDiagramById(diagramId);
    if (!diagram) return false;

    const includedElementIds = viewProjectionService.getIncludedElementIds(diagram);
    if (includedElementIds.includes(elementId)) {
      const model = modelService.getModelById(diagram.modelId);
      const modelElement = model?.elements.find(element => element.id === elementId);
      if (!model || !modelElement) return false;

      const presentation: ModelElementPresentation = {};
      if (typeof updates.x === 'number' || typeof updates.y === 'number') {
        presentation.position2D = {
          x: typeof updates.x === 'number' ? updates.x : modelElement.presentation?.position2D?.x || 0,
          y: typeof updates.y === 'number' ? updates.y : modelElement.presentation?.position2D?.y || 0,
        };
      }
      if (typeof updates.width === 'number' || typeof updates.height === 'number') {
        presentation.size2D = {
          width: typeof updates.width === 'number' ? updates.width : modelElement.presentation?.size2D?.width || 120,
          height: typeof updates.height === 'number' ? updates.height : modelElement.presentation?.size2D?.height || 80,
        };
      }

      const styleUpdates = updates.style || {};
      if (styleUpdates.position3D) {
        presentation.position3D = styleUpdates.position3D;
      }
      if (typeof styleUpdates.rotationZ === 'number') {
        presentation.rotationZ = styleUpdates.rotationZ;
      }
      if (['widthMm', 'heightMm', 'depthMm'].some(key => typeof styleUpdates[key] === 'number')) {
        presentation.size3D = {
          widthMm: typeof styleUpdates.widthMm === 'number' ? styleUpdates.widthMm : modelElement.presentation?.size3D?.widthMm || 500,
          heightMm: typeof styleUpdates.heightMm === 'number' ? styleUpdates.heightMm : modelElement.presentation?.size3D?.heightMm || 800,
          depthMm: typeof styleUpdates.depthMm === 'number' ? styleUpdates.depthMm : modelElement.presentation?.size3D?.depthMm || 200,
        };
      }
      if (Object.prototype.hasOwnProperty.call(styleUpdates, 'appearance')) {
        try {
          presentation.appearance = styleUpdates.appearance === undefined || styleUpdates.appearance === null || styleUpdates.appearance === ''
            ? undefined
            : typeof styleUpdates.appearance === 'string'
              ? JSON.parse(styleUpdates.appearance)
              : styleUpdates.appearance;
        } catch {
          presentation.appearance = modelElement.presentation?.appearance;
        }
      }

      const {
        position,
        position2D,
        position3D,
        widthMm,
        heightMm,
        depthMm,
        rotationZ,
        appearance,
        linkedModelElementId,
        modelElementRefId,
        ...modelStyleUpdates
      } = styleUpdates;

      const syncedPresentation = this.applyPositionWriteThrough(modelElement, presentation);
      const hasPresentationChanges = Object.keys(syncedPresentation).length > 0;
      const hasStyleChanges = Object.keys(modelStyleUpdates).length > 0;

      if (hasPresentationChanges) {
        modelService.updateModelElementPresentation(diagram.modelId, elementId, syncedPresentation);
      }
      if (hasStyleChanges) {
        modelService.updateModelElementProperties(diagram.modelId, elementId, modelStyleUpdates);
      }

      return hasPresentationChanges || hasStyleChanges;
    }

    return diagramElementCrudService.updateElement(
      diagram,
      elementId,
      updates,
      (id) => this.saveToStorage(id)
    );
  }

  deleteElement(diagramId: string, elementId: string): boolean {
    const diagram = diagramCrudService.getDiagramById(diagramId);
    if (!diagram) return false;

    const includedElementIds = viewProjectionService.getIncludedElementIds(diagram);
    if (includedElementIds.includes(elementId)) {
      diagram.includedElementIds = includedElementIds.filter(id => id !== elementId);
      this.saveToStorage(diagram.id);
      return true;
    }

    return diagramElementCrudService.deleteElement(
      diagram,
      elementId,
      (id) => this.saveToStorage(id)
    );
  }

  // Element query operations
  getElementById(diagramId: string, elementId: string): DiagramElement | undefined {
    const diagram = this.getDiagramById(diagramId);
    if (!diagram) return undefined;

    return diagramElementQueryService.getElementById(diagram, elementId);
  }

  addModelElementToView(
    diagramId: string,
    modelElementId: string,
    presentation?: ModelElementPresentation
  ): boolean {
    const diagram = diagramCrudService.getDiagramById(diagramId);
    if (!diagram) return false;

    const model = modelService.getModelById(diagram.modelId);
    if (!model?.elements.some(element => element.id === modelElementId)) return false;

    const includedElementIds = viewProjectionService.getIncludedElementIds(diagram);
    if (includedElementIds.includes(modelElementId)) return false;

    diagram.includedElementIds = [...includedElementIds, modelElementId];
    diagram.schemaVersion = 2;

    if (presentation) {
      modelService.updateModelElementPresentation(diagram.modelId, modelElementId, presentation);
    }

    this.saveToStorage(diagram.id);
    return true;
  }

  async updateModelElementPresentationInView(
    diagramId: string,
    modelElementId: string,
    presentation: ModelElementPresentation
  ): Promise<boolean> {
    const diagram = diagramCrudService.getDiagramById(diagramId);
    if (!diagram) return false;

    const modelElement = modelService
      .getModelById(diagram.modelId)
      ?.elements.find(element => element.id === modelElementId);
    const syncedPresentation = this.applyPositionWriteThrough(modelElement, presentation);

    const updatedLocally = modelService.updateModelElementPresentation(
      diagram.modelId,
      modelElementId,
      syncedPresentation
    );
    if (!updatedLocally) return false;

    try {
      const updatedDiagram = await diagramApiSyncService.updateModelElementPresentation(
        diagramId,
        modelElementId,
        syncedPresentation
      );
      const diagrams = diagramCrudService.getDiagramsRef();
      const diagramIndex = diagrams.findIndex(candidate => candidate.id === updatedDiagram.id);
      if (diagramIndex >= 0) {
        diagrams[diagramIndex] = updatedDiagram;
      }
    } catch (error) {
      console.error('Error updating model element presentation from view:', error);
    }

    window.dispatchEvent(new CustomEvent('view:changed', { detail: { diagramId } }));
    window.dispatchEvent(new Event('storage'));
    return true;
  }

  async createModelElementInView(
    diagramId: string,
    metaClassId: string,
    presentation?: ModelElementPresentation,
    style: Record<string, any> = {}
  ): Promise<DiagramElement | null> {
    const diagram = diagramCrudService.getDiagramById(diagramId);
    if (!diagram) return null;

    try {
      const result = await diagramApiSyncService.createModelElementInView(
        diagramId,
        metaClassId,
        presentation,
        style
      );

      const model = modelService.getModelById(result.diagram.modelId);
      if (model && !model.elements.some(element => element.id === result.modelElement.id)) {
        modelService.updateModel(model.id, {
          elements: [...model.elements, result.modelElement],
        });
      }

      const diagrams = diagramCrudService.getDiagramsRef();
      const diagramIndex = diagrams.findIndex(candidate => candidate.id === result.diagram.id);
      if (diagramIndex >= 0) {
        diagrams[diagramIndex] = result.diagram;
      } else {
        diagrams.push(result.diagram);
      }

      window.dispatchEvent(new CustomEvent('view:changed', { detail: { diagramId } }));
      window.dispatchEvent(new Event('storage'));

      const materializedDiagram = this.getDiagramById(diagramId);
      return materializedDiagram?.elements.find(element => element.id === result.modelElement.id) || null;
    } catch (error) {
      console.error('Error creating model element in view:', error);
      return null;
    }
  }

  getCompatiblePinCreationOptions(diagramId: string, ownerElementId: string): PinCreationOption[] {
    const context = this.getRepresentationContext(diagramId);
    if (!context) return [];

    const { model, metamodel, representationDescription } = context;
    const ownerElement = model.elements.find(element => element.id === ownerElementId);
    if (!ownerElement || !representationDescription?.pinMappings?.length) return [];

    const options: PinCreationOption[] = [];
    const seen = new Set<string>();

    for (const mapping of representationDescription.pinMappings) {
      if (!this.isMetaClassCompatible(ownerElement.modelElementId, mapping.ownerMetaClassIds, metamodel)) {
        continue;
      }

      for (const pinMetaClass of metamodel.classes) {
        if (pinMetaClass.abstract) continue;
        if (!this.isMetaClassCompatible(pinMetaClass.id, mapping.pinMetaClassIds, metamodel)) continue;
        if (!this.isMetaClassVisibleInRepresentation(representationDescription, pinMetaClass.id)) continue;
        if (!this.isMetaClassCreatableInRepresentation(representationDescription, pinMetaClass.id)) continue;
        if (!this.resolveAttachmentReferenceName(metamodel, pinMetaClass.id, ownerElement.modelElementId, mapping)) continue;

        const key = `${mapping.id}:${pinMetaClass.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        options.push({
          mappingId: mapping.id,
          pinMetaClassId: pinMetaClass.id,
          pinMetaClassName: pinMetaClass.name,
          ownerElementId: ownerElement.id,
          label: this.getPinCreationLabel(pinMetaClass, mapping),
          direction: mapping.direction,
          defaultSide: this.getDefaultAttachmentSide(mapping),
          defaultOffsetRatio: this.getDefaultAttachmentOffsetRatio(mapping),
        });
      }
    }

    return options;
  }

  async createPinForOwnerInView(
    diagramId: string,
    ownerElementId: string,
    pinMetaClassId: string,
    mappingId?: string
  ): Promise<DiagramElement | null> {
    const context = this.getRepresentationContext(diagramId);
    if (!context) return null;

    const { diagram, model, metamodel, representationDescription } = context;
    const ownerElement = model.elements.find(element => element.id === ownerElementId);
    const pinMetaClass = metamodel.classes.find(cls => cls.id === pinMetaClassId);

    if (!ownerElement || !pinMetaClass || pinMetaClass.abstract) return null;

    const mapping = this.findCompatiblePinMapping(
      representationDescription,
      metamodel,
      pinMetaClassId,
      ownerElement.modelElementId,
      mappingId
    );

    if (!mapping) {
      console.error('No compatible pin mapping found for owner and pin metaclasses');
      return null;
    }

    if (!this.isMetaClassVisibleInRepresentation(representationDescription, pinMetaClassId)
        || !this.isMetaClassCreatableInRepresentation(representationDescription, pinMetaClassId)) {
      console.error('Pin metaclass is not visible or creatable in this representation');
      return null;
    }

    const attachmentReferenceName = this.resolveAttachmentReferenceName(
      metamodel,
      pinMetaClassId,
      ownerElement.modelElementId,
      mapping
    );

    if (!attachmentReferenceName) {
      console.error('No valid semantic owner reference exists for this pin mapping');
      return null;
    }

    const presentation: ModelElementPresentation = {
      attachedToElementId: ownerElementId,
      attachmentSide: this.getDefaultAttachmentSide(mapping),
      attachmentOffsetRatio: this.getDefaultAttachmentOffsetRatio(mapping),
      size2D: { width: 16, height: 16 },
    };

    const createdElement = await this.createModelElementInView(
      diagramId,
      pinMetaClassId,
      presentation,
      {
        name: this.getPinInstanceName(pinMetaClass, mapping),
      }
    );

    if (!createdElement) return null;

    const createdModelElementId = createdElement.style?.linkedModelElementId || createdElement.id;
    this.persistPinOwnerReference(diagram.modelId, createdModelElementId, attachmentReferenceName, ownerElementId);

    window.dispatchEvent(new CustomEvent('view:changed', { detail: { diagramId } }));
    window.dispatchEvent(new Event('storage'));

    const materializedDiagram = this.getDiagramById(diagramId);
    return materializedDiagram?.elements.find(element => element.id === createdModelElementId) || null;
  }

  getPinAttachmentDetails(diagramId: string, elementId: string): PinAttachmentDetails {
    const context = this.getRepresentationContext(diagramId);
    if (!context) return { isPin: false };

    const { model, metamodel, representationDescription } = context;
    const modelElement = model.elements.find(element => element.id === elementId);
    if (!modelElement) return { isPin: false };

    const mapping = this.findPinMappingForElement(representationDescription, metamodel, modelElement.modelElementId);
    const ownerElementId = modelElement.presentation?.attachedToElementId
      || this.findSemanticOwnerId(modelElement, mapping?.attachmentReferenceName);

    return {
      isPin: Boolean(mapping || modelElement.presentation?.attachedToElementId),
      ownerElementId,
      allowedSides: mapping?.allowedSides,
      defaultSide: mapping ? this.getDefaultAttachmentSide(mapping) : modelElement.presentation?.attachmentSide,
      defaultOffsetRatio: mapping ? this.getDefaultAttachmentOffsetRatio(mapping) : modelElement.presentation?.attachmentOffsetRatio,
    };
  }

  isPinElementInView(diagramId: string, elementId: string): boolean {
    return this.getPinAttachmentDetails(diagramId, elementId).isPin;
  }

  addAllModelElementsToView(diagramId: string): boolean {
    const diagram = diagramCrudService.getDiagramById(diagramId);
    if (!diagram) return false;

    const model = modelService.getModelById(diagram.modelId);
    if (!model) return false;

    const includedSet = new Set(viewProjectionService.getIncludedElementIds(diagram));
    const { representationDescription } = viewpointService.resolveRepresentationDescription(diagram);
    const visibleMetaClassIds = new Set(representationDescription?.visibleMetaClassIds || []);
    model.elements
      .filter(element => visibleMetaClassIds.size === 0 || visibleMetaClassIds.has(element.modelElementId))
      .forEach(element => includedSet.add(element.id));
    diagram.includedElementIds = Array.from(includedSet);
    diagram.schemaVersion = 2;
    this.saveToStorage(diagram.id);
    return true;
  }

  getRemainingModelElements(diagramId: string): ModelElement[] {
    const diagram = diagramCrudService.getDiagramById(diagramId);
    if (!diagram) return [];

    const model = modelService.getModelById(diagram.modelId);
    if (!model) return [];

    const includedSet = new Set(viewProjectionService.getIncludedElementIds(diagram));
    return model.elements.filter(element => !includedSet.has(element.id));
  }
  
  getModelElement(diagramId: string, elementId: string): ModelElement | undefined {
    const diagram = this.getDiagramById(diagramId);
    if (!diagram) return undefined;

    return diagramElementQueryService.getModelElement(diagram, elementId);
  }

  getDiagramElementsByModelElement(diagramId: string, modelElementId: string): DiagramElement[] {
    const diagram = this.getDiagramById(diagramId);
    if (!diagram) return [];

    return diagramElementQueryService.getDiagramElementsByModelElement(diagram, modelElementId);
  }
  
  removeElementsForModelElement(modelId: string, modelElementId: string): void {
    const diagrams = diagramCrudService.getDiagramsRef();
    diagramElementQueryService.removeElementsForModelElement(
      diagrams,
      modelId,
      modelElementId,
      () => this.saveToStorage()
    );
  }

  // Import/Export operations
  exportDiagramToJSON(diagramId: string): string | null {
    const diagram = this.getDiagramById(diagramId);
    if (!diagram) return null;

    return diagramImportExportService.exportDiagramToJSON(diagram);
  }

  importDiagramFromJSON(jsonData: string): Diagram | null {
    const result = diagramImportExportService.importDiagramFromJSON(
      jsonData,
      (diagram) => {
        // Upsert into the local collection while preserving the ID from JSON.
        const diagrams = diagramCrudService.getDiagramsRef();
        const existingIndex = diagrams.findIndex(existing => existing.id === diagram.id);
        if (existingIndex >= 0) {
          diagrams[existingIndex] = diagram;
        } else {
          diagrams.push(diagram);
        }
        this.saveToStorage(diagram.id);
      }
    );

    return result.diagram;
  }

  // Cache management
  async clearCacheAndReinitialize(): Promise<void> {
    console.log('DiagramService: Clearing cache and reinitializing');
    diagramCrudService.clearDiagrams();
    diagramApiSyncService.clearSyncState();
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  clearCacheLocal(): void {
    console.log('DiagramService: Clearing cache locally');
    diagramCrudService.clearDiagrams();
    diagramApiSyncService.clearSyncState();
    this.initPromise = null;
  }

  private getRepresentationContext(diagramId: string): {
    diagram: Diagram;
    model: NonNullable<ReturnType<typeof modelService.getModelById>>;
    metamodel: Metamodel;
    representationDescription?: RepresentationDescription;
  } | null {
    const diagram = diagramCrudService.getDiagramById(diagramId);
    if (!diagram) return null;

    const model = modelService.getModelById(diagram.modelId);
    if (!model) return null;

    const metamodel = metamodelService.getMetamodelById(model.conformsTo || model.metamodelId);
    if (!metamodel) return null;

    const { representationDescription } = viewpointService.resolveRepresentationDescription(diagram);
    return { diagram, model, metamodel, representationDescription };
  }

  private findCompatiblePinMapping(
    representationDescription: RepresentationDescription | undefined,
    metamodel: Metamodel,
    pinMetaClassId: string,
    ownerMetaClassId: string,
    mappingId?: string
  ): RepresentationPinMapping | undefined {
    return (representationDescription?.pinMappings || []).find(mapping => {
      if (mappingId && mapping.id !== mappingId) return false;
      return this.isMetaClassCompatible(pinMetaClassId, mapping.pinMetaClassIds, metamodel)
        && this.isMetaClassCompatible(ownerMetaClassId, mapping.ownerMetaClassIds, metamodel);
    });
  }

  private findPinMappingForElement(
    representationDescription: RepresentationDescription | undefined,
    metamodel: Metamodel,
    pinMetaClassId: string
  ): RepresentationPinMapping | undefined {
    return (representationDescription?.pinMappings || []).find(mapping => (
      this.isMetaClassCompatible(pinMetaClassId, mapping.pinMetaClassIds, metamodel)
    ));
  }

  private isMetaClassVisibleInRepresentation(
    representationDescription: RepresentationDescription | undefined,
    metaClassId: string
  ): boolean {
    return !representationDescription?.visibleMetaClassIds?.length
      || representationDescription.visibleMetaClassIds.includes(metaClassId);
  }

  private isMetaClassCreatableInRepresentation(
    representationDescription: RepresentationDescription | undefined,
    metaClassId: string
  ): boolean {
    return !representationDescription?.creatableMetaClassIds?.length
      || representationDescription.creatableMetaClassIds.includes(metaClassId);
  }

  private isMetaClassCompatible(
    metaClassId: string,
    allowedMetaClassIds: string[] | undefined,
    metamodel: Metamodel
  ): boolean {
    if (!allowedMetaClassIds?.length) return true;
    if (allowedMetaClassIds.includes(metaClassId)) return true;

    const visited = new Set<string>();
    const visit = (candidateId: string): boolean => {
      if (visited.has(candidateId)) return false;
      visited.add(candidateId);

      const metaClass = metamodel.classes.find(cls => cls.id === candidateId);
      if (!metaClass) return false;

      return (metaClass.superTypes || []).some(superTypeId => (
        allowedMetaClassIds.includes(superTypeId) || visit(superTypeId)
      ));
    };

    return visit(metaClassId);
  }

  private getAllReferences(metaClass: MetaClass, metamodel: Metamodel): MetaReference[] {
    const inherited = (metaClass.superTypes || [])
      .map(superTypeId => metamodel.classes.find(cls => cls.id === superTypeId))
      .filter((candidate): candidate is MetaClass => Boolean(candidate))
      .flatMap(superType => this.getAllReferences(superType, metamodel));

    const byName = new Map<string, MetaReference>();
    [...inherited, ...(metaClass.references || [])].forEach(reference => {
      byName.set(reference.name, reference);
    });
    return Array.from(byName.values());
  }

  private resolveAttachmentReferenceName(
    metamodel: Metamodel,
    pinMetaClassId: string,
    ownerMetaClassId: string,
    mapping: RepresentationPinMapping
  ): string | undefined {
    const pinMetaClass = metamodel.classes.find(cls => cls.id === pinMetaClassId);
    if (!pinMetaClass) return undefined;

    const references = this.getAllReferences(pinMetaClass, metamodel);
    const findCompatibleReference = (referenceName: string): MetaReference | undefined => {
      const reference = references.find(candidate => (
        candidate.name === referenceName || candidate.id === referenceName
      ));
      return reference && this.isMetaClassCompatible(ownerMetaClassId, [reference.target], metamodel)
        ? reference
        : undefined;
    };

    if (mapping.attachmentReferenceName) {
      return findCompatibleReference(mapping.attachmentReferenceName)?.name;
    }

    return ['owner', 'action', 'node', 'parent']
      .map(findCompatibleReference)
      .find((reference): reference is MetaReference => Boolean(reference))
      ?.name;
  }

  private findSemanticOwnerId(
    modelElement: ModelElement,
    attachmentReferenceName?: string
  ): string | undefined {
    const referenceNames = [
      attachmentReferenceName,
      'owner',
      'action',
      'node',
      'parent',
    ].filter((name): name is string => Boolean(name));

    for (const referenceName of referenceNames) {
      const value = modelElement.references?.[referenceName];
      if (typeof value === 'string') return value;
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    }

    return undefined;
  }

  private getDefaultAttachmentSide(
    mapping: RepresentationPinMapping
  ): NonNullable<ModelElementPresentation['attachmentSide']> {
    const fallbackSide: NonNullable<ModelElementPresentation['attachmentSide']> = mapping.direction === 'output'
      ? 'right'
      : 'left';
    const requestedSide = mapping.defaultSide || fallbackSide;

    return mapping.allowedSides?.length && !mapping.allowedSides.includes(requestedSide)
      ? mapping.allowedSides[0]
      : requestedSide;
  }

  private getDefaultAttachmentOffsetRatio(mapping: RepresentationPinMapping): number {
    return Math.max(0, Math.min(1, mapping.defaultOffsetRatio ?? 0.5));
  }

  private getPinCreationLabel(pinMetaClass: MetaClass, mapping: RepresentationPinMapping): string {
    if (mapping.direction === 'input') return `Add ${pinMetaClass.name}`;
    if (mapping.direction === 'output') return `Add ${pinMetaClass.name}`;
    return `Add ${pinMetaClass.name}`;
  }

  private getPinInstanceName(pinMetaClass: MetaClass, mapping: RepresentationPinMapping): string {
    if (mapping.direction === 'input') return `${pinMetaClass.name}`;
    if (mapping.direction === 'output') return `${pinMetaClass.name}`;
    return pinMetaClass.name;
  }

  private persistPinOwnerReference(
    modelId: string,
    pinElementId: string,
    referenceName: string,
    ownerElementId: string
  ): boolean {
    const updatedViaReferenceService = modelService.setModelElementReference(
      modelId,
      pinElementId,
      referenceName,
      ownerElementId
    );

    if (updatedViaReferenceService) return true;

    const model = modelService.getModelById(modelId);
    if (!model) return false;

    const nextElements = model.elements.map(element => (
      element.id === pinElementId
        ? {
          ...element,
          references: {
            ...(element.references || {}),
            [referenceName]: ownerElementId,
          },
        }
        : element
    ));

    return Boolean(modelService.updateModel(modelId, { elements: nextElements }));
  }
}

export const diagramService = new DiagramService();
