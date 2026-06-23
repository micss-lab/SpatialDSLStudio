

import { exampleDataService } from '../metamodel/exampleData.service';
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
    const exampleProjects = exampleDataService.getExampleProjects();
    const projectsToAdd = exampleProjects.filter(
      exampleProject => !existingProjects.some(project => project.id === exampleProject.id)
    );

    if (projectsToAdd.length === 0) {
      return;
    }

    codegenProjectCrudService.setProjects([...existingProjects, ...projectsToAdd]);
  }
}

export const codegenExampleDataService = new CodegenExampleDataService();
