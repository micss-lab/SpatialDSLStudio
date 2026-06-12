import {
  CodeGenerationTemplate,
  CodeGenerationResult,
  CodeGenerationProject
} from '../../models/types';
import { codegenApiSyncService } from './codegen-api-sync.service';
import { codegenHandlebarsService } from './codegen-handlebars.service';
import { codegenTemplateCrudService } from './codegen-template-crud.service';
import { codegenProjectCrudService } from './codegen-project-crud.service';
import { codegenModelGenerationService } from './codegen-model-generation.service';
import { codegenExampleDataService } from './codegen-example-data.service';

/**
 * Main code generation service that orchestrates all code generation operations
 */
class CodeGenerationService {
  private initPromise: Promise<void> | null = null;
  private initialized: boolean = false;

  constructor() {
    // Initialize handlebars helpers
    codegenHandlebarsService.registerAllHelpers();
  }

  private async initializeFromAPI(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const projects = await codegenApiSyncService.initializeFromAPI(
        codegenProjectCrudService.getAllProjects()
      );
      
      codegenProjectCrudService.setProjects(projects);
      this.initialized = true;
    } catch (error) {
      console.warn('Could not load from API, starting with empty state:', error);
      codegenProjectCrudService.clearProjects();
      codegenTemplateCrudService.clearTemplates();
      this.initialized = true;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeFromAPI();
    }
    await this.initPromise;
  }

  // ==============================
  // Template CRUD (Legacy - deprecated)
  // ==============================
  
  getAllTemplates(): CodeGenerationTemplate[] {
    return codegenTemplateCrudService.getAllTemplates();
  }

  getTemplateById(id: string): CodeGenerationTemplate | undefined {
    return codegenTemplateCrudService.getTemplateById(id);
  }

  getTemplatesByLanguage(language: 'java' | 'python'): CodeGenerationTemplate[] {
    return codegenTemplateCrudService.getTemplatesByLanguage(language);
  }

  createTemplate(
    name: string,
    language: 'java' | 'python',
    templateContent: string,
    targetMetamodelId: string,
    outputPattern: string
  ): CodeGenerationTemplate {
    return codegenTemplateCrudService.createTemplate(
      name,
      language,
      templateContent,
      targetMetamodelId,
      outputPattern
    );
  }

  updateTemplate(id: string, updates: Partial<CodeGenerationTemplate>): boolean {
    return codegenTemplateCrudService.updateTemplate(id, updates);
  }

  deleteTemplate(id: string): boolean {
    return codegenTemplateCrudService.deleteTemplate(id);
  }

  // ==============================
  // Project CRUD
  // ==============================
  
  getAllProjects(): CodeGenerationProject[] {
    return codegenProjectCrudService.getAllProjects();
  }

  getAllExampleProjects(): CodeGenerationProject[] {
    return codegenProjectCrudService.getAllExampleProjects();
  }

  getProjectById(id: string): CodeGenerationProject | undefined {
    return codegenProjectCrudService.getProjectById(id);
  }

  getProjectsByMetamodelId(metamodelId: string): CodeGenerationProject[] {
    return codegenProjectCrudService.getProjectsByMetamodelId(metamodelId);
  }

  createProject(
    name: string,
    targetMetamodelId: string,
    description: string = '',
    isExample: boolean = false
  ): CodeGenerationProject {
    return codegenProjectCrudService.createProject(
      name,
      targetMetamodelId,
      description,
      isExample
    );
  }

  updateProject(
    id: string, 
    updates: Partial<Omit<CodeGenerationProject, 'id' | 'createdAt' | 'templates'>>
  ): boolean {
    return codegenProjectCrudService.updateProject(id, updates);
  }

  deleteProject(id: string): boolean {
    return codegenProjectCrudService.deleteProject(id);
  }

  addTemplateToProject(
    projectId: string, 
    name: string,
    language: 'java' | 'python',
    templateContent: string,
    outputPattern: string
  ): CodeGenerationTemplate | null {
    return codegenProjectCrudService.addTemplateToProject(
      projectId,
      name,
      language,
      templateContent,
      outputPattern
    );
  }

  updateTemplateInProject(
    projectId: string,
    templateId: string,
    updates: Partial<Omit<CodeGenerationTemplate, 'id' | 'targetMetamodelId'>>
  ): boolean {
    return codegenProjectCrudService.updateTemplateInProject(
      projectId,
      templateId,
      updates
    );
  }

  removeTemplateFromProject(projectId: string, templateId: string): boolean {
    return codegenProjectCrudService.removeTemplateFromProject(projectId, templateId);
  }

  // ==============================
  // Code Generation (Model-based)
  // ==============================
  
  generateCodeFromModel(modelId: string, templateId: string): CodeGenerationResult[] {
    return codegenModelGenerationService.generateCodeFromModel(modelId, templateId);
  }

  generateProjectCodeFromModel(modelId: string, projectId: string): CodeGenerationResult[] {
    return codegenModelGenerationService.generateProjectCodeFromModel(modelId, projectId);
  }

  // ==============================
  // Example Data
  // ==============================
  
  loadExampleTemplates(): void {
    codegenExampleDataService.loadExampleTemplates();
  }

  loadExampleProjects(): void {
    codegenExampleDataService.loadExampleProjects();
  }

  // ==============================
  // Async & Cache Management
  // ==============================
  
  async getAllTemplatesAsync(): Promise<CodeGenerationTemplate[]> {
    await this.ensureInitialized();
    return this.getAllTemplates();
  }

  async getAllProjectsAsync(): Promise<CodeGenerationProject[]> {
    await this.ensureInitialized();
    return this.getAllProjects();
  }

  async getProjectByIdAsync(id: string): Promise<CodeGenerationProject | undefined> {
    await this.ensureInitialized();
    return this.getProjectById(id);
  }

  async refresh(): Promise<void> {
    this.initialized = false;
    this.initPromise = this.initializeFromAPI();
    await this.initPromise;
  }

  async clearCacheAndReinitialize(): Promise<void> {
    console.log('CodeGenerationService: Clearing cache and reinitializing');
    codegenProjectCrudService.clearProjects();
    codegenTemplateCrudService.clearTemplates();
    codegenApiSyncService.clearCache();
    this.initialized = false;
    this.initPromise = this.initializeFromAPI();
    await this.initPromise;
  }

  clearCacheLocal(): void {
    console.log('CodeGenerationService: Clearing cache locally');
    codegenProjectCrudService.clearProjects();
    codegenTemplateCrudService.clearTemplates();
    codegenApiSyncService.clearCache();
    this.initialized = false;
    this.initPromise = null;
  }
}

export const codeGenerationService = new CodeGenerationService();
