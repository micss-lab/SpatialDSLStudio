import { prismaMock } from '../helpers/prisma.mock';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';


// Mock sharing service
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

import { metamodelService } from '../../services/metamodel.service';
import { ApiError } from '../../middleware/errorHandler';

const mockMetamodelRow = {
  id: 'mm-uuid-1',
  name: 'TestMetamodel',
  description: null,
  uri: 'http://example.com/mm',
  prefix: 'tm',
  eClass: 'pkg-uuid-1',
  classes: [],
  enums: [],
  constraints: [],
  conformsToId: 'pkg-uuid-1',
  userId: 'user-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('MetamodelService', () => {
  describe('getAll', () => {
    it('returns owned and shared metamodels', async () => {
      prismaMock.metamodel.findMany.mockResolvedValueOnce([mockMetamodelRow]);
      prismaMock.sharedResource.findMany.mockResolvedValue([]);

      const result = await metamodelService.getAll('user-uuid-1');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('TestMetamodel');
      expect(result[0].isOwner).toBe(true);
    });

    it('returns empty array when no metamodels exist', async () => {
      prismaMock.metamodel.findMany.mockResolvedValue([]);
      prismaMock.sharedResource.findMany.mockResolvedValue([]);

      const result = await metamodelService.getAll('user-uuid-1');

      expect(result).toHaveLength(0);
    });

    it('includes shared metamodels', async () => {
      prismaMock.metamodel.findMany
        .mockResolvedValueOnce([]) // owned
        .mockResolvedValueOnce([{ ...mockMetamodelRow, userId: 'other-user' }]); // shared
      prismaMock.sharedResource.findMany.mockResolvedValue([
        {
          id: 'share-1',
          resourceType: 'METAMODEL',
          resourceId: 'mm-uuid-1',
          permission: 'VIEWER',
          ownerId: 'other-user',
          sharedWithId: 'user-uuid-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          owner: { email: 'other@example.com' },
        } as any,
      ]);

      const result = await metamodelService.getAll('user-uuid-1');

      expect(result).toHaveLength(1);
      expect(result[0].isOwner).toBe(false);
    });

    it('returns every metamodel platform-wide for an ADMIN', async () => {
      sharingServiceMock.isAdmin.mockResolvedValue(true);
      prismaMock.metamodel.findMany.mockResolvedValue([
        { ...mockMetamodelRow, userId: 'admin-uuid', user: { email: 'admin@example.com' } },
        { ...mockMetamodelRow, id: 'mm-uuid-2', userId: 'other-user', user: { email: 'other@example.com' } },
      ] as any);

      const result = await metamodelService.getAll('admin-uuid');

      expect(result).toHaveLength(2);
      const own = result.find(m => m.id === 'mm-uuid-1');
      const others = result.find(m => m.id === 'mm-uuid-2');
      expect(own?.isOwner).toBe(true);
      expect(others?.isOwner).toBe(false);
      expect(others?.permission).toBe('EDITOR');
      expect(others?.ownerEmail).toBe('other@example.com');
    });
  });

  describe('getById', () => {
    it('returns metamodel when found and accessible', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow);
      sharingServiceMock.checkAccess.mockResolvedValue({
        hasAccess: true,
        isOwner: true,
      });

      const result = await metamodelService.getById('mm-uuid-1', 'user-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('mm-uuid-1');
    });

    it('returns null when metamodel not found', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue(null);

      const result = await metamodelService.getById('nonexistent', 'user-uuid-1');

      expect(result).toBeNull();
    });

    it('returns null when user has no access', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow);
      sharingServiceMock.checkAccess.mockResolvedValue({
        hasAccess: false,
        isOwner: false,
      });

      const result = await metamodelService.getById('mm-uuid-1', 'other-user');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a metamodel for DSL_DESIGNER', async () => {
      prismaMock.ePackage.findFirst.mockResolvedValue({
        id: 'pkg-uuid-1',
        name: 'Ecore',
        nsURI: 'http://ecore',
        nsPrefix: 'ecore',
        classes: [],
        userId: 'user-uuid-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.metamodel.create.mockResolvedValue(mockMetamodelRow);

      const result = await metamodelService.create(
        {
          id: 'mm-uuid-1',
          name: 'TestMetamodel',
          uri: 'http://example.com/mm',
          prefix: 'tm',
          conformsTo: 'pkg-uuid-1',
          classes: [],
          constraints: [],
        },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.name).toBe('TestMetamodel');
      expect(prismaMock.metamodel.create).toHaveBeenCalled();
    });

    it('throws 403 for MODELER role', async () => {
      await expect(
        metamodelService.create(
          {
            id: 'mm-uuid-1',
            name: 'TestMetamodel',
            uri: 'http://example.com/mm',
            prefix: 'tm',
            conformsTo: 'pkg-uuid-1',
            classes: [],
            constraints: [],
          },
          'user-uuid-1',
          'MODELER'
        )
      ).rejects.toThrow(ApiError);
    });

    it('throws 403 for VIEWER role', async () => {
      await expect(
        metamodelService.create(
          {
            id: 'mm-uuid-1',
            name: 'TestMetamodel',
            uri: 'http://example.com/mm',
            prefix: 'tm',
            conformsTo: 'pkg-uuid-1',
            classes: [],
            constraints: [],
          },
          'user-uuid-1',
          'VIEWER'
        )
      ).rejects.toThrow(ApiError);
    });

    it('throws 400 when referenced ePackage not found', async () => {
      prismaMock.ePackage.findFirst.mockResolvedValue(null);

      await expect(
        metamodelService.create(
          {
            id: 'mm-uuid-1',
            name: 'TestMetamodel',
            uri: 'http://example.com/mm',
            prefix: 'tm',
            conformsTo: 'nonexistent-pkg',
            classes: [],
            constraints: [],
          },
          'user-uuid-1',
          'DSL_DESIGNER'
        )
      ).rejects.toThrow(ApiError);
    });
  });

  describe('update', () => {
    it('updates metamodel when owner', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({
        hasAccess: true,
        isOwner: true,
      });
      prismaMock.metamodel.update.mockResolvedValue({
        ...mockMetamodelRow,
        name: 'Updated Metamodel',
      });

      const result = await metamodelService.update(
        'mm-uuid-1',
        { name: 'Updated Metamodel' },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.name).toBe('Updated Metamodel');
    });

    it('throws 404 when metamodel not accessible', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({
        hasAccess: false,
        isOwner: false,
      });

      await expect(
        metamodelService.update('mm-uuid-1', { name: 'Updated' }, 'other-user', 'DSL_DESIGNER')
      ).rejects.toThrow(ApiError);
    });

    it('throws 403 when VIEWER role tries to edit', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({
        hasAccess: true,
        isOwner: true,
      });

      await expect(
        metamodelService.update('mm-uuid-1', { name: 'Updated' }, 'user-uuid-1', 'VIEWER')
      ).rejects.toThrow(ApiError);
    });
  });

  describe('delete', () => {
    it('deletes metamodel when owner with no dependencies', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow);
      prismaMock.model.count.mockResolvedValue(0);
      prismaMock.codeGenerationProject.count.mockResolvedValue(0);
      sharingServiceMock.deleteResourceShares.mockResolvedValue(undefined);
      prismaMock.metamodel.delete.mockResolvedValue(mockMetamodelRow);

      await expect(metamodelService.delete('mm-uuid-1', 'user-uuid-1')).resolves.toBeUndefined();
    });

    it('throws 404 when metamodel not found or not owner', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue(null);

      await expect(metamodelService.delete('mm-uuid-1', 'other-user')).rejects.toThrow(ApiError);
    });

    it('throws 400 when models depend on the metamodel', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow);
      prismaMock.model.count.mockResolvedValue(2);

      await expect(metamodelService.delete('mm-uuid-1', 'user-uuid-1')).rejects.toThrow(ApiError);
    });

    it('throws 400 when codegen projects depend on the metamodel', async () => {
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow);
      prismaMock.model.count.mockResolvedValue(0);
      prismaMock.codeGenerationProject.count.mockResolvedValue(1);

      await expect(metamodelService.delete('mm-uuid-1', 'user-uuid-1')).rejects.toThrow(ApiError);
    });
  });

  describe('addClass', () => {
    it('adds a class to the metamodel', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({
        hasAccess: true,
        isOwner: true,
      });
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow);
      prismaMock.metamodel.update.mockResolvedValue({
        ...mockMetamodelRow,
        classes: [{ id: 'cls-1', name: 'NewClass', abstract: false, superTypes: [], attributes: [], references: [] }],
      });

      const newClass = {
        id: 'cls-1',
        name: 'NewClass',
        abstract: false,
        superTypes: [],
        attributes: [],
        references: [],
      };

      const result = await metamodelService.addClass('mm-uuid-1', newClass as any, 'user-uuid-1', 'DSL_DESIGNER');

      expect(prismaMock.metamodel.update).toHaveBeenCalled();
    });

    it('throws 400 when class with same ID already exists', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({
        hasAccess: true,
        isOwner: true,
      });
      prismaMock.metamodel.findFirst.mockResolvedValue({
        ...mockMetamodelRow,
        classes: [{ id: 'cls-1', name: 'ExistingClass' }],
      });

      await expect(
        metamodelService.addClass(
          'mm-uuid-1',
          { id: 'cls-1', name: 'DuplicateClass' } as any,
          'user-uuid-1',
          'DSL_DESIGNER'
        )
      ).rejects.toThrow(ApiError);
    });

    it('throws 403 when MODELER tries to add class', async () => {
      await expect(
        metamodelService.addClass(
          'mm-uuid-1',
          { id: 'cls-1', name: 'NewClass' } as any,
          'user-uuid-1',
          'MODELER'
        )
      ).rejects.toThrow(ApiError);
    });
  });

  describe('deleteClass', () => {
    it('removes a class from the metamodel', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({
        hasAccess: true,
        isOwner: true,
      });
      prismaMock.metamodel.findFirst.mockResolvedValue({
        ...mockMetamodelRow,
        classes: [{ id: 'cls-1', name: 'ClassToDelete' }],
      });
      prismaMock.metamodel.update.mockResolvedValue({
        ...mockMetamodelRow,
        classes: [],
      });

      const result = await metamodelService.deleteClass('mm-uuid-1', 'cls-1', 'user-uuid-1', 'DSL_DESIGNER');

      expect(prismaMock.metamodel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { classes: [] },
        })
      );
    });
  });
});
