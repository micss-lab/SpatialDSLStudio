import JSZip from 'jszip';
import { apiClient } from '../../services/core';
import { siriusInteropService } from '../../services/interoperability';
import { modelService } from '../../services/model';

jest.mock('../../services/core', () => ({
  apiClient: {
    post: jest.fn(),
  },
  API_ENDPOINTS: {
    SIRIUS_VALIDATE: '/interoperability/sirius/validate',
    SIRIUS_IMPORT: '/interoperability/sirius/import',
    SIRIUS_AIRD_IMPORT: '/interoperability/sirius/aird/import',
    SIRIUS_AIRD_EXPORT: '/interoperability/sirius/aird/export',
    SIRIUS_EXPORT: '/interoperability/sirius/export',
    SIRIUS_PROJECT_EXPORT: '/interoperability/sirius/project/export',
  },
}));

jest.mock('../../services/model', () => ({
  modelService: {
    getAllModels: jest.fn(),
    importModel: jest.fn(),
  },
}));

const mockedApiClient = apiClient as any;
const mockedModelService = modelService as jest.Mocked<typeof modelService>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedModelService.getAllModels.mockReturnValue([]);
  mockedModelService.importModel.mockImplementation(async model => model);
});

describe('siriusInteropService', () => {
  it('validates .odesign content through the Sirius API', async () => {
    mockedApiClient.post.mockResolvedValue({
      viewpoints: [],
      report: { supported: true, warnings: [], droppedFeatures: [], unresolvedReferences: [] },
    });

    await siriusInteropService.validateOdesign('<description:Group/>', 'metamodel-1');

    expect(mockedApiClient.post).toHaveBeenCalledWith('/interoperability/sirius/validate', {
      content: '<description:Group/>',
      sourceFormat: 'odesign',
      metamodelId: 'metamodel-1',
      options: undefined,
    });
  });

  it('extracts .odesign from a Sirius project ZIP before import', async () => {
    mockedApiClient.post.mockResolvedValue({
      viewpoints: [{ id: 'viewpoint-1' }],
      report: {
        sourceFormat: 'odesign',
        targetFormat: 'spatialdsl',
        supported: true,
        warnings: [],
        droppedFeatures: [],
        unresolvedReferences: [],
      },
    });

    const zip = new JSZip();
    zip.file('description/workflow.odesign', '<description:Group name="Workflow"/>');
    zip.file('representations/workflow.aird', '<viewpoint:DAnalysis/>');
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = new File([blob], 'workflow.zip', { type: 'application/zip' });

    const result = await siriusInteropService.importFile(file, 'metamodel-1');

    expect(mockedApiClient.post).toHaveBeenCalledWith('/interoperability/sirius/import', {
      content: '<description:Group name="Workflow"/>',
      metamodelId: 'metamodel-1',
      options: undefined,
    });
    expect(result.report.sourceFormat).toBe('project-zip');
    expect(result.report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SIRIUS_DEFERRED_AIRD' }),
      expect.objectContaining({ code: 'SIRIUS_PROJECT_ZIP_ODSIGN_IMPORTED' }),
      expect.objectContaining({ code: 'SPATIALDSL_PRESENTATION_SIDECAR_MISSING' }),
    ]));
  });

  it('restores canonical 3D presentation from a project ZIP sidecar', async () => {
    mockedApiClient.post.mockResolvedValue({
      viewpoints: [{ id: 'viewpoint-1' }],
      report: {
        sourceFormat: 'odesign',
        targetFormat: 'spatialdsl',
        supported: true,
        warnings: [],
        droppedFeatures: [],
        unresolvedReferences: [],
      },
    });
    mockedModelService.getAllModels.mockReturnValue([{
      id: 'model-1',
      name: 'WarehouseModel',
      metamodelId: 'metamodel-1',
      conformsTo: 'metamodel-1',
      elements: [{
        id: 'drone-1',
        modelElementId: 'InspectionDrone',
        style: { name: 'Drone' },
        references: {},
        presentation: { position2D: { x: 10, y: 20 } },
      }],
    }]);

    const zip = new JSZip();
    zip.file('description/warehouse.odesign', '<description:Group name="Warehouse"/>');
    zip.file('spatialdsl-presentation.json', JSON.stringify({
      schemaVersion: 1,
      model: { id: 'model-1', name: 'WarehouseModel', metamodelId: 'metamodel-1' },
      elements: {
        'drone-1': {
          position3D: { x: 12000, y: 6000, z: 4500 },
          size3D: { widthMm: 1200, heightMm: 1200, depthMm: 400 },
          rotationZ: 15,
        },
      },
    }));
    const blob = await zip.generateAsync({ type: 'blob' });
    const result = await siriusInteropService.importFile(
      new File([blob], 'warehouse.zip', { type: 'application/zip' }),
      'metamodel-1'
    );

    expect(mockedModelService.importModel).toHaveBeenCalledWith(expect.objectContaining({
      id: 'model-1',
      elements: [expect.objectContaining({
        id: 'drone-1',
        presentation: {
          position2D: { x: 10, y: 20 },
          position3D: { x: 12000, y: 6000, z: 4500 },
          size3D: { widthMm: 1200, heightMm: 1200, depthMm: 400 },
          rotationZ: 15,
        },
      })],
    }));
    expect(result.report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SPATIALDSL_PRESENTATION_SIDECAR_RECOGNIZED' }),
      expect.objectContaining({ code: 'SPATIALDSL_PRESENTATION_SIDECAR_RESTORED' }),
    ]));
  });

  it('reports a malformed presentation sidecar instead of restoring partial 3D data', async () => {
    mockedApiClient.post.mockResolvedValue({
      viewpoints: [],
      report: {
        sourceFormat: 'odesign',
        targetFormat: 'spatialdsl',
        supported: true,
        warnings: [],
        droppedFeatures: [],
        unresolvedReferences: [],
      },
    });

    const zip = new JSZip();
    zip.file('description/warehouse.odesign', '<description:Group name="Warehouse"/>');
    zip.file('spatialdsl-presentation.json', JSON.stringify({
      schemaVersion: 1,
      model: { id: 'model-1', name: 'WarehouseModel' },
      elements: {
        'drone-1': {
          position3D: { x: 12000, y: 6000, z: 4500 },
          size3D: { widthMm: 1200, heightMm: 1200, depthMm: '400' },
        },
      },
    }));

    const result = await siriusInteropService.importFile(
      new File([await zip.generateAsync({ type: 'blob' })], 'warehouse.zip'),
      'metamodel-1'
    );

    expect(mockedModelService.importModel).not.toHaveBeenCalled();
    expect(result.report.unresolvedReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SPATIALDSL_PRESENTATION_SIDECAR_INVALID' }),
    ]));
  });

  it('reports ambiguous presentation sidecars instead of choosing one by path order', async () => {
    mockedApiClient.post.mockResolvedValue({
      viewpoints: [],
      report: {
        sourceFormat: 'odesign',
        targetFormat: 'spatialdsl',
        supported: true,
        warnings: [],
        droppedFeatures: [],
        unresolvedReferences: [],
      },
    });

    const sidecar = JSON.stringify({
      schemaVersion: 1,
      model: { id: 'model-1' },
      elements: {},
    });
    const zip = new JSZip();
    zip.file('description/warehouse.odesign', '<description:Group name="Warehouse"/>');
    zip.file('spatialdsl-presentation.json', sidecar);
    zip.file('nested/spatialdsl-presentation.json', sidecar);

    const result = await siriusInteropService.importFile(
      new File([await zip.generateAsync({ type: 'blob' })], 'warehouse.zip'),
      'metamodel-1'
    );

    expect(mockedModelService.importModel).not.toHaveBeenCalled();
    expect(result.report.unresolvedReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SPATIALDSL_PRESENTATION_SIDECAR_AMBIGUOUS' }),
    ]));
  });

  it('downloads the complete Sirius project ZIP assembled by the backend', async () => {
    mockedApiClient.post.mockResolvedValue({
      filename: 'workflow.sirius-project.zip',
      content: btoa('PK\u0003\u0004bundle'),
      entries: [
        'model/workflow.ecore',
        'model/sample.xmi',
        'description/workflow.odesign',
        'representations.aird',
      ],
      report: {
        sourceFormat: 'project-zip',
        targetFormat: 'sirius-project',
        supported: true,
        warnings: [],
        droppedFeatures: [],
        unresolvedReferences: [],
      },
    });

    const result = await siriusInteropService.exportProjectZip('metamodel-1', 'model-1');

    expect(result.filename).toBe('workflow.sirius-project.zip');
    expect(mockedApiClient.post).toHaveBeenCalledWith('/interoperability/sirius/project/export', {
      metamodelId: 'metamodel-1',
      modelId: 'model-1',
      viewpointIds: undefined,
      diagramIds: undefined,
    });
    expect(result.report.droppedFeatures).toEqual([]);
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it('validates an .aird view with the model and viewpoint context', async () => {
    mockedApiClient.post.mockResolvedValue({
      diagrams: [],
      report: { supported: true, warnings: [], droppedFeatures: [], unresolvedReferences: [] },
    });

    await siriusInteropService.validateAird('<viewpoint:DAnalysis/>', 'model-1', 'viewpoint-1');

    expect(mockedApiClient.post).toHaveBeenCalledWith('/interoperability/sirius/validate', {
      content: '<viewpoint:DAnalysis/>',
      sourceFormat: 'aird',
      modelId: 'model-1',
      viewpointId: 'viewpoint-1',
      options: undefined,
    });
  });

  it('imports an .aird view through the dedicated endpoint', async () => {
    mockedApiClient.post.mockResolvedValue({
      diagrams: [{ id: 'diagram-1' }],
      report: { supported: true, warnings: [], droppedFeatures: [], unresolvedReferences: [] },
    });

    const file = { text: () => Promise.resolve('<viewpoint:DAnalysis/>') } as unknown as File;
    const result = await siriusInteropService.importAirdFile(file, 'model-1', 'viewpoint-1');

    expect(result.diagrams).toHaveLength(1);
    expect(mockedApiClient.post).toHaveBeenCalledWith('/interoperability/sirius/aird/import', {
      content: '<viewpoint:DAnalysis/>',
      modelId: 'model-1',
      viewpointId: 'viewpoint-1',
      options: undefined,
    });
  });

  it('exports a model\'s views through the dedicated .aird export endpoint', async () => {
    mockedApiClient.post.mockResolvedValue({
      filename: 'demo-model.aird',
      content: '<xmi:XMI/>',
      report: { supported: true, warnings: [], droppedFeatures: [], unresolvedReferences: [] },
    });

    const result = await siriusInteropService.exportAird('model-1');

    expect(result.filename).toBe('demo-model.aird');
    expect(mockedApiClient.post).toHaveBeenCalledWith('/interoperability/sirius/aird/export', {
      modelId: 'model-1',
      diagramIds: undefined,
      options: { includeAird: true },
    });
  });
});
