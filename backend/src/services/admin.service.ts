import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { ApiError } from '../middleware';
import { UserRole, ResourceType } from '../../../shared/types';

const SALT_ROUNDS = 10;

// Types for admin operations
export interface UserListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: UserRole;
  sortBy?: 'email' | 'createdAt' | 'role';
  sortOrder?: 'asc' | 'desc';
}

export interface AdminUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  resourceCounts: {
    metamodels: number;
    models: number;
    diagrams: number;
    transformations: number;
    codegenProjects: number;
    testCases: number;
    files: number;
  };
}

export interface UserListResponse {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ResourceStats {
  users: {
    total: number;
    byRole: Record<UserRole, number>;
  };
  resources: {
    metamodels: number;
    models: number;
    diagrams: number;
    transformations: number;
    codegenProjects: number;
    testCases: number;
    sharedResources: number;
  };
  storage: {
    totalFiles: number;
    totalSizeBytes: number;
  };
  recentResources: {
    type: string;
    name: string;
    createdAt: Date;
    userId: string;
    userEmail: string;
  }[];
  mostActiveUsers: {
    id: string;
    email: string;
    resourceCount: number;
  }[];
}

export interface AdminResourceItem {
  id: string;
  name: string;
  type: ResourceType;
  userId: string;
  userEmail: string;
  createdAt: Date;
  updatedAt: Date;
  sharedWith: number;
}

export interface ResourceListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: ResourceType;
  userId?: string;
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'type' | 'userEmail';
  sortOrder?: 'asc' | 'desc';
}

export interface ResourceListResponse {
  resources: AdminResourceItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SystemHealth {
  database: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTimeMs: number;
    connectionCount?: number;
  };
  api: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
      rss: number;
    };
  };
  storage: {
    totalFiles: number;
    totalSizeBytes: number;
    totalSizeMB: number;
  };
}

export interface ActivityLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: string;
  timestamp: Date;
  ipAddress?: string;
}

