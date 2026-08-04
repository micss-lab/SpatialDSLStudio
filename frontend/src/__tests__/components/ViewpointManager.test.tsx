import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import ViewpointManager from '../../components/viewpoints/ViewpointManager';
import { Metamodel, Viewpoint } from '../../models/types';
import { metamodelService } from '../../services/metamodel';
import { diagramService } from '../../services/diagram';
import { modelService } from '../../services/model';
import viewpointService from '../../services/viewpoint.service';
import { siriusInteropService } from '../../services/interoperability';

const mockMetamodel: Metamodel = {
  id: 'metamodel-1',
  name: 'Workflow',
  eClass: 'epackage',
  uri: 'http://example.com/workflow',
  prefix: 'wf',
  conformsTo: 'core',
  classes: [
    {
      id: 'task',
      name: 'Task',
      eClass: 'eclass',
      abstract: false,
      superTypes: [],
      attributes: [
        { id: 'attr-name', name: 'name', eClass: 'eattribute', type: 'string', many: false },
        { id: 'attr-priority', name: 'priority', eClass: 'eattribute', type: 'number', many: false },
      ],
      references: [
        {
          id: 'ref-next',
          name: 'next',
          eClass: 'ereference',
          target: 'task',
          containment: false,
          cardinality: { lowerBound: 0, upperBound: '*' },
        },
        {
          id: 'ref-children',
          name: 'children',
          eClass: 'ereference',
          target: 'task',
          containment: true,
          cardinality: { lowerBound: 0, upperBound: '*' },
        },
      ],
    },
    {
      id: 'abstract-base',
      name: 'AbstractBase',
      eClass: 'eclass',
      abstract: true,
      superTypes: [],
      attributes: [],
      references: [],
    },
  ],
};

const mockViewpoint: Viewpoint = {
  id: 'viewpoint-1',
  name: 'Default Viewpoint',
  description: 'Main designer viewpoint',
  metamodelId: mockMetamodel.id,
  isDefault: true,
  representationDescriptions: [
    {
      id: 'representation-1',
      name: 'Workflow Diagram',
      viewpointId: 'viewpoint-1',
      kind: 'diagram',
      visibleMetaClassIds: ['task', 'abstract-base'],
      creatableMetaClassIds: ['task'],
      concreteSyntaxByMetaClassId: {},
      concreteSyntaxByReferenceId: {},
      isDefault: true,
    },
  ],
};

var mockCanEditMetamodel = true;
var mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ metamodelId: 'metamodel-1' }),
}));

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    canEditMetamodel: mockCanEditMetamodel,
  }),
}));

jest.mock('../../contexts/ProjectContext', () => ({
  useProject: () => ({
    can: () => mockCanEditMetamodel,
    project: { id: 'project-1' },
  }),
}));

jest.mock('../../services/metamodel', () => ({
  metamodelService: {
    getMetamodelById: jest.fn(),
  },
}));

jest.mock('../../services/diagram', () => ({
  diagramService: {
    getAllDiagrams: jest.fn(),
  },
}));

jest.mock('../../services/viewpoint.service', () => ({
  __esModule: true,
  validateRepresentationVerticalPlacementPolicies: jest.requireActual('../../services/viewpoint.service')
    .validateRepresentationVerticalPlacementPolicies,
  default: {
    getCachedViewpoints: jest.fn(),
    loadViewpoints: jest.fn(),
    getDefaultViewpoint: jest.fn(),
    createDefaultViewpoint: jest.fn(),
    createViewpoint: jest.fn(),
    updateViewpoint: jest.fn(),
    deleteViewpoint: jest.fn(),
    createRepresentationDescription: jest.fn(),
    updateRepresentationDescription: jest.fn(),
    deleteRepresentationDescription: jest.fn(),
  },
  viewpointService: {
    getCachedViewpoints: jest.fn(),
    loadViewpoints: jest.fn(),
    getDefaultViewpoint: jest.fn(),
    createDefaultViewpoint: jest.fn(),
    createViewpoint: jest.fn(),
    updateViewpoint: jest.fn(),
    deleteViewpoint: jest.fn(),
    createRepresentationDescription: jest.fn(),
    updateRepresentationDescription: jest.fn(),
    deleteRepresentationDescription: jest.fn(),
  },
}));

jest.mock('../../services/interoperability', () => ({
  siriusInteropService: {
    validateFile: jest.fn(),
    importFile: jest.fn(),
    exportOdesign: jest.fn(),
    exportProjectZip: jest.fn(),
    downloadText: jest.fn(),
    downloadBlob: jest.fn(),
  },
}));

const mockedMetamodelService = metamodelService as any;
const mockedDiagramService = diagramService as any;
const getModelsByMetamodelIdSpy = jest.spyOn(modelService, 'getModelsByMetamodelId');
const mockedViewpointService = viewpointService as any;
const mockedSiriusInteropService = siriusInteropService as any;

