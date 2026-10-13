import { v4 as uuidv4 } from 'uuid';
import { Metamodel, Model, Diagram, CodeGenerationProject, Viewpoint } from '../../models/types';
import smartWarehouseMetamodelData from '../../examples/data/smart-warehouse-metamodel.json';
import smartWarehouseModelData from '../../examples/data/smart-warehouse-model.json';
import smartWarehouseViewsData from '../../examples/data/smart-warehouse-views.json';
import smartWarehouseViewpointsData from '../../examples/data/smart-warehouse-viewpoints.json';
import smartWarehouseProjectData from '../../examples/data/smart-warehouse-project.json';
import smartWarehouseOmniverseProjectData from '../../examples/data/smart-warehouse-omniverse-project.json';
import activityDiagramMetamodelData from '../../examples/data/activity-diagram-metamodel.json';
import activityDiagramModelData from '../../examples/data/activity-diagram-model.json';
import activityDiagramViewsData from '../../examples/data/activity-diagram-views.json';
import activityDiagramViewpointsData from '../../examples/data/activity-diagram-viewpoints.json';
import smartHomeMetamodelData from '../../examples/data/smart-home-metamodel.json';
import smartHomeModelData from '../../examples/data/smart-home-model.json';
import smartHomeViewsData from '../../examples/data/smart-home-views.json';
import smartHomeViewpointsData from '../../examples/data/smart-home-viewpoints.json';
import smartHomeProjectData from '../../examples/data/smart-home-project.json';

export interface ExampleBundle {
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
 * session so cross-references between artifacts stay consistent. Starter
 * imports get their own remapped bundle per project, because artifact IDs are
 * global keys and the same starter may be imported into several projects.
 *
 * Views are projections of the model; they do not own element instances,
 * only `includedElementIds` referencing model elements.
 */
class ExampleDataService {
  /** Remapped bundles by scope: '' for the session, otherwise a project ID. */
  private bundles = new Map<string, ExampleBundle>();

  private getBundle(scope: string = ''): ExampleBundle {
    let bundle = this.bundles.get(scope);
    if (!bundle) {
      const raw = {
        metamodels: [smartWarehouseMetamodelData, activityDiagramMetamodelData, smartHomeMetamodelData],
        models: [smartWarehouseModelData, activityDiagramModelData, smartHomeModelData],
        views: [
          ...(smartWarehouseViewsData as unknown[]),
          ...(activityDiagramViewsData as unknown[]),
          ...(smartHomeViewsData as unknown[]),
        ],
        viewpoints: [
          ...(smartWarehouseViewpointsData as unknown[]),
          ...(activityDiagramViewpointsData as unknown[]),
          ...(smartHomeViewpointsData as unknown[]),
        ],
        projects: [
          smartWarehouseProjectData,
          smartWarehouseOmniverseProjectData,
          smartHomeProjectData,
        ].map((project: any) => ({
          ...project,
          templates: project.templates.map((template: any) => ({
            ...template,
            targetMetamodelId: project.targetMetamodelId,
          })),
        })),
      };

      const ids = new Set<string>();
      collectIds(raw, ids);
      const idMap = new Map<string, string>();
      ids.forEach(id => idMap.set(id, uuidv4()));

      bundle = remapNode(raw, idMap) as ExampleBundle;
      this.bundles.set(scope, bundle);
    }
    return bundle;
  }

  getExampleMetamodels(): Metamodel[] {
    return this.getBundle().metamodels;
  }

  getExampleModels(): Model[] {
    return this.getBundle().models;
  }

  /**
   * Returns example views (Diagram type: diagrams are the storage shape for views
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
      ...(smartHomeViewpointsData as unknown as Viewpoint[]),
    ];
  }

  /** @deprecated Use getExampleViews(); kept for transitional callers. */
  getExampleDiagrams(): Diagram[] {
    return this.getExampleViews();
  }

  getExampleProjects(): CodeGenerationProject[] {
    return this.getBundle().projects;
  }

  /**
   * Return the connected Smart Warehouse artifact graph for project-scoped
   * starter import. Every artifact comes from the same remapped bundle, so all
   * metamodel, semantic element, viewpoint, representation, and view IDs agree.
   * With a project ID, the IDs are fresh for that project and stable across
   * calls for it, so a retried import reuses them.
   */
  getSmartWarehouseBundle(projectId?: string): ExampleBundle {
    return this.getBundleForMetamodel('Smart Warehouse', projectId);
  }

  /** The connected Smart Home device-placement graph, for project starter import. */
  getSmartHomeBundle(projectId?: string): ExampleBundle {
    return this.getBundleForMetamodel('Smart Home', projectId);
  }

  /** The UML activity-diagram language with its model and saved views, for project starter import. */
  getActivityBundle(projectId?: string): ExampleBundle {
    return this.getBundleForMetamodel(activityDiagramMetamodelData.name, projectId);
  }

  private getBundleForMetamodel(metamodelName: string, projectId?: string): ExampleBundle {
    const bundle = this.getBundle(projectId ? `project:${projectId}` : '');
    const metamodel = bundle.metamodels.find(candidate => candidate.name === metamodelName);
    if (!metamodel) throw new Error(`The ${metamodelName} metamodel fixture is unavailable`);

    const models = bundle.models.filter(model => (
      (model.conformsTo || model.metamodelId) === metamodel.id
    ));
    const modelIds = new Set(models.map(model => model.id));

    return {
      metamodels: [metamodel],
      models,
      viewpoints: bundle.viewpoints.filter(viewpoint => viewpoint.metamodelId === metamodel.id),
      views: bundle.views.filter(view => modelIds.has(view.modelId)),
      projects: bundle.projects.filter(project => project.targetMetamodelId === metamodel.id),
    };
  }

  /**
   * The isExample* checks match the original fixture ids, identifying legacy
   * copies seeded before ids were remapped per account.
   */
  isExampleMetamodel(metamodelId: string): boolean {
    return (
      metamodelId === smartWarehouseMetamodelData.id ||
      metamodelId === activityDiagramMetamodelData.id ||
      metamodelId === smartHomeMetamodelData.id
    );
  }

  isExampleModel(modelId: string): boolean {
    return (
      modelId === smartWarehouseModelData.id ||
      modelId === activityDiagramModelData.id ||
      modelId === smartHomeModelData.id
    );
  }

  isExampleView(viewId: string): boolean {
    return (
      (smartWarehouseViewsData as Array<{ id: string }>).some(v => v.id === viewId) ||
      (activityDiagramViewsData as Array<{ id: string }>).some(v => v.id === viewId) ||
      (smartHomeViewsData as Array<{ id: string }>).some(v => v.id === viewId)
    );
  }

  /** @deprecated Use isExampleView; kept for transitional callers. */
  isExampleDiagram(diagramId: string): boolean {
    return this.isExampleView(diagramId);
  }

  isExampleProject(projectId: string): boolean {
    return projectId === smartWarehouseProjectData.id
      || projectId === smartWarehouseOmniverseProjectData.id
      || projectId === smartHomeProjectData.id;
  }
}

export const exampleDataService = new ExampleDataService();
export default exampleDataService;
