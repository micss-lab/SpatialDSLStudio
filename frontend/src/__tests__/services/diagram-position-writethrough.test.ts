import { Model } from '../../models/types';

jest.mock('../../services/diagram/diagram-crud.service', () => ({
  diagramCrudService: {
    getDiagramById: jest.fn(),
    getDiagramsRef: jest.fn(() => [])
  }
}));

jest.mock('../../services/diagram/view-projection.service', () => ({
  viewProjectionService: {
    getIncludedElementIds: jest.fn(() => [])
  }
}));

jest.mock('../../services/model', () => ({
  modelService: {
    getModelById: jest.fn(),
    updateModelElementPresentation: jest.fn(() => true),
    updateModelElementProperties: jest.fn(() => true)
  }
}));

jest.mock('../../services/diagram/diagram-api-sync.service', () => ({
  diagramApiSyncService: {
    updateModelElementPresentation: jest.fn(() =>
      Promise.resolve({ id: 'diagram-1', elements: [] })
    )
  }
}));

import { diagramService } from '../../services/diagram/diagram.service';
import { diagramCrudService } from '../../services/diagram/diagram-crud.service';
import { viewProjectionService } from '../../services/diagram/view-projection.service';
import { modelService } from '../../services/model';
import { diagramApiSyncService } from '../../services/diagram/diagram-api-sync.service';

const diagram = { id: 'diagram-1', modelId: 'model-1', elements: [] };

const makeModel = (presentation?: Record<string, any>): Model =>
  ({
    id: 'model-1',
    name: 'Warehouse',
    metamodelId: 'mm-1',
    conformsTo: 'mm-1',
    elements: [
      {
        id: 'el-1',
        modelElementId: 'class-rack',
        style: { name: 'Rack A' },
        references: {},
        presentation
      }
    ]
  } as Model);

beforeEach(() => {
  (diagramCrudService.getDiagramById as jest.Mock).mockReturnValue(diagram);
  (diagramCrudService.getDiagramsRef as jest.Mock).mockReturnValue([]);
  (viewProjectionService.getIncludedElementIds as jest.Mock).mockReturnValue(['el-1']);
  (modelService.updateModelElementPresentation as jest.Mock).mockReturnValue(true);
  (modelService.updateModelElementProperties as jest.Mock).mockReturnValue(true);
  (diagramApiSyncService.updateModelElementPresentation as jest.Mock).mockResolvedValue({
    id: 'diagram-1',
    elements: []
  });
});

