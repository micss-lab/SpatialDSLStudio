import prisma from '../config/database';
import { ApiError } from '../middleware/errorHandler';
import {
  AddProjectMemberRequest,
  CreateStudioProjectRequest,
  ProjectCapability,
  ProjectMember,
  ProjectRole,
  StudioProject,
  UpdateProjectMemberRequest,
  UpdateStudioProjectRequest,
  UserRole,
} from '../../../shared/types';

const READ_CAPABILITIES: ProjectCapability[] = ['project.read'];
const MODELER_CAPABILITIES: ProjectCapability[] = [
  ...READ_CAPABILITIES,
  'model.create',
  'model.update',
  'model.delete',
  'view.create',
  'view.update',
  'view.delete',
  'transformation.execute',
  'codegen.execute',
  'test.execute',
  'pipeline.execute',
];
const DSL_DESIGNER_CAPABILITIES: ProjectCapability[] = [
  ...MODELER_CAPABILITIES,
  'metamodel.create',
  'metamodel.update',
  'metamodel.delete',
  'viewpoint.create',
  'viewpoint.update',
  'viewpoint.delete',
  'transformation.author',
  'codegen.author',
  'test.author',
  'checkpoint.create',
  'metamodel.evolve',
];
const OWNER_CAPABILITIES: ProjectCapability[] = [
  ...DSL_DESIGNER_CAPABILITIES,
  'project.settings.update',
  'project.members.manage',
  'project.archive',
  'checkpoint.restore',
];

export interface ProjectAccess {
  projectId: string;
  role: ProjectRole;
  capabilities: ProjectCapability[];
  isOwner: boolean;
  isPlatformAdmin: boolean;
  status: 'ACTIVE' | 'ARCHIVED';
}

const projectInclude = (userId: string) => ({
  owner: { select: { email: true } },
  memberships: {
    where: { userId },
    select: { role: true },
  },
  _count: {
    select: {
      memberships: true,
      metamodels: true,
      viewpoints: true,
      models: true,
      diagrams: true,
      transformationRules: true,
      codegenProjects: true,
      testCases: true,
      storedFiles: true,
    },
  },
});

class ProjectService {
  getCapabilities(role: ProjectRole, isPlatformAdmin = false): ProjectCapability[] {
    if (isPlatformAdmin || role === 'OWNER') return [...OWNER_CAPABILITIES];
    if (role === 'DSL_DESIGNER') return [...DSL_DESIGNER_CAPABILITIES];
    if (role === 'MODELER') return [...MODELER_CAPABILITIES];
    return [...READ_CAPABILITIES];
  }

  toEffectiveUserRole(access: ProjectAccess): UserRole {
    if (access.isPlatformAdmin) return 'ADMIN';
    if (access.role === 'OWNER' || access.role === 'DSL_DESIGNER') return 'DSL_DESIGNER';
    return access.role;
  }

