import prisma from '../config/database';
import { ApiError } from '../middleware';
import { 
  ResourceType, 
  SharePermission, 
  SharedResource as SharedResourceType,
  UserRole 
} from '../../../shared/types';
import { ResourceType as PrismaResourceType, SharePermission as PrismaSharePermission } from '@prisma/client';

// Map string types to Prisma enums
const toPrismaResourceType = (type: ResourceType): PrismaResourceType => type as PrismaResourceType;
const toPrismaPermission = (perm: SharePermission): PrismaSharePermission => perm as PrismaSharePermission;
const isDevelopment = process.env.NODE_ENV === 'development';

const debugLog = (...args: any[]) => {
  if (isDevelopment) {
    console.log(...args);
  }
};

export interface AccessCheckResult {
  hasAccess: boolean;
  isOwner: boolean;
  permission?: SharePermission;
  ownerEmail?: string;
}

class SharingService {
  /**
   * Share a resource with another user by email
   */
  async shareResource(
    resourceType: ResourceType,
    resourceId: string,
    ownerUserId: string,
    targetEmail: string,
    permission: SharePermission
  ): Promise<SharedResourceType> {
    // Verify the owner has the right role to share (ADMIN or DSL_DESIGNER)
    const owner = await prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { id: true, email: true, role: true },
    });

    if (!owner) {
      throw new ApiError(404, 'Owner user not found');
    }

    if (owner.role !== 'ADMIN' && owner.role !== 'DSL_DESIGNER') {
      throw new ApiError(403, 'Only ADMIN and DSL_DESIGNER roles can share resources');
    }

    // Verify the owner actually owns this resource
    const isOwner = await this.checkResourceOwnership(resourceType, resourceId, ownerUserId);
    if (!isOwner) {
      throw new ApiError(403, 'You can only share resources you own');
    }

    // Find the target user by email
    const targetUser = await prisma.user.findUnique({
      where: { email: targetEmail.toLowerCase() },
      select: { id: true, email: true },
    });

    if (!targetUser) {
      throw new ApiError(404, 'User with this email not found');
    }

    if (targetUser.id === ownerUserId) {
      throw new ApiError(400, 'You cannot share a resource with yourself');
    }

    // Check if already shared with this user
    const existingShare = await prisma.sharedResource.findUnique({
      where: {
        resourceType_resourceId_sharedWithId: {
          resourceType: toPrismaResourceType(resourceType),
          resourceId,
          sharedWithId: targetUser.id,
        },
      },
    });

    if (existingShare) {
      // Update the permission instead
      const updated = await prisma.sharedResource.update({
        where: { id: existingShare.id },
        data: { permission: toPrismaPermission(permission) },
        include: {
          owner: { select: { email: true } },
          sharedWith: { select: { email: true } },
        },
      });

      return this.mapToSharedResource(updated);
    }

    // Create new sharing record
    const share = await prisma.sharedResource.create({
      data: {
        resourceType: toPrismaResourceType(resourceType),
        resourceId,
        permission: toPrismaPermission(permission),
        ownerId: ownerUserId,
        sharedWithId: targetUser.id,
      },
      include: {
        owner: { select: { email: true } },
        sharedWith: { select: { email: true } },
      },
    });

    return this.mapToSharedResource(share);
  }

  /**
   * Share a resource with cascading to dependencies
   * When sharing a model, also shares its metamodel
   * When sharing a diagram, also shares its model and metamodel
   * When sharing a codegen project, also shares its target metamodel
   */
  async shareResourceWithCascade(
    resourceType: ResourceType,
    resourceId: string,
    ownerUserId: string,
    targetEmail: string,
    permission: SharePermission
  ): Promise<{ mainShare: SharedResourceType; cascadedShares: SharedResourceType[]; warnings: string[] }> {
    // Share the main resource first
    const mainShare = await this.shareResource(resourceType, resourceId, ownerUserId, targetEmail, permission);
    const cascadedShares: SharedResourceType[] = [];
    const warnings: string[] = [];

    try {
      // Cascade to dependencies based on resource type
      if (resourceType === 'MODEL') {
        // When sharing a model, also share its metamodel
        const model = await prisma.model.findUnique({
          where: { id: resourceId },
          select: { conformsToId: true, userId: true },
        });
        if (model?.conformsToId) {
          const metamodel = await prisma.metamodel.findUnique({
            where: { id: model.conformsToId },
            select: { userId: true },
          });
          if (metamodel) {
            // Try to share using the metamodel's actual owner
            if (metamodel.userId === ownerUserId) {
              try {
                const metamodelShare = await this.shareResource('METAMODEL', model.conformsToId, ownerUserId, targetEmail, permission);
                cascadedShares.push(metamodelShare);
              } catch (err: any) {
                debugLog(`Could not cascade share to metamodel: ${err.message}`);
              }
            } else {
              // Metamodel is owned by someone else - check if already shared with target
              const targetUser = await prisma.user.findUnique({ where: { email: targetEmail.toLowerCase() } });
              if (targetUser) {
                const existingShare = await prisma.sharedResource.findUnique({
                  where: {
                    resourceType_resourceId_sharedWithId: {
                      resourceType: 'METAMODEL',
                      resourceId: model.conformsToId,
                      sharedWithId: targetUser.id,
                    },
                  },
                });
                if (!existingShare) {
                  warnings.push(`The metamodel is owned by another user. Ask them to share it with ${targetEmail} for full access.`);
                }
              }
            }
          }
        }
      } else if (resourceType === 'DIAGRAM') {
        // When sharing a diagram, also share its model and metamodel
        const diagram = await prisma.diagram.findUnique({
          where: { id: resourceId },
          select: { modelId: true, userId: true },
        });
        debugLog('Cascading DIAGRAM share - diagram:', diagram);
        if (diagram?.modelId) {
          // Get model details
          const model = await prisma.model.findUnique({
            where: { id: diagram.modelId },
            select: { id: true, conformsToId: true, userId: true },
          });
          debugLog('Cascading DIAGRAM share - model:', model, 'ownerUserId:', ownerUserId);
          if (model) {
            // Share model using its actual owner
            if (model.userId === ownerUserId) {
              try {
                const modelShare = await this.shareResource('MODEL', model.id, ownerUserId, targetEmail, permission);
                cascadedShares.push(modelShare);
                debugLog('Successfully cascaded share to MODEL');
              } catch (err: any) {
                debugLog(`Could not cascade share to model: ${err.message}`);
              }
            } else {
              debugLog('Model owner mismatch - model.userId:', model.userId, 'ownerUserId:', ownerUserId);
              // Model is owned by someone else
              const targetUser = await prisma.user.findUnique({ where: { email: targetEmail.toLowerCase() } });
              if (targetUser) {
                const existingShare = await prisma.sharedResource.findUnique({
                  where: {
                    resourceType_resourceId_sharedWithId: {
                      resourceType: 'MODEL',
                      resourceId: model.id,
                      sharedWithId: targetUser.id,
                    },
                  },
                });
                if (!existingShare) {
                  warnings.push(`The model is owned by another user. Ask them to share it with ${targetEmail} for full access.`);
                }
              }
            }
            
            // Share metamodel
            if (model.conformsToId) {
              const metamodel = await prisma.metamodel.findUnique({
                where: { id: model.conformsToId },
                select: { userId: true },
              });
              debugLog('Cascading DIAGRAM share - metamodel:', metamodel, 'model.conformsToId:', model.conformsToId);
              if (metamodel) {
                if (metamodel.userId === ownerUserId) {
                  try {
                    const metamodelShare = await this.shareResource('METAMODEL', model.conformsToId, ownerUserId, targetEmail, permission);
                    cascadedShares.push(metamodelShare);
                    debugLog('Successfully cascaded share to METAMODEL');
                  } catch (err: any) {
                    debugLog(`Could not cascade share to metamodel: ${err.message}`);
                  }
                } else {
                  debugLog('Metamodel owner mismatch - metamodel.userId:', metamodel.userId, 'ownerUserId:', ownerUserId);
                  const targetUser = await prisma.user.findUnique({ where: { email: targetEmail.toLowerCase() } });
                  if (targetUser) {
                    const existingShare = await prisma.sharedResource.findUnique({
                      where: {
                        resourceType_resourceId_sharedWithId: {
                          resourceType: 'METAMODEL',
                          resourceId: model.conformsToId,
                          sharedWithId: targetUser.id,
                        },
                      },
                    });
                    if (!existingShare) {
                      warnings.push(`The metamodel is owned by another user. Ask them to share it with ${targetEmail} for full access.`);
                    }
                  }
                }
              } else {
                debugLog('Metamodel not found for id:', model.conformsToId);
              }
            } else {
              debugLog('Model has no conformsToId field');
            }
          }
        }
      } else if (resourceType === 'CODEGEN_PROJECT') {
        // When sharing a codegen project, also share its target metamodel, models, and diagrams
        const project = await prisma.codeGenerationProject.findUnique({
          where: { id: resourceId },
          select: { targetMetamodelId: true, userId: true },
        });
        if (project?.targetMetamodelId) {
          const metamodel = await prisma.metamodel.findUnique({
            where: { id: project.targetMetamodelId },
            select: { userId: true },
          });
          if (metamodel) {
            if (metamodel.userId === ownerUserId) {
              try {
                const metamodelShare = await this.shareResource('METAMODEL', project.targetMetamodelId, ownerUserId, targetEmail, permission);
                cascadedShares.push(metamodelShare);
              } catch (err: any) {
                debugLog(`Could not cascade share to metamodel: ${err.message}`);
              }
            } else {
              const targetUser = await prisma.user.findUnique({ where: { email: targetEmail.toLowerCase() } });
              if (targetUser) {
                const existingShare = await prisma.sharedResource.findUnique({
                  where: {
                    resourceType_resourceId_sharedWithId: {
                      resourceType: 'METAMODEL',
                      resourceId: project.targetMetamodelId,
                      sharedWithId: targetUser.id,
                    },
                  },
                });
                if (!existingShare) {
                  warnings.push(`The target metamodel is owned by another user. Ask them to share it with ${targetEmail} for full access.`);
                }
              }
            }
          }

          // Also share models that conform to the target metamodel and belong to the owner
          const models = await prisma.model.findMany({
            where: { 
              conformsToId: project.targetMetamodelId,
              userId: ownerUserId 
            },
            select: { id: true },
          });
          
          for (const model of models) {
            try {
              const modelShare = await this.shareResource('MODEL', model.id, ownerUserId, targetEmail, permission);
              cascadedShares.push(modelShare);
            } catch (err: any) {
              debugLog(`Could not cascade share to model ${model.id}: ${err.message}`);
            }

            // Also share diagrams for each model
            const diagrams = await prisma.diagram.findMany({
              where: { 
                modelId: model.id,
                userId: ownerUserId 
              },
              select: { id: true },
            });
            
            for (const diagram of diagrams) {
              try {
                const diagramShare = await this.shareResource('DIAGRAM', diagram.id, ownerUserId, targetEmail, permission);
                cascadedShares.push(diagramShare);
              } catch (err: any) {
                debugLog(`Could not cascade share to diagram ${diagram.id}: ${err.message}`);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Error during cascade sharing');
      debugLog('Cascade sharing error detail:', err);
      // Continue - main share was successful
    }

    return { mainShare, cascadedShares, warnings };
  }

  /**
   * Remove sharing for a resource
   */
  async unshareResource(
    resourceType: ResourceType,
    resourceId: string,
    ownerUserId: string,
    sharedWithUserId: string
  ): Promise<void> {
    // Verify ownership
    const isOwner = await this.checkResourceOwnership(resourceType, resourceId, ownerUserId);
    if (!isOwner) {
      throw new ApiError(403, 'You can only unshare resources you own');
    }

    const share = await prisma.sharedResource.findUnique({
      where: {
        resourceType_resourceId_sharedWithId: {
          resourceType: toPrismaResourceType(resourceType),
          resourceId,
          sharedWithId: sharedWithUserId,
        },
      },
    });

    if (!share) {
      throw new ApiError(404, 'Sharing record not found');
    }

    await prisma.sharedResource.delete({
      where: { id: share.id },
    });
  }

  /**
   * Get all users a resource is shared with
   */
  async getResourceShares(
    resourceType: ResourceType,
    resourceId: string,
    requestingUserId: string
  ): Promise<SharedResourceType[]> {
    // Verify the requesting user is the owner
    const isOwner = await this.checkResourceOwnership(resourceType, resourceId, requestingUserId);
    if (!isOwner) {
      throw new ApiError(403, 'Only resource owners can view sharing details');
    }

    const shares = await prisma.sharedResource.findMany({
      where: {
        resourceType: toPrismaResourceType(resourceType),
        resourceId,
      },
      include: {
        owner: { select: { email: true } },
        sharedWith: { select: { email: true } },
      },
    });

    return shares.map(s => this.mapToSharedResource(s));
  }

  /**
   * Get all resources shared with the current user
   */
  async getResourcesSharedWithUser(userId: string): Promise<SharedResourceType[]> {
    const shares = await prisma.sharedResource.findMany({
      where: { sharedWithId: userId },
      include: {
        owner: { select: { email: true } },
        sharedWith: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return shares.map(s => this.mapToSharedResource(s));
  }

  /**
   * Check if a user can access a specific resource
   * Returns detailed access information
   */
  async checkAccess(
    resourceType: ResourceType,
    resourceId: string,
    userId: string
  ): Promise<AccessCheckResult> {
    // First check if user is the owner
    const isOwner = await this.checkResourceOwnership(resourceType, resourceId, userId);
    
    if (isOwner) {
      return { hasAccess: true, isOwner: true };
    }

    // Check if resource is shared with user
    const share = await prisma.sharedResource.findUnique({
      where: {
        resourceType_resourceId_sharedWithId: {
          resourceType: toPrismaResourceType(resourceType),
          resourceId,
          sharedWithId: userId,
        },
      },
      include: {
        owner: { select: { email: true } },
      },
    });

    if (share) {
      return {
        hasAccess: true,
        isOwner: false,
        permission: share.permission as SharePermission,
        ownerEmail: share.owner.email,
      };
    }

    return { hasAccess: false, isOwner: false };
  }

  /**
   * Check if a user owns a resource
   */
  private async checkResourceOwnership(
    resourceType: ResourceType,
    resourceId: string,
    userId: string
  ): Promise<boolean> {
    let resource: { userId: string } | null = null;

    switch (resourceType) {
      case 'METAMODEL':
        resource = await prisma.metamodel.findFirst({
          where: { id: resourceId },
          select: { userId: true },
        });
        break;
      case 'MODEL':
        resource = await prisma.model.findFirst({
          where: { id: resourceId },
          select: { userId: true },
        });
        break;
      case 'DIAGRAM':
        resource = await prisma.diagram.findFirst({
          where: { id: resourceId },
          select: { userId: true },
        });
        break;
      case 'TRANSFORMATION_RULE':
        resource = await prisma.transformationRule.findFirst({
          where: { id: resourceId },
          select: { userId: true },
        });
        break;
      case 'CODEGEN_PROJECT':
        resource = await prisma.codeGenerationProject.findFirst({
          where: { id: resourceId },
          select: { userId: true },
        });
        break;
      case 'TEST_CASE':
        resource = await prisma.testCase.findFirst({
          where: { id: resourceId },
          select: { userId: true },
        });
        break;
    }

    return resource?.userId === userId;
  }

  /**
   * Get the effective permission level for a user on a resource
   * Considers both user role and share permission (returns the more restrictive)
   */
  async getEffectivePermission(
    resourceType: ResourceType,
    resourceId: string,
    userId: string
  ): Promise<{ canView: boolean; canEdit: boolean; canDelete: boolean; canShare: boolean }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      return { canView: false, canEdit: false, canDelete: false, canShare: false };
    }

    const access = await this.checkAccess(resourceType, resourceId, userId);

    if (!access.hasAccess) {
      return { canView: false, canEdit: false, canDelete: false, canShare: false };
    }

    // Owner has full control based on their role
    if (access.isOwner) {
      return {
        canView: true,
        canEdit: user.role !== 'VIEWER',
        canDelete: true,
        canShare: user.role === 'ADMIN' || user.role === 'DSL_DESIGNER',
      };
    }

    // For shared resources, combine share permission with user role
    const sharePermission = access.permission;
    const userRole = user.role as UserRole;

    // VIEWER role can only view regardless of share permission
    if (userRole === 'VIEWER') {
      return { canView: true, canEdit: false, canDelete: false, canShare: false };
    }

    // EDITOR share permission allows editing (VIEWER role already handled above)
    const canEdit = sharePermission === 'EDITOR';

    return {
      canView: true,
      canEdit,
      canDelete: false, // Only owner can delete
      canShare: false,  // Only owner can share
    };
  }

  /**
   * Delete all shares for a resource (called when resource is deleted)
   */
  async deleteResourceShares(resourceType: ResourceType, resourceId: string): Promise<void> {
    await prisma.sharedResource.deleteMany({
      where: {
        resourceType: toPrismaResourceType(resourceType),
        resourceId,
      },
    });
  }

  private mapToSharedResource(share: any): SharedResourceType {
    return {
      id: share.id,
      resourceType: share.resourceType as ResourceType,
      resourceId: share.resourceId,
      permission: share.permission as SharePermission,
      ownerId: share.ownerId,
      ownerEmail: share.owner?.email,
      sharedWithId: share.sharedWithId,
      sharedWithEmail: share.sharedWith?.email,
      createdAt: share.createdAt?.toISOString(),
    };
  }
}

export const sharingService = new SharingService();
export default sharingService;
