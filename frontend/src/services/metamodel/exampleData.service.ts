import { Metamodel, Model, Diagram, CodeGenerationProject } from '../../models/types';
import warehouseMetamodelData from '../../examples/data/warehouse-metamodel.json';
import warehouseModelData from '../../examples/data/warehouse-model.json';
import warehouseDiagramData from '../../examples/data/warehouse-diagram.json';
import warehouseProjectData from '../../examples/data/warehouse-project.json';

/**
 * Service for loading example data (metamodels, models, diagrams, projects)
 * This provides default examples that appear when users first open the application
 */
class ExampleDataService {
  /**
   * Get example metamodels
   */
  getExampleMetamodels(): Metamodel[] {
    return [
      warehouseMetamodelData as Metamodel
    ];
  }

  /**
   * Get example models
   */
  getExampleModels(): Model[] {
    return [
      warehouseModelData as Model
    ];
  }

  /**
   * Get example diagrams (both 2D and 3D)
   */
  getExampleDiagrams(): Diagram[] {
    return [
      warehouseDiagramData as Diagram
    ];
  }

  /**
   * Get example code generation projects
   */
  getExampleProjects(): CodeGenerationProject[] {
    return [
      warehouseProjectData as CodeGenerationProject
    ];
  }

  /**
   * Check if a metamodel is an example (read-only)
   */
  isExampleMetamodel(metamodelId: string): boolean {
    return metamodelId === warehouseMetamodelData.id;
  }

  /**
   * Check if a model is an example (read-only)
   */
  isExampleModel(modelId: string): boolean {
    return modelId === warehouseModelData.id;
  }

  /**
   * Check if a diagram is an example (read-only)
   */
  isExampleDiagram(diagramId: string): boolean {
    return diagramId === warehouseDiagramData.id;
  }

  /**
   * Check if a project is an example (read-only)
   */
  isExampleProject(projectId: string): boolean {
    return projectId === warehouseProjectData.id;
  }
}

export const exampleDataService = new ExampleDataService();
export default exampleDataService;
