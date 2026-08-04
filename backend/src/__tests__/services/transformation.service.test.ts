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

import { transformationService } from '../../services/transformation.service';
import { ApiError } from '../../middleware/errorHandler';

const mockRuleRow = {
  id: 'rule-uuid-1',
  name: 'TestRule',
  description: 'A test rule',
  priority: 0,
  enabled: true,
  lhs: { id: 'lhs-1', name: 'LHS', type: 'LHS', elements: [] },
  rhs: { id: 'rhs-1', name: 'RHS', type: 'RHS', elements: [] },
  nacs: [],
  conditions: [],
  diagramId: null,
  userId: 'user-uuid-1',
  projectId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('TransformationService', () => {
  describe('getAllRules', () => {
    it('returns owned rules', async () => {
      prismaMock.transformationRule.findMany.mockResolvedValueOnce([mockRuleRow]);
      prismaMock.sharedResource.findMany.mockResolvedValue([]);

      const result = await transformationService.getAllRules('user-uuid-1');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('TestRule');
      expect(result[0].isOwner).toBe(true);
    });

    it('returns every rule platform-wide for an ADMIN', async () => {
      sharingServiceMock.isAdmin.mockResolvedValue(true);
      prismaMock.transformationRule.findMany.mockResolvedValue([
        { ...mockRuleRow, userId: 'admin-uuid', user: { email: 'admin@example.com' } },
        { ...mockRuleRow, id: 'rule-uuid-2', userId: 'other-user', user: { email: 'other@example.com' } },
      ] as any);

      const result = await transformationService.getAllRules('admin-uuid');

      expect(result).toHaveLength(2);
      const others = result.find(r => r.id === 'rule-uuid-2');
      expect(others?.isOwner).toBe(false);
      expect(others?.permission).toBe('EDITOR');
      expect(others?.ownerEmail).toBe('other@example.com');
    });
  });

  describe('getRuleById', () => {
    it('returns rule when accessible', async () => {
      prismaMock.transformationRule.findFirst.mockResolvedValue(mockRuleRow);
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

      const result = await transformationService.getRuleById('rule-uuid-1', 'user-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('rule-uuid-1');
    });

    it('returns null when not found', async () => {
      prismaMock.transformationRule.findFirst.mockResolvedValue(null);

      const result = await transformationService.getRuleById('nonexistent', 'user-uuid-1');

      expect(result).toBeNull();
    });

    it('returns null when no access', async () => {
      prismaMock.transformationRule.findFirst.mockResolvedValue(mockRuleRow);
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: false, isOwner: false });

      const result = await transformationService.getRuleById('rule-uuid-1', 'other-user');

      expect(result).toBeNull();
    });
  });

  describe('createRule', () => {
    it('creates rule for DSL_DESIGNER', async () => {
      prismaMock.transformationRule.create.mockResolvedValue(mockRuleRow);

      const result = await transformationService.createRule(
        {
          name: 'TestRule',
          lhs: { id: 'lhs-1', name: 'LHS', type: 'LHS', elements: [] } as any,
          rhs: { id: 'rhs-1', name: 'RHS', type: 'RHS', elements: [] } as any,
        },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.name).toBe('TestRule');
    });

    it('throws 403 for MODELER role', async () => {
      await expect(
        transformationService.createRule(
          {
            name: 'TestRule',
            lhs: { id: 'lhs-1', name: 'LHS', type: 'LHS', elements: [] } as any,
            rhs: { id: 'rhs-1', name: 'RHS', type: 'RHS', elements: [] } as any,
          },
          'user-uuid-1',
          'MODELER'
        )
      ).rejects.toThrow(ApiError);
    });
  });

  describe('updateRule', () => {
    it('updates rule for owner', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.transformationRule.update.mockResolvedValue({ ...mockRuleRow, name: 'Updated Rule' });

      const result = await transformationService.updateRule(
        'rule-uuid-1',
        { name: 'Updated Rule' },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.name).toBe('Updated Rule');
    });

    it('throws 404 when rule not accessible', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: false, isOwner: false });

      await expect(
        transformationService.updateRule('rule-uuid-1', { name: 'Updated' }, 'other-user', 'DSL_DESIGNER')
      ).rejects.toThrow(ApiError);
    });

    it('rejects a view reference outside the active project', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: false, permission: 'EDITOR' });
      prismaMock.diagram.findFirst.mockResolvedValue(null);

      await expect(transformationService.updateRule(
        'rule-uuid-1',
        { diagramId: 'other-project-view' },
        'designer-uuid',
        'DSL_DESIGNER',
        'project-uuid-1'
      )).rejects.toThrow('Referenced view is not in this project');

      expect(prismaMock.transformationRule.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteRule', () => {
    it('deletes rule for owner', async () => {
      prismaMock.transformationRule.findFirst.mockResolvedValue(mockRuleRow);
      sharingServiceMock.deleteResourceShares.mockResolvedValue(undefined);
      prismaMock.transformationRule.delete.mockResolvedValue(mockRuleRow);

      await expect(transformationService.deleteRule('rule-uuid-1', 'user-uuid-1')).resolves.toBeUndefined();
    });

    it('throws 404 when not owner', async () => {
      prismaMock.transformationRule.findFirst.mockResolvedValue(null);

      await expect(transformationService.deleteRule('rule-uuid-1', 'other-user')).rejects.toThrow(ApiError);
    });
  });
});
