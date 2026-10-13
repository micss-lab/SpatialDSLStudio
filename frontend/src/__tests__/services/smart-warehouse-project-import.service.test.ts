let mockProjectId: string | null = 'previous-project';

jest.mock('../../services/core', () => ({
  apiClient: {
    getProjectId: jest.fn(),
    setProjectId: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
  },
  API_ENDPOINTS: {
    EPACKAGES_CORE: '/epackages/core',
    METAMODELS: '/metamodels',
    VIEWPOINTS: '/viewpoints',
    MODELS: '/models',
    DIAGRAMS: '/diagrams',
    CODEGEN_PROJECTS: '/codegen/projects',
  },
}));

jest.mock('../../services/metamodel/exampleData.service', () => ({
  exampleDataService: {
    getSmartWarehouseBundle: jest.fn(() => ({
      metamodels: [{
        id: 'metamodel-1',
        name: 'Smart Warehouse',
        uri: 'urn:warehouse',
        prefix: 'warehouse',
        conformsTo: 'legacy-core',
        eClass: 'legacy-epackage',
        classes: [],
      }],
      models: [{
        id: 'model-1',
        name: 'WarehouseModel',
        metamodelId: 'metamodel-1',
        conformsTo: 'metamodel-1',
        elements: [{
          id: 'drone-1',
          modelElementId: 'drone',
          style: { name: 'Drone', position3D: { x: 10, y: 20 } },
          references: {},
        }],
        connections: [],
      }],
      viewpoints: [{
        id: 'viewpoint-1',
        name: 'Operations',
        metamodelId: 'metamodel-1',
        representationDescriptions: [],
      }],
      views: [{
        id: 'view-1',
        name: 'Aerial Inspection',
        modelId: 'model-1',
        elements: [],
      }],
      projects: [
        { id: 'generator-vc', name: 'Visual Components', targetMetamodelId: 'metamodel-1', templates: [] },
        { id: 'generator-usd', name: 'Omniverse', targetMetamodelId: 'metamodel-1', templates: [] },
      ],
    })),
    getSmartHomeBundle: jest.fn(() => ({
      metamodels: [{
        id: 'home-metamodel',
        name: 'Smart Home',
        uri: 'urn:home',
        prefix: 'home',
        conformsTo: 'legacy-core',
        eClass: 'legacy-epackage',
        classes: [],
        spatialRules: [{ id: 'rule-1', name: 'Rooms apart', kind: 'noOverlap', sourceClassId: 'room', targetClassId: 'room', severity: 'error' }],
      }],
      models: [{ id: 'home-model', name: 'Home', metamodelId: 'home-metamodel', conformsTo: 'home-metamodel', elements: [], connections: [] }],
      viewpoints: [{ id: 'home-viewpoint', name: 'Home Layout', metamodelId: 'home-metamodel', representationDescriptions: [] }],
      views: [{ id: 'home-view', name: 'Floor Plan', modelId: 'home-model', elements: [] }],
      projects: [{ id: 'home-generator', name: 'Device Configuration', targetMetamodelId: 'home-metamodel', templates: [] }],
    })),
    getActivityBundle: jest.fn(() => ({
      metamodels: [{ id: 'activity-metamodel', name: 'UMLActivityDiagramMM', uri: 'urn:activity', prefix: 'act', conformsTo: 'legacy-core', classes: [] }],
      models: [{ id: 'activity-model', name: 'Orders', metamodelId: 'activity-metamodel', conformsTo: 'activity-metamodel', elements: [], connections: [] }],
      viewpoints: [{ id: 'activity-viewpoint', name: 'UML Activity', metamodelId: 'activity-metamodel', representationDescriptions: [] }],
      views: [{ id: 'activity-view', name: 'Order Processing Flow', modelId: 'activity-model', elements: [] }],
      projects: [],
    })),
  },
}));

import { apiClient } from '../../services/core';
import { exampleDataService } from '../../services/metamodel/exampleData.service';
import { smartWarehouseProjectImportService } from '../../services/smart-warehouse-project-import.service';

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockExampleDataService = exampleDataService as jest.Mocked<typeof exampleDataService>;
const starterBundle = mockExampleDataService.getSmartWarehouseBundle();
const homeBundle = mockExampleDataService.getSmartHomeBundle();
const activityBundle = mockExampleDataService.getActivityBundle();