class AdminService {
  /**
   * Get paginated list of users with resource counts
   */
  async getUsers(params: UserListParams): Promise<UserListResponse> {
    const {
      page = 1,
      pageSize = 20,
      search,
      role,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;

    const where: any = {};

    if (search) {
      where.email = { contains: search, mode: 'insensitive' };
    }

    if (role) {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              metamodels: true,
              models: true,
              diagrams: true,
              transformationRules: true,
              codegenProjects: true,
              testCases: true,
              storedFiles: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const mappedUsers: AdminUser[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role as UserRole,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      resourceCounts: {
        metamodels: u._count.metamodels,
        models: u._count.models,
        diagrams: u._count.diagrams,
        transformations: u._count.transformationRules,
        codegenProjects: u._count.codegenProjects,
        testCases: u._count.testCases,
        files: u._count.storedFiles,
      },
    }));

    return {
      users: mappedUsers,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get single user details
   */
  async getUserById(userId: string): Promise<AdminUser | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            metamodels: true,
            models: true,
            diagrams: true,
            transformationRules: true,
            codegenProjects: true,
            testCases: true,
            storedFiles: true,
          },
        },
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      resourceCounts: {
        metamodels: user._count.metamodels,
        models: user._count.models,
        diagrams: user._count.diagrams,
        transformations: user._count.transformationRules,
        codegenProjects: user._count.codegenProjects,
        testCases: user._count.testCases,
        files: user._count.storedFiles,
      },
    };
  }

  /**
   * Change user role
   */
  async changeUserRole(
    adminUserId: string,
    targetUserId: string,
    newRole: UserRole
  ): Promise<AdminUser> {
    // Prevent admin from changing their own role
    if (adminUserId === targetUserId) {
      throw new ApiError(400, 'Cannot change your own role');
    }

    const user = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            metamodels: true,
            models: true,
            diagrams: true,
            transformationRules: true,
            codegenProjects: true,
            testCases: true,
            storedFiles: true,
          },
        },
      },
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      resourceCounts: {
        metamodels: user._count.metamodels,
        models: user._count.models,
        diagrams: user._count.diagrams,
        transformations: user._count.transformationRules,
        codegenProjects: user._count.codegenProjects,
        testCases: user._count.testCases,
        files: user._count.storedFiles,
      },
    };
  }

  /**
   * Admin reset password for a user
   */
  async resetUserPassword(
    adminUserId: string,
    targetUserId: string,
    newPassword: string
  ): Promise<void> {
    if (adminUserId === targetUserId) {
      throw new ApiError(400, 'Use the regular password change for your own account');
    }

    if (newPassword.length < 6) {
      throw new ApiError(400, 'Password must be at least 6 characters');
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: targetUserId },
      data: { password: hashedPassword },
    });
  }

  /**
   * Delete user and optionally reassign or delete their resources
   */
  async deleteUser(
    adminUserId: string,
    targetUserId: string,
    reassignToUserId?: string
  ): Promise<{ deletedResources: number; reassignedResources: number }> {
    if (adminUserId === targetUserId) {
      throw new ApiError(400, 'Cannot delete your own account');
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new ApiError(404, 'User not found');
    }

    let reassignedResources = 0;

    // If reassigning, transfer ownership
    if (reassignToUserId) {
      const reassignUser = await prisma.user.findUnique({
        where: { id: reassignToUserId },
      });

      if (!reassignUser) {
        throw new ApiError(404, 'Reassignment target user not found');
      }

      // Transfer all resources to new owner
      const transfers = await prisma.$transaction([
        prisma.metamodel.updateMany({
          where: { userId: targetUserId },
          data: { userId: reassignToUserId },
        }),
        prisma.model.updateMany({
          where: { userId: targetUserId },
          data: { userId: reassignToUserId },
        }),
        prisma.diagram.updateMany({
          where: { userId: targetUserId },
          data: { userId: reassignToUserId },
        }),
        prisma.transformationRule.updateMany({
          where: { userId: targetUserId },
          data: { userId: reassignToUserId },
        }),
        prisma.codeGenerationProject.updateMany({
          where: { userId: targetUserId },
          data: { userId: reassignToUserId },
        }),
        prisma.testCase.updateMany({
          where: { userId: targetUserId },
          data: { userId: reassignToUserId },
        }),
        prisma.storedFile.updateMany({
          where: { userId: targetUserId },
          data: { userId: reassignToUserId },
        }),
        prisma.ePackage.updateMany({
          where: { userId: targetUserId },
          data: { userId: reassignToUserId },
        }),
        // Update share ownership
        prisma.sharedResource.updateMany({
          where: { ownerId: targetUserId },
          data: { ownerId: reassignToUserId },
        }),
      ]);

      reassignedResources = transfers.reduce((sum, r) => sum + r.count, 0);
    }

    // Count resources that will be deleted (cascade)
    const resourceCounts = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        _count: {
          select: {
            metamodels: true,
            models: true,
            diagrams: true,
            transformationRules: true,
            codegenProjects: true,
            testCases: true,
            storedFiles: true,
            ePackages: true,
          },
        },
      },
    });

    const deletedResources = resourceCounts
      ? Object.values(resourceCounts._count).reduce((sum, count) => sum + count, 0)
      : 0;

    // Delete the user (cascade deletes remaining resources)
    await prisma.user.delete({
      where: { id: targetUserId },
    });

    return {
      deletedResources: reassignToUserId ? 0 : deletedResources,
      reassignedResources,
    };
  }

  /**
   * Bulk role change for multiple users
   */
  async bulkChangeRole(
    adminUserId: string,
    userIds: string[],
    newRole: UserRole
  ): Promise<number> {
    // Filter out admin's own ID
    const filteredIds = userIds.filter((id) => id !== adminUserId);

    const result = await prisma.user.updateMany({
      where: { id: { in: filteredIds } },
      data: { role: newRole },
    });

    return result.count;
  }

  /**
   * Bulk delete users
   */
  async bulkDeleteUsers(
    adminUserId: string,
    userIds: string[]
  ): Promise<number> {
    const filteredIds = userIds.filter((id) => id !== adminUserId);

    const result = await prisma.user.deleteMany({
      where: { id: { in: filteredIds } },
    });

    return result.count;
  }

  /**
   * Get resource statistics for dashboard
   */
  async getResourceStats(): Promise<ResourceStats> {
    const [
      totalUsers,
      adminCount,
      dslDesignerCount,
      modelerCount,
      viewerCount,
      metamodelCount,
      modelCount,
      diagramCount,
      transformationCount,
      codegenCount,
      testCaseCount,
      sharedCount,
      fileStats,
      recentResources,
      activeUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'DSL_DESIGNER' } }),
      prisma.user.count({ where: { role: 'MODELER' } }),
      prisma.user.count({ where: { role: 'VIEWER' } }),
      prisma.metamodel.count(),
      prisma.model.count(),
      prisma.diagram.count(),
      prisma.transformationRule.count(),
      prisma.codeGenerationProject.count(),
      prisma.testCase.count(),
      prisma.sharedResource.count(),
      prisma.storedFile.aggregate({
        _count: true,
        _sum: { size: true },
      }),
      // Get recent resources
      prisma.$queryRaw<any[]>`
        SELECT * FROM (
          SELECT id, name, 'METAMODEL' as type, "userId", "createdAt" FROM metamodels
          UNION ALL
          SELECT id, name, 'MODEL' as type, "userId", "createdAt" FROM models
          UNION ALL
          SELECT id, name, 'DIAGRAM' as type, "userId", "createdAt" FROM diagrams
        ) combined
        ORDER BY "createdAt" DESC
        LIMIT 10
      `,
      // Get most active users by resource count
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          _count: {
            select: {
              metamodels: true,
              models: true,
              diagrams: true,
              transformationRules: true,
              codegenProjects: true,
            },
          },
        },
        orderBy: [
          { metamodels: { _count: 'desc' } },
        ],
        take: 10,
      }),
    ]);

    // Fetch user emails for recent resources
    const userIds = [...new Set(recentResources.map((r) => r.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.email]));

    return {
      users: {
        total: totalUsers,
        byRole: {
          ADMIN: adminCount,
          DSL_DESIGNER: dslDesignerCount,
          MODELER: modelerCount,
          VIEWER: viewerCount,
        },
      },
      resources: {
        metamodels: metamodelCount,
        models: modelCount,
        diagrams: diagramCount,
        transformations: transformationCount,
        codegenProjects: codegenCount,
        testCases: testCaseCount,
        sharedResources: sharedCount,
      },
      storage: {
        totalFiles: fileStats._count,
        totalSizeBytes: fileStats._sum.size || 0,
      },
      recentResources: recentResources.map((r) => ({
        type: r.type,
        name: r.name,
        createdAt: r.createdAt,
        userId: r.userId,
        userEmail: userMap.get(r.userId) || 'Unknown',
      })),
      mostActiveUsers: activeUsers.map((u) => ({
        id: u.id,
        email: u.email,
        resourceCount:
          u._count.metamodels +
          u._count.models +
          u._count.diagrams +
          u._count.transformationRules +
          u._count.codegenProjects,
      })).sort((a, b) => b.resourceCount - a.resourceCount),
    };
  }

  /**
   * Get all resources with filtering
   */
  async getResources(params: ResourceListParams): Promise<ResourceListResponse> {
    const {
      page = 1,
      pageSize = 20,
      search,
      type,
      userId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;

    const resources: AdminResourceItem[] = [];
    let total = 0;

    // Build where clauses
    const nameFilter = search ? { contains: search, mode: 'insensitive' as const } : undefined;
    const userFilter = userId ? { userId } : undefined;

    // Fetch resources based on type filter
    const types = type ? [type] : ['METAMODEL', 'MODEL', 'DIAGRAM', 'TRANSFORMATION_RULE', 'CODEGEN_PROJECT', 'TEST_CASE'];

    for (const resourceType of types) {
      let items: any[] = [];
      let count = 0;

      const where = {
        ...(nameFilter && { name: nameFilter }),
        ...userFilter,
      };

      switch (resourceType) {
        case 'METAMODEL':
          [items, count] = await Promise.all([
            prisma.metamodel.findMany({
              where,
              include: {
                user: { select: { email: true } },
                _count: { select: { models: true } },
              },
              orderBy: { [sortBy]: sortOrder },
            }),
            prisma.metamodel.count({ where }),
          ]);
          break;
        case 'MODEL':
          [items, count] = await Promise.all([
            prisma.model.findMany({
              where,
              include: {
                user: { select: { email: true } },
                _count: { select: { diagrams: true } },
              },
              orderBy: { [sortBy]: sortOrder },
            }),
            prisma.model.count({ where }),
          ]);
          break;
        case 'DIAGRAM':
          [items, count] = await Promise.all([
            prisma.diagram.findMany({
              where,
              include: { user: { select: { email: true } } },
              orderBy: { [sortBy]: sortOrder },
            }),
            prisma.diagram.count({ where }),
          ]);
          break;
        case 'TRANSFORMATION_RULE':
          [items, count] = await Promise.all([
            prisma.transformationRule.findMany({
              where,
              include: { user: { select: { email: true } } },
              orderBy: { [sortBy]: sortOrder },
            }),
            prisma.transformationRule.count({ where }),
          ]);
          break;
        case 'CODEGEN_PROJECT':
          [items, count] = await Promise.all([
            prisma.codeGenerationProject.findMany({
              where,
              include: { user: { select: { email: true } } },
              orderBy: { [sortBy]: sortOrder },
            }),
            prisma.codeGenerationProject.count({ where }),
          ]);
          break;
        case 'TEST_CASE':
          [items, count] = await Promise.all([
            prisma.testCase.findMany({
              where,
              include: { user: { select: { email: true } } },
              orderBy: { [sortBy]: sortOrder },
            }),
            prisma.testCase.count({ where }),
          ]);
          break;
      }

      // Get share counts for each item
      for (const item of items) {
        const shareCount = await prisma.sharedResource.count({
          where: {
            resourceType: resourceType as any,
            resourceId: item.id,
          },
        });

        resources.push({
          id: item.id,
          name: item.name,
          type: resourceType as ResourceType,
          userId: item.userId,
          userEmail: item.user?.email || 'Unknown',
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          sharedWith: shareCount,
        });
      }

      total += count;
    }

    // Sort all resources
    resources.sort((a, b) => {
      const aVal = a[sortBy as keyof AdminResourceItem];
      const bVal = b[sortBy as keyof AdminResourceItem];
      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });

    // Paginate
    const startIdx = (page - 1) * pageSize;
    const paginatedResources = resources.slice(startIdx, startIdx + pageSize);

    return {
      resources: paginatedResources,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Delete a resource by type and ID
   */
  async deleteResource(type: ResourceType, resourceId: string): Promise<void> {
    switch (type) {
      case 'METAMODEL':
        await prisma.metamodel.delete({ where: { id: resourceId } });
        break;
      case 'MODEL':
        await prisma.model.delete({ where: { id: resourceId } });
        break;
      case 'DIAGRAM':
        await prisma.diagram.delete({ where: { id: resourceId } });
        break;
      case 'TRANSFORMATION_RULE':
        await prisma.transformationRule.delete({ where: { id: resourceId } });
        break;
      case 'CODEGEN_PROJECT':
        await prisma.codeGenerationProject.delete({ where: { id: resourceId } });
        break;
      case 'TEST_CASE':
        await prisma.testCase.delete({ where: { id: resourceId } });
        break;
      default:
        throw new ApiError(400, 'Invalid resource type');
    }
  }

  /**
   * Transfer resource ownership
   */
  async transferResourceOwnership(
    type: ResourceType,
    resourceId: string,
    newOwnerId: string
  ): Promise<void> {
    const newOwner = await prisma.user.findUnique({ where: { id: newOwnerId } });
    if (!newOwner) {
      throw new ApiError(404, 'New owner not found');
    }

    switch (type) {
      case 'METAMODEL':
        await prisma.metamodel.update({
          where: { id: resourceId },
          data: { userId: newOwnerId },
        });
        break;
      case 'MODEL':
        await prisma.model.update({
          where: { id: resourceId },
          data: { userId: newOwnerId },
        });
        break;
      case 'DIAGRAM':
        await prisma.diagram.update({
          where: { id: resourceId },
          data: { userId: newOwnerId },
        });
        break;
      case 'TRANSFORMATION_RULE':
        await prisma.transformationRule.update({
          where: { id: resourceId },
          data: { userId: newOwnerId },
        });
        break;
      case 'CODEGEN_PROJECT':
        await prisma.codeGenerationProject.update({
          where: { id: resourceId },
          data: { userId: newOwnerId },
        });
        break;
      case 'TEST_CASE':
        await prisma.testCase.update({
          where: { id: resourceId },
          data: { userId: newOwnerId },
        });
        break;
      default:
        throw new ApiError(400, 'Invalid resource type');
    }

    // Update share ownership records
    await prisma.sharedResource.updateMany({
      where: {
        resourceType: type as any,
        resourceId,
      },
      data: { ownerId: newOwnerId },
    });
  }

  /**
   * Remove all shares for a resource
   */
  async forceUnshareResource(type: ResourceType, resourceId: string): Promise<number> {
    const result = await prisma.sharedResource.deleteMany({
      where: {
        resourceType: type as any,
        resourceId,
      },
    });
    return result.count;
  }

  /**
   * Get all sharing relationships
   */
  async getShareAudit(params: {
    page?: number;
    pageSize?: number;
    resourceType?: ResourceType;
  }): Promise<{
    shares: any[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page = 1, pageSize = 20, resourceType } = params;

    const where = resourceType ? { resourceType: resourceType as any } : {};

    const [shares, total] = await Promise.all([
      prisma.sharedResource.findMany({
        where,
        include: {
          owner: { select: { email: true } },
          sharedWith: { select: { email: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.sharedResource.count({ where }),
    ]);

    return {
      shares: shares.map((s) => ({
        id: s.id,
        resourceType: s.resourceType,
        resourceId: s.resourceId,
        permission: s.permission,
        ownerEmail: s.owner.email,
        sharedWithEmail: s.sharedWith.email,
        createdAt: s.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get system health information
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const startTime = process.hrtime();

    // Test database connection
    let dbStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let dbResponseTime = 0;

    try {
      const dbStart = process.hrtime();
      await prisma.$queryRaw`SELECT 1`;
      const dbEnd = process.hrtime(dbStart);
      dbResponseTime = dbEnd[0] * 1000 + dbEnd[1] / 1000000;

      if (dbResponseTime > 1000) {
        dbStatus = 'degraded';
      }
    } catch (error) {
      dbStatus = 'unhealthy';
      dbResponseTime = -1;
    }

    // Get storage stats
    const storageStats = await prisma.storedFile.aggregate({
      _count: true,
      _sum: { size: true },
    });

    // Get memory usage
    const memUsage = process.memoryUsage();

    return {
      database: {
        status: dbStatus,
        responseTimeMs: Math.round(dbResponseTime * 100) / 100,
      },
      api: {
        status: 'healthy',
        uptime: process.uptime(),
        memoryUsage: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          rss: memUsage.rss,
        },
      },
      storage: {
        totalFiles: storageStats._count,
        totalSizeBytes: storageStats._sum.size || 0,
        totalSizeMB: Math.round((storageStats._sum.size || 0) / 1024 / 1024 * 100) / 100,
      },
    };
  }

  /**
   * Update user's last login timestamp
   */
  async updateLastLogin(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLogin: new Date() },
    });
  }

  /**
   * Get resource details for preview
   */
  async getResourceDetails(type: ResourceType, resourceId: string): Promise<any> {
    switch (type) {
      case 'METAMODEL':
        return prisma.metamodel.findUnique({
          where: { id: resourceId },
          include: { user: { select: { email: true } } },
        });
      case 'MODEL':
        return prisma.model.findUnique({
          where: { id: resourceId },
          include: {
            user: { select: { email: true } },
            conformsTo: { select: { name: true } },
          },
        });
      case 'DIAGRAM':
        return prisma.diagram.findUnique({
          where: { id: resourceId },
          include: {
            user: { select: { email: true } },
            model: { select: { name: true } },
          },
        });
      case 'TRANSFORMATION_RULE':
        return prisma.transformationRule.findUnique({
          where: { id: resourceId },
          include: { user: { select: { email: true } } },
        });
      case 'CODEGEN_PROJECT':
        return prisma.codeGenerationProject.findUnique({
          where: { id: resourceId },
          include: { user: { select: { email: true } } },
        });
      case 'TEST_CASE':
        return prisma.testCase.findUnique({
          where: { id: resourceId },
          include: { user: { select: { email: true } } },
        });
      default:
        throw new ApiError(400, 'Invalid resource type');
    }
  }
}

export const adminService = new AdminService();
