import { prismaMock } from '../helpers/prisma.mock';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';


const sharingServiceMock = {
  checkAccess: jest.fn(),
  deleteResourceShares: jest.fn(),
};
jest.mock('../../services/sharing.service', () => ({
  sharingService: sharingServiceMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

import { diagramService } from '../../services/diagram.service';
import { ApiError } from '../../middleware/errorHandler';

const mockDiagramRow = {
  id: 'diag-uuid-1',
  name: 'TestDiagram',
  modelId: 'model-uuid-1',
  elements: [],
  gridSettings: { sizeX: 20000, sizeY: 20000 },
  userId: 'user-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('DiagramService', () => {
  describe('getAll', () => {
    it('returns owned diagrams', async () => {
      prismaMock.diagram.findMany.mockResolvedValueOnce([mockDiagramRow]);
      prismaMock.sharedResource.findMany.mockResolvedValue([]);

      const result = await diagramService.getAll('user-uuid-1');

      expect(result).toHaveLength(1);
      expect(result[0].isOwner).toBe(true);
    });
  });

  describe('getByModelId', () => {
    it('filters diagrams by model ID', async () => {
      prismaMock.diagram.findMany.mockResolvedValueOnce([mockDiagramRow]);
      prismaMock.sharedResource.findMany.mockResolvedValue([]);

      const result = await diagramService.getByModelId('model-uuid-1', 'user-uuid-1');

      expect(result).toHaveLength(1);
    });

    it('returns empty when no diagrams match model', async () => {
      prismaMock.diagram.findMany.mockResolvedValueOnce([mockDiagramRow]);
      prismaMock.sharedResource.findMany.mockResolvedValue([]);

      const result = await diagramService.getByModelId('other-model', 'user-uuid-1');

      expect(result).toHaveLength(0);
    });
  });

  describe('getById', () => {
    it('returns diagram when accessible', async () => {
      prismaMock.diagram.findFirst.mockResolvedValue(mockDiagramRow);
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

      const result = await diagramService.getById('diag-uuid-1', 'user-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('diag-uuid-1');
    });

    it('returns null when not found', async () => {
      prismaMock.diagram.findFirst.mockResolvedValue(null);

      const result = await diagramService.getById('nonexistent', 'user-uuid-1');

      expect(result).toBeNull();
    });

    it('returns null when no access', async () => {
      prismaMock.diagram.findFirst.mockResolvedValue(mockDiagramRow);
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: false, isOwner: false });

      const result = await diagramService.getById('diag-uuid-1', 'other-user');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates diagram for DSL_DESIGNER', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.diagram.create.mockResolvedValue(mockDiagramRow);

      const result = await diagramService.create(
        {
          id: 'diag-uuid-1',
          name: 'TestDiagram',
          modelId: 'model-uuid-1',
          elements: [],
          gridSettings: { sizeX: 20000, sizeY: 20000 },
        },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.name).toBe('TestDiagram');
    });

    it('throws 403 for VIEWER role', async () => {
      await expect(
        diagramService.create(
          { id: 'diag-uuid-1', name: 'TestDiagram', modelId: 'model-uuid-1', elements: [], gridSettings: { sizeX: 20000, sizeY: 20000 } },
          'user-uuid-1',
          'VIEWER'
        )
      ).rejects.toThrow(ApiError);
    });

    it('throws 400 when referenced model not accessible', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: false, isOwner: false });

      await expect(
        diagramService.create(
          { id: 'diag-uuid-1', name: 'TestDiagram', modelId: 'inaccessible-model', elements: [], gridSettings: { sizeX: 20000, sizeY: 20000 } },
          'user-uuid-1',
          'DSL_DESIGNER'
        )
      ).rejects.toThrow(ApiError);
    });
  });

  describe('update', () => {
    it('updates diagram for owner', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.diagram.update.mockResolvedValue({ ...mockDiagramRow, name: 'Updated Diagram' });

      const result = await diagramService.update(
        'diag-uuid-1',
        { name: 'Updated Diagram' },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.name).toBe('Updated Diagram');
    });

    it('throws 403 for VIEWER role', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

      await expect(
        diagramService.update('diag-uuid-1', { name: 'Updated' }, 'user-uuid-1', 'VIEWER')
      ).rejects.toThrow(ApiError);
    });
  });

  describe('delete', () => {
    it('deletes diagram for owner', async () => {
      prismaMock.diagram.findFirst.mockResolvedValue(mockDiagramRow);
      sharingServiceMock.deleteResourceShares.mockResolvedValue(undefined);
      prismaMock.diagram.delete.mockResolvedValue(mockDiagramRow);

      await expect(diagramService.delete('diag-uuid-1', 'user-uuid-1')).resolves.toBeUndefined();
    });

    it('throws 404 when not owner', async () => {
      prismaMock.diagram.findFirst.mockResolvedValue(null);

      await expect(diagramService.delete('diag-uuid-1', 'other-user')).rejects.toThrow(ApiError);
    });
  });

  describe('addElement', () => {
    it('adds element to diagram', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.diagram.findFirst.mockResolvedValue(mockDiagramRow);
      prismaMock.diagram.update.mockResolvedValue({
        ...mockDiagramRow,
        elements: [{ id: 'elem-1' }],
      });

      await diagramService.addElement(
        'diag-uuid-1',
        { id: 'elem-1' } as any,
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(prismaMock.diagram.update).toHaveBeenCalled();
    });

    it('throws 400 when element with same ID exists', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.diagram.findFirst.mockResolvedValue({
        ...mockDiagramRow,
        elements: [{ id: 'elem-1' }],
      });

      await expect(
        diagramService.addElement(
          'diag-uuid-1',
          { id: 'elem-1' } as any,
          'user-uuid-1',
          'DSL_DESIGNER'
        )
      ).rejects.toThrow(ApiError);
    });
  });

  describe('updateGridSettings', () => {
    it('updates grid settings', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.diagram.update.mockResolvedValue({
        ...mockDiagramRow,
        gridSettings: { sizeX: 50000, sizeY: 50000 },
      });

      const result = await diagramService.updateGridSettings(
        'diag-uuid-1',
        { sizeX: 50000, sizeY: 50000 },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.gridSettings).toEqual({ sizeX: 50000, sizeY: 50000 });
    });
  });
});
