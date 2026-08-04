import prisma from '../config/database';
import { ApiError } from '../middleware';
import { EPackage, UserRole } from '../../../shared/types';
import { canPerformOperation } from '../middleware/permissions';

class MetametamodelService {
  /**
   * Get all EPackages (meta-metamodels) for a user
   */
  async getAll(userId: string, projectId?: string): Promise<EPackage[]> {
    const packages = await prisma.ePackage.findMany({
      where: projectId ? { projectId } : { userId },
      orderBy: { name: 'asc' },
    });

    return packages.map(pkg => ({
      id: pkg.id,
      projectId: pkg.projectId || undefined,
      name: pkg.name,
      nsURI: pkg.nsURI,
      nsPrefix: pkg.nsPrefix,
      classes: pkg.classes as any[],
    }));
  }

  /**
   * Get a single EPackage by ID (with user ownership check)
   */
  async getById(id: string, userId: string, projectId?: string): Promise<EPackage | null> {
    const pkg = await prisma.ePackage.findFirst({
      where: projectId ? { id, projectId } : { id, userId },
    });

    if (!pkg) return null;

    return {
      id: pkg.id,
      projectId: pkg.projectId || undefined,
      name: pkg.name,
      nsURI: pkg.nsURI,
      nsPrefix: pkg.nsPrefix,
      classes: pkg.classes as any[],
    };
  }

  /**
   * Get EPackage by namespace URI (with user ownership check)
   */
  async getByUri(nsURI: string, userId: string, projectId?: string): Promise<EPackage | null> {
    const pkg = await prisma.ePackage.findFirst({
      where: projectId ? { nsURI, projectId } : { nsURI, userId },
    });

    if (!pkg) return null;

    return {
      id: pkg.id,
      projectId: pkg.projectId || undefined,
      name: pkg.name,
      nsURI: pkg.nsURI,
      nsPrefix: pkg.nsPrefix,
      classes: pkg.classes as any[],
    };
  }

  /**
   * Create a new EPackage for a user
   */
  async create(
    data: Partial<EPackage> & Omit<EPackage, 'id'>,
    userId: string,
    projectId?: string,
    userRole?: UserRole
  ): Promise<EPackage> {
    if (projectId && userRole && !canPerformOperation(userRole, 'metamodel', 'create')) {
      throw new ApiError(403, 'Your role does not allow creating meta-metamodel packages');
    }
    const pkg = await prisma.ePackage.create({
      data: {
        ...(data.id && { id: data.id }), // Use provided ID if available
        name: data.name,
        nsURI: data.nsURI,
        nsPrefix: data.nsPrefix,
        classes: data.classes as any,
        userId,
        projectId,
      },
    });

    return {
      id: pkg.id,
      projectId: pkg.projectId || undefined,
      name: pkg.name,
      nsURI: pkg.nsURI,
      nsPrefix: pkg.nsPrefix,
      classes: pkg.classes as any[],
    };
  }

  /**
   * Update an existing EPackage (with user ownership check)
   */
  async update(
    id: string,
    data: Partial<Omit<EPackage, 'id'>>,
    userId: string,
    projectId?: string,
    userRole?: UserRole
  ): Promise<EPackage> {
    if (projectId && userRole && !canPerformOperation(userRole, 'metamodel', 'editClass')) {
      throw new ApiError(403, 'Your role does not allow editing meta-metamodel packages');
    }
    // First verify ownership
    const existing = await prisma.ePackage.findFirst({
      where: projectId ? { id, projectId } : { id, userId },
    });
    
    if (!existing) {
      throw new ApiError(404, 'EPackage not found');
    }

    const pkg = await prisma.ePackage.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.nsURI && { nsURI: data.nsURI }),
        ...(data.nsPrefix && { nsPrefix: data.nsPrefix }),
        ...(data.classes && { classes: data.classes as any }),
      },
    });

    return {
      id: pkg.id,
      projectId: pkg.projectId || undefined,
      name: pkg.name,
      nsURI: pkg.nsURI,
      nsPrefix: pkg.nsPrefix,
      classes: pkg.classes as any[],
    };
  }

  /**
   * Delete an EPackage (with user ownership check)
   */
  async delete(id: string, userId: string, projectId?: string, userRole?: UserRole): Promise<void> {
    if (projectId && userRole && !canPerformOperation(userRole, 'metamodel', 'deleteClass')) {
      throw new ApiError(403, 'Your role does not allow deleting meta-metamodel packages');
    }
    // First verify ownership
    const existing = await prisma.ePackage.findFirst({
      where: projectId ? { id, projectId } : { id, userId },
    });
    
    if (!existing) {
      throw new ApiError(404, 'EPackage not found');
    }

    // Check if any metamodels depend on this package
    const dependentMetamodels = await prisma.metamodel.count({
      where: projectId ? { conformsToId: id, projectId } : { conformsToId: id, userId },
    });

    if (dependentMetamodels > 0) {
      throw new ApiError(
        400,
        `Cannot delete meta-metamodel: ${dependentMetamodels} metamodel(s) depend on it`
      );
    }

    await prisma.ePackage.delete({
      where: { id },
    });
  }

  /**
   * Initialize core Ecore-like meta-metamodel for a user if it doesn't exist
   */
  async initializeCoreEcore(userId: string, projectId?: string, userRole?: UserRole): Promise<EPackage> {
    const existingCore = await this.getByUri('http://www.modeling-tool.com/ecore', userId, projectId);
    
    if (existingCore) {
      return existingCore;
    }

    // Create the core Ecore-like package with essential classes
    const corePackage = await this.create({
      name: 'Ecore',
      nsURI: 'http://www.modeling-tool.com/ecore',
      nsPrefix: 'ecore',
      classes: [
        {
          id: 'eclass-eclass',
          name: 'EClass',
          abstract: false,
          superTypes: [],
          attributes: [],
          references: [],
        },
        {
          id: 'eclass-eattribute',
          name: 'EAttribute',
          abstract: false,
          superTypes: [],
          attributes: [],
          references: [],
        },
        {
          id: 'eclass-ereference',
          name: 'EReference',
          abstract: false,
          superTypes: [],
          attributes: [],
          references: [],
        },
        {
          id: 'eclass-epackage',
          name: 'EPackage',
          abstract: false,
          superTypes: [],
          attributes: [],
          references: [],
        },
        {
          id: 'eclass-pattern',
          name: 'Pattern',
          abstract: false,
          superTypes: [],
          attributes: [],
          references: [],
        },
        {
          id: 'eclass-rule',
          name: 'Rule',
          abstract: false,
          superTypes: [],
          attributes: [],
          references: [],
        },
      ],
    }, userId, projectId, userRole);

    return corePackage;
  }
}

export const metametamodelService = new MetametamodelService();
export default metametamodelService;
