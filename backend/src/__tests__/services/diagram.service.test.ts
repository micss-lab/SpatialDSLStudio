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
  projectId: null,
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
  projectId: null,
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
  projectId: null,
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
  projectId: null,
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

    it('returns every diagram platform-wide for an ADMIN', async () => {
      sharingServiceMock.isAdmin.mockResolvedValue(true);
      prismaMock.diagram.findMany.mockResolvedValue([
        { ...mockDiagramRow, userId: 'admin-uuid', user: { email: 'admin@example.com' } },
        { ...mockDiagramRow, id: 'diag-uuid-2', userId: 'other-user', user: { email: 'other@example.com' } },
      ] as any);

      const result = await diagramService.getAll('admin-uuid');

      expect(result).toHaveLength(2);
      const others = result.find(d => d.id === 'diag-uuid-2');
      expect(others?.isOwner).toBe(false);
      expect(others?.permission).toBe('EDITOR');
      expect(others?.ownerEmail).toBe('other@example.com');
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

    it('persists a tree representation as an executable view', async () => {
      const treeViewpointRow = {
        ...mockViewpointRow,
        representationDescriptions: [
          {
            ...mockViewpointRow.representationDescriptions[0],
            id: 'tree-representation-1',
            name: 'Robot Tree',
            kind: 'tree',
          },
        ],
      };
      prismaMock.viewpoint.findFirst.mockResolvedValue(treeViewpointRow as any);
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.model.findFirst.mockResolvedValue(mockModelRow as any);
      (prismaMock.diagram.create as any).mockImplementation(async ({ data }: any) => ({
        ...mockDiagramRow,
        ...data,
      }));

      const result = await diagramService.create(
        {
          id: 'tree-view-1',
          name: 'Robot Tree',
          modelId: 'model-uuid-1',
          viewpointId: 'viewpoint-uuid-1',
          representationDescriptionId: 'tree-representation-1',
          elements: [],
          gridSettings: { sizeX: 20000, sizeY: 20000 },
        },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(result.representationDescriptionId).toBe('tree-representation-1');
      expect(prismaMock.diagram.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          viewpointId: 'viewpoint-uuid-1',
          representationDescriptionId: 'tree-representation-1',
        }),
      }));
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

      await expect(diagramService.delete('diag-uuid-1', 'user-uuid-1', 'DSL_DESIGNER')).resolves.toBeUndefined();
      expect(prismaMock.diagram.findFirst).toHaveBeenCalledWith({
        where: { id: 'diag-uuid-1', userId: 'user-uuid-1' },
      });
    });

    it('lets an admin delete a diagram they do not own', async () => {
      prismaMock.diagram.findFirst.mockResolvedValue(mockDiagramRow);
      sharingServiceMock.deleteResourceShares.mockResolvedValue(undefined);
      prismaMock.diagram.delete.mockResolvedValue(mockDiagramRow);

      await expect(diagramService.delete('diag-uuid-1', 'admin-user', 'ADMIN')).resolves.toBeUndefined();
      expect(prismaMock.diagram.findFirst).toHaveBeenCalledWith({
        where: { id: 'diag-uuid-1' },
      });
    });

    it('throws 404 when not owner', async () => {
      prismaMock.diagram.findFirst.mockResolvedValue(null);

      await expect(diagramService.delete('diag-uuid-1', 'other-user', 'DSL_DESIGNER')).rejects.toThrow(ApiError);
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
    it('rejects diagram-only mutations for tree representations', async () => {
      const treeViewpointRow = {
        ...mockViewpointRow,
        representationDescriptions: [
          {
            ...mockViewpointRow.representationDescriptions[0],
            id: 'tree-representation-1',
            kind: 'tree',
          },
        ],
      };
      prismaMock.viewpoint.findFirst.mockResolvedValue(treeViewpointRow as any);
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.diagram.findFirst.mockResolvedValue({
        ...mockDiagramRow,
        viewpointId: 'viewpoint-uuid-1',
        representationDescriptionId: 'tree-representation-1',
      });
      prismaMock.model.findFirst.mockResolvedValue(mockModelRow as any);
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow as any);

      await expect(
        diagramService.createModelElementInView(
          'diag-uuid-1',
          'cls-1',
          'user-uuid-1',
          'DSL_DESIGNER'
        )
      ).rejects.toThrow('only supported for diagram representations');

      expect(prismaMock.model.update).not.toHaveBeenCalled();
      expect(prismaMock.diagram.update).not.toHaveBeenCalled();
    });

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
    const arrangeSpatialUpdate = (presentation: any) => {
      sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });
      prismaMock.diagram.findFirst.mockResolvedValue({
        ...mockDiagramRow,
        viewpointId: mockViewpointRow.id,
        representationDescriptionId: 'representation-uuid-1',
        includedElementIds: ['robot-1'],
      } as any);
      prismaMock.model.findFirst.mockResolvedValue({
        ...mockModelRow,
        elements: [{
          id: 'robot-1',
          modelElementId: 'cls-1',
          style: { name: 'Robot' },
          references: {},
          presentation,
        }],
      } as any);
      prismaMock.metamodel.findFirst.mockResolvedValue(mockMetamodelRow as any);
      prismaMock.model.update.mockResolvedValue(mockModelRow as any);
    };

    it('preserves non-zero elevation when aligned X/Y is edited through a view', async () => {
      arrangeSpatialUpdate({
        position2D: { x: 100, y: 200 },
        position3D: { x: 100, y: 200, z: 4500 },
      });

      await diagramService.updateModelPresentation(
        'diag-uuid-1',
        'robot-1',
        { position2D: { x: 130, y: 175 } },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      expect(prismaMock.model.update).toHaveBeenCalledWith(expect.objectContaining({
        data: {
          elements: [expect.objectContaining({
            presentation: expect.objectContaining({
              position2D: { x: 130, y: 175 },
              position3D: { x: 130, y: 175, z: 4500 },
            }),
          })],
        },
      }));
    });

    it('preserves deliberately distinct physical X/Y during a schematic 2D edit', async () => {
      arrangeSpatialUpdate({
        position2D: { x: 354, y: 104.5 },
        position3D: { x: -22140, y: -9669, z: 4500 },
      });

      await diagramService.updateModelPresentation(
        'diag-uuid-1',
        'robot-1',
        { position2D: { x: 489, y: 106.5 } },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      const savedElements = (prismaMock.model.update.mock.calls[0][0].data as any).elements;
      expect(savedElements[0].presentation.position2D).toEqual({ x: 489, y: 106.5 });
      expect(savedElements[0].presentation.position3D).toEqual({ x: -22140, y: -9669, z: 4500 });
    });

    it('changes Z without moving 2D X/Y', async () => {
      arrangeSpatialUpdate({
        position2D: { x: 100, y: 200 },
        position3D: { x: 100, y: 200, z: 0 },
      });

      await diagramService.updateModelPresentation(
        'diag-uuid-1',
        'robot-1',
        { position3D: { x: 100, y: 200, z: 4500 } },
        'user-uuid-1',
        'DSL_DESIGNER'
      );

      const savedElements = (prismaMock.model.update.mock.calls[0][0].data as any).elements;
      expect(savedElements[0].presentation.position2D).toEqual({ x: 100, y: 200 });
      expect(savedElements[0].presentation.position3D).toEqual({ x: 100, y: 200, z: 4500 });
    });

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
