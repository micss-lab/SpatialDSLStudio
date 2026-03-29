import { prismaMock } from '../helpers/prisma.mock';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$hashed$password'),
  compare: jest.fn(),
}));

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

import { adminService } from '../../services/admin.service';
import { ApiError } from '../../middleware/errorHandler';

const makeUser = (overrides = {}) => ({
  id: 'user-uuid-1',
  email: 'user@example.com',
  password: '$2b$10$hashedpassword',
  role: 'DSL_DESIGNER' as const,
  isSuspended: false,
  lastLogin: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: {
    metamodels: 2,
    models: 3,
    diagrams: 1,
    transformationRules: 0,
    codegenProjects: 1,
    testCases: 0,
    storedFiles: 0,
  },
  ...overrides,
});

describe('AdminService', () => {
  describe('getUsers', () => {
    it('returns paginated users', async () => {
      prismaMock.user.findMany.mockResolvedValue([makeUser()]);
      prismaMock.user.count.mockResolvedValue(1);

      const result = await adminService.getUsers({ page: 1, pageSize: 20 });

      expect(result.users).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('applies search filter', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      const result = await adminService.getUsers({ search: 'admin' });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: expect.objectContaining({ contains: 'admin' }),
          }),
        })
      );
    });

    it('applies role filter', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await adminService.getUsers({ role: 'ADMIN' });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'ADMIN' }),
        })
      );
    });
  });

  describe('getUserById', () => {
    it('returns user details', async () => {
      prismaMock.user.findUnique.mockResolvedValue(makeUser() as any);

      const result = await adminService.getUserById('user-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.resourceCounts.metamodels).toBe(2);
    });

    it('returns null when not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await adminService.getUserById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('changeUserRole', () => {
    it('changes user role successfully', async () => {
      prismaMock.user.update.mockResolvedValue(makeUser({ role: 'MODELER' }) as any);

      const result = await adminService.changeUserRole('admin-uuid', 'user-uuid-1', 'MODELER');

      expect(result.role).toBe('MODELER');
    });

    it('throws 400 when admin tries to change own role', async () => {
      await expect(
        adminService.changeUserRole('admin-uuid', 'admin-uuid', 'VIEWER')
      ).rejects.toThrow(ApiError);
    });
  });

  describe('resetUserPassword', () => {
    it('resets password successfully', async () => {
      prismaMock.user.update.mockResolvedValue(makeUser() as any);

      await expect(
        adminService.resetUserPassword('admin-uuid', 'user-uuid-1', 'newpassword123')
      ).resolves.toBeUndefined();

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-uuid-1' },
          data: { password: '$hashed$password' },
        })
      );
    });

    it('throws 400 when admin tries to reset own password', async () => {
      await expect(
        adminService.resetUserPassword('admin-uuid', 'admin-uuid', 'newpassword123')
      ).rejects.toThrow(ApiError);
    });

    it('throws 400 when new password too short', async () => {
      await expect(
        adminService.resetUserPassword('admin-uuid', 'user-uuid-1', 'short')
      ).rejects.toThrow(ApiError);
    });
  });

  describe('deleteUser', () => {
    it('deletes user and their resources', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(makeUser() as any) // targetUser
        .mockResolvedValueOnce({
          _count: {
            metamodels: 1,
            models: 1,
            diagrams: 0,
            transformationRules: 0,
            codegenProjects: 0,
            testCases: 0,
            storedFiles: 0,
            ePackages: 1,
          },
        } as any); // resource counts
      prismaMock.user.delete.mockResolvedValue(makeUser() as any);

      const result = await adminService.deleteUser('admin-uuid', 'user-uuid-1');

      expect(result.deletedResources).toBeGreaterThanOrEqual(0);
      expect(prismaMock.user.delete).toHaveBeenCalled();
    });

    it('throws 400 when admin tries to delete themselves', async () => {
      await expect(adminService.deleteUser('admin-uuid', 'admin-uuid')).rejects.toThrow(ApiError);
    });

    it('throws 404 when target user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      await expect(adminService.deleteUser('admin-uuid', 'nonexistent')).rejects.toThrow(ApiError);
    });
  });

  describe('bulkChangeRole', () => {
    it('changes roles for multiple users, excluding admin', async () => {
      prismaMock.user.updateMany.mockResolvedValue({ count: 2 });

      const result = await adminService.bulkChangeRole('admin-uuid', ['user-1', 'user-2', 'admin-uuid'], 'VIEWER');

      expect(result).toBe(2);
      expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['user-1', 'user-2'] } },
        })
      );
    });
  });

  describe('bulkDeleteUsers', () => {
    it('deletes multiple users, excluding admin', async () => {
      prismaMock.user.deleteMany.mockResolvedValue({ count: 2 });

      const result = await adminService.bulkDeleteUsers('admin-uuid', ['user-1', 'user-2', 'admin-uuid']);

      expect(result).toBe(2);
    });
  });

  describe('deleteResource', () => {
    it('deletes metamodel', async () => {
      prismaMock.metamodel.delete.mockResolvedValue({} as any);

      await adminService.deleteResource('METAMODEL', 'mm-uuid-1');

      expect(prismaMock.metamodel.delete).toHaveBeenCalledWith({ where: { id: 'mm-uuid-1' } });
    });

    it('deletes model', async () => {
      prismaMock.model.delete.mockResolvedValue({} as any);

      await adminService.deleteResource('MODEL', 'model-uuid-1');

      expect(prismaMock.model.delete).toHaveBeenCalled();
    });

    it('throws 400 for invalid resource type', async () => {
      await expect(adminService.deleteResource('INVALID' as any, 'id')).rejects.toThrow(ApiError);
    });
  });

  describe('transferResourceOwnership', () => {
    it('transfers resource ownership', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'new-owner', email: 'new@example.com' } as any);
      prismaMock.metamodel.update.mockResolvedValue({} as any);
      prismaMock.sharedResource.updateMany.mockResolvedValue({ count: 0 });

      await adminService.transferResourceOwnership('METAMODEL', 'mm-uuid-1', 'new-owner');

      expect(prismaMock.metamodel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mm-uuid-1' },
          data: { userId: 'new-owner' },
        })
      );
    });

    it('throws 404 when new owner not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        adminService.transferResourceOwnership('METAMODEL', 'mm-uuid-1', 'nonexistent')
      ).rejects.toThrow(ApiError);
    });

    it('transfers MODEL ownership', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'new-owner' } as any);
      prismaMock.model.update.mockResolvedValue({} as any);
      prismaMock.sharedResource.updateMany.mockResolvedValue({ count: 0 });

      await adminService.transferResourceOwnership('MODEL', 'model-uuid-1', 'new-owner');

      expect(prismaMock.model.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'model-uuid-1' }, data: { userId: 'new-owner' } })
      );
    });

    it('transfers DIAGRAM ownership', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'new-owner' } as any);
      prismaMock.diagram.update.mockResolvedValue({} as any);
      prismaMock.sharedResource.updateMany.mockResolvedValue({ count: 0 });

      await adminService.transferResourceOwnership('DIAGRAM', 'diag-uuid-1', 'new-owner');

      expect(prismaMock.diagram.update).toHaveBeenCalled();
    });

    it('transfers TRANSFORMATION_RULE ownership', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'new-owner' } as any);
      prismaMock.transformationRule.update.mockResolvedValue({} as any);
      prismaMock.sharedResource.updateMany.mockResolvedValue({ count: 0 });

      await adminService.transferResourceOwnership('TRANSFORMATION_RULE', 'tr-uuid-1', 'new-owner');

      expect(prismaMock.transformationRule.update).toHaveBeenCalled();
    });

    it('transfers CODEGEN_PROJECT ownership', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'new-owner' } as any);
      prismaMock.codeGenerationProject.update.mockResolvedValue({} as any);
      prismaMock.sharedResource.updateMany.mockResolvedValue({ count: 0 });

      await adminService.transferResourceOwnership('CODEGEN_PROJECT', 'cg-uuid-1', 'new-owner');

      expect(prismaMock.codeGenerationProject.update).toHaveBeenCalled();
    });

    it('transfers TEST_CASE ownership', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'new-owner' } as any);
      prismaMock.testCase.update.mockResolvedValue({} as any);
      prismaMock.sharedResource.updateMany.mockResolvedValue({ count: 0 });

      await adminService.transferResourceOwnership('TEST_CASE', 'tc-uuid-1', 'new-owner');

      expect(prismaMock.testCase.update).toHaveBeenCalled();
    });

    it('throws 400 for invalid resource type', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'new-owner' } as any);

      await expect(
        adminService.transferResourceOwnership('INVALID' as any, 'id', 'new-owner')
      ).rejects.toThrow(ApiError);
    });
  });

  describe('deleteResource (additional types)', () => {
    it('deletes DIAGRAM', async () => {
      prismaMock.diagram.delete.mockResolvedValue({} as any);

      await adminService.deleteResource('DIAGRAM', 'diag-uuid-1');

      expect(prismaMock.diagram.delete).toHaveBeenCalledWith({ where: { id: 'diag-uuid-1' } });
    });

    it('deletes TRANSFORMATION_RULE', async () => {
      prismaMock.transformationRule.delete.mockResolvedValue({} as any);

      await adminService.deleteResource('TRANSFORMATION_RULE', 'tr-uuid-1');

      expect(prismaMock.transformationRule.delete).toHaveBeenCalled();
    });

    it('deletes CODEGEN_PROJECT', async () => {
      prismaMock.codeGenerationProject.delete.mockResolvedValue({} as any);

      await adminService.deleteResource('CODEGEN_PROJECT', 'cg-uuid-1');

      expect(prismaMock.codeGenerationProject.delete).toHaveBeenCalled();
    });

    it('deletes TEST_CASE', async () => {
      prismaMock.testCase.delete.mockResolvedValue({} as any);

      await adminService.deleteResource('TEST_CASE', 'tc-uuid-1');

      expect(prismaMock.testCase.delete).toHaveBeenCalled();
    });
  });

  describe('deleteUser with reassignment', () => {
    it('transfers resources to new owner when reassignToUserId provided', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(makeUser() as any) // targetUser
        .mockResolvedValueOnce({ id: 'new-owner' } as any) // reassignUser
        .mockResolvedValueOnce({
          _count: {
            metamodels: 0,
            models: 0,
            diagrams: 0,
            transformationRules: 0,
            codegenProjects: 0,
            testCases: 0,
            storedFiles: 0,
            ePackages: 0,
          },
        } as any); // resource counts
      prismaMock.$transaction.mockResolvedValue([
        { count: 1 }, { count: 0 }, { count: 0 }, { count: 0 },
        { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 },
      ] as any);
      prismaMock.user.delete.mockResolvedValue(makeUser() as any);

      const result = await adminService.deleteUser('admin-uuid', 'user-uuid-1', 'new-owner');

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(result.reassignedResources).toBe(1);
      expect(result.deletedResources).toBe(0);
    });

    it('throws 404 when reassign target not found', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(makeUser() as any) // targetUser
        .mockResolvedValueOnce(null); // reassignUser not found

      await expect(
        adminService.deleteUser('admin-uuid', 'user-uuid-1', 'nonexistent-reassign')
      ).rejects.toThrow(ApiError);
    });
  });

  describe('getResourceStats', () => {
    it('returns stats with all counts', async () => {
      prismaMock.user.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(1)  // ADMIN
        .mockResolvedValueOnce(3)  // DSL_DESIGNER
        .mockResolvedValueOnce(4)  // MODELER
        .mockResolvedValueOnce(2); // VIEWER
      prismaMock.metamodel.count.mockResolvedValue(5);
      prismaMock.model.count.mockResolvedValue(8);
      prismaMock.diagram.count.mockResolvedValue(3);
      prismaMock.transformationRule.count.mockResolvedValue(2);
      prismaMock.codeGenerationProject.count.mockResolvedValue(4);
      prismaMock.testCase.count.mockResolvedValue(1);
      prismaMock.sharedResource.count.mockResolvedValue(6);
      prismaMock.storedFile.aggregate.mockResolvedValue({
        _count: 7,
        _sum: { size: 102400 },
      } as any);
      prismaMock.$queryRaw.mockResolvedValue([
        { id: 'r1', name: 'Resource1', type: 'METAMODEL', userId: 'user-uuid-1', createdAt: new Date() },
      ] as any);
      // Two findMany calls: (1) activeUsers in Promise.all, (2) user email lookup after
      prismaMock.user.findMany
        .mockResolvedValueOnce([
          {
            id: 'user-uuid-1',
            email: 'user@example.com',
            _count: { metamodels: 2, models: 1, diagrams: 0, transformationRules: 0, codegenProjects: 0 },
          } as any,
        ])
        .mockResolvedValueOnce([
          { id: 'user-uuid-1', email: 'user@example.com' } as any,
        ]);

      const result = await adminService.getResourceStats();

      expect(result.users.total).toBe(10);
      expect(result.resources.metamodels).toBe(5);
      expect(result.storage.totalFiles).toBe(7);
    });
  });

  describe('getResources', () => {
    it('returns resources of all types when no type filter', async () => {
      prismaMock.metamodel.findMany.mockResolvedValue([]);
      prismaMock.metamodel.count.mockResolvedValue(0);
      prismaMock.model.findMany.mockResolvedValue([]);
      prismaMock.model.count.mockResolvedValue(0);
      prismaMock.diagram.findMany.mockResolvedValue([]);
      prismaMock.diagram.count.mockResolvedValue(0);
      prismaMock.transformationRule.findMany.mockResolvedValue([]);
      prismaMock.transformationRule.count.mockResolvedValue(0);
      prismaMock.codeGenerationProject.findMany.mockResolvedValue([]);
      prismaMock.codeGenerationProject.count.mockResolvedValue(0);
      prismaMock.testCase.findMany.mockResolvedValue([]);
      prismaMock.testCase.count.mockResolvedValue(0);

      const result = await adminService.getResources({});

      expect(result.resources).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('returns METAMODEL type resources with pagination', async () => {
      const mmItem = {
        id: 'mm-uuid-1',
        name: 'TestMM',
        userId: 'user-uuid-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { email: 'user@example.com' },
        _count: { models: 2 },
      };
      prismaMock.metamodel.findMany.mockResolvedValue([mmItem] as any);
      prismaMock.metamodel.count.mockResolvedValue(1);
      prismaMock.sharedResource.count.mockResolvedValue(0);

      const result = await adminService.getResources({ type: 'METAMODEL' });

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].type).toBe('METAMODEL');
      expect(result.resources[0].userEmail).toBe('user@example.com');
    });

    it('returns MODEL type resources', async () => {
      const modelItem = {
        id: 'model-uuid-1',
        name: 'TestModel',
        userId: 'user-uuid-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { email: 'user@example.com' },
        _count: { diagrams: 1 },
      };
      prismaMock.model.findMany.mockResolvedValue([modelItem] as any);
      prismaMock.model.count.mockResolvedValue(1);
      prismaMock.sharedResource.count.mockResolvedValue(2);

      const result = await adminService.getResources({ type: 'MODEL' });

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].sharedWith).toBe(2);
    });

    it('returns DIAGRAM type resources', async () => {
      const diagItem = {
        id: 'diag-uuid-1',
        name: 'TestDiagram',
        userId: 'user-uuid-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { email: 'user@example.com' },
      };
      prismaMock.diagram.findMany.mockResolvedValue([diagItem] as any);
      prismaMock.diagram.count.mockResolvedValue(1);
      prismaMock.sharedResource.count.mockResolvedValue(0);

      const result = await adminService.getResources({ type: 'DIAGRAM' });

      expect(result.resources[0].type).toBe('DIAGRAM');
    });

    it('returns TRANSFORMATION_RULE type resources', async () => {
      const trItem = {
        id: 'tr-uuid-1',
        name: 'TestRule',
        userId: 'user-uuid-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { email: 'user@example.com' },
      };
      prismaMock.transformationRule.findMany.mockResolvedValue([trItem] as any);
      prismaMock.transformationRule.count.mockResolvedValue(1);
      prismaMock.sharedResource.count.mockResolvedValue(0);

      const result = await adminService.getResources({ type: 'TRANSFORMATION_RULE' });

      expect(result.resources[0].type).toBe('TRANSFORMATION_RULE');
    });

    it('returns CODEGEN_PROJECT type resources', async () => {
      const cgItem = {
        id: 'cg-uuid-1',
        name: 'TestProject',
        userId: 'user-uuid-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { email: 'user@example.com' },
      };
      prismaMock.codeGenerationProject.findMany.mockResolvedValue([cgItem] as any);
      prismaMock.codeGenerationProject.count.mockResolvedValue(1);
      prismaMock.sharedResource.count.mockResolvedValue(0);

      const result = await adminService.getResources({ type: 'CODEGEN_PROJECT' });

      expect(result.resources[0].type).toBe('CODEGEN_PROJECT');
    });

    it('returns TEST_CASE type resources', async () => {
      const tcItem = {
        id: 'tc-uuid-1',
        name: 'TestCase1',
        userId: 'user-uuid-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { email: 'user@example.com' },
      };
      prismaMock.testCase.findMany.mockResolvedValue([tcItem] as any);
      prismaMock.testCase.count.mockResolvedValue(1);
      prismaMock.sharedResource.count.mockResolvedValue(0);

      const result = await adminService.getResources({ type: 'TEST_CASE' });

      expect(result.resources[0].type).toBe('TEST_CASE');
    });

    it('applies search filter', async () => {
      prismaMock.metamodel.findMany.mockResolvedValue([]);
      prismaMock.metamodel.count.mockResolvedValue(0);

      await adminService.getResources({ type: 'METAMODEL', search: 'mySearch' });

      expect(prismaMock.metamodel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: expect.objectContaining({ contains: 'mySearch' }),
          }),
        })
      );
    });

    it('applies userId filter', async () => {
      prismaMock.metamodel.findMany.mockResolvedValue([]);
      prismaMock.metamodel.count.mockResolvedValue(0);

      await adminService.getResources({ type: 'METAMODEL', userId: 'user-uuid-1' });

      expect(prismaMock.metamodel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-uuid-1' }),
        })
      );
    });
  });

  describe('forceUnshareResource', () => {
    it('deletes all shares for a resource and returns count', async () => {
      prismaMock.sharedResource.deleteMany.mockResolvedValue({ count: 3 });

      const result = await adminService.forceUnshareResource('METAMODEL', 'mm-uuid-1');

      expect(result).toBe(3);
      expect(prismaMock.sharedResource.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ resourceType: 'METAMODEL', resourceId: 'mm-uuid-1' }),
        })
      );
    });

    it('returns 0 when no shares to delete', async () => {
      prismaMock.sharedResource.deleteMany.mockResolvedValue({ count: 0 });

      const result = await adminService.forceUnshareResource('MODEL', 'model-uuid-1');

      expect(result).toBe(0);
    });
  });

  describe('getShareAudit', () => {
    it('returns paginated share audit records', async () => {
      const mockShare = {
        id: 'share-uuid-1',
        resourceType: 'METAMODEL',
        resourceId: 'mm-uuid-1',
        permission: 'VIEWER',
        ownerId: 'owner-uuid',
        sharedWithId: 'target-uuid',
        createdAt: new Date(),
        owner: { email: 'owner@example.com' },
        sharedWith: { email: 'target@example.com' },
      };
      prismaMock.sharedResource.findMany.mockResolvedValue([mockShare as any]);
      prismaMock.sharedResource.count.mockResolvedValue(1);

      const result = await adminService.getShareAudit({ page: 1, pageSize: 10 });

      expect(result.shares).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.shares[0].ownerEmail).toBe('owner@example.com');
      expect(result.shares[0].sharedWithEmail).toBe('target@example.com');
    });

    it('filters by resourceType when provided', async () => {
      prismaMock.sharedResource.findMany.mockResolvedValue([]);
      prismaMock.sharedResource.count.mockResolvedValue(0);

      await adminService.getShareAudit({ resourceType: 'MODEL' });

      expect(prismaMock.sharedResource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { resourceType: 'MODEL' },
        })
      );
    });

    it('uses empty where clause when no resourceType', async () => {
      prismaMock.sharedResource.findMany.mockResolvedValue([]);
      prismaMock.sharedResource.count.mockResolvedValue(0);

      await adminService.getShareAudit({});

      expect(prismaMock.sharedResource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        })
      );
    });
  });

  describe('getSystemHealth', () => {
    it('returns healthy status when db responds quickly', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }] as any);
      prismaMock.storedFile.aggregate.mockResolvedValue({
        _count: 5,
        _sum: { size: 20480 },
      } as any);

      const result = await adminService.getSystemHealth();

      expect(result.database.status).toBe('healthy');
      expect(result.api.status).toBe('healthy');
      expect(result.storage.totalFiles).toBe(5);
      expect(result.api.uptime).toBeGreaterThanOrEqual(0);
      expect(result.api.memoryUsage.heapUsed).toBeGreaterThan(0);
    });

    it('returns unhealthy status when db throws', async () => {
      prismaMock.$queryRaw.mockRejectedValue(new Error('Connection refused'));
      prismaMock.storedFile.aggregate.mockResolvedValue({
        _count: 0,
        _sum: { size: null },
      } as any);

      const result = await adminService.getSystemHealth();

      expect(result.database.status).toBe('unhealthy');
      expect(result.database.responseTimeMs).toBe(-1);
    });
  });

  describe('updateLastLogin', () => {
    it('updates the lastLogin timestamp for a user', async () => {
      prismaMock.user.update.mockResolvedValue(makeUser() as any);

      await adminService.updateLastLogin('user-uuid-1');

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-uuid-1' },
          data: expect.objectContaining({ lastLogin: expect.any(Date) }),
        })
      );
    });
  });

  describe('getResourceDetails', () => {
    it('gets METAMODEL details', async () => {
      prismaMock.metamodel.findUnique.mockResolvedValue({ id: 'mm-uuid-1', name: 'MM' } as any);

      const result = await adminService.getResourceDetails('METAMODEL', 'mm-uuid-1');

      expect(prismaMock.metamodel.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'mm-uuid-1' } })
      );
    });

    it('gets MODEL details', async () => {
      prismaMock.model.findUnique.mockResolvedValue({ id: 'model-uuid-1', name: 'Model' } as any);

      await adminService.getResourceDetails('MODEL', 'model-uuid-1');

      expect(prismaMock.model.findUnique).toHaveBeenCalled();
    });

    it('gets DIAGRAM details', async () => {
      prismaMock.diagram.findUnique.mockResolvedValue({ id: 'diag-uuid-1', name: 'Diag' } as any);

      await adminService.getResourceDetails('DIAGRAM', 'diag-uuid-1');

      expect(prismaMock.diagram.findUnique).toHaveBeenCalled();
    });

    it('gets TRANSFORMATION_RULE details', async () => {
      prismaMock.transformationRule.findUnique.mockResolvedValue({ id: 'tr-uuid-1', name: 'Rule' } as any);

      await adminService.getResourceDetails('TRANSFORMATION_RULE', 'tr-uuid-1');

      expect(prismaMock.transformationRule.findUnique).toHaveBeenCalled();
    });

    it('gets CODEGEN_PROJECT details', async () => {
      prismaMock.codeGenerationProject.findUnique.mockResolvedValue({ id: 'cg-uuid-1', name: 'Project' } as any);

      await adminService.getResourceDetails('CODEGEN_PROJECT', 'cg-uuid-1');

      expect(prismaMock.codeGenerationProject.findUnique).toHaveBeenCalled();
    });

    it('gets TEST_CASE details', async () => {
      prismaMock.testCase.findUnique.mockResolvedValue({ id: 'tc-uuid-1', name: 'TestCase' } as any);

      await adminService.getResourceDetails('TEST_CASE', 'tc-uuid-1');

      expect(prismaMock.testCase.findUnique).toHaveBeenCalled();
    });

    it('throws 400 for invalid resource type', async () => {
      await expect(
        adminService.getResourceDetails('INVALID' as any, 'id')
      ).rejects.toThrow(ApiError);
    });
  });
});
