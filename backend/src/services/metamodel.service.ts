import prisma from '../config/database';
import { ApiError } from '../middleware';
import { 
  Metamodel, 
  MetaClass, 
  MetaEnum,
  Constraint,
  CreateMetamodelRequest,
  UpdateMetamodelRequest,
  UserRole,
  ResourceWithPermission
} from '../../../shared/types';
import { sharingService } from './sharing.service';
import { canPerformOperation } from '../middleware/permissions';

// Extended metamodel type with permission info
export interface MetamodelWithPermission extends Metamodel, ResourceWithPermission {}

class MetamodelService {
  /**
   * Get all metamodels accessible by a user (owned + shared)
   */
  async getAll(userId: string): Promise<MetamodelWithPermission[]> {
    // Get owned metamodels
    const ownedMetamodels = await prisma.metamodel.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });

    // Get shared metamodels
    const sharedResources = await prisma.sharedResource.findMany({
      where: { 
        sharedWithId: userId,
        resourceType: 'METAMODEL',
      },
      include: {
        owner: { select: { email: true } },
      },
    });

    const sharedMetamodelIds = sharedResources.map(s => s.resourceId);
    const sharedMetamodels = sharedMetamodelIds.length > 0 
      ? await prisma.metamodel.findMany({
          where: { id: { in: sharedMetamodelIds } },
          orderBy: { name: 'asc' },
        })
      : [];

    // Map owned metamodels
    const ownedResult: MetamodelWithPermission[] = ownedMetamodels.map(mm => ({
      ...this.mapToMetamodel(mm),
      isOwner: true,
    }));

    // Map shared metamodels with permission info
    const sharedResult: MetamodelWithPermission[] = sharedMetamodels.map(mm => {
      const shareInfo = sharedResources.find(s => s.resourceId === mm.id);
      return {
        ...this.mapToMetamodel(mm),
        isOwner: false,
        permission: shareInfo?.permission as any,
        ownerEmail: shareInfo?.owner.email,
      };
    });

    return [...ownedResult, ...sharedResult];
  }

  /**
   * Get a single metamodel by ID (with access check)
   */
  async getById(id: string, userId: string): Promise<MetamodelWithPermission | null> {
    const metamodel = await prisma.metamodel.findFirst({
      where: { id },
    });

    if (!metamodel) return null;

    // Check access
    const access = await sharingService.checkAccess('METAMODEL', id, userId);
    if (!access.hasAccess) {
      return null;
    }

    return {
      ...this.mapToMetamodel(metamodel),
      isOwner: access.isOwner,
      permission: access.permission,
      ownerEmail: access.ownerEmail,
    };
  }

  /**
   * Create a new metamodel (requires ADMIN or DSL_DESIGNER role)
   */
  async create(data: CreateMetamodelRequest, userId: string, userRole: UserRole): Promise<Metamodel> {
    // Check role permission
    if (!canPerformOperation(userRole, 'metamodel', 'create')) {
      throw new ApiError(403, 'Your role does not allow creating metamodels');
    }

    // Verify the meta-metamodel exists (allow any user's ePackage as reference)
    const ePackage = await prisma.ePackage.findFirst({
      where: { id: data.conformsTo },
    });

    if (!ePackage) {
      throw new ApiError(400, 'Referenced meta-metamodel (conformsTo) not found');
    }

    const metamodel = await prisma.metamodel.create({
      data: {
        id: data.id,
        name: data.name,
        description: data.description,
        uri: data.uri,
        prefix: data.prefix,
        eClass: data.conformsTo,
        classes: (data.classes || []) as any,
        enums: (data.enums || []) as any,
        constraints: (data.constraints || []) as any,
        conformsToId: data.conformsTo,
        userId,
      },
    });

    return this.mapToMetamodel(metamodel);
  }

  /**
   * Update an existing metamodel (with permission check)
   */
  async update(id: string, data: UpdateMetamodelRequest, userId: string, userRole: UserRole): Promise<Metamodel> {
    const access = await sharingService.checkAccess('METAMODEL', id, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Metamodel not found');
    }

    // Check if user can edit based on ownership/sharing and role
    const canEdit = access.isOwner 
      ? userRole !== 'VIEWER'
      : access.permission === 'EDITOR' && userRole !== 'VIEWER';

    if (!canEdit) {
      throw new ApiError(403, 'You do not have permission to edit this metamodel');
    }

    const metamodel = await prisma.metamodel.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.uri !== undefined && { uri: data.uri }),
        ...(data.prefix !== undefined && { prefix: data.prefix }),
        ...(data.classes !== undefined && { classes: data.classes as any }),
        ...(data.enums !== undefined && { enums: data.enums as any }),
        ...(data.constraints !== undefined && { constraints: data.constraints as any }),
      },
    });

    return this.mapToMetamodel(metamodel);
  }

  /**
   * Delete a metamodel (owner only)
   */
  async delete(id: string, userId: string): Promise<void> {
    // Only owner can delete
    const existing = await prisma.metamodel.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new ApiError(404, 'Metamodel not found or you are not the owner');
    }

    // Check dependencies
    const dependentModels = await prisma.model.count({
      where: { conformsToId: id },
    });

    if (dependentModels > 0) {
      throw new ApiError(400, `Cannot delete metamodel: ${dependentModels} model(s) depend on it`);
    }

    const dependentProjects = await prisma.codeGenerationProject.count({
      where: { targetMetamodelId: id },
    });

    if (dependentProjects > 0) {
      throw new ApiError(400, `Cannot delete metamodel: ${dependentProjects} code generation project(s) depend on it`);
    }

    // Delete sharing records
    await sharingService.deleteResourceShares('METAMODEL', id);

    await prisma.metamodel.delete({
      where: { id },
    });
  }

  /**
   * Add a class to a metamodel (requires appropriate role and permission)
   */
  async addClass(metamodelId: string, metaClass: MetaClass, userId: string, userRole: UserRole): Promise<Metamodel> {
    // Check role permission for adding classes
    if (!canPerformOperation(userRole, 'metamodel', 'addClass')) {
      throw new ApiError(403, 'Your role does not allow adding classes to metamodels');
    }

    const access = await sharingService.checkAccess('METAMODEL', metamodelId, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Metamodel not found');
    }

    // Only owner or EDITOR share with appropriate role can add classes
    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this metamodel');
    }

    const metamodel = await prisma.metamodel.findFirst({
      where: { id: metamodelId },
    });

    if (!metamodel) {
      throw new ApiError(404, 'Metamodel not found');
    }

    const classes = (metamodel.classes as unknown as MetaClass[]) || [];
    
    if (classes.some(c => c.id === metaClass.id)) {
      throw new ApiError(400, 'Class with this ID already exists');
    }

    classes.push(metaClass);

    const updated = await prisma.metamodel.update({
      where: { id: metamodelId },
      data: { classes: classes as any },
    });

    return this.mapToMetamodel(updated);
  }

  /**
   * Update a class in a metamodel (requires appropriate permission)
   */
  async updateClass(metamodelId: string, classId: string, updates: Partial<MetaClass>, userId: string, userRole: UserRole): Promise<Metamodel> {
    if (!canPerformOperation(userRole, 'metamodel', 'editClass')) {
      throw new ApiError(403, 'Your role does not allow editing classes');
    }

    const access = await sharingService.checkAccess('METAMODEL', metamodelId, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Metamodel not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this metamodel');
    }

    const metamodel = await prisma.metamodel.findFirst({
      where: { id: metamodelId },
    });

    if (!metamodel) {
      throw new ApiError(404, 'Metamodel not found');
    }

    const classes = (metamodel.classes as unknown as MetaClass[]) || [];
    const classIndex = classes.findIndex(c => c.id === classId);

    if (classIndex === -1) {
      throw new ApiError(404, 'Class not found in metamodel');
    }

    classes[classIndex] = { ...classes[classIndex], ...updates };

    const updated = await prisma.metamodel.update({
      where: { id: metamodelId },
      data: { classes: classes as any },
    });

    return this.mapToMetamodel(updated);
  }

  /**
   * Delete a class from a metamodel (requires appropriate permission)
   */
  async deleteClass(metamodelId: string, classId: string, userId: string, userRole: UserRole): Promise<Metamodel> {
    if (!canPerformOperation(userRole, 'metamodel', 'deleteClass')) {
      throw new ApiError(403, 'Your role does not allow deleting classes');
    }

    const access = await sharingService.checkAccess('METAMODEL', metamodelId, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Metamodel not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this metamodel');
    }

    const metamodel = await prisma.metamodel.findFirst({
      where: { id: metamodelId },
    });

    if (!metamodel) {
      throw new ApiError(404, 'Metamodel not found');
    }

    const classes = ((metamodel.classes as unknown as MetaClass[]) || []).filter(c => c.id !== classId);

    const updated = await prisma.metamodel.update({
      where: { id: metamodelId },
      data: { classes: classes as any },
    });

    return this.mapToMetamodel(updated);
  }

  /**
   * Add a constraint to a metamodel or class
   */
  async addConstraint(
    metamodelId: string, 
    constraint: Constraint, 
    classId: string | undefined,
    userId: string,
    userRole: UserRole
  ): Promise<Metamodel> {
    if (!canPerformOperation(userRole, 'metamodel', 'editClass')) {
      throw new ApiError(403, 'Your role does not allow adding constraints');
    }

    const access = await sharingService.checkAccess('METAMODEL', metamodelId, userId);
    
    if (!access.hasAccess) {
      throw new ApiError(404, 'Metamodel not found');
    }

    if (!access.isOwner && access.permission !== 'EDITOR') {
      throw new ApiError(403, 'You do not have permission to modify this metamodel');
    }

    const metamodel = await prisma.metamodel.findFirst({
      where: { id: metamodelId },
    });

    if (!metamodel) {
      throw new ApiError(404, 'Metamodel not found');
    }

    if (classId) {
      const classes = (metamodel.classes as unknown as MetaClass[]) || [];
      const classIndex = classes.findIndex(c => c.id === classId);

      if (classIndex === -1) {
        throw new ApiError(404, 'Class not found in metamodel');
      }

      if (!classes[classIndex].constraints) {
        classes[classIndex].constraints = [];
      }
      classes[classIndex].constraints!.push(constraint);

      const updated = await prisma.metamodel.update({
        where: { id: metamodelId },
        data: { classes: classes as any },
      });

      return this.mapToMetamodel(updated);
    } else {
      const constraints = (metamodel.constraints as unknown as Constraint[]) || [];
      constraints.push(constraint);

      const updated = await prisma.metamodel.update({
        where: { id: metamodelId },
        data: { constraints: constraints as any },
      });

      return this.mapToMetamodel(updated);
    }
  }

  private mapToMetamodel(mm: any): Metamodel {
    return {
      id: mm.id,
      name: mm.name,
      description: mm.description || undefined,
      eClass: mm.eClass || '',
      uri: mm.uri,
      prefix: mm.prefix,
      classes: (mm.classes as unknown as MetaClass[]) || [],
      enums: (mm.enums as unknown as MetaEnum[]) || [],
      constraints: (mm.constraints as unknown as Constraint[]) || [],
      conformsTo: mm.conformsToId,
    };
  }
}

export const metamodelService = new MetamodelService();
export default metamodelService;