describe('Smart Warehouse project starter import', () => {
  beforeEach(() => {
    mockProjectId = 'previous-project';
    jest.clearAllMocks();
    mockExampleDataService.getSmartWarehouseBundle.mockReturnValue(starterBundle);
    mockExampleDataService.getSmartHomeBundle.mockReturnValue(homeBundle);
    mockExampleDataService.getActivityBundle.mockReturnValue(activityBundle);
    mockApiClient.getProjectId.mockImplementation(() => mockProjectId);
    mockApiClient.setProjectId.mockImplementation((projectId: string | null) => {
      mockProjectId = projectId;
    });
    mockApiClient.get.mockImplementation((endpoint: string) => (
      endpoint === '/epackages/core'
        ? Promise.resolve({
          id: 'core-1',
          name: 'Ecore',
          nsURI: 'urn:ecore',
          nsPrefix: 'ecore',
          classes: [{ id: 'eclass-epackage', name: 'EPackage' }],
        })
        : Promise.resolve([])
    ));
    mockApiClient.post.mockImplementation((_endpoint: string, value: unknown) => Promise.resolve(value));
  });

  it('imports the complete connected graph into one scoped project and restores the prior scope', async () => {
    const summary = await smartWarehouseProjectImportService.importInto('smart-project');
    expect(mockExampleDataService.getSmartWarehouseBundle).toHaveBeenCalledWith('smart-project');

    expect(summary).toEqual({
      metamodels: 1,
      models: 1,
      viewpoints: 1,
      views: 1,
      generatorConfigurations: 2,
    });
    expect(mockApiClient.setProjectId).toHaveBeenNthCalledWith(1, 'smart-project');
    expect(mockApiClient.setProjectId).toHaveBeenLastCalledWith('previous-project');

    expect(mockApiClient.post).toHaveBeenCalledWith('/metamodels', expect.objectContaining({
      id: 'metamodel-1',
      conformsTo: 'core-1',
      eClass: 'eclass-epackage',
    }));
    expect(mockApiClient.post).toHaveBeenCalledWith('/models', expect.objectContaining({
      id: 'model-1',
      elements: [expect.objectContaining({
        style: { name: 'Drone' },
        presentation: { position3D: { x: 10, y: 20, z: 0 } },
      })],
    }));
    expect(mockApiClient.post).toHaveBeenCalledWith('/viewpoints', expect.objectContaining({ id: 'viewpoint-1' }));
    expect(mockApiClient.post).toHaveBeenCalledWith('/diagrams', expect.objectContaining({ id: 'view-1' }));
    expect(mockApiClient.post).toHaveBeenCalledWith('/codegen/projects', expect.objectContaining({ id: 'generator-vc' }));
    expect(mockApiClient.post).toHaveBeenCalledWith('/codegen/projects', expect.objectContaining({ id: 'generator-usd' }));
  });

  it('imports the Smart Home starter, spatial rules included, into one scoped project', async () => {
    const summary = await smartWarehouseProjectImportService.importSmartHomeInto('home-project');
    expect(mockExampleDataService.getSmartHomeBundle).toHaveBeenCalledWith('home-project');

    expect(summary).toEqual({ metamodels: 1, models: 1, viewpoints: 1, views: 1, generatorConfigurations: 1 });
    expect(mockApiClient.setProjectId).toHaveBeenNthCalledWith(1, 'home-project');
    expect(mockApiClient.setProjectId).toHaveBeenLastCalledWith('previous-project');
    expect(mockApiClient.post).toHaveBeenCalledWith('/metamodels', expect.objectContaining({
      id: 'home-metamodel',
      conformsTo: 'core-1',
      spatialRules: [expect.objectContaining({ id: 'rule-1', kind: 'noOverlap' })],
    }));
    expect(mockApiClient.post).toHaveBeenCalledWith('/codegen/projects', expect.objectContaining({ id: 'home-generator' }));
  });

  it('imports the UML Activity starter with its saved views', async () => {
    const summary = await smartWarehouseProjectImportService.importActivityInto('activity-project');
    expect(mockExampleDataService.getActivityBundle).toHaveBeenCalledWith('activity-project');

    expect(summary).toEqual({ metamodels: 1, models: 1, viewpoints: 1, views: 1, generatorConfigurations: 0 });
    expect(mockApiClient.post).toHaveBeenCalledWith('/metamodels', expect.objectContaining({ id: 'activity-metamodel', conformsTo: 'core-1' }));
    expect(mockApiClient.post).toHaveBeenCalledWith('/diagrams', expect.objectContaining({ id: 'activity-view' }));
  });

  it('restores the prior API scope if an artifact import fails', async () => {
    mockApiClient.post.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(smartWarehouseProjectImportService.importInto('smart-project'))
      .rejects.toThrow('network unavailable');

    expect(mockProjectId).toBe('previous-project');
  });
});
