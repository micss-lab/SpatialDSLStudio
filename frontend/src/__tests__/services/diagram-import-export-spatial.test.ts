import { modelService } from '../../services/model';
import { DiagramImportExportService } from '../../services/diagram/diagram-import-export.service';

jest.mock('../../services/model', () => ({
  modelService: { getModelById: jest.fn() },
}));

const mockedModelService = modelService as jest.Mocked<typeof modelService>;

const diagram = (position3D: unknown) => ({
  id: 'diagram-1',
  name: 'Aerial',
  modelId: 'model-1',
  elements: [{
    id: 'drone-1',
    type: 'node',
    modelElementId: 'InspectionDrone',
    x: 10,
    y: 20,
    width: 70,
    height: 70,
    style: {
      position3D,
      widthMm: 1200,
      heightMm: 1200,
      depthMm: 400,
    },
  }],
});

describe('diagram JSON spatial boundaries', () => {
  beforeEach(() => {
    mockedModelService.getModelById.mockReturnValue({ id: 'model-1' } as any);
  });

  it('normalizes legacy X/Y placement to an explicit Z on import and export', () => {
    const service = new DiagramImportExportService();
    const save = jest.fn();
    const imported = service.importDiagramFromJSON(JSON.stringify(diagram({ x: 10, y: 20 })), save);

    expect(imported.diagram?.elements[0].style.position3D).toEqual({ x: 10, y: 20, z: 0 });
    expect(save).toHaveBeenCalledTimes(1);

    const exported = service.exportDiagramToJSON(imported.diagram!);
    expect(JSON.parse(exported!).elements[0].style.position3D).toEqual({ x: 10, y: 20, z: 0 });
  });

  it('rejects malformed placement instead of treating it as ground elevation', () => {
    const service = new DiagramImportExportService();
    const save = jest.fn();
    const imported = service.importDiagramFromJSON(
      JSON.stringify(diagram({ x: 10, y: 20, z: '4500' })),
      save
    );

    expect(imported.diagram).toBeNull();
    expect(imported.diagrams).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });
});
