

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
    console.log('Example data projects should be loaded via backend seed command');
    // Example data loading moved to backend seeding
  }
}

export const codegenExampleDataService = new CodegenExampleDataService();
