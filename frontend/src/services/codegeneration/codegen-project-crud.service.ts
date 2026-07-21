import { CodeGenerationProject, CodeGenerationTemplate } from '../../models/types';
import { v4 as uuidv4 } from 'uuid';
import { apiClient, API_ENDPOINTS } from '../core';
import { codegenApiSyncService } from './codegen-api-sync.service';

/**
 * Service for managing code generation projects
 */
export class CodegenProjectCrudService {
  private projects: CodeGenerationProject[] = [];

  getAllProjects(): CodeGenerationProject[] {
    return [...this.projects];
  }

  getAllExampleProjects(): CodeGenerationProject[] {
    return this.projects.filter(p => p.isExample);
  }

  getProjectById(id: string): CodeGenerationProject | undefined {
    return this.projects.find(p => p.id === id);
  }

  getProjectsByMetamodelId(metamodelId: string): CodeGenerationProject[] {
    return this.projects.filter(p => p.targetMetamodelId === metamodelId);
  }

  createProject(
    name: string,
    targetMetamodelId: string,
    description: string = '',
    isExample: boolean = false
  ): CodeGenerationProject {
    const newProject: CodeGenerationProject = {
      id: uuidv4(),
      name,
      description,
      targetMetamodelId,
      templates: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isExample
    };
    
    this.projects.push(newProject);
    codegenApiSyncService.syncProjectToAPI(newProject);
    return newProject;
  }

  updateProject(
    id: string, 
    updates: Partial<Omit<CodeGenerationProject, 'id' | 'createdAt' | 'templates'>>
  ): boolean {
    const projectIndex = this.projects.findIndex(p => p.id === id);
    if (projectIndex === -1) return false;
    
    this.projects[projectIndex] = {
      ...this.projects[projectIndex],
      ...updates,
      updatedAt: Date.now()
    };
    
    codegenApiSyncService.syncProjectToAPI(this.projects[projectIndex]);
    return true;
  }

  deleteProject(id: string): boolean {
    const initialLength = this.projects.length;
    this.projects = this.projects.filter(p => p.id !== id);
    
    const result = initialLength !== this.projects.length;
    if (result) {
      // Delete from API only - no localStorage
      apiClient.delete(`${API_ENDPOINTS.CODEGEN_PROJECTS}/${id}`).catch(console.error);
    }
    return result;
  }

  importProject(projectData: unknown): CodeGenerationProject {
    const parsedProject = this.normalizeImportedProject(projectData);
    this.projects.push(parsedProject);
    codegenApiSyncService.syncProjectToAPI(parsedProject);
    return parsedProject;
  }

  // Template management within projects
  
  addTemplateToProject(
    projectId: string, 
    name: string,
    language: 'java' | 'python' | 'json' | 'xml' | 'plaintext',
    templateContent: string,
    outputPattern: string
  ): CodeGenerationTemplate | null {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return null;
    
    const newTemplate: CodeGenerationTemplate = {
      id: uuidv4(),
      name,
      language,
      templateContent,
      targetMetamodelId: project.targetMetamodelId,
      outputPattern
    };
    
    project.templates.push(newTemplate);
    project.updatedAt = Date.now();
    codegenApiSyncService.syncProjectToAPI(project);
    return newTemplate;
  }

  updateTemplateInProject(
    projectId: string,
    templateId: string,
    updates: Partial<Omit<CodeGenerationTemplate, 'id' | 'targetMetamodelId'>>
  ): boolean {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return false;
    
    const templateIndex = project.templates.findIndex(t => t.id === templateId);
    if (templateIndex === -1) return false;
    
    project.templates[templateIndex] = {
      ...project.templates[templateIndex],
      ...updates
    };
    
    project.updatedAt = Date.now();
    codegenApiSyncService.syncProjectToAPI(project);
    return true;
  }

  removeTemplateFromProject(projectId: string, templateId: string): boolean {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return false;
    
    const initialLength = project.templates.length;
    project.templates = project.templates.filter(t => t.id !== templateId);
    
    const result = initialLength !== project.templates.length;
    if (result) {
      project.updatedAt = Date.now();
      codegenApiSyncService.syncProjectToAPI(project);
    }
    return result;
  }

  setProjects(projects: CodeGenerationProject[]): void {
    this.projects = projects;
  }

  clearProjects(): void {
    this.projects = [];
  }

  private normalizeImportedProject(projectData: unknown): CodeGenerationProject {
    if (!projectData || typeof projectData !== 'object') {
      throw new Error('Imported file must contain a code generation project object');
    }

    const project = projectData as Partial<CodeGenerationProject>;
    if (!project.name || typeof project.name !== 'string') {
      throw new Error('Imported project is missing a valid name');
    }
    if (!project.targetMetamodelId || typeof project.targetMetamodelId !== 'string') {
      throw new Error('Imported project is missing a valid targetMetamodelId');
    }
    if (!Array.isArray(project.templates)) {
      throw new Error('Imported project is missing a templates array');
    }

    const projectId = project.id && !this.projects.some(existing => existing.id === project.id)
      ? project.id
      : uuidv4();

    const existingTemplateIds = new Set(
      this.projects.flatMap(existingProject => existingProject.templates.map(template => template.id))
    );
    const importedTemplateIds = new Set<string>();

    const templates: CodeGenerationTemplate[] = project.templates.map((template, index) => {
      if (!template || typeof template !== 'object') {
        throw new Error(`Template ${index + 1} is not a valid object`);
      }
      if (!template.name || typeof template.name !== 'string') {
        throw new Error(`Template ${index + 1} is missing a valid name`);
      }
      const validLanguages = ['java', 'python', 'json', 'xml', 'plaintext'];
      if (!validLanguages.includes(template.language as string)) {
        throw new Error(`Template "${template.name}" must use a valid language (${validLanguages.join(', ')})`);
      }
      if (typeof template.templateContent !== 'string') {
        throw new Error(`Template "${template.name}" is missing templateContent`);
      }
      if (!template.outputPattern || typeof template.outputPattern !== 'string') {
        throw new Error(`Template "${template.name}" is missing a valid outputPattern`);
      }

      const shouldKeepTemplateId = (
        !!template.id &&
        !existingTemplateIds.has(template.id) &&
        !importedTemplateIds.has(template.id)
      );
      const templateId = shouldKeepTemplateId ? template.id : uuidv4();
      importedTemplateIds.add(templateId);

      return {
        id: templateId,
        name: template.name,
        language: template.language,
        templateContent: template.templateContent,
        targetMetamodelId: template.targetMetamodelId || project.targetMetamodelId!,
        outputPattern: template.outputPattern
      };
    });

    return {
      id: projectId,
      name: project.name,
      description: typeof project.description === 'string' ? project.description : '',
      targetMetamodelId: project.targetMetamodelId,
      templates,
      createdAt: typeof project.createdAt === 'number' ? project.createdAt : Date.now(),
      updatedAt: Date.now(),
      isExample: false
    };
  }
}

export const codegenProjectCrudService = new CodegenProjectCrudService();
