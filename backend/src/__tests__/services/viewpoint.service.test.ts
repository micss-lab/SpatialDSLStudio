import { prismaMock } from '../helpers/prisma.mock';
import { mockReset } from 'jest-mock-extended';

const sharingServiceMock = {
  checkAccess: jest.fn(),
  isAdmin: jest.fn(),
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
      references: [
        {
          id: 'ref-parts',
          name: 'parts',
          eClass: 'EReference',
          target: 'cls-1',
          containment: true,
          cardinality: { lowerBound: 0, upperBound: '*' },
        },
      ],
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
  describe('getAll', () => {
    it('returns every viewpoint platform-wide for an ADMIN', async () => {
      sharingServiceMock.isAdmin.mockResolvedValue(true);
      prismaMock.viewpoint.findMany.mockResolvedValue([
        mockViewpointRow,
        { ...mockViewpointRow, id: 'viewpoint-uuid-2', userId: 'other-user' },
      ] as any);

      const result = await viewpointService.getAll('admin-uuid');

      expect(result).toHaveLength(2);
      expect(result.map(v => v.id)).toContain('viewpoint-uuid-2');
    });
  });

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
              tableColumns: ['name', 'name'],
              containerMappings: [
                {
                  id: 'container-robots',
                  containerMetaClassId: ' cls-1 ',
                  containmentReferenceId: ' ref-parts ',
                  childMetaClassIds: ['cls-1', 'cls-1'],
                  concreteSyntax: { two_d: { shape: 'rectangle' } },
                },
              ],
              propertySections: [
                {
                  id: 'properties-robot',
                  name: '  Robot status  ',
                  metaClassIds: ['cls-1', 'cls-1'],
                  attributeNames: ['name', 'battery', 'name'],
                  referenceNames: ['parts', 'parts'],
                },
              ],
              toolDefinitions: [
                {
                  id: 'tool-create',
                  name: '  Create configured robot  ',
                  type: 'node',
                  metaClassId: 'cls-1',
                  payload: {
                    operations: [
                      { type: 'set-attribute', attributeName: 'name', value: 'Configured robot' },
                    ],
                  },
                },
              ],
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
        tableColumns: ['name'],
        containerMappings: [
          {
            id: 'container-robots',
            containerMetaClassId: 'cls-1',
            containmentReferenceId: 'ref-parts',
            childMetaClassIds: ['cls-1'],
            concreteSyntax: { two_d: { shape: 'rectangle' } },
          },
        ],
        propertySections: [
          {
            id: 'properties-robot',
            name: 'Robot status',
            metaClassIds: ['cls-1'],
            attributeNames: ['name', 'battery'],
            referenceNames: ['parts'],
          },
        ],
        toolDefinitions: [expect.objectContaining({
          id: 'tool-create',
          name: 'Create configured robot',
          type: 'create-node',
          metaClassId: 'cls-1',
          payload: {
            operations: [
              { type: 'set-attribute', attributeName: 'name', value: 'Configured robot' },
            ],
          },
        })],
      }));
    });

    it('rejects property sections on non-diagram representations', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow as any);
      prismaMock.viewpoint.findMany.mockResolvedValue([]);

      await expect(viewpointService.create(
        {
          name: 'Invalid table panels',
          metamodelId: 'metamodel-uuid-1',
          representationDescriptions: [
            {
              id: 'rep-table',
              name: 'Robot table',
              viewpointId: 'viewpoint-table',
              kind: 'table',
              visibleMetaClassIds: ['cls-1'],
              creatableMetaClassIds: [],
              propertySections: [{ id: 'section-1', name: 'Details' }],
            },
          ],
        },
        'metamodel-owner-1',
        'DSL_DESIGNER'
      )).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects executable tool payloads with non-scalar operation values', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow as any);
      prismaMock.viewpoint.findMany.mockResolvedValue([]);

      await expect(viewpointService.create(
        {
          name: 'Unsafe tools',
          metamodelId: 'metamodel-uuid-1',
          representationDescriptions: [
            {
              id: 'rep-unsafe',
              name: 'Unsafe Diagram',
              viewpointId: 'viewpoint-unsafe',
              kind: 'diagram',
              visibleMetaClassIds: ['cls-1'],
              creatableMetaClassIds: ['cls-1'],
              toolDefinitions: [
                {
                  id: 'tool-unsafe',
                  name: 'Unsafe create',
                  type: 'create-node',
                  metaClassId: 'cls-1',
                  payload: {
                    operations: [
                      { type: 'set-attribute', attributeName: 'name', value: { expression: 'run()' } as any },
                    ],
                  },
                },
              ],
            },
          ],
        },
        'metamodel-owner-1',
        'DSL_DESIGNER'
      )).rejects.toThrow('must be a scalar or null');

      expect(prismaMock.viewpoint.create).not.toHaveBeenCalled();
    });

    it('rejects inconsistent vertical-placement policies in representation notation', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow as any);
      prismaMock.viewpoint.findMany.mockResolvedValue([]);

      await expect(viewpointService.create(
        {
          name: 'Invalid elevation policy',
          metamodelId: 'metamodel-uuid-1',
          representationDescriptions: [{
            id: 'rep-invalid-elevation',
            name: 'Invalid Diagram',
            viewpointId: 'viewpoint-invalid',
            kind: 'diagram',
            visibleMetaClassIds: ['cls-1'],
            creatableMetaClassIds: ['cls-1'],
            concreteSyntaxByMetaClassId: {
              'cls-1': {
                three_d: {
                  verticalPlacement: {
                    mode: 'adjustable',
                    defaultBaseZMm: -100,
                    minBaseZMm: 0,
                  },
                },
              },
            },
          }],
        },
        'metamodel-owner-1',
        'DSL_DESIGNER'
      )).rejects.toThrow('defaultBaseZMm must be greater than or equal to');

      expect(prismaMock.viewpoint.create).not.toHaveBeenCalled();
    });

    it('rejects malformed vertical-placement policies in viewpoint shared notation', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow as any);
      prismaMock.viewpoint.findMany.mockResolvedValue([]);

      await expect(viewpointService.create(
        {
          name: 'Invalid shared policy',
          metamodelId: 'metamodel-uuid-1',
          sharedConcreteSyntaxByMetaClassId: {
            'cls-1': {
              three_d: {
                verticalPlacement: {
                  mode: 'adjustable',
                  stepMm: '100' as any,
                },
              },
            },
          },
        },
        'metamodel-owner-1',
        'DSL_DESIGNER'
      )).rejects.toThrow('stepMm must be a finite number');

      expect(prismaMock.viewpoint.create).not.toHaveBeenCalled();
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

    it('does not create a default viewpoint during a project-scoped read', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: false, permission: 'VIEWER' });
      prismaMock.viewpoint.findFirst.mockResolvedValue(null);

      await expect(
        viewpointService.getDefaultForMetamodel('metamodel-uuid-1', 'viewer-1', 'project-1')
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(prismaMock.viewpoint.create).not.toHaveBeenCalled();
    });

    it('allows a DSL Designer to explicitly create a project default', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: false, permission: 'EDITOR' });
      prismaMock.metamodel.findFirst.mockResolvedValue({ ...mockMetamodelRow, projectId: 'project-1' } as any);
      prismaMock.viewpoint.findFirst.mockResolvedValue(null);
      prismaMock.viewpoint.findMany.mockResolvedValue([]);
      (prismaMock.viewpoint.create as any).mockImplementation(async ({ data }: any) => ({
        ...mockViewpointRow,
        ...data,
      }));

      const result = await viewpointService.createDefaultForMetamodel(
        'metamodel-uuid-1',
        'designer-1',
        'DSL_DESIGNER',
        'project-1'
      );

      expect(result.isDefault).toBe(true);
      expect(prismaMock.viewpoint.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ projectId: 'project-1', userId: 'designer-1' }),
      }));
    });

    it('does not let a Modeler create a default viewpoint definition', async () => {
      await expect(
        viewpointService.createDefaultForMetamodel(
          'metamodel-uuid-1',
          'modeler-1',
          'MODELER',
          'project-1'
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(prismaMock.viewpoint.create).not.toHaveBeenCalled();
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
