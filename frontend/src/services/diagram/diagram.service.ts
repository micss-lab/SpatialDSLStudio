import { Diagram, DiagramElement, ModelElement } from '../../models/types';
import { diagramCrudService } from './diagram-crud.service';
import { diagramElementCrudService } from './diagram-element-crud.service';
import { diagramElementQueryService } from './diagram-element-query.service';
import { diagramMigrationService } from './diagram-migration.service';
import { diagramApiSyncService } from './diagram-api-sync.service';
import { diagramImportExportService } from './diagram-import-export.service';

/**
 * Main service that orchestrates all diagram-related operations
 */
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
    const data = await diagramApiSyncService.loadFromAPI();
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
      const diagram = this.getDiagramById(changedDiagramId);
      if (diagram) {
        diagramApiSyncService.syncDiagramToAPI(diagram);
      }
    }
  }

  // Diagram CRUD operations
  getAllDiagrams(): Diagram[] {
    return diagramCrudService.getAllDiagrams();
  }

  getDiagramById(id: string): Diagram | undefined {
    return diagramCrudService.getDiagramById(id);
  }

  getDiagramsByModelId(modelId: string): Diagram[] {
    return diagramCrudService.getDiagramsByModelId(modelId);
  }

  createDiagram(name: string, modelId: string): Diagram {
    return diagramCrudService.createDiagram(name, modelId, (diagram) => {
      this.saveToStorage();
      diagramApiSyncService.saveDiagramToAPI(diagram);
    });
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
    const diagram = this.getDiagramById(diagramId);
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
    const diagram = this.getDiagramById(diagramId);
    if (!diagram) return null;

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

  updateElement(diagramId: string, elementId: string, updates: Partial<DiagramElement>): boolean {
    const diagram = this.getDiagramById(diagramId);
    if (!diagram) return false;

    return diagramElementCrudService.updateElement(
      diagram,
      elementId,
      updates,
      (id) => this.saveToStorage(id)
    );
  }

  deleteElement(diagramId: string, elementId: string): boolean {
    const diagram = this.getDiagramById(diagramId);
    if (!diagram) return false;

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
        // Add to collection and save
        const diagrams = diagramCrudService.getDiagramsRef();
        diagrams.push(diagram);
        this.saveToStorage();
        diagramApiSyncService.saveDiagramToAPI(diagram);
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
}

export const diagramService = new DiagramService();
