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

import { modelService } from '../../services/model.service';
import { ApiError } from '../../middleware/errorHandler';

const mockModelRow = {
  id: 'model-uuid-1',
  name: 'TestModel',
  description: null,
  metamodelId: 'mm-uuid-1',
  elements: [],
  connections: [],
  conformsToId: 'mm-uuid-1',
  userId: 'user-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ModelService', () => {
  describe('getAll', () => {
    it('returns owned models', async () => {
      prismaMock.model.findMany.mockResolvedValueOnce([mockModelRow]);
      prismaMock.sharedResource.findMany.mockResolvedValue([]);

      const result = await modelService.getAll('user-uuid-1');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('TestModel');
      expect(result[0].isOwner).toBe(true);
    });

    it('returns empty when no models', async () => {
      prismaMock.model.findMany.mockResolvedValue([]);
      prismaMock.sharedResource.findMany.mockResolvedValue([]);

      const result = await modelService.getAll('user-uuid-1');

      expect(result).toHaveLength(0);
    });

    it('returns every model platform-wide for an ADMIN', async () => {
      sharingServiceMock.isAdmin.mockResolvedValue(true);
      prismaMock.model.findMany.mockResolvedValue([
        { ...mockModelRow, userId: 'admin-uuid', user: { email: 'admin@example.com' } },
        { ...mockModelRow, id: 'model-uuid-2', userId: 'other-user', user: { email: 'other@example.com' } },
      ] as any);

      const result = await modelService.getAll('admin-uuid');

      expect(result).toHaveLength(2);
      const others = result.find(m => m.id === 'model-uuid-2');
      expect(others?.isOwner).toBe(false);
      expect(others?.permission).toBe('EDITOR');
      expect(others?.ownerEmail).toBe('other@example.com');
    });
  });

  describe('getByMetamodelId', () => {
    it('filters models by metamodel ID', async () => {
      prismaMock.model.findMany.mockResolvedValueOnce([mockModelRow]);
      prismaMock.sharedResource.findMany.mockResolvedValue([]);

      const result = await modelService.getByMetamodelId('mm-uuid-1', 'user-uuid-1');

      expect(result).toHaveLength(1);
      expect(result[0].conformsTo).toBe('mm-uuid-1');
    });

    it('returns empty when no models match metamodel', async () => {
      prismaMock.model.findMany.mockResolvedValueOnce([mockModelRow]);
      prismaMock.sharedResource.findMany.mockResolvedValue([]);

      const result = await modelService.getByMetamodelId('other-mm', 'user-uuid-1');

      expect(result).toHaveLength(0);
    });
  });

  describe('getById', () => {
    it('returns model when accessible', async () => {
      prismaMock.model.findFirst.mockResolvedValue(mockModelRow);
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

      const result = await modelService.getById('model-uuid-1', 'user-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('model-uuid-1');
    });

    it('returns null when model not found', async () => {
      prismaMock.model.findFirst.mockResolvedValue(null);

      const result = await modelService.getById('nonexistent', 'user-uuid-1');

      expect(result).toBeNull();
    });

    it('returns null when user has no access', async () => {
      prismaMock.model.findFirst.mockResolvedValue(mockModelRow);
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: false, isOwner: false });

      const result = await modelService.getById('model-uuid-1', 'other-user');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates model for DSL_DESIGNER', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.model.create.mockResolvedValue(mockModelRow);

      const result = await modelService.create(
        {
          id: 'model-uuid-1',
          name: 'TestModel',
          metamodelId: 'mm-uuid-1',
          conformsTo: 'mm-uuid-1',
          elements: [],
          connections: [],
        },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.name).toBe('TestModel');
    });

    it('throws 403 for MODELER role', async () => {
      await expect(
        modelService.create(
          {
            id: 'model-uuid-1',
            name: 'TestModel',
            metamodelId: 'mm-uuid-1',
            conformsTo: 'mm-uuid-1',
            elements: [],
            connections: [],
          },
          'user-uuid-1',
          'MODELER'
        )
      ).rejects.toThrow(ApiError);
    });

    it('throws 400 when referenced metamodel not accessible', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: false, isOwner: false });

      await expect(
        modelService.create(
          {
            id: 'model-uuid-1',
            name: 'TestModel',
            metamodelId: 'mm-uuid-1',
            conformsTo: 'inaccessible-mm',
            elements: [],
            connections: [],
          },
          'user-uuid-1',
          'DSL_DESIGNER'
        )
      ).rejects.toThrow(ApiError);
    });
  });

  describe('update', () => {
    it('updates model for owner', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.model.update.mockResolvedValue({ ...mockModelRow, name: 'Updated Model' });

      const result = await modelService.update(
        'model-uuid-1',
        { name: 'Updated Model' },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.name).toBe('Updated Model');
    });

    it('throws 404 when model not accessible', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: false, isOwner: false });

      await expect(
        modelService.update('model-uuid-1', { name: 'Updated' }, 'other-user', 'DSL_DESIGNER')
      ).rejects.toThrow(ApiError);
    });

    it('throws 403 when VIEWER tries to edit', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

      await expect(
        modelService.update('model-uuid-1', { name: 'Updated' }, 'user-uuid-1', 'VIEWER')
      ).rejects.toThrow(ApiError);
    });
  });

  describe('delete', () => {
    it('deletes model for owner', async () => {
      prismaMock.model.findFirst.mockResolvedValue(mockModelRow);
      sharingServiceMock.deleteResourceShares.mockResolvedValue(undefined);
      prismaMock.model.delete.mockResolvedValue(mockModelRow);

      await expect(modelService.delete('model-uuid-1', 'user-uuid-1')).resolves.toBeUndefined();
    });

    it('throws 404 when model not found or not owner', async () => {
      prismaMock.model.findFirst.mockResolvedValue(null);

      await expect(modelService.delete('model-uuid-1', 'other-user')).rejects.toThrow(ApiError);
    });
  });

  describe('addElement', () => {
    it('adds element to model', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.model.findFirst.mockResolvedValue(mockModelRow);
      const elementToAdd = { id: 'elem-1', modelElementId: 'cls-1', name: 'Element1', attributes: {} };
      prismaMock.model.update.mockResolvedValue({
        ...mockModelRow,
        elements: [elementToAdd],
      });

      const result = await modelService.addElement(
        'model-uuid-1',
        elementToAdd as any,
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(prismaMock.model.update).toHaveBeenCalled();
    });

    it('throws 400 when element with same ID exists', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.model.findFirst.mockResolvedValue({
        ...mockModelRow,
        elements: [{ id: 'elem-1', modelElementId: 'cls-1' }],
      });

      await expect(
        modelService.addElement(
          'model-uuid-1',
          { id: 'elem-1', modelElementId: 'cls-1' } as any,
          'user-uuid-1',
          'DSL_DESIGNER'
        )
      ).rejects.toThrow(ApiError);
    });

    it('throws 403 for VIEWER role', async () => {
      await expect(
        modelService.addElement(
          'model-uuid-1',
          { id: 'elem-1', modelElementId: 'cls-1' } as any,
          'user-uuid-1',
          'VIEWER'
        )
      ).rejects.toThrow(ApiError);
    });
  });

  describe('deleteElement', () => {
    it('removes element and associated connections', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.model.findFirst.mockResolvedValue({
        ...mockModelRow,
        elements: [{ id: 'elem-1', modelElementId: 'cls-1' }],
        connections: [{ id: 'conn-1', sourceId: 'elem-1', targetId: 'elem-2' }],
      });
      prismaMock.model.update.mockResolvedValue(mockModelRow);

      await modelService.deleteElement('model-uuid-1', 'elem-1', 'user-uuid-1', 'DSL_DESIGNER');

      expect(prismaMock.model.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            elements: [],
            connections: [],
          }),
        })
      );
    });
  });

  describe('addConnection', () => {
    it('adds connection to model', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.model.findFirst.mockResolvedValue(mockModelRow);
      prismaMock.model.update.mockResolvedValue({
        ...mockModelRow,
        connections: [{ id: 'conn-1', sourceId: 'elem-1', targetId: 'elem-2' }],
      });

      await modelService.addConnection(
        'model-uuid-1',
        { id: 'conn-1', sourceId: 'elem-1', targetId: 'elem-2' } as any,
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(prismaMock.model.update).toHaveBeenCalled();
    });
  });
});
