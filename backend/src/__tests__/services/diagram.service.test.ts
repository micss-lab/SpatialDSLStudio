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
  (prismaMock.$transaction as any).mockImplementation(async (operations: any[]) => Promise.all(operations));
});

import { diagramService } from '../../services/diagram.service';
import { ApiError } from '../../middleware/errorHandler';

const mockDiagramRow = {
  id: 'diag-uuid-1',
  name: 'TestDiagram',
  description: null,
  modelId: 'model-uuid-1',
  viewpointId: null,
  representationDescriptionId: null,
  elements: [],
  includedElementIds: [],
  schemaVersion: 2,
  migrationWarnings: [],
  gridSettings: { sizeX: 20000, sizeY: 20000 },
  userId: 'user-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockModelRow = {
  id: 'model-uuid-1',
  name: 'TestModel',
  description: null,
  metamodelId: 'metamodel-uuid-1',
  elements: [],
  connections: [],
  conformsToId: 'metamodel-uuid-1',
  userId: 'user-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMetamodelRow = {
  id: 'metamodel-uuid-1',
  name: 'TestMetamodel',
  description: null,
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
      attributes: [{ id: 'attr-1', name: 'name', eClass: 'EAttribute', type: 'string', many: false }],
      references: [{ id: 'ref-1', name: 'parts', eClass: 'EReference', target: 'cls-1', containment: true, cardinality: { lowerBound: 0, upperBound: '*' } }],
    },
    {
      id: 'abstract-cls',
      name: 'AbstractRobot',
      eClass: 'EClass',
      abstract: true,
      superTypes: [],
      attributes: [],
      references: [],
    },
  ],
  enums: [],
  constraints: [],
  conformsToId: 'epackage-uuid-1',
  userId: 'user-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockViewpointRow = {
  id: 'viewpoint-uuid-1',
  name: 'Default',
  description: 'Default modeling perspective generated from the metamodel.',
  metamodelId: 'metamodel-uuid-1',
  representationDescriptions: [
    {
      id: 'representation-uuid-1',
      name: 'Default Diagram',
      viewpointId: 'viewpoint-uuid-1',
      kind: 'diagram',
      visibleMetaClassIds: ['cls-1', 'abstract-cls'],
      creatableMetaClassIds: ['cls-1'],
      isDefault: true,
    },
  ],
  sharedConcreteSyntax: {},
  isDefault: true,
  userId: 'user-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('DiagramService', () => {
  beforeEach(() => {
    prismaMock.viewpoint.findFirst.mockResolvedValue(mockViewpointRow as any);
  });

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
      prismaMock.model.findFirst.mockResolvedValue(mockModelRow as any);
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

  describe('createModelElementInView', () => {
    it('creates a model element and includes it in the current view', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.diagram.findFirst.mockResolvedValue(mockDiagramRow);
      prismaMock.model.findFirst.mockResolvedValue(mockModelRow as any);
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow as any);
      prismaMock.model.update.mockResolvedValue({
        ...mockModelRow,
        elements: [{ id: 'created-1', modelElementId: 'cls-1', style: {}, references: {} }],
      } as any);
      (prismaMock.diagram.update as any).mockImplementation(async ({ data }: any) => ({
        ...mockDiagramRow,
        ...data,
      }));

      const result = await diagramService.createModelElementInView(
        'diag-uuid-1',
        'cls-1',
        'user-uuid-1',
        'DSL_DESIGNER',
        { position2D: { x: 100, y: 120 }, size2D: { width: 140, height: 90 } },
        { name: 'Robot 1' }
      );

      expect(result.modelElement.modelElementId).toBe('cls-1');
      expect(result.modelElement.style.name).toBe('Robot 1');
      expect(result.modelElement.references.parts).toEqual([]);
      expect(result.diagram.includedElementIds).toEqual([result.modelElement.id]);
      expect(prismaMock.model.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'model-uuid-1' },
      }));
      expect(prismaMock.diagram.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'diag-uuid-1' },
      }));
    });

    it('rejects abstract metaclasses', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.diagram.findFirst.mockResolvedValue(mockDiagramRow);
      prismaMock.model.findFirst.mockResolvedValue(mockModelRow as any);
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow as any);

      await expect(
        diagramService.createModelElementInView(
          'diag-uuid-1',
          'abstract-cls',
          'user-uuid-1',
          'DSL_DESIGNER'
        )
      ).rejects.toThrow(ApiError);

      expect(prismaMock.model.update).not.toHaveBeenCalled();
      expect(prismaMock.diagram.update).not.toHaveBeenCalled();
    });

    it('preserves existing unique view membership when creating', async () => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.diagram.findFirst.mockResolvedValue({
        ...mockDiagramRow,
        includedElementIds: ['existing-1', 'existing-1'],
      });
      prismaMock.model.findFirst.mockResolvedValue({
        ...mockModelRow,
        elements: [{ id: 'existing-1', modelElementId: 'cls-1', style: {}, references: {} }],
      } as any);
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow as any);
      prismaMock.model.update.mockResolvedValue({} as any);
      (prismaMock.diagram.update as any).mockImplementation(async ({ data }: any) => ({
        ...mockDiagramRow,
        ...data,
      }));

      const result = await diagramService.createModelElementInView(
        'diag-uuid-1',
        'cls-1',
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.diagram.includedElementIds).toEqual(['existing-1', result.modelElement.id]);
    });

    it('rejects pin creation when the requested side is not allowed by the representation', async () => {
      const pinMetamodelRow = {
        ...mockMetamodelRow,
        classes: [
          ...mockMetamodelRow.classes,
          {
            id: 'pin-cls',
            name: 'InputPin',
            eClass: 'EClass',
            abstract: false,
            superTypes: [],
            attributes: [],
            references: [
              {
                id: 'owner-ref',
                name: 'owner',
                eClass: 'EReference',
                target: 'cls-1',
                containment: false,
                cardinality: { lowerBound: 1, upperBound: 1 },
              },
            ],
          },
        ],
      };
      const pinViewpointRow = {
        ...mockViewpointRow,
        representationDescriptions: [
          {
            ...mockViewpointRow.representationDescriptions[0],
            visibleMetaClassIds: ['cls-1', 'pin-cls'],
            creatableMetaClassIds: ['cls-1', 'pin-cls'],
            pinMappings: [
              {
                id: 'pin-map-1',
                pinMetaClassIds: ['pin-cls'],
                ownerMetaClassIds: ['cls-1'],
                attachmentReferenceName: 'owner',
                allowedSides: ['left'],
              },
            ],
          },
        ],
      };

      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.diagram.findFirst.mockResolvedValue({
        ...mockDiagramRow,
        includedElementIds: ['owner-1'],
      });
      prismaMock.model.findFirst.mockResolvedValue({
        ...mockModelRow,
        elements: [{ id: 'owner-1', modelElementId: 'cls-1', style: {}, references: {} }],
      } as any);
      prismaMock.metamodel.findFirst.mockResolvedValue(pinMetamodelRow as any);
      prismaMock.viewpoint.findFirst.mockResolvedValue(pinViewpointRow as any);

      await expect(
        diagramService.createModelElementInView(
          'diag-uuid-1',
          'pin-cls',
          'user-uuid-1',
          'DSL_DESIGNER',
          { attachedToElementId: 'owner-1', attachmentSide: 'right' }
        )
      ).rejects.toThrow(ApiError);

      expect(prismaMock.model.update).not.toHaveBeenCalled();
      expect(prismaMock.diagram.update).not.toHaveBeenCalled();
    });

    it('rejects pin creation when the owner is not included in the view', async () => {
      const pinMetamodelRow = {
        ...mockMetamodelRow,
        classes: [
          ...mockMetamodelRow.classes,
          {
            id: 'pin-cls',
            name: 'InputPin',
            eClass: 'EClass',
            abstract: false,
            superTypes: [],
            attributes: [],
            references: [
              {
                id: 'owner-ref',
                name: 'owner',
                eClass: 'EReference',
                target: 'cls-1',
                containment: false,
                cardinality: { lowerBound: 1, upperBound: 1 },
              },
            ],
          },
        ],
      };
      const pinViewpointRow = {
        ...mockViewpointRow,
        representationDescriptions: [
          {
            ...mockViewpointRow.representationDescriptions[0],
            visibleMetaClassIds: ['cls-1', 'pin-cls'],
            creatableMetaClassIds: ['cls-1', 'pin-cls'],
            pinMappings: [
              {
                id: 'pin-map-1',
                pinMetaClassIds: ['pin-cls'],
                ownerMetaClassIds: ['cls-1'],
                attachmentReferenceName: 'owner',
                allowedSides: ['left'],
              },
            ],
          },
        ],
      };

      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.diagram.findFirst.mockResolvedValue(mockDiagramRow);
      prismaMock.model.findFirst.mockResolvedValue({
        ...mockModelRow,
        elements: [{ id: 'owner-1', modelElementId: 'cls-1', style: {}, references: {} }],
      } as any);
      prismaMock.metamodel.findFirst.mockResolvedValue(pinMetamodelRow as any);
      prismaMock.viewpoint.findFirst.mockResolvedValue(pinViewpointRow as any);

      await expect(
        diagramService.createModelElementInView(
          'diag-uuid-1',
          'pin-cls',
          'user-uuid-1',
          'DSL_DESIGNER',
          { attachedToElementId: 'owner-1', attachmentSide: 'left' }
        )
      ).rejects.toThrow(ApiError);

      expect(prismaMock.model.update).not.toHaveBeenCalled();
      expect(prismaMock.diagram.update).not.toHaveBeenCalled();
    });
  });

  describe('updateModelPresentation', () => {
    it('rejects pin updates when the owner metaclass is not allowed by the representation', async () => {
      const pinMetamodelRow = {
        ...mockMetamodelRow,
        classes: [
          ...mockMetamodelRow.classes,
          {
            id: 'pin-cls',
            name: 'InputPin',
            eClass: 'EClass',
            abstract: false,
            superTypes: [],
            attributes: [],
            references: [
              {
                id: 'owner-ref',
                name: 'owner',
                eClass: 'EReference',
                target: 'cls-1',
                containment: false,
                cardinality: { lowerBound: 1, upperBound: 1 },
              },
            ],
          },
        ],
      };
      const pinViewpointRow = {
        ...mockViewpointRow,
        representationDescriptions: [
          {
            ...mockViewpointRow.representationDescriptions[0],
            visibleMetaClassIds: ['cls-1', 'pin-cls'],
            creatableMetaClassIds: ['cls-1', 'pin-cls'],
            pinMappings: [
              {
                id: 'pin-map-1',
                pinMetaClassIds: ['pin-cls'],
                ownerMetaClassIds: ['cls-1'],
                attachmentReferenceName: 'owner',
                allowedSides: ['left'],
              },
            ],
          },
        ],
      };

      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.diagram.findFirst.mockResolvedValue({
        ...mockDiagramRow,
        includedElementIds: ['pin-1', 'bad-owner-1'],
      });
      prismaMock.model.findFirst.mockResolvedValue({
        ...mockModelRow,
        elements: [
          { id: 'pin-1', modelElementId: 'pin-cls', style: {}, references: { owner: null } },
          { id: 'bad-owner-1', modelElementId: 'pin-cls', style: {}, references: { owner: null } },
        ],
      } as any);
      prismaMock.metamodel.findFirst.mockResolvedValue(pinMetamodelRow as any);
      prismaMock.viewpoint.findFirst.mockResolvedValue(pinViewpointRow as any);

      await expect(
        diagramService.updateModelPresentation(
          'diag-uuid-1',
          'pin-1',
          { attachedToElementId: 'bad-owner-1', attachmentSide: 'left' },
          'user-uuid-1',
          'DSL_DESIGNER'
        )
      ).rejects.toThrow(ApiError);

      expect(prismaMock.model.update).not.toHaveBeenCalled();
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
