

import { CodeGenerationProject } from '../../models/types';
import { exampleDataService } from '../metamodel/exampleData.service';
import { metamodelService } from '../metamodel/metamodel.service';
import { codegenProjectCrudService } from './codegen-project-crud.service';

/**
 * Service for loading example templates and projects
 * Note: Example data should be seeded through backend. This is kept for backward compatibility.
 */
export class CodegenExampleDataService {
  /**
   * Load example templates (deprecated - should use backend seed)
   */
  loadExampleTemplates(): void {
    console.log('Example data templates should be loaded via backend seed command');
    // Templates are now managed through projects, not standalone
  }

  /**
   * Load example projects (deprecated - should use backend seed)
   */
  loadExampleProjects(): void {
    const existingProjects = codegenProjectCrudService.getAllProjects();
    const exampleProjects = exampleDataService
      .getExampleProjects()
      .map(project => this.retargetToAccountMetamodel(project));
    const projectsToAdd = exampleProjects.filter(
      exampleProject => !existingProjects.some(project => project.id === exampleProject.id)
    );

    if (projectsToAdd.length === 0) {
      return;
    }

    codegenProjectCrudService.setProjects([...existingProjects, ...projectsToAdd]);
  }

  /**
   * The example bundle's ids are fresh per session, but this account's copy
   * of the example metamodel may have been seeded in an earlier session (or
   * with the legacy fixed ids). Point the project at the metamodel row the
   * account actually has, matched by name.
   */
  private retargetToAccountMetamodel(project: CodeGenerationProject): CodeGenerationProject {
    const bundleMetamodel = exampleDataService
      .getExampleMetamodels()
      .find(mm => mm.id === project.targetMetamodelId);
    if (!bundleMetamodel) return project;

    const accountMetamodel = metamodelService
      .getAllMetamodels()
      .find(mm => mm.name === bundleMetamodel.name);
    if (!accountMetamodel || accountMetamodel.id === project.targetMetamodelId) return project;

    return {
      ...project,
      targetMetamodelId: accountMetamodel.id,
      templates: (project.templates || []).map(template => ({
        ...template,
        targetMetamodelId:
          template.targetMetamodelId === project.targetMetamodelId
            ? accountMetamodel.id
            : template.targetMetamodelId,
      })),
    };
  }
}

export const codegenExampleDataService = new CodegenExampleDataService();
