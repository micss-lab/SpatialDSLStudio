import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import ViewpointManager from '../../components/viewpoints/ViewpointManager';
import { Metamodel, Viewpoint } from '../../models/types';
import { metamodelService } from '../../services/metamodel';
import { diagramService } from '../../services/diagram';
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
      attributes: [],
      references: [],
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
  default: {
    getCachedViewpoints: jest.fn(),
    loadViewpoints: jest.fn(),
    getDefaultViewpoint: jest.fn(),
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
const mockedViewpointService = viewpointService as any;
const mockedSiriusInteropService = siriusInteropService as any;

const renderManager = () => render(<ViewpointManager />);

beforeEach(() => {
  jest.clearAllMocks();
  mockCanEditMetamodel = true;
  mockNavigate = jest.fn();
  mockedMetamodelService.getMetamodelById.mockReturnValue(mockMetamodel);
  mockedDiagramService.getAllDiagrams.mockReturnValue([]);
  mockedViewpointService.getCachedViewpoints.mockReturnValue([mockViewpoint]);
  mockedViewpointService.loadViewpoints.mockResolvedValue([mockViewpoint]);
  mockedViewpointService.getDefaultViewpoint.mockResolvedValue(mockViewpoint);
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
});