  async getAccess(projectId: string, userId: string, userRole: UserRole): Promise<ProjectAccess | null> {
    const project = await prisma.studioProject.findUnique({
      where: { id: projectId },
      include: {
        memberships: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!project) return null;

    const isPlatformAdmin = userRole === 'ADMIN';
    const membershipRole = project.memberships[0]?.role as ProjectRole | undefined;
    const isOwner = project.ownerId === userId;
    if (!isPlatformAdmin && !membershipRole && !isOwner) return null;

    const role: ProjectRole = isOwner ? 'OWNER' : membershipRole || 'OWNER';
    return {
      projectId,
      role,
      capabilities: this.getCapabilities(role, isPlatformAdmin),
      isOwner,
      isPlatformAdmin,
      status: project.status,
    };
  }

  async getAll(userId: string, userRole: UserRole, includeArchived = false): Promise<StudioProject[]> {
    const isPlatformAdmin = userRole === 'ADMIN';
    const projects = await prisma.studioProject.findMany({
      where: {
        ...(!includeArchived && { status: 'ACTIVE' as const }),
        ...(!isPlatformAdmin && { memberships: { some: { userId } } }),
      },
      include: projectInclude(userId),
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });

    return projects.map(project => this.mapProject(project, userId, isPlatformAdmin));
  }

  async getById(projectId: string, userId: string, userRole: UserRole): Promise<StudioProject | null> {
    const access = await this.getAccess(projectId, userId, userRole);
    if (!access) return null;

    const project = await prisma.studioProject.findUnique({
      where: { id: projectId },
      include: projectInclude(userId),
    });
    return project ? this.mapProject(project, userId, access.isPlatformAdmin) : null;
  }

  async create(data: CreateStudioProjectRequest, userId: string): Promise<StudioProject> {
    const name = data.name.trim();
    if (!name) throw new ApiError(400, 'Project name is required');

    const project = await prisma.$transaction(async tx => {
      const created = await tx.studioProject.create({
        data: {
          name,
          description: data.description?.trim() || null,
          ownerId: userId,
        },
      });
      await tx.projectMembership.create({
        data: {
          projectId: created.id,
          userId,
          role: 'OWNER',
        },
      });
      return created;
    });

    const result = await this.getById(project.id, userId, 'VIEWER');
    if (!result) throw new ApiError(500, 'Project was created but could not be loaded');
    return result;
  }

  async update(
    projectId: string,
    data: UpdateStudioProjectRequest,
    userId: string,
    userRole: UserRole
  ): Promise<StudioProject> {
    await this.assertOwner(projectId, userId, userRole);
    const name = data.name?.trim();
    if (data.name !== undefined && !name) throw new ApiError(400, 'Project name is required');

    await prisma.studioProject.update({
      where: { id: projectId },
      data: {
        ...(name !== undefined && { name }),
        ...(data.description !== undefined && { description: data.description.trim() || null }),
      },
    });

    return (await this.getById(projectId, userId, userRole))!;
  }

  async setArchived(projectId: string, archived: boolean, userId: string, userRole: UserRole): Promise<StudioProject> {
    await this.assertOwner(projectId, userId, userRole);
    await prisma.studioProject.update({
      where: { id: projectId },
      data: { status: archived ? 'ARCHIVED' : 'ACTIVE' },
    });
    return (await this.getById(projectId, userId, userRole))!;
  }

  async getMembers(projectId: string, userId: string, userRole: UserRole): Promise<ProjectMember[]> {
    const access = await this.getAccess(projectId, userId, userRole);
    if (!access) throw new ApiError(404, 'Project not found');

    const memberships = await prisma.projectMembership.findMany({
      where: { projectId },
      include: { user: { select: { email: true } } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
    return memberships.map(membership => ({
      id: membership.id,
      userId: membership.userId,
      email: membership.user.email,
      role: membership.role as ProjectRole,
      createdAt: membership.createdAt.toISOString(),
    }));
  }

  async addMember(
    projectId: string,
    data: AddProjectMemberRequest,
    userId: string,
    userRole: UserRole
  ): Promise<ProjectMember> {
    await this.assertOwner(projectId, userId, userRole);
    this.assertAssignableRole(data.role);

    const target = await prisma.user.findUnique({
      where: { email: data.email.trim().toLowerCase() },
      select: { id: true, email: true },
    });
    if (!target) throw new ApiError(404, 'No user with that email address was found');

    const existing = await prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId, userId: target.id } },
    });
    if (existing) throw new ApiError(409, 'This user is already a project member');

    const membership = await prisma.projectMembership.create({
      data: { projectId, userId: target.id, role: data.role },
    });
    return {
      id: membership.id,
      userId: target.id,
      email: target.email,
      role: membership.role as ProjectRole,
      createdAt: membership.createdAt.toISOString(),
    };
  }

  async updateMember(
    projectId: string,
    memberUserId: string,
    data: UpdateProjectMemberRequest,
    userId: string,
    userRole: UserRole
  ): Promise<ProjectMember> {
    await this.assertOwner(projectId, userId, userRole);
    this.assertAssignableRole(data.role);

    const existing = await prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId, userId: memberUserId } },
      include: { user: { select: { email: true } } },
    });
    if (!existing) throw new ApiError(404, 'Project member not found');
    if (existing.role === 'OWNER') throw new ApiError(400, 'The owner role cannot be changed here');

    const membership = await prisma.projectMembership.update({
      where: { id: existing.id },
      data: { role: data.role },
    });
    return {
      id: membership.id,
      userId: memberUserId,
      email: existing.user.email,
      role: membership.role as ProjectRole,
      createdAt: membership.createdAt.toISOString(),
    };
  }

  async removeMember(projectId: string, memberUserId: string, userId: string, userRole: UserRole): Promise<void> {
    await this.assertOwner(projectId, userId, userRole);
    const membership = await prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId, userId: memberUserId } },
    });
    if (!membership) throw new ApiError(404, 'Project member not found');
    if (membership.role === 'OWNER') throw new ApiError(400, 'The project owner cannot be removed');
    await prisma.projectMembership.delete({ where: { id: membership.id } });
  }

  private async assertOwner(projectId: string, userId: string, userRole: UserRole): Promise<ProjectAccess> {
    const access = await this.getAccess(projectId, userId, userRole);
    if (!access) throw new ApiError(404, 'Project not found');
    if (!access.isOwner && !access.isPlatformAdmin) {
      throw new ApiError(403, 'Only the project owner can manage this project');
    }
    return access;
  }

  private assertAssignableRole(role: ProjectRole): void {
    if (!['DSL_DESIGNER', 'MODELER', 'VIEWER'].includes(role)) {
      throw new ApiError(400, 'Role must be DSL_DESIGNER, MODELER, or VIEWER');
    }
  }

  private mapProject(project: any, userId: string, isPlatformAdmin: boolean): StudioProject {
    const isOwner = project.ownerId === userId;
    const membershipRole = project.memberships?.[0]?.role as ProjectRole | undefined;
    const role: ProjectRole = isOwner ? 'OWNER' : membershipRole || 'OWNER';
    return {
      id: project.id,
      name: project.name,
      description: project.description || undefined,
      status: project.status,
      ownerId: project.ownerId,
      ownerEmail: project.owner.email,
      role,
      isPlatformAdmin,
      capabilities: this.getCapabilities(role, isPlatformAdmin),
      memberCount: project._count.memberships,
      artifactCounts: {
        metamodels: project._count.metamodels,
        viewpoints: project._count.viewpoints,
        models: project._count.models,
        views: project._count.diagrams,
        transformations: project._count.transformationRules,
        generatorConfigurations: project._count.codegenProjects,
        tests: project._count.testCases,
        files: project._count.storedFiles,
      },
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }
}

export const projectService = new ProjectService();
