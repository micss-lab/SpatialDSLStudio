import prisma from '../config/database';
import { ApiError } from '../middleware';
import { 
  CodeGenerationProject, 
  CodeGenerationTemplate,
  CreateProjectRequest,
  UpdateProjectRequest,
  UserRole,
  ResourceWithPermission
} from '../../../shared/types';
import { sharingService } from './sharing.service';
import { canPerformOperation } from '../middleware/permissions';

export interface CodegenProjectWithPermission extends CodeGenerationProject, ResourceWithPermission {}

class CodeGenerationService {
  /**
   * Get all projects accessible by a user (owned + shared)
   */
  async getAllProjects(userId: string): Promise<CodegenProjectWithPermission[]> {
    const ownedProjects = await prisma.codeGenerationProject.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });

    const sharedResources = await prisma.sharedResource.findMany({
      where: { 
        sharedWithId: userId,
        resourceType: 'CODEGEN_PROJECT',
      },
      include: {
        owner: { select: { email: true } },
      },
    });

    const sharedProjectIds = sharedResources.map(s => s.resourceId);
    const sharedProjects = sharedProjectIds.length > 0 
      ? await prisma.codeGenerationProject.findMany({
          where: { id: { in: sharedProjectIds } },
          orderBy: { name: 'asc' },
        })
      : [];

    const ownedResult: CodegenProjectWithPermission[] = ownedProjects.map(p => ({
      ...this.mapToProject(p),
      isOwner: true,
    }));

    const sharedResult: CodegenProjectWithPermission[] = sharedProjects.map(p => {
      const shareInfo = sharedResources.find(s => s.resourceId === p.id);
      return {
        ...this.mapToProject(p),
        isOwner: false,
        permission: shareInfo?.permission as any,
        ownerEmail: shareInfo?.owner.email,
      };
    });

    return [...ownedResult, ...sharedResult];
  }

  /**
   * Get projects by metamodel ID accessible by user
   */
  async getProjectsByMetamodelId(metamodelId: string, userId: string): Promise<CodegenProjectWithPermission[]> {
    const allProjects = await this.getAllProjects(userId);
    return allProjects.filter(p => p.targetMetamodelId === metamodelId);
  }

  /**
   * Get a single project by ID (with access check)
   */
  async getProjectById(id: string, userId: string): Promise<CodegenProjectWithPermission | null> {
    const project = await prisma.codeGenerationProject.findFirst({
      where: { id },
    });

    if (!project) return null;

    const access = await sharingService.checkAccess('CODEGEN_PROJECT', id, userId);
    if (!access.hasAccess) {
      return null;
    }

    return {
      ...this.mapToProject(project),
      isOwner: access.isOwner,
      permission: access.permission,
      ownerEmail: access.ownerEmail,
    };
  }

  /**
   * Create a new project (requires ADMIN or DSL_DESIGNER role)
   */
  async createProject(data: CreateProjectRequest, userId: string, userRole: UserRole): Promise<CodeGenerationProject> {
    if (!canPerformOperation(userRole, 'codegen', 'create')) {
      throw new ApiError(403, 'Your role does not allow creating code generation projects');
    }

    // Only verify metamodel if targetMetamodelId is a valid UUID and not an example project
    if (data.targetMetamodelId && !data.isExample) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(data.targetMetamodelId)) {
        const access = await sharingService.checkAccess('METAMODEL', data.targetMetamodelId, userId);
        if (!access.hasAccess) {
          throw new ApiError(400, 'Target metamodel not found');
        }
      }
    }

    const project = await prisma.codeGenerationProject.create({
      data: {
        id: data.id,
        name: data.name,
        description: data.description,
        isExample: data.isExample || false,
        targetMetamodelId: data.targetMetamodelId || null,
        templates: (data.templates || []) as any,
        userId,
      },
    });

    return this.mapToProject(project);
  }

  /**
   * Update an existing project (with permission check)
   */
  async updateProject(id: string, data: UpdateProjectRequest, userId: string, userRole: UserRole): Promise<CodeGenerationProject> {
    const access = await sharingService.checkAccess('CODEGEN_PROJECT', id, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Project not found');
    }

    // Only owner or EDITOR share with appropriate role can update templates
    const canEdit = access.isOwner 
      ? canPerformOperation(userRole, 'codegen', 'editTemplate')
      : access.permission === 'EDITOR' && canPerformOperation(userRole, 'codegen', 'editTemplate');

    if (!canEdit) {
      throw new ApiError(403, 'You do not have permission to edit this project');
    }

    const project = await prisma.codeGenerationProject.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.templates !== undefined && { templates: data.templates as any }),
      },
    });

    return this.mapToProject(project);
  }

  /**
   * Delete a project (owner only)
   */
  async deleteProject(id: string, userId: string): Promise<void> {
    const existing = await prisma.codeGenerationProject.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new ApiError(404, 'Project not found or you are not the owner');
    }

    await sharingService.deleteResourceShares('CODEGEN_PROJECT', id);
    await prisma.codeGenerationProject.delete({
      where: { id },
    });
  }

  /**
   * Add a template to a project (requires appropriate permission)
   */
  async addTemplate(projectId: string, template: CodeGenerationTemplate, userId: string, userRole: UserRole): Promise<CodeGenerationProject> {
    if (!canPerformOperation(userRole, 'codegen', 'editTemplate')) {
      throw new ApiError(403, 'Your role does not allow editing templates');
    }

    const access = await sharingService.checkAccess('CODEGEN_PROJECT', projectId, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Project not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this project');
    }

    const project = await prisma.codeGenerationProject.findFirst({
      where: { id: projectId },
    });

    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    const templates = (project.templates as unknown as CodeGenerationTemplate[]) || [];
    
    if (templates.some(t => t.id === template.id)) {
      throw new ApiError(400, 'Template with this ID already exists');
    }

    templates.push(template);

    const updated = await prisma.codeGenerationProject.update({
      where: { id: projectId },
      data: { templates: templates as any },
    });

    return this.mapToProject(updated);
  }

  /**
   * Update a template in a project
   */
  async updateTemplate(
    projectId: string, 
    templateId: string, 
    updates: Partial<CodeGenerationTemplate>,
    userId: string,
    userRole: UserRole
  ): Promise<CodeGenerationProject> {
    if (!canPerformOperation(userRole, 'codegen', 'editTemplate')) {
      throw new ApiError(403, 'Your role does not allow editing templates');
    }

    const access = await sharingService.checkAccess('CODEGEN_PROJECT', projectId, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Project not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this project');
    }

    const project = await prisma.codeGenerationProject.findFirst({
      where: { id: projectId },
    });

    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    const templates = (project.templates as unknown as CodeGenerationTemplate[]) || [];
    const templateIndex = templates.findIndex(t => t.id === templateId);

    if (templateIndex === -1) {
      throw new ApiError(404, 'Template not found in project');
    }

    templates[templateIndex] = { ...templates[templateIndex], ...updates };

    const updated = await prisma.codeGenerationProject.update({
      where: { id: projectId },
      data: { templates: templates as any },
    });

    return this.mapToProject(updated);
  }

  /**
   * Delete a template from a project
   */
  async deleteTemplate(projectId: string, templateId: string, userId: string, userRole: UserRole): Promise<CodeGenerationProject> {
    if (!canPerformOperation(userRole, 'codegen', 'editTemplate')) {
      throw new ApiError(403, 'Your role does not allow editing templates');
    }

    const access = await sharingService.checkAccess('CODEGEN_PROJECT', projectId, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Project not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this project');
    }

    const project = await prisma.codeGenerationProject.findFirst({
      where: { id: projectId },
    });

    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    const templates = ((project.templates as unknown as CodeGenerationTemplate[]) || []).filter(
      t => t.id !== templateId
    );

    const updated = await prisma.codeGenerationProject.update({
      where: { id: projectId },
      data: { templates: templates as any },
    });

    return this.mapToProject(updated);
  }

  private mapToProject(p: any): CodeGenerationProject {
    return {
      id: p.id,
      name: p.name,
      description: p.description || undefined,
      targetMetamodelId: p.targetMetamodelId,
      templates: ((p.templates as unknown as CodeGenerationTemplate[]) || []),
      createdAt: new Date(p.createdAt).getTime(),
      updatedAt: new Date(p.updatedAt).getTime(),
      isExample: p.isExample,
    };
  }
}

export const codeGenerationService = new CodeGenerationService();
export default codeGenerationService;
