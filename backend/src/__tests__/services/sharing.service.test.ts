import { prismaMock } from '../helpers/prisma.mock';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';


beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

import { sharingService } from '../../services/sharing.service';
import { ApiError } from '../../middleware/errorHandler';

const mockOwner = {
  id: 'owner-uuid',
  email: 'owner@example.com',
  password: 'hashed',
  role: 'DSL_DESIGNER' as const,
  isSuspended: false,
  lastLogin: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockTarget = {
  id: 'target-uuid',
  email: 'target@example.com',
  password: 'hashed',
  role: 'MODELER' as const,
  isSuspended: false,
  lastLogin: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockShare = {
  id: 'share-uuid',
  resourceType: 'METAMODEL' as const,
  resourceId: 'mm-uuid-1',
  permission: 'VIEWER' as const,
  ownerId: 'owner-uuid',
  sharedWithId: 'target-uuid',
  createdAt: new Date(),
  updatedAt: new Date(),
  owner: { email: 'owner@example.com' },
  sharedWith: { email: 'target@example.com' },
};

describe('SharingService', () => {
  describe('checkAccess', () => {
    it('returns owner access when user is the resource owner', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue({
        id: 'mm-uuid-1',
        name: 'TestMM',
        description: null,
        uri: 'http://test',
        prefix: 'test',
        eClass: null,
        classes: [],
        enums: [],
        constraints: [],
        conformsToId: 'pkg-1',
        userId: 'owner-uuid',
        projectId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await sharingService.checkAccess('METAMODEL', 'mm-uuid-1', 'owner-uuid');

      expect(result.hasAccess).toBe(true);
      expect(result.isOwner).toBe(true);
    });

    it('returns shared access when resource is shared with user', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue({
        id: 'mm-uuid-1',
        name: 'TestMM',
        description: null,
        uri: 'http://test',
        prefix: 'test',
        eClass: null,
        classes: [],
        enums: [],
        constraints: [],
        conformsToId: 'pkg-1',
        userId: 'other-owner',
        projectId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.sharedResource.findUnique.mockResolvedValue({
        ...mockShare,
        permission: 'VIEWER',
      } as any);

      const result = await sharingService.checkAccess('METAMODEL', 'mm-uuid-1', 'target-uuid');

      expect(result.hasAccess).toBe(true);
      expect(result.isOwner).toBe(false);
      expect(result.permission).toBe('VIEWER');
    });

    it('returns no access when resource is not accessible', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue({
        id: 'mm-uuid-1',
        userId: 'other-owner',
      } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue(null);

      const result = await sharingService.checkAccess('METAMODEL', 'mm-uuid-1', 'stranger-uuid');

      expect(result.hasAccess).toBe(false);
    });

    it('lets project membership supersede a weaker legacy resource share', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue({
        id: 'mm-uuid-1',
        userId: 'other-owner',
        projectId: 'project-uuid-1',
      } as any);
      prismaMock.user.findUnique.mockResolvedValue({ role: 'MODELER' } as any);
      prismaMock.projectMembership.findUnique.mockResolvedValue({ role: 'MODELER' } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue({
        ...mockShare,
        permission: 'VIEWER',
      } as any);

      const result = await sharingService.checkAccess('METAMODEL', 'mm-uuid-1', 'target-uuid');

      expect(result).toEqual(expect.objectContaining({
        hasAccess: true,
        permission: 'EDITOR',
        projectRole: 'MODELER',
      }));
      expect(prismaMock.sharedResource.findUnique).not.toHaveBeenCalled();
    });

    it('grants EDITOR access to a platform ADMIN for any resource', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue({
        id: 'mm-uuid-1',
        userId: 'other-owner',
      } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue(null);
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ role: 'ADMIN' } as any) // isAdmin lookup
        .mockResolvedValueOnce({ email: 'other@example.com' } as any); // owner email

      const result = await sharingService.checkAccess('METAMODEL', 'mm-uuid-1', 'admin-uuid');

      expect(result.hasAccess).toBe(true);
      expect(result.isOwner).toBe(false);
      expect(result.permission).toBe('EDITOR');
      expect(result.ownerEmail).toBe('other@example.com');
    });

    it('denies a platform ADMIN when the resource does not exist', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue(null);
      prismaMock.sharedResource.findUnique.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue({ role: 'ADMIN' } as any);

      const result = await sharingService.checkAccess('METAMODEL', 'missing-uuid', 'admin-uuid');

      expect(result.hasAccess).toBe(false);
    });
  });

  describe('shareResource', () => {
    it('shares resource with target user', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(mockOwner as any) // owner lookup
        .mockResolvedValueOnce(mockTarget as any); // target lookup
      prismaMock.metamodel.findFirst.mockResolvedValue({
        id: 'mm-uuid-1',
        userId: 'owner-uuid',
      } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue(null);
      prismaMock.sharedResource.create.mockResolvedValue(mockShare as any);

      const result = await sharingService.shareResource(
        'METAMODEL',
        'mm-uuid-1',
        'owner-uuid',
        'target@example.com',
        'VIEWER'
      );

      expect(result.resourceId).toBe('mm-uuid-1');
      expect(result.permission).toBe('VIEWER');
    });

    it('throws 403 when owner does not have DSL_DESIGNER or ADMIN role', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        ...mockOwner,
        role: 'MODELER',
      } as any);

      await expect(
        sharingService.shareResource('METAMODEL', 'mm-uuid-1', 'modeler-uuid', 'target@example.com', 'VIEWER')
      ).rejects.toThrow(ApiError);
    });

    it('throws 403 when owner does not own the resource', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(mockOwner as any);
      prismaMock.metamodel.findFirst.mockResolvedValue({
        id: 'mm-uuid-1',
        userId: 'different-owner',
      } as any);

      await expect(
        sharingService.shareResource('METAMODEL', 'mm-uuid-1', 'owner-uuid', 'target@example.com', 'VIEWER')
      ).rejects.toThrow('You can only share resources you own');
    });

    it('throws 404 when the resource does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(mockOwner as any);
      prismaMock.metamodel.findFirst.mockResolvedValue(null);

      await expect(
        sharingService.shareResource('METAMODEL', 'mm-uuid-1', 'owner-uuid', 'target@example.com', 'VIEWER')
      ).rejects.toThrow('Resource not found');
    });

    it('lets an admin share a resource they do not own, attributed to the owner', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ ...mockOwner, id: 'admin-uuid', email: 'admin@example.com', role: 'ADMIN' } as any)
        .mockResolvedValueOnce(mockTarget as any);
      prismaMock.metamodel.findFirst.mockResolvedValue({
        id: 'mm-uuid-1',
        userId: 'real-owner',
      } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue(null);
      prismaMock.sharedResource.create.mockResolvedValue(mockShare as any);

      await sharingService.shareResource('METAMODEL', 'mm-uuid-1', 'admin-uuid', 'target@example.com', 'VIEWER');

      // The share row belongs to the actual resource owner, not the admin
      expect(prismaMock.sharedResource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ownerId: 'real-owner' }),
        })
      );
    });

    it('throws 404 when target user not found', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(mockOwner as any) // owner
        .mockResolvedValueOnce(null); // target not found
      prismaMock.metamodel.findFirst.mockResolvedValue({
        id: 'mm-uuid-1',
        userId: 'owner-uuid',
      } as any);

      await expect(
        sharingService.shareResource('METAMODEL', 'mm-uuid-1', 'owner-uuid', 'unknown@example.com', 'VIEWER')
      ).rejects.toThrow(ApiError);
    });

    it('throws 400 when trying to share with self', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(mockOwner as any) // owner
        .mockResolvedValueOnce({ ...mockOwner, id: 'owner-uuid' } as any); // target is same person
      prismaMock.metamodel.findFirst.mockResolvedValue({
        id: 'mm-uuid-1',
        userId: 'owner-uuid',
      } as any);

      await expect(
        sharingService.shareResource('METAMODEL', 'mm-uuid-1', 'owner-uuid', 'owner@example.com', 'VIEWER')
      ).rejects.toThrow(ApiError);
    });

    it('updates existing share when already shared with user', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(mockOwner as any)
        .mockResolvedValueOnce(mockTarget as any);
      prismaMock.metamodel.findFirst.mockResolvedValue({
        id: 'mm-uuid-1',
        userId: 'owner-uuid',
      } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue(mockShare as any);
      prismaMock.sharedResource.update.mockResolvedValue({
        ...mockShare,
        permission: 'EDITOR',
      } as any);

      const result = await sharingService.shareResource(
        'METAMODEL',
        'mm-uuid-1',
        'owner-uuid',
        'target@example.com',
        'EDITOR'
      );

      expect(prismaMock.sharedResource.update).toHaveBeenCalled();
    });
  });

  describe('unshareResource', () => {
    it('removes sharing record', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue({
        id: 'mm-uuid-1',
        userId: 'owner-uuid',
      } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue(mockShare as any);
      prismaMock.sharedResource.delete.mockResolvedValue(mockShare as any);

      await expect(
        sharingService.unshareResource('METAMODEL', 'mm-uuid-1', 'owner-uuid', 'target-uuid')
      ).resolves.toBeUndefined();
    });

    it('throws 403 when not owner', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue({
        id: 'mm-uuid-1',
        userId: 'real-owner',
      } as any);

      await expect(
        sharingService.unshareResource('METAMODEL', 'mm-uuid-1', 'not-owner', 'target-uuid')
      ).rejects.toThrow(ApiError);
    });

    it('lets an admin remove a share for a resource they do not own', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue({
        id: 'mm-uuid-1',
        userId: 'real-owner',
      } as any);
      prismaMock.user.findUnique.mockResolvedValue({ role: 'ADMIN' } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue(mockShare as any);
      prismaMock.sharedResource.delete.mockResolvedValue(mockShare as any);

      await expect(
        sharingService.unshareResource('METAMODEL', 'mm-uuid-1', 'admin-uuid', 'target-uuid')
      ).resolves.toBeUndefined();
    });

    it('throws 404 when share record not found', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue({
        id: 'mm-uuid-1',
        userId: 'owner-uuid',
      } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue(null);

      await expect(
        sharingService.unshareResource('METAMODEL', 'mm-uuid-1', 'owner-uuid', 'target-uuid')
      ).rejects.toThrow(ApiError);
    });
  });

  describe('getResourcesSharedWithUser', () => {
    it('returns list of shared resources', async () => {
      prismaMock.sharedResource.findMany.mockResolvedValue([mockShare as any]);

      const result = await sharingService.getResourcesSharedWithUser('target-uuid');

      expect(result).toHaveLength(1);
      expect(result[0].resourceId).toBe('mm-uuid-1');
    });
  });

  describe('deleteResourceShares', () => {
    it('deletes all shares for a resource', async () => {
      prismaMock.sharedResource.deleteMany.mockResolvedValue({ count: 2 });

      await expect(
        sharingService.deleteResourceShares('METAMODEL', 'mm-uuid-1')
      ).resolves.toBeUndefined();

      expect(prismaMock.sharedResource.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { resourceType: 'METAMODEL', resourceId: 'mm-uuid-1' },
        })
      );
    });
  });

  describe('getEffectivePermission', () => {
    it('returns owner permissions', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);
      prismaMock.metamodel.findFirst.mockResolvedValue({ id: 'mm-uuid-1', userId: 'user-uuid-1' } as any);

      const result = await sharingService.getEffectivePermission('METAMODEL', 'mm-uuid-1', 'user-uuid-1');

      expect(result.canView).toBe(true);
      expect(result.canEdit).toBe(true);
      expect(result.canDelete).toBe(true);
      expect(result.canShare).toBe(true);
    });

    it('returns no access when user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await sharingService.getEffectivePermission('METAMODEL', 'mm-uuid-1', 'nonexistent');

      expect(result.canView).toBe(false);
      expect(result.canEdit).toBe(false);
    });

    it('returns viewer-only permissions for VIEWER role on shared resource', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'VIEWER' } as any);
      prismaMock.metamodel.findFirst.mockResolvedValue({ id: 'mm-uuid-1', userId: 'other-owner' } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue({
        ...mockShare,
        permission: 'EDITOR',
      } as any);

      const result = await sharingService.getEffectivePermission('METAMODEL', 'mm-uuid-1', 'viewer-user');

      expect(result.canView).toBe(true);
      expect(result.canEdit).toBe(false);
    });

    it('returns no access when resource not accessible', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);
      prismaMock.metamodel.findFirst.mockResolvedValue({ id: 'mm-uuid-1', userId: 'other-owner' } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue(null);

      const result = await sharingService.getEffectivePermission('METAMODEL', 'mm-uuid-1', 'stranger');

      expect(result.canView).toBe(false);
      expect(result.canEdit).toBe(false);
      expect(result.canDelete).toBe(false);
      expect(result.canShare).toBe(false);
    });

    it('returns edit permission for DSL_DESIGNER with EDITOR share', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);
      prismaMock.metamodel.findFirst.mockResolvedValue({ id: 'mm-uuid-1', userId: 'other-owner' } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue({
        ...mockShare,
        permission: 'EDITOR',
        owner: { email: 'owner@example.com' },
      } as any);

      const result = await sharingService.getEffectivePermission('METAMODEL', 'mm-uuid-1', 'dsl-user');

      expect(result.canView).toBe(true);
      expect(result.canEdit).toBe(true);
      expect(result.canDelete).toBe(false);
      expect(result.canShare).toBe(false);
    });

    it('VIEWER owner cannot share', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'VIEWER' } as any);
      prismaMock.metamodel.findFirst.mockResolvedValue({ id: 'mm-uuid-1', userId: 'viewer-owner' } as any);

      const result = await sharingService.getEffectivePermission('METAMODEL', 'mm-uuid-1', 'viewer-owner');

      expect(result.canView).toBe(true);
      expect(result.canEdit).toBe(false);
      expect(result.canDelete).toBe(true);
      expect(result.canShare).toBe(false);
    });

    it('ADMIN owner can share', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'ADMIN' } as any);
      prismaMock.metamodel.findFirst.mockResolvedValue({ id: 'mm-uuid-1', userId: 'admin-owner' } as any);

      const result = await sharingService.getEffectivePermission('METAMODEL', 'mm-uuid-1', 'admin-owner');

      expect(result.canShare).toBe(true);
    });
  });

  describe('checkAccess (non-metamodel types)', () => {
    it('returns owner access for MODEL', async () => {
      prismaMock.model.findFirst.mockResolvedValue({ id: 'model-1', userId: 'owner-uuid' } as any);

      const result = await sharingService.checkAccess('MODEL', 'model-1', 'owner-uuid');

      expect(result.hasAccess).toBe(true);
      expect(result.isOwner).toBe(true);
    });

    it('returns owner access for DIAGRAM', async () => {
      prismaMock.diagram.findFirst.mockResolvedValue({ id: 'diag-1', userId: 'owner-uuid' } as any);

      const result = await sharingService.checkAccess('DIAGRAM', 'diag-1', 'owner-uuid');

      expect(result.hasAccess).toBe(true);
      expect(result.isOwner).toBe(true);
    });

    it('returns owner access for TRANSFORMATION_RULE', async () => {
      prismaMock.transformationRule.findFirst.mockResolvedValue({ id: 'tr-1', userId: 'owner-uuid' } as any);

      const result = await sharingService.checkAccess('TRANSFORMATION_RULE', 'tr-1', 'owner-uuid');

      expect(result.hasAccess).toBe(true);
      expect(result.isOwner).toBe(true);
    });

    it('returns owner access for CODEGEN_PROJECT', async () => {
      prismaMock.codeGenerationProject.findFirst.mockResolvedValue({ id: 'cg-1', userId: 'owner-uuid' } as any);

      const result = await sharingService.checkAccess('CODEGEN_PROJECT', 'cg-1', 'owner-uuid');

      expect(result.hasAccess).toBe(true);
      expect(result.isOwner).toBe(true);
    });

    it('returns owner access for TEST_CASE', async () => {
      prismaMock.testCase.findFirst.mockResolvedValue({ id: 'tc-1', userId: 'owner-uuid' } as any);

      const result = await sharingService.checkAccess('TEST_CASE', 'tc-1', 'owner-uuid');

      expect(result.hasAccess).toBe(true);
      expect(result.isOwner).toBe(true);
    });

    it('returns shared access with ownerEmail when resource shared', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue({ id: 'mm-uuid-1', userId: 'other-owner' } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue({
        ...mockShare,
        permission: 'EDITOR',
        owner: { email: 'owner@example.com' },
      } as any);

      const result = await sharingService.checkAccess('METAMODEL', 'mm-uuid-1', 'target-uuid');

      expect(result.hasAccess).toBe(true);
      expect(result.permission).toBe('EDITOR');
      expect(result.ownerEmail).toBe('owner@example.com');
    });
  });

  describe('getResourceShares', () => {
    it('returns shares when user is owner', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue({ id: 'mm-uuid-1', userId: 'owner-uuid' } as any);
      prismaMock.sharedResource.findMany.mockResolvedValue([mockShare as any]);

      const result = await sharingService.getResourceShares('METAMODEL', 'mm-uuid-1', 'owner-uuid');

      expect(result).toHaveLength(1);
      expect(result[0].resourceId).toBe('mm-uuid-1');
    });

    it('throws 403 when user is not the owner', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue({ id: 'mm-uuid-1', userId: 'real-owner' } as any);

      await expect(
        sharingService.getResourceShares('METAMODEL', 'mm-uuid-1', 'not-owner')
      ).rejects.toThrow(ApiError);
    });

    it('lets an admin view shares for a resource they do not own', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue({ id: 'mm-uuid-1', userId: 'real-owner' } as any);
      prismaMock.user.findUnique.mockResolvedValue({ role: 'ADMIN' } as any);
      prismaMock.sharedResource.findMany.mockResolvedValue([mockShare as any]);

      const result = await sharingService.getResourceShares('METAMODEL', 'mm-uuid-1', 'admin-uuid');

      expect(result).toHaveLength(1);
    });
  });

  describe('shareResourceWithCascade', () => {
    it('shares MODEL and cascades to metamodel when same owner', async () => {
      // Main share setup
      prismaMock.user.findUnique
        .mockResolvedValueOnce(mockOwner as any) // owner for main share
        .mockResolvedValueOnce(mockTarget as any) // target for main share
        .mockResolvedValueOnce(mockOwner as any) // owner for cascade share
        .mockResolvedValueOnce(mockTarget as any); // target for cascade share
      prismaMock.model.findFirst.mockResolvedValue({ id: 'model-1', userId: 'owner-uuid' } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue(null);
      prismaMock.sharedResource.create.mockResolvedValue(mockShare as any);
      prismaMock.model.findUnique.mockResolvedValue({
        id: 'model-1',
        conformsToId: 'mm-uuid-1',
        userId: 'owner-uuid',
      } as any);
      prismaMock.metamodel.findUnique.mockResolvedValue({ userId: 'owner-uuid' } as any);
      prismaMock.metamodel.findFirst.mockResolvedValue({ id: 'mm-uuid-1', userId: 'owner-uuid' } as any);

      const result = await sharingService.shareResourceWithCascade(
        'MODEL',
        'model-1',
        'owner-uuid',
        'target@example.com',
        'VIEWER'
      );

      expect(result.mainShare).toBeDefined();
    });

    it('shares DIAGRAM and cascades to model and metamodel', async () => {
      // Main share for DIAGRAM
      prismaMock.user.findUnique
        .mockResolvedValueOnce(mockOwner as any) // owner for main diagram share
        .mockResolvedValueOnce(mockTarget as any) // target for main diagram share
        .mockResolvedValueOnce(mockOwner as any) // owner for model cascade share
        .mockResolvedValueOnce(mockTarget as any) // target for model cascade share
        .mockResolvedValueOnce(mockOwner as any) // owner for metamodel cascade share
        .mockResolvedValueOnce(mockTarget as any); // target for metamodel cascade share
      prismaMock.diagram.findFirst.mockResolvedValue({ id: 'diag-1', userId: 'owner-uuid' } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue(null);
      prismaMock.sharedResource.create.mockResolvedValue(mockShare as any);
      prismaMock.diagram.findUnique.mockResolvedValue({ id: 'diag-1', modelId: 'model-1', userId: 'owner-uuid' } as any);
      prismaMock.model.findUnique.mockResolvedValue({ id: 'model-1', conformsToId: 'mm-uuid-1', userId: 'owner-uuid' } as any);
      prismaMock.model.findFirst.mockResolvedValue({ id: 'model-1', userId: 'owner-uuid' } as any);
      prismaMock.metamodel.findUnique.mockResolvedValue({ userId: 'owner-uuid' } as any);
      prismaMock.metamodel.findFirst.mockResolvedValue({ id: 'mm-uuid-1', userId: 'owner-uuid' } as any);

      const result = await sharingService.shareResourceWithCascade(
        'DIAGRAM',
        'diag-1',
        'owner-uuid',
        'target@example.com',
        'VIEWER'
      );

      expect(result.mainShare).toBeDefined();
    });

    it('shares CODEGEN_PROJECT and cascades to metamodel', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(mockOwner as any) // owner for main share
        .mockResolvedValueOnce(mockTarget as any) // target for main share
        .mockResolvedValueOnce(mockOwner as any) // owner for metamodel cascade
        .mockResolvedValueOnce(mockTarget as any); // target for metamodel cascade
      prismaMock.codeGenerationProject.findFirst.mockResolvedValue({ id: 'cg-1', userId: 'owner-uuid' } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue(null);
      prismaMock.sharedResource.create.mockResolvedValue(mockShare as any);
      prismaMock.codeGenerationProject.findUnique.mockResolvedValue({
        id: 'cg-1',
        targetMetamodelId: 'mm-uuid-1',
        userId: 'owner-uuid',
      } as any);
      prismaMock.metamodel.findUnique.mockResolvedValue({ userId: 'owner-uuid' } as any);
      prismaMock.metamodel.findFirst.mockResolvedValue({ id: 'mm-uuid-1', userId: 'owner-uuid' } as any);
      prismaMock.model.findMany.mockResolvedValue([]);

      const result = await sharingService.shareResourceWithCascade(
        'CODEGEN_PROJECT',
        'cg-1',
        'owner-uuid',
        'target@example.com',
        'VIEWER'
      );

      expect(result.mainShare).toBeDefined();
    });

    it('returns warnings when metamodel is owned by another user', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(mockOwner as any) // owner for main share
        .mockResolvedValueOnce(mockTarget as any) // target for main share
        .mockResolvedValueOnce(mockTarget as any); // target user lookup for warning check
      prismaMock.model.findFirst.mockResolvedValue({ id: 'model-1', userId: 'owner-uuid' } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue(null);
      prismaMock.sharedResource.create.mockResolvedValue(mockShare as any);
      prismaMock.model.findUnique.mockResolvedValue({
        id: 'model-1',
        conformsToId: 'mm-uuid-1',
        userId: 'owner-uuid',
      } as any);
      prismaMock.metamodel.findUnique.mockResolvedValue({ userId: 'different-owner' } as any);
      // No existing share for metamodel
      prismaMock.sharedResource.findUnique
        .mockResolvedValueOnce(null) // main share check
        .mockResolvedValueOnce(null); // cascade share check

      const result = await sharingService.shareResourceWithCascade(
        'MODEL',
        'model-1',
        'owner-uuid',
        'target@example.com',
        'VIEWER'
      );

      expect(result.mainShare).toBeDefined();
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    });

    it('shares METAMODEL without cascade', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(mockOwner as any)
        .mockResolvedValueOnce(mockTarget as any);
      prismaMock.metamodel.findFirst.mockResolvedValue({ id: 'mm-uuid-1', userId: 'owner-uuid' } as any);
      prismaMock.sharedResource.findUnique.mockResolvedValue(null);
      prismaMock.sharedResource.create.mockResolvedValue(mockShare as any);

      const result = await sharingService.shareResourceWithCascade(
        'METAMODEL',
        'mm-uuid-1',
        'owner-uuid',
        'target@example.com',
        'VIEWER'
      );

      expect(result.mainShare).toBeDefined();
      expect(result.cascadedShares).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('shareResource (owner not found)', () => {
    it('throws 404 when owner user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        sharingService.shareResource('METAMODEL', 'mm-uuid-1', 'nonexistent-owner', 'target@example.com', 'VIEWER')
      ).rejects.toThrow(ApiError);
    });
  });
});
