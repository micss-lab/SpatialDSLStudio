import prisma from '../config/database';
import { ApiError } from '../middleware';
import { EPackage } from '../../../shared/types';

class MetametamodelService {
  /**
   * Get all EPackages (meta-metamodels) for a user
   */
  async getAll(userId: string): Promise<EPackage[]> {
    const packages = await prisma.ePackage.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });

    return packages.map(pkg => ({
      id: pkg.id,
      name: pkg.name,
      nsURI: pkg.nsURI,
      nsPrefix: pkg.nsPrefix,
      classes: pkg.classes as any[],
    }));
  }

  /**
   * Get a single EPackage by ID (with user ownership check)
   */
  async getById(id: string, userId: string): Promise<EPackage | null> {
    const pkg = await prisma.ePackage.findFirst({
      where: { id, userId },
    });

    if (!pkg) return null;

    return {
      id: pkg.id,
      name: pkg.name,
      nsURI: pkg.nsURI,
      nsPrefix: pkg.nsPrefix,
      classes: pkg.classes as any[],
    };
  }

  /**
   * Get EPackage by namespace URI (with user ownership check)
   */
  async getByUri(nsURI: string, userId: string): Promise<EPackage | null> {
    const pkg = await prisma.ePackage.findFirst({
      where: { nsURI, userId },
    });

    if (!pkg) return null;

    return {
      id: pkg.id,
      name: pkg.name,
      nsURI: pkg.nsURI,
      nsPrefix: pkg.nsPrefix,
      classes: pkg.classes as any[],
    };
  }

  /**
   * Create a new EPackage for a user
   */
  async create(data: Partial<EPackage> & Omit<EPackage, 'id'>, userId: string): Promise<EPackage> {
    const pkg = await prisma.ePackage.create({
      data: {
        ...(data.id && { id: data.id }), // Use provided ID if available
        name: data.name,
        nsURI: data.nsURI,
        nsPrefix: data.nsPrefix,
        classes: data.classes as any,
        userId,
      },
    });

    return {
      id: pkg.id,
      name: pkg.name,
      nsURI: pkg.nsURI,
      nsPrefix: pkg.nsPrefix,
      classes: pkg.classes as any[],
    };
  }

  /**
   * Update an existing EPackage (with user ownership check)
   */
  async update(id: string, data: Partial<Omit<EPackage, 'id'>>, userId: string): Promise<EPackage> {
    // First verify ownership
    const existing = await prisma.ePackage.findFirst({
      where: { id, userId },
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
      name: pkg.name,
      nsURI: pkg.nsURI,
      nsPrefix: pkg.nsPrefix,
      classes: pkg.classes as any[],
    };
  }

  /**
   * Delete an EPackage (with user ownership check)
   */
  async delete(id: string, userId: string): Promise<void> {
    // First verify ownership
    const existing = await prisma.ePackage.findFirst({
      where: { id, userId },
    });
    
    if (!existing) {
      throw new ApiError(404, 'EPackage not found');
    }

    // Check if any metamodels depend on this package
    const dependentMetamodels = await prisma.metamodel.count({
      where: { conformsToId: id, userId },
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
  async initializeCoreEcore(userId: string): Promise<EPackage> {
    const existingCore = await this.getByUri('http://www.modeling-tool.com/ecore', userId);
    
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
    }, userId);

    return corePackage;
  }
}

export const metametamodelService = new MetametamodelService();
export default metametamodelService;
