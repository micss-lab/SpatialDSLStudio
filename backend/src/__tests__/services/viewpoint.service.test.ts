import { prismaMock } from '../helpers/prisma.mock';
import { mockReset } from 'jest-mock-extended';

const sharingServiceMock = {
  checkAccess: jest.fn(),
};

jest.mock('../../services/sharing.service', () => ({
  sharingService: sharingServiceMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
  (prismaMock.$transaction as any).mockImplementation(async (operations: any[]) => Promise.all(operations));
});

import { viewpointService } from '../../services/viewpoint.service';
import { ApiError } from '../../middleware/errorHandler';

const mockMetamodelRow = {
  id: 'metamodel-uuid-1',
  name: 'TestMetamodel',
  uri: 'test',
  prefix: 'test',
  eClass: '',
  classes: [
    {
      id: 'cls-1',
      name: 'Robot',
      eClass: 'EClass',
      abstract: false,
      superTypes: [],
      attributes: [],
      references: [],
    },
  ],
  enums: [],
  constraints: [],
  conformsToId: 'epackage-uuid-1',
  userId: 'metamodel-owner-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockViewpointRow = {
  id: 'viewpoint-uuid-1',
  name: 'Operations',
  description: 'Ops view',
  metamodelId: 'metamodel-uuid-1',
  representationDescriptions: [
    {
      id: 'rep-1',
      name: 'Main Diagram',
      viewpointId: 'viewpoint-uuid-1',
      kind: 'diagram',
      visibleMetaClassIds: ['cls-1'],
      creatableMetaClassIds: ['cls-1'],
      isDefault: true,
    },
  ],
  sharedConcreteSyntax: {},
  isDefault: true,
  userId: 'metamodel-owner-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ViewpointService', () => {
  describe('create', () => {
    it('creates shared-editor viewpoints under the metamodel owner and clears competing defaults', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: false, permission: 'EDITOR' });
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow as any);
      prismaMock.viewpoint.findMany.mockResolvedValue([]);
      prismaMock.viewpoint.updateMany.mockResolvedValue({ count: 1 } as any);
      (prismaMock.viewpoint.create as any).mockImplementation(async ({ data }: any) => ({
        ...mockViewpointRow,
        ...data,
      }));

      const result = await viewpointService.create(
        {
          id: 'viewpoint-uuid-1',
          name: '  Operations  ',
          metamodelId: 'metamodel-uuid-1',
          isDefault: true,
          representationDescriptions: [
            {
              id: 'rep-1',
              name: '  Main Diagram  ',
              viewpointId: 'wrong-viewpoint',
              kind: 'diagram',
              visibleMetaClassIds: ['cls-1', 'cls-1'],
              creatableMetaClassIds: ['cls-1'],
              isDefault: true,
            },
          ],
        },
        'shared-editor-1',
        'DSL_DESIGNER'
      );

      expect(result.name).toBe('Operations');
      expect(prismaMock.viewpoint.updateMany).toHaveBeenCalledWith({
        where: { metamodelId: 'metamodel-uuid-1', id: { not: 'viewpoint-uuid-1' }, isDefault: true },
        data: { isDefault: false },
      });
      expect(prismaMock.viewpoint.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          userId: 'metamodel-owner-1',
          name: 'Operations',
          isDefault: true,
        }),
      }));

      const createData = (prismaMock.viewpoint.create as jest.Mock).mock.calls[0][0].data;
      expect(createData.representationDescriptions[0]).toEqual(expect.objectContaining({
        id: 'rep-1',
        name: 'Main Diagram',
        viewpointId: 'viewpoint-uuid-1',
        visibleMetaClassIds: ['cls-1'],
      }));
    });

    it('rejects duplicate viewpoint names case-insensitively within a metamodel', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow as any);
      prismaMock.viewpoint.findMany.mockResolvedValue([
        { id: 'other-viewpoint', name: 'operations' },
      ] as any);

      await expect(
        viewpointService.create(
          { name: ' Operations ', metamodelId: 'metamodel-uuid-1' },
          'metamodel-owner-1',
          'DSL_DESIGNER'
        )
      ).rejects.toThrow(ApiError);

      expect(prismaMock.viewpoint.create).not.toHaveBeenCalled();
    });
  });

  describe('getDefaultForMetamodel', () => {
    it('generates a unique default viewpoint name when Default already exists', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.viewpoint.findFirst.mockResolvedValue(null);
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow as any);
      prismaMock.viewpoint.findMany.mockResolvedValue([{ name: 'Default' }] as any);
      (prismaMock.viewpoint.create as any).mockImplementation(async ({ data }: any) => ({
        ...mockViewpointRow,
        ...data,
      }));

      const result = await viewpointService.getDefaultForMetamodel('metamodel-uuid-1', 'metamodel-owner-1');

      expect(result.name).toBe('Default 2');
      expect(prismaMock.viewpoint.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          name: 'Default 2',
          userId: 'metamodel-owner-1',
          isDefault: true,
        }),
      }));
    });
  });

  describe('updateRepresentationDescription', () => {
    it('preserves the path representation ID and viewpoint ID over request body IDs', async () => {
      const existingViewpoint = {
        ...mockViewpointRow,
        representationDescriptions: [
          {
            id: 'rep-1',
            name: 'Main Diagram',
            viewpointId: 'viewpoint-uuid-1',
            kind: 'diagram',
            visibleMetaClassIds: ['cls-1'],
            creatableMetaClassIds: ['cls-1'],
            isDefault: false,
          },
          {
            id: 'rep-2',
            name: 'Secondary Diagram',
            viewpointId: 'viewpoint-uuid-1',
            kind: 'diagram',
            visibleMetaClassIds: ['cls-1'],
            creatableMetaClassIds: ['cls-1'],
            isDefault: true,
          },
        ],
      };

      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.viewpoint.findFirst.mockResolvedValue(existingViewpoint as any);
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow as any);
      (prismaMock.viewpoint.update as any).mockImplementation(async ({ data }: any) => ({
        ...existingViewpoint,
        ...data,
      }));

      await viewpointService.updateRepresentationDescription(
        'viewpoint-uuid-1',
        'rep-1',
        {
          id: 'rep-from-body',
          viewpointId: 'wrong-viewpoint',
          name: '  Main Updated  ',
          isDefault: true,
        },
        'metamodel-owner-1',
        'DSL_DESIGNER'
      );

      const updateData = (prismaMock.viewpoint.update as jest.Mock).mock.calls[0][0].data;
      expect(updateData.representationDescriptions[0]).toEqual(expect.objectContaining({
        id: 'rep-1',
        viewpointId: 'viewpoint-uuid-1',
        name: 'Main Updated',
        isDefault: true,
      }));
      expect(updateData.representationDescriptions[1]).toEqual(expect.objectContaining({
        id: 'rep-2',
        isDefault: false,
      }));
    });

    it('rejects deletion of unknown representation descriptions', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.viewpoint.findFirst.mockResolvedValue(mockViewpointRow as any);
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow as any);

      await expect(
        viewpointService.deleteRepresentationDescription(
          'viewpoint-uuid-1',
          'missing-rep',
          'metamodel-owner-1',
          'DSL_DESIGNER'
        )
      ).rejects.toThrow(ApiError);

      expect(prismaMock.viewpoint.update).not.toHaveBeenCalled();
    });
  });
});
