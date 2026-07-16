import { v4 as uuidv4 } from 'uuid';
import { Metamodel, Model, Diagram, CodeGenerationProject, Viewpoint } from '../../models/types';
import smartWarehouseMetamodelData from '../../examples/data/smart-warehouse-metamodel.json';
import smartWarehouseModelData from '../../examples/data/smart-warehouse-model.json';
import smartWarehouseViewsData from '../../examples/data/smart-warehouse-views.json';
import smartWarehouseViewpointsData from '../../examples/data/smart-warehouse-viewpoints.json';
import smartWarehouseProjectData from '../../examples/data/smart-warehouse-project.json';
import activityDiagramMetamodelData from '../../examples/data/activity-diagram-metamodel.json';
import activityDiagramModelData from '../../examples/data/activity-diagram-model.json';
import activityDiagramViewsData from '../../examples/data/activity-diagram-views.json';
import activityDiagramViewpointsData from '../../examples/data/activity-diagram-viewpoints.json';

interface ExampleBundle {
  metamodels: Metamodel[];
  models: Model[];
  views: Diagram[];
  viewpoints: Viewpoint[];
  projects: CodeGenerationProject[];
}

/**
 * Collect every `id` property value found anywhere in the fixture tree.
 * These are the identifiers all cross-references (conformsTo, modelElementId,
 * sourceId, includedElementIds, concrete-syntax map keys, ...) point at.
 */
const collectIds = (node: unknown, ids: Set<string>): void => {
  if (Array.isArray(node)) {
    node.forEach(child => collectIds(child, ids));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'id' && typeof value === 'string' && value) {
        ids.add(value);
      }
      collectIds(value, ids);
    }
  }
};

/**
 * Deep-copy a fixture tree, replacing every string value or object key that
 * matches a collected id. Cross-references stay consistent because the same
 * map is applied to the whole bundle.
 */
const remapNode = (node: any, idMap: Map<string, string>): any => {
  if (typeof node === 'string') {
    return idMap.get(node) || node;
  }
  if (Array.isArray(node)) {
    return node.map(child => remapNode(child, idMap));
  }
  if (node && typeof node === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(node)) {
      result[idMap.get(key) || key] = remapNode(value, idMap);
    }
    return result;
  }
  return node;
};

/**
 * Service for loading example data (metamodels, models, views, projects)
 * This provides default examples that appear when users first open the application.
 *
 * The bundled fixtures ship with fixed UUIDs. If those ids were synced as-is,
 * the first account to seed would own the database rows and every later
 * account's copy would silently conflict with them (see issue #27). The
 * getters therefore serve a bundle remapped to fresh UUIDs, computed once per
 * session so cross-references between artifacts stay consistent.
 *
 * Views are projections of the model — they do not own element instances,
 * only `includedElementIds` referencing model elements.
 */
class ExampleDataService {
  private bundle: ExampleBundle | null = null;

  private getBundle(): ExampleBundle {
    if (!this.bundle) {
      const raw = {
        metamodels: [smartWarehouseMetamodelData, activityDiagramMetamodelData],
        models: [smartWarehouseModelData, activityDiagramModelData],
        views: [...(smartWarehouseViewsData as unknown[]), ...(activityDiagramViewsData as unknown[])],
        viewpoints: [...(smartWarehouseViewpointsData as unknown[]), ...(activityDiagramViewpointsData as unknown[])],
        projects: [smartWarehouseProjectData],
      };

      const ids = new Set<string>();
      collectIds(raw, ids);
      const idMap = new Map<string, string>();
      ids.forEach(id => idMap.set(id, uuidv4()));

      this.bundle = remapNode(raw, idMap) as ExampleBundle;
    }
    return this.bundle;
  }

  getExampleMetamodels(): Metamodel[] {
    return this.getBundle().metamodels;
  }

  getExampleModels(): Model[] {
    return this.getBundle().models;
  }

  /**
   * Returns example views (Diagram type — diagrams are the storage shape for views
   * under the view-projection model).
   */
  getExampleViews(): Diagram[] {
    return this.getBundle().views;
  }

  getExampleViewpoints(): Viewpoint[] {
    return this.getBundle().viewpoints;
  }

  /**
   * The raw fixture viewpoints with their original fixed ids. Accounts that
   * seeded before ids were remapped still hold metamodel rows with those
   * fixed ids, and their example views resolve representation descriptions
   * against them.
   */
  getLegacyExampleViewpoints(): Viewpoint[] {
    return [
      ...(smartWarehouseViewpointsData as unknown as Viewpoint[]),
      ...(activityDiagramViewpointsData as unknown as Viewpoint[]),
    ];
  }

  /** @deprecated Use getExampleViews() — kept for transitional callers. */
  getExampleDiagrams(): Diagram[] {
    return this.getExampleViews();
  }

  getExampleProjects(): CodeGenerationProject[] {
    return this.getBundle().projects;
  }

  /**
   * The isExample* checks match the original fixture ids, identifying legacy
   * copies seeded before ids were remapped per account.
   */
  isExampleMetamodel(metamodelId: string): boolean {
    return (
      metamodelId === smartWarehouseMetamodelData.id ||
      metamodelId === activityDiagramMetamodelData.id
    );
  }

  isExampleModel(modelId: string): boolean {
    return (
      modelId === smartWarehouseModelData.id ||
      modelId === activityDiagramModelData.id
    );
  }

  isExampleView(viewId: string): boolean {
    return (
      (smartWarehouseViewsData as Array<{ id: string }>).some(v => v.id === viewId) ||
      (activityDiagramViewsData as Array<{ id: string }>).some(v => v.id === viewId)
    );
  }

  /** @deprecated Use isExampleView — kept for transitional callers. */
  isExampleDiagram(diagramId: string): boolean {
    return this.isExampleView(diagramId);
  }

  isExampleProject(projectId: string): boolean {
    return projectId === smartWarehouseProjectData.id;
  }
}

export const exampleDataService = new ExampleDataService();
export default exampleDataService;
