import { prismaMock } from '../helpers/prisma.mock';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';


const sharingServiceMock = {
  checkAccess: jest.fn(),
  isAdmin: jest.fn(),
  deleteResourceShares: jest.fn(),
};
jest.mock('../../services/sharing.service', () => ({
  sharingService: sharingServiceMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

import { testService } from '../../services/test.service';
import { ApiError } from '../../middleware/errorHandler';

const mockTestCaseRow = {
  id: 'tc-uuid-1',
  name: 'TestCase1',
  description: 'A test case',
  type: 'attribute' as const,
  targetMetaClassId: 'cls-1',
  targetMetaClassName: 'MyClass',
  targetProperty: 'myAttr',
  status: 'pending' as const,
  errorMessage: null,
  constraintId: null,
  constraintType: null,
  originalInput: null,
  expectedOutput: null,
  actualOutput: null,
  testValues: [],
  modelId: 'model-uuid-1',
  userId: 'user-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('TestService', () => {
  describe('getAll', () => {
    it('returns owned test cases', async () => {
      prismaMock.testCase.findMany.mockResolvedValueOnce([mockTestCaseRow]);
      prismaMock.sharedResource.findMany.mockResolvedValue([]);

      const result = await testService.getAll('user-uuid-1');

      expect(result).toHaveLength(1);
      expect(result[0].isOwner).toBe(true);
    });

    it('returns every test case platform-wide for an ADMIN', async () => {
      sharingServiceMock.isAdmin.mockResolvedValue(true);
      prismaMock.testCase.findMany.mockResolvedValue([
        { ...mockTestCaseRow, userId: 'admin-uuid', user: { email: 'admin@example.com' } },
        { ...mockTestCaseRow, id: 'tc-uuid-2', userId: 'other-user', user: { email: 'other@example.com' } },
      ] as any);

      const result = await testService.getAll('admin-uuid');

      expect(result).toHaveLength(2);
      const others = result.find(tc => tc.id === 'tc-uuid-2');
      expect(others?.isOwner).toBe(false);
      expect(others?.permission).toBe('EDITOR');
      expect(others?.ownerEmail).toBe('other@example.com');
    });
  });

  describe('getById', () => {
    it('returns test case when accessible', async () => {
      prismaMock.testCase.findFirst.mockResolvedValue(mockTestCaseRow);
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

      const result = await testService.getById('tc-uuid-1', 'user-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('tc-uuid-1');
    });

    it('returns null when not found', async () => {
      prismaMock.testCase.findFirst.mockResolvedValue(null);

      const result = await testService.getById('nonexistent', 'user-uuid-1');

      expect(result).toBeNull();
    });

    it('returns null when no access', async () => {
      prismaMock.testCase.findFirst.mockResolvedValue(mockTestCaseRow);
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: false, isOwner: false });

      const result = await testService.getById('tc-uuid-1', 'other-user');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates test case for DSL_DESIGNER', async () => {
      prismaMock.testCase.create.mockResolvedValue(mockTestCaseRow);

      const result = await testService.create(
        {
          name: 'TestCase1',
          type: 'attribute',
          targetMetaClassId: 'cls-1',
          targetMetaClassName: 'MyClass',
        },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.name).toBe('TestCase1');
    });

    it('throws 403 for MODELER role', async () => {
      await expect(
        testService.create(
          {
            name: 'TestCase1',
            type: 'attribute',
            targetMetaClassId: 'cls-1',
            targetMetaClassName: 'MyClass',
          },
          'user-uuid-1',
          'MODELER'
        )
      ).rejects.toThrow(ApiError);
    });
  });

  describe('update', () => {
    it('updates test case for owner', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.testCase.update.mockResolvedValue({ ...mockTestCaseRow, name: 'Updated TC' });

      const result = await testService.update(
        'tc-uuid-1',
        { name: 'Updated TC' },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.name).toBe('Updated TC');
    });

    it('throws 403 for MODELER role', async () => {
      await expect(
        testService.update('tc-uuid-1', { name: 'Updated' }, 'user-uuid-1', 'MODELER')
      ).rejects.toThrow(ApiError);
    });

    it('throws 404 when not found', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: false, isOwner: false });

      await expect(
        testService.update('tc-uuid-1', { name: 'Updated' }, 'other-user', 'DSL_DESIGNER')
      ).rejects.toThrow(ApiError);
    });
  });

  describe('updateStatus', () => {
    it('updates status for DSL_DESIGNER', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.testCase.update.mockResolvedValue({ ...mockTestCaseRow, status: 'passed' });

      const result = await testService.updateStatus(
        'tc-uuid-1',
        'passed',
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.status).toBe('passed');
    });

    it('throws 403 for VIEWER role', async () => {
      await expect(
        testService.updateStatus('tc-uuid-1', 'passed', 'user-uuid-1', 'VIEWER')
      ).rejects.toThrow(ApiError);
    });
  });

  describe('delete', () => {
    it('deletes test case for owner', async () => {
      prismaMock.testCase.findFirst.mockResolvedValue(mockTestCaseRow);
      sharingServiceMock.deleteResourceShares.mockResolvedValue(undefined);
      prismaMock.testCase.delete.mockResolvedValue(mockTestCaseRow);

      await expect(testService.delete('tc-uuid-1', 'user-uuid-1')).resolves.toBeUndefined();
    });

    it('throws 404 when not owner', async () => {
      prismaMock.testCase.findFirst.mockResolvedValue(null);

      await expect(testService.delete('tc-uuid-1', 'other-user')).rejects.toThrow(ApiError);
    });
  });

  describe('deleteByModelId', () => {
    it('deletes all test cases for a model', async () => {
      prismaMock.testCase.findMany.mockResolvedValue([{ id: 'tc-uuid-1' }, { id: 'tc-uuid-2' }] as any);
      sharingServiceMock.deleteResourceShares.mockResolvedValue(undefined);
      prismaMock.testCase.deleteMany.mockResolvedValue({ count: 2 });

      const result = await testService.deleteByModelId('model-uuid-1', 'user-uuid-1');

      expect(result).toBe(2);
    });
  });

  describe('resetByModelId', () => {
    it('resets test cases to pending status', async () => {
      prismaMock.testCase.updateMany.mockResolvedValue({ count: 3 });

      const result = await testService.resetByModelId('model-uuid-1', 'user-uuid-1', 'DSL_DESIGNER');

      expect(result).toBe(3);
    });

    it('throws 403 for VIEWER role', async () => {
      await expect(
        testService.resetByModelId('model-uuid-1', 'user-uuid-1', 'VIEWER')
      ).rejects.toThrow(ApiError);
    });
  });
});
