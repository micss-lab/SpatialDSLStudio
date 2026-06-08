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

/**
 * Service for loading example data (metamodels, models, views, projects)
 * This provides default examples that appear when users first open the application.
 *
 * Views are projections of the model — they do not own element instances,
 * only `includedElementIds` referencing model elements.
 */
class ExampleDataService {
  getExampleMetamodels(): Metamodel[] {
    return [
      smartWarehouseMetamodelData as unknown as Metamodel,
      activityDiagramMetamodelData as unknown as Metamodel,
    ];
  }

  getExampleModels(): Model[] {
    return [
      smartWarehouseModelData as unknown as Model,
      activityDiagramModelData as unknown as Model,
    ];
  }

  /**
   * Returns example views (Diagram type — diagrams are the storage shape for views
   * under the view-projection model).
   */
  getExampleViews(): Diagram[] {
    return [
      ...(smartWarehouseViewsData as unknown as Diagram[]),
      ...(activityDiagramViewsData as unknown as Diagram[]),
    ];
  }

  getExampleViewpoints(): Viewpoint[] {
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
    return [smartWarehouseProjectData as unknown as CodeGenerationProject];
  }

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