const renderManager = () => render(<ViewpointManager />);

beforeEach(() => {
  jest.clearAllMocks();
  mockCanEditMetamodel = true;
  mockNavigate = jest.fn();
  mockedMetamodelService.getMetamodelById.mockReturnValue(mockMetamodel);
  mockedDiagramService.getAllDiagrams.mockReturnValue([]);
  getModelsByMetamodelIdSpy.mockReturnValue([{ id: 'model-1', name: 'Workflow Model' } as any]);
  mockedViewpointService.getCachedViewpoints.mockReturnValue([mockViewpoint]);
  mockedViewpointService.loadViewpoints.mockResolvedValue([mockViewpoint]);
  mockedViewpointService.getDefaultViewpoint.mockResolvedValue(mockViewpoint);
  mockedViewpointService.createDefaultViewpoint.mockResolvedValue(mockViewpoint);
  mockedViewpointService.createViewpoint.mockImplementation((payload: any) => Promise.resolve({
    ...mockViewpoint,
    id: 'created-viewpoint',
    name: payload.name,
    description: payload.description,
    isDefault: payload.isDefault,
    representationDescriptions: payload.representationDescriptions || [],
  }));
  mockedViewpointService.updateViewpoint.mockResolvedValue(mockViewpoint);
  mockedViewpointService.deleteViewpoint.mockResolvedValue(undefined);
  mockedViewpointService.createRepresentationDescription.mockResolvedValue(mockViewpoint);
  mockedViewpointService.updateRepresentationDescription.mockResolvedValue(mockViewpoint);
  mockedViewpointService.deleteRepresentationDescription.mockResolvedValue(mockViewpoint);
  mockedSiriusInteropService.validateFile.mockResolvedValue({
    viewpoints: [mockViewpoint],
    report: {
      sourceFormat: 'odesign',
      targetFormat: 'spatialdsl',
      supported: true,
      warnings: [],
      droppedFeatures: [],
      unresolvedReferences: [],
    },
  });
  mockedSiriusInteropService.importFile.mockResolvedValue({
    viewpoints: [mockViewpoint],
    report: {
      sourceFormat: 'odesign',
      targetFormat: 'spatialdsl',
      supported: true,
      warnings: [],
      droppedFeatures: [],
      unresolvedReferences: [],
    },
  });
  mockedSiriusInteropService.exportOdesign.mockResolvedValue({
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
  mockedSiriusInteropService.exportProjectZip.mockResolvedValue({
    filename: 'workflow.sirius-project.zip',
    blob: new Blob(['zip']),
    report: {
      sourceFormat: 'project-zip',
      targetFormat: 'sirius-project',
      supported: true,
      warnings: [],
      droppedFeatures: [],
      unresolvedReferences: [],
    },
  });
});

describe('ViewpointManager', () => {
  it('hides write actions for read-only roles', async () => {
    mockCanEditMetamodel = false;

    renderManager();

    expect((await screen.findAllByText('Default Viewpoint')).length).toBeGreaterThan(0);
    expect(screen.getByText(/read-only role/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^create$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/delete viewpoint/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /import sirius/i })).not.toBeInTheDocument();
  });

  it('creates a viewpoint through the service', async () => {
    renderManager();

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }));
    expect(await screen.findByDisplayValue('New Viewpoint')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockedViewpointService.createViewpoint).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Viewpoint',
        metamodelId: 'metamodel-1',
      }));
    });
  });

  it('excludes abstract metaclasses from the creatable selector', async () => {
    renderManager();

    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));

    expect(screen.getByLabelText('AbstractBase (abstract)')).toBeInTheDocument();
    expect(screen.queryByLabelText('AbstractBase')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Task').length).toBeGreaterThan(1);
  });

  it('imports a Sirius file and reloads viewpoints', async () => {
    const { container } = renderManager();

    fireEvent.click(await screen.findByRole('button', { name: /import sirius/i }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['<description:Group/>'], 'workflow.odesign', { type: 'application/xml' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockedSiriusInteropService.importFile).toHaveBeenCalledWith(file, 'metamodel-1');
      expect(mockedViewpointService.loadViewpoints).toHaveBeenCalledWith('metamodel-1');
    });
    expect(await screen.findByText(/imported 1 sirius viewpoint/i)).toBeInTheDocument();
  });

  it('exports Sirius .odesign content and downloads it', async () => {
    renderManager();

    fireEvent.click(await screen.findByRole('button', { name: /export \.odesign/i }));

    await waitFor(() => {
      expect(mockedSiriusInteropService.exportOdesign).toHaveBeenCalledWith('metamodel-1');
      expect(mockedSiriusInteropService.downloadText).toHaveBeenCalledWith('workflow.odesign', '<description:Group/>');
    });
  });

  it('exports the full Sirius project ZIP for the primary model', async () => {
    renderManager();

    fireEvent.click(await screen.findByRole('button', { name: /export zip/i }));

    await waitFor(() => {
      expect(mockedSiriusInteropService.exportProjectZip).toHaveBeenCalledWith(
        'metamodel-1',
        'model-1'
      );
      expect(mockedSiriusInteropService.downloadBlob).toHaveBeenCalledWith(
        'workflow.sirius-project.zip',
        expect.any(Blob)
      );
    });
  });

  it('authors an edge mapping and persists it on the representation', async () => {
    renderManager();

    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));

    expect(screen.getByText('Edge Mappings')).toBeInTheDocument();
    expect(screen.getByText('Node Mappings')).toBeInTheDocument();
    expect(screen.getByText(/all references are drawable as edges/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('add-edge-mapping-select'));
    fireEvent.click(await screen.findByRole('option', { name: /Task\.next/i }));

    expect(await screen.findByText(/Task\.next to Task/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('save-representation'));

    await waitFor(() => {
      expect(mockedViewpointService.updateRepresentationDescription).toHaveBeenCalledWith(
        'viewpoint-1',
        'representation-1',
        expect.objectContaining({
          edgeMappings: [expect.objectContaining({ referenceId: 'ref-next', referenceName: 'next' })],
        })
      );
    });
  });

  it('authors a containment-backed container mapping and persists its style', async () => {
    renderManager();

    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    expect(screen.getByText('Container Mappings')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add container mapping/i }));

    expect(screen.getByRole('combobox', { name: 'Container metaclass' })).toHaveTextContent('Task');
    expect(screen.getByRole('combobox', { name: 'Containment reference' })).toHaveTextContent('children');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Container width' }), { target: { value: '640' } });
    fireEvent.click(screen.getByTestId('save-representation'));

    await waitFor(() => {
      expect(mockedViewpointService.updateRepresentationDescription).toHaveBeenCalledWith(
        'viewpoint-1',
        'representation-1',
        expect.objectContaining({
          containerMappings: [expect.objectContaining({
            containerMetaClassId: 'task',
            containmentReferenceId: 'ref-children',
            childMetaClassIds: ['task'],
            concreteSyntax: expect.objectContaining({
              two_d: expect.objectContaining({ defaultSize: expect.objectContaining({ width: 640 }) }),
            }),
          })],
        })
      );
    });
  });

  it('authors representation property sections for attributes and references', async () => {
    renderManager();

    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    expect(screen.getByText('Property Sections')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add property section/i }));

    expect(screen.getByDisplayValue('Properties')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Attributes' })).toHaveTextContent('name, priority');
    expect(screen.getByRole('combobox', { name: 'References' })).toHaveTextContent('next, children');

    fireEvent.click(screen.getByTestId('save-representation'));

    await waitFor(() => {
      expect(mockedViewpointService.updateRepresentationDescription).toHaveBeenCalledWith(
        'viewpoint-1',
        'representation-1',
        expect.objectContaining({
          propertySections: [expect.objectContaining({
            name: 'Properties',
            metaClassIds: ['task'],
            attributeNames: ['name', 'priority'],
            referenceNames: ['next', 'children'],
          })],
        })
      );
    });
  });

  it('shows an inconsistent elevation-policy error and blocks representation save', async () => {
    const elevationViewpoint: Viewpoint = {
      ...mockViewpoint,
      representationDescriptions: [{
        ...mockViewpoint.representationDescriptions[0],
        concreteSyntaxByMetaClassId: {
          task: {
            three_d: {
              verticalPlacement: {
                mode: 'adjustable',
                defaultBaseZMm: 1000,
                minBaseZMm: 0,
                maxBaseZMm: 5000,
                stepMm: 100,
              },
            },
          },
        },
      }],
    };
    mockedViewpointService.getCachedViewpoints.mockReturnValue([elevationViewpoint]);
    mockedViewpointService.loadViewpoints.mockResolvedValue([elevationViewpoint]);

    renderManager();
    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Step' }), {
      target: { value: '0' },
    });

    expect(await screen.findByText(/vertical placement\.stepMm must be greater than 0/i))
      .toBeInTheDocument();
    expect(screen.getByTestId('save-representation')).toBeDisabled();
    expect(mockedViewpointService.updateRepresentationDescription).not.toHaveBeenCalled();
  });

  it('inspects and toggles imported Sirius layers, filters, and conditional styles', async () => {
    const advancedViewpoint: Viewpoint = {
      ...mockViewpoint,
      representationDescriptions: [{
        ...mockViewpoint.representationDescriptions[0],
        layers: [{
          id: 'layer-review',
          name: 'Review',
          label: 'Review notes',
          optional: true,
          activeByDefault: true,
          enabled: true,
          mappings: [{ id: 'mapping-review', name: 'Review Task', kind: 'node', metaClassId: 'task' }],
        }],
        filters: [{
          id: 'filter-priority',
          name: 'High priority',
          enabled: true,
          rules: [{
            id: 'filter-priority-rule',
            kind: 'mapping',
            filterKind: 'hide',
            semanticConditionExpression: 'aql:self.priority > 3',
          }],
        }],
        conditionalStyles: [{
          id: 'style-priority',
          mappingId: 'mapping-task',
          mappingKind: 'node',
          metaClassId: 'task',
          predicateExpression: 'aql:self.priority > 3',
          enabled: true,
          concreteSyntax: { two_d: { fillColor: '#ef4444' } },
        }],
      }],
    };
    mockedViewpointService.getCachedViewpoints.mockReturnValue([advancedViewpoint]);
    mockedViewpointService.loadViewpoints.mockResolvedValue([advancedViewpoint]);

    renderManager();
    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));

    expect(screen.getByTestId('sirius-advanced-features')).toHaveTextContent('aql:self.priority > 3');
    fireEvent.click(screen.getByLabelText('Review notes layer enabled'));
    fireEvent.click(screen.getByLabelText('High priority filter enabled'));
    fireEvent.click(screen.getByLabelText('Conditional style 1 enabled'));
    fireEvent.click(screen.getByTestId('save-representation'));

    await waitFor(() => {
      expect(mockedViewpointService.updateRepresentationDescription).toHaveBeenCalledWith(
        'viewpoint-1',
        'representation-1',
        expect.objectContaining({
          layers: [expect.objectContaining({ enabled: false, activeByDefault: false })],
          filters: [expect.objectContaining({ enabled: false })],
          conditionalStyles: [expect.objectContaining({ enabled: false })],
        })
      );
    });
  });

  it('authors a create-node tool and persists it on the representation', async () => {
    renderManager();

    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));

    expect(screen.getByText('Tools')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('add-tool-select'));
    fireEvent.click(await screen.findByRole('option', { name: /^create node$/i }));

    expect(await screen.findByDisplayValue('Create node')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('save-representation'));

    await waitFor(() => {
      expect(mockedViewpointService.updateRepresentationDescription).toHaveBeenCalledWith(
        'viewpoint-1',
        'representation-1',
        expect.objectContaining({
          toolDefinitions: [expect.objectContaining({ type: 'create-node', name: 'Create node' })],
        })
      );
    });
  });

  it('authors a safe initial attribute operation for a create-node tool', async () => {
    renderManager();

    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    fireEvent.mouseDown(screen.getByTestId('add-tool-select'));
    fireEvent.click(await screen.findByRole('option', { name: /^create node$/i }));

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Metaclass' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Task' }));
    fireEvent.click(screen.getByRole('button', { name: /add value/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), {
      target: { value: 'Configured task' },
    });

    fireEvent.click(screen.getByTestId('save-representation'));

    await waitFor(() => {
      expect(mockedViewpointService.updateRepresentationDescription).toHaveBeenCalledWith(
        'viewpoint-1',
        'representation-1',
        expect.objectContaining({
          toolDefinitions: [expect.objectContaining({
            type: 'create-node',
            metaClassId: 'task',
            payload: {
              operations: [
                { type: 'set-attribute', attributeName: 'name', value: 'Configured task' },
              ],
            },
          })],
        })
      );
    });
  });

  it('enables tree representations in the kind selector', async () => {
    renderManager();

    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Kind' }));
    const treeOption = await screen.findByRole('option', { name: 'tree' });
    expect(treeOption).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(treeOption);
    fireEvent.click(screen.getByTestId('save-representation'));

    await waitFor(() => {
      expect(mockedViewpointService.updateRepresentationDescription).toHaveBeenCalledWith(
        'viewpoint-1',
        'representation-1',
        expect.objectContaining({ kind: 'tree' })
      );
    });
  });

  it('persists table column choices from the representation editor', async () => {
    renderManager();

    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Kind' }));
    fireEvent.click(await screen.findByRole('option', { name: 'table' }));

    expect(await screen.findByText('Table Columns')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('table-columns-select'));
    fireEvent.click(await screen.findByRole('option', { name: 'priority' }));
    fireEvent.click(screen.getByTestId('save-representation'));

    await waitFor(() => {
      expect(mockedViewpointService.updateRepresentationDescription).toHaveBeenCalledWith(
        'viewpoint-1',
        'representation-1',
        expect.objectContaining({ kind: 'table', tableColumns: ['name'] })
      );
    });
  });
});
