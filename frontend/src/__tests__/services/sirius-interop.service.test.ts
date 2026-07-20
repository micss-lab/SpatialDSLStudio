import JSZip from 'jszip';
import { apiClient } from '../../services/core';
import { siriusInteropService } from '../../services/interoperability';

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
  },
}));

const mockedApiClient = apiClient as any;

beforeEach(() => {
  jest.clearAllMocks();
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
    ]));
  });

  it('packages .odesign export into a Sirius project ZIP', async () => {
    mockedApiClient.post.mockResolvedValue({
      filename: 'workflow.odesign',
      content: '<description:Group/>',
      report: {
        sourceFormat: 'odesign',
        targetFormat: 'sirius-project',
        supported: true,
        warnings: [],
        droppedFeatures: [],
        unresolvedReferences: [],
      },
    });

    const result = await siriusInteropService.exportProjectZip('metamodel-1');

    expect(result.filename).toBe('workflow.sirius-project.zip');
    expect(result.report.droppedFeatures).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SIRIUS_DEFERRED_AIRD_EXPORT' }),
    ]));
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
