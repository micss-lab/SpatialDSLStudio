import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SimulationResultsPage } from '../../components/projects/SimulationResultsPage';
import { useProject } from '../../contexts/ProjectContext';
import warehouse from '../../examples/data/smart-warehouse-model.json';
import { Diagram, Model } from '../../models/types';
import { diagramService, viewValidationService } from '../../services/diagram';
import { exampleDataService } from '../../services/metamodel/exampleData.service';
import { metamodelService } from '../../services/metamodel';
import { modelService } from '../../services/model';
import { SimulationReport, simulationResultsService } from '../../services/simulation-results.service';

jest.mock('react-router-dom');
jest.mock('../../contexts/ProjectContext', () => ({ useProject: jest.fn() }));
jest.mock('../../services/diagram', () => ({
  diagramService: { getDiagramsByModelId: jest.fn() },
  viewValidationService: {
    findElementForIssue: (view: Diagram, issue: { elementId: string }) => view.elements.find(element => element.id === issue.elementId),
  },
}));
jest.mock('../../services/metamodel', () => ({ metamodelService: { getMetamodelById: jest.fn(), getAllMetamodels: jest.fn() } }));
jest.mock('../../services/model', () => ({ modelService: { getModelById: jest.fn(), getAllModels: jest.fn() } }));
jest.mock('../../services/viewpoint.service', () => ({
  __esModule: true,
  default: { resolveRepresentationDescription: () => ({}), resolveDefaultForMetamodel: () => ({}) },
}));

it('imports a warehouse report, displays its sampled poses, and links to the remapped rack', async () => {
  const projectId = 'project-1';
  const starter = exampleDataService.getSmartWarehouseBundle(projectId);
  const [model] = starter.models;
  const [metamodel] = starter.metamodels;
  const rack = model.elements.find(element => element.style.name === 'Storage Rack #2')!;
  const sourceRack = warehouse.elements.find(element => element.style.name === 'Storage Rack #2')!;
  const view = { id: 'view-1', elements: [{ id: rack.id, type: 'node' }] } as Diagram;
  const designPose = { x: 14000, y: 12000, z: 0, rotationZ: 0 };
  const observedPose = { ...designPose, x: 12800 };
  const report: SimulationReport = {
    provenance: { modelId: warehouse.id, modelHash: 'sha256:warehouse', observation: { source: 'stand-in', durationS: 60, samples: 121 } },
    ruleFindings: [{
      kind: 'runtime-rule-violation', ruleId: 'rack-clearance', ruleName: 'Storage rack aisle width',
      message: 'The aisle narrowed to below 1500 mm.', severity: 'error', firstT: 20, lastT: 60, samples: 81,
      elements: [{ elementId: sourceRack.id, elementName: 'Storage Rack #2', className: 'StorageRack', prim: '/World/Storage_Rack_2' }],
      poses: [{ elementId: sourceRack.id, designPose, observedPose }],
    }],
    deviations: [],
  };
  jest.mocked(useProject).mockReturnValue({
    project: { id: projectId } as ReturnType<typeof useProject>['project'],
    can: () => true,
    refreshProject: jest.fn(),
    openProject: jest.fn(),
  });
  jest.mocked(modelService.getModelById).mockReturnValue(model);
  jest.mocked(modelService.getAllModels).mockReturnValue([model]);
  jest.mocked(metamodelService.getMetamodelById).mockReturnValue(metamodel);
  jest.mocked(metamodelService.getAllMetamodels).mockReturnValue([metamodel]);
  jest.mocked(diagramService.getDiagramsByModelId).mockReturnValue([view]);
  const list = jest.spyOn(simulationResultsService, 'list').mockResolvedValue([]);
  const read = jest.spyOn(simulationResultsService, 'get').mockResolvedValue(report);
  const store = jest.spyOn(simulationResultsService, 'store').mockImplementation(async (
    _projectId: string, file: File, _report: SimulationReport, selectedModel: Model
  ) => ({ id: 'saved-report', filename: file.name, metadata: { kind: 'spatialdsl.twin-report', modelId: selectedModel.id } }));

  const { container } = render(<SimulationResultsPage />);
  await screen.findByText('No simulation reports have been imported into this project.');
  const file = new File([JSON.stringify(report)], 'report.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => JSON.stringify(report) });
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
  fireEvent.click(await screen.findByRole('button', { name: 'Save report' }));

  expect(await screen.findByText('Storage rack aisle width')).toBeInTheDocument();
  expect(screen.getByText('Observed at 20 s')).toBeInTheDocument();
  expect(screen.getByText(/X 12800 mm/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Locate in 3D' })).toHaveAttribute('href', `/projects/${projectId}/views/${view.id}?mode=3d&element=${rack.id}`);
  expect(list).toHaveBeenCalledWith(projectId);
  expect(store).toHaveBeenCalledWith(projectId, file, report, model, metamodel);
  expect(read).toHaveBeenCalledWith(projectId, 'saved-report');
});