describe('2D/3D position write-through', () => {
  describe('updateElement (3D editor persist path)', () => {
    it('mirrors a 3D move to position2D with the same values', () => {
      (modelService.getModelById as jest.Mock).mockReturnValue(
        makeModel({ position2D: { x: 1, y: 2 } })
      );

      diagramService.updateElement('diagram-1', 'el-1', {
        style: { position3D: { x: 500, y: 700 } }
      });

      expect(modelService.updateModelElementPresentation).toHaveBeenCalledWith(
        'model-1',
        'el-1',
        expect.objectContaining({
          position3D: { x: 500, y: 700 },
          position2D: { x: 500, y: 700 }
        })
      );
    });

    it('mirrors a 2D x/y move to position3D when the element already has a world-space position', () => {
      (modelService.getModelById as jest.Mock).mockReturnValue(
        makeModel({ position2D: { x: 1, y: 2 }, position3D: { x: 1, y: 2 } })
      );

      diagramService.updateElement('diagram-1', 'el-1', { x: 30, y: 40 });

      expect(modelService.updateModelElementPresentation).toHaveBeenCalledWith(
        'model-1',
        'el-1',
        expect.objectContaining({
          position2D: { x: 30, y: 40 },
          position3D: { x: 30, y: 40 }
        })
      );
    });

    it('does not mirror across a legacy record whose 2D and 3D positions intentionally differ', () => {
      (modelService.getModelById as jest.Mock).mockReturnValue(
        makeModel({ position2D: { x: 354, y: 104.5 }, position3D: { x: -22140, y: -9669 } })
      );

      diagramService.updateElement('diagram-1', 'el-1', {
        style: { position3D: { x: -20140, y: -9669 } }
      });

      const persisted = (modelService.updateModelElementPresentation as jest.Mock).mock
        .calls[0][2];
      expect(persisted.position3D).toEqual({ x: -20140, y: -9669 });
      expect(persisted.position2D).toBeUndefined();
    });

    it('does not overwrite a world-space position from a schematic 2D drag', () => {
      (modelService.getModelById as jest.Mock).mockReturnValue(
        makeModel({ position2D: { x: 354, y: 104.5 }, position3D: { x: -22140, y: -9669 } })
      );

      diagramService.updateElement('diagram-1', 'el-1', { x: 489, y: 106.5 });

      const persisted = (modelService.updateModelElementPresentation as jest.Mock).mock
        .calls[0][2];
      expect(persisted.position2D).toEqual({ x: 489, y: 106.5 });
      expect(persisted.position3D).toBeUndefined();
    });

    it('does not create position3D for elements without a world-space position', () => {
      (modelService.getModelById as jest.Mock).mockReturnValue(
        makeModel({ position2D: { x: 1, y: 2 } })
      );

      diagramService.updateElement('diagram-1', 'el-1', { x: 30, y: 40 });

      const persisted = (modelService.updateModelElementPresentation as jest.Mock).mock
        .calls[0][2];
      expect(persisted.position2D).toEqual({ x: 30, y: 40 });
      expect(persisted.position3D).toBeUndefined();
    });
  });

  describe('updateModelElementPresentationInView (2D editor persist path)', () => {
    it('mirrors a 2D move to position3D when the element already has a world-space position', async () => {
      (modelService.getModelById as jest.Mock).mockReturnValue(
        makeModel({ position2D: { x: 1, y: 2 }, position3D: { x: 1, y: 2 } })
      );

      await diagramService.updateModelElementPresentationInView('diagram-1', 'el-1', {
        position2D: { x: 10, y: 20 }
      });

      const expected = expect.objectContaining({
        position2D: { x: 10, y: 20 },
        position3D: { x: 10, y: 20 }
      });
      expect(modelService.updateModelElementPresentation).toHaveBeenCalledWith(
        'model-1',
        'el-1',
        expected
      );
      expect(diagramApiSyncService.updateModelElementPresentation).toHaveBeenCalledWith(
        'diagram-1',
        'el-1',
        expected
      );
    });

    it('leaves pure 2D notations untouched (no position3D is ever created)', async () => {
      (modelService.getModelById as jest.Mock).mockReturnValue(
        makeModel({ position2D: { x: 1, y: 2 } })
      );

      await diagramService.updateModelElementPresentationInView('diagram-1', 'el-1', {
        position2D: { x: 10, y: 20 }
      });

      const persisted = (modelService.updateModelElementPresentation as jest.Mock).mock
        .calls[0][2];
      expect(persisted.position2D).toEqual({ x: 10, y: 20 });
      expect(persisted.position3D).toBeUndefined();
    });

    it('mirrors a 3D-only presentation update back to position2D', async () => {
      (modelService.getModelById as jest.Mock).mockReturnValue(
        makeModel({ position2D: { x: 1, y: 2 }, position3D: { x: 1, y: 2 } })
      );

      await diagramService.updateModelElementPresentationInView('diagram-1', 'el-1', {
        position3D: { x: 900, y: 450 }
      });

      expect(modelService.updateModelElementPresentation).toHaveBeenCalledWith(
        'model-1',
        'el-1',
        expect.objectContaining({
          position3D: { x: 900, y: 450 },
          position2D: { x: 900, y: 450 }
        })
      );
    });
  });
});
