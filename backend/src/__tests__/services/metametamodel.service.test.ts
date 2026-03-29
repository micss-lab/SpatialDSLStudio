import { prismaMock } from '../helpers/prisma.mock';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';


beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

import { metametamodelService } from '../../services/metametamodel.service';
import { ApiError } from '../../middleware/errorHandler';

const mockEPackage = {
  id: 'pkg-uuid-1',
  name: 'Ecore',
  nsURI: 'http://www.modeling-tool.com/ecore',
  nsPrefix: 'ecore',
  classes: [],
  userId: 'user-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('MetametamodelService', () => {
  describe('getAll', () => {
    it('returns all packages for user', async () => {
      prismaMock.ePackage.findMany.mockResolvedValue([mockEPackage]);

      const result = await metametamodelService.getAll('user-uuid-1');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Ecore');
      expect(result[0].nsURI).toBe('http://www.modeling-tool.com/ecore');
    });

    it('returns empty array when no packages', async () => {
      prismaMock.ePackage.findMany.mockResolvedValue([]);

      const result = await metametamodelService.getAll('user-uuid-1');

      expect(result).toHaveLength(0);
    });
  });

  describe('getById', () => {
    it('returns package when found', async () => {
      prismaMock.ePackage.findFirst.mockResolvedValue(mockEPackage);

      const result = await metametamodelService.getById('pkg-uuid-1', 'user-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('pkg-uuid-1');
    });

    it('returns null when not found', async () => {
      prismaMock.ePackage.findFirst.mockResolvedValue(null);

      const result = await metametamodelService.getById('nonexistent', 'user-uuid-1');

      expect(result).toBeNull();
    });
  });

  describe('getByUri', () => {
    it('returns package by URI', async () => {
      prismaMock.ePackage.findFirst.mockResolvedValue(mockEPackage);

      const result = await metametamodelService.getByUri('http://www.modeling-tool.com/ecore', 'user-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.nsURI).toBe('http://www.modeling-tool.com/ecore');
    });
  });

  describe('create', () => {
    it('creates a new EPackage', async () => {
      prismaMock.ePackage.create.mockResolvedValue(mockEPackage);

      const result = await metametamodelService.create(
        {
          name: 'Ecore',
          nsURI: 'http://www.modeling-tool.com/ecore',
          nsPrefix: 'ecore',
          classes: [],
        },
        'user-uuid-1'
      );

      expect(result.name).toBe('Ecore');
      expect(prismaMock.ePackage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-uuid-1' }),
        })
      );
    });
  });

  describe('update', () => {
    it('updates EPackage when owner', async () => {
      prismaMock.ePackage.findFirst.mockResolvedValue(mockEPackage);
      prismaMock.ePackage.update.mockResolvedValue({ ...mockEPackage, name: 'Updated' });

      const result = await metametamodelService.update('pkg-uuid-1', { name: 'Updated' }, 'user-uuid-1');

      expect(result.name).toBe('Updated');
    });

    it('throws 404 when not found or not owner', async () => {
      prismaMock.ePackage.findFirst.mockResolvedValue(null);

      await expect(
        metametamodelService.update('nonexistent', { name: 'Updated' }, 'user-uuid-1')
      ).rejects.toThrow(ApiError);
    });
  });

  describe('delete', () => {
    it('deletes EPackage when no metamodels depend on it', async () => {
      prismaMock.ePackage.findFirst.mockResolvedValue(mockEPackage);
      prismaMock.metamodel.count.mockResolvedValue(0);
      prismaMock.ePackage.delete.mockResolvedValue(mockEPackage);

      await expect(metametamodelService.delete('pkg-uuid-1', 'user-uuid-1')).resolves.toBeUndefined();
    });

    it('throws 404 when not found', async () => {
      prismaMock.ePackage.findFirst.mockResolvedValue(null);

      await expect(metametamodelService.delete('nonexistent', 'user-uuid-1')).rejects.toThrow(ApiError);
    });

    it('throws 400 when metamodels depend on the package', async () => {
      prismaMock.ePackage.findFirst.mockResolvedValue(mockEPackage);
      prismaMock.metamodel.count.mockResolvedValue(3);

      await expect(metametamodelService.delete('pkg-uuid-1', 'user-uuid-1')).rejects.toThrow(ApiError);
    });
  });

  describe('initializeCoreEcore', () => {
    it('returns existing core ePackage if already exists', async () => {
      prismaMock.ePackage.findFirst.mockResolvedValue(mockEPackage);

      const result = await metametamodelService.initializeCoreEcore('user-uuid-1');

      expect(result).toEqual(
        expect.objectContaining({ nsURI: 'http://www.modeling-tool.com/ecore' })
      );
      expect(prismaMock.ePackage.create).not.toHaveBeenCalled();
    });

    it('creates core ePackage if it does not exist', async () => {
      prismaMock.ePackage.findFirst.mockResolvedValue(null);
      prismaMock.ePackage.create.mockResolvedValue(mockEPackage);

      const result = await metametamodelService.initializeCoreEcore('user-uuid-1');

      expect(result.nsURI).toBe('http://www.modeling-tool.com/ecore');
      expect(prismaMock.ePackage.create).toHaveBeenCalled();
    });
  });
});
