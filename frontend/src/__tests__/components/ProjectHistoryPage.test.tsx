import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ProjectHistoryPage } from '../../components/projects/ProjectHistoryPage';
import { useProject } from '../../contexts/ProjectContext';
import { HeadlessPipelineDefinition, HeadlessPipelineRun } from '../../models/lifecycle.types';
import { apiClient } from '../../services/core';
import { lifecycleService } from '../../services/lifecycle.service';
import { modelApiSyncService, modelService } from '../../services/model';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('../../__mocks__/react-router-dom'),
  useSearchParams: () => {
    const [params, setParams] = jest.requireActual('react').useState(() => new URLSearchParams());
    return [params, (search: string) => setParams(new URLSearchParams(search))];
  },
}));
jest.mock('../../contexts/ProjectContext', () => ({ useProject: jest.fn() }));
jest.mock('../../services/lifecycle.service', () => ({
  lifecycleService: {
    listCheckpoints: jest.fn(), createCheckpoint: jest.fn(), diffCheckpoint: jest.fn(), listPipelineRuns: jest.fn(),
    listPipelineInputs: jest.fn(), runPipeline: jest.fn(),
  },
}));
jest.mock('../../services/model', () => ({
  modelApiSyncService: { waitForPendingSave: jest.fn() },
  modelService: { useSavedModelContents: jest.fn() },
}));

const projectId = 'project-1';
const date = '2026-11-25T15:00:00Z';
const checkpoint = { id: 'checkpoint-1', projectId, sequence: 1, contentHash: 'hash-1', createdById: 'user-1', createdAt: date };
const inputs = {
  models: [{ id: 'warehouse', name: 'Warehouse', conformsToId: 'warehouse-dsl' }],
  generators: [
    { id: 'warehouse-usd', name: 'Warehouse USD', targetMetamodelId: 'warehouse-dsl' },
    { id: 'other-json', name: 'Other JSON', targetMetamodelId: 'other-dsl' },
  ],
  transformationRules: [{ id: 'assign-dock', name: 'Assign a dock' }],
};
const context: ReturnType<typeof useProject> = {
  project: { id: projectId } as ReturnType<typeof useProject>['project'],
  can: () => true,
  refreshProject: jest.fn(),
  openProject: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useProject).mockReturnValue(context);
  jest.mocked(lifecycleService.listCheckpoints).mockResolvedValue([checkpoint]);
  jest.mocked(lifecycleService.listPipelineRuns).mockResolvedValue([]);
  jest.mocked(lifecycleService.listPipelineInputs).mockResolvedValue(inputs);
  apiClient.setProjectId(projectId);
});
afterEach(() => apiClient.setProjectId(null));

async function openBuilder() {
  render(<ProjectHistoryPage />);
  fireEvent.click(screen.getByRole('tab', { name: 'Pipeline runs' }));
  await screen.findByText('No pipeline runs yet.');
  fireEvent.click(screen.getByRole('button', { name: 'New pipeline run' }));
  const dialog = within(screen.getByRole('dialog', { name: 'New pipeline run' }));
  await dialog.findByRole('textbox', { name: 'Pipeline name' });
  return dialog;
}

const step = (index: number) => within(screen.getByRole('region', { name: `Step ${index}` }));
async function pick(select: HTMLElement, option: string) {
  fireEvent.mouseDown(select);
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

it('creates a checkpoint and compares it with the current project', async () => {
  jest.mocked(lifecycleService.createCheckpoint).mockResolvedValue({ ...checkpoint, id: 'checkpoint-2', sequence: 2, tag: 'Before review' });
  jest.mocked(lifecycleService.diffCheckpoint).mockResolvedValue({
    fromHash: 'hash-2', toHash: 'hash-3', added: [], removed: [], changed: [{ type: 'model', id: 'warehouse' }], unchanged: 12,
  });
  render(<ProjectHistoryPage />);
  await screen.findByRole('combobox', { name: 'From checkpoint' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Tag' }), { target: { value: 'Before review' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create checkpoint' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'From checkpoint' })).toHaveTextContent('Before review'));
  expect(lifecycleService.createCheckpoint).toHaveBeenCalledWith(projectId, { tag: 'Before review', message: undefined });

  fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
  expect(await screen.findByText('12 unchanged')).toBeInTheDocument();
  expect(lifecycleService.diffCheckpoint).toHaveBeenCalledWith(projectId, 'checkpoint-2', undefined);
});

it('lets a viewer review the recorded pipeline failure without a checkpoint write action', async () => {
  jest.mocked(useProject).mockReturnValue({ ...context, can: () => false });
  jest.mocked(lifecycleService.listPipelineRuns).mockResolvedValue([{
    id: 'run-1', projectId, name: 'Validate warehouse', status: 'FAILED',
    definition: { name: 'Validate warehouse', steps: [{ id: 'validation', kind: 'validate-model', modelId: 'warehouse' }] },
    results: [{ stepId: 'validation', kind: 'validate-model', status: 'FAILED', error: 'Rack clearance failed' }],
    createdById: 'user-1', createdAt: date, startedAt: date,
  }]);
  render(<ProjectHistoryPage />);
  await waitFor(() => expect(lifecycleService.listCheckpoints).toHaveBeenCalledWith(projectId));
  expect(screen.queryByRole('button', { name: 'Create checkpoint' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Pipeline runs' }));
  fireEvent.click(await screen.findByRole('button', { name: /Validate warehouse/ }));
  expect(await screen.findByText('Rack clearance failed')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'New pipeline run' })).not.toBeInTheDocument();
  expect(lifecycleService.listPipelineInputs).not.toHaveBeenCalled();
  expect(lifecycleService.listPipelineRuns).toHaveBeenCalledWith(projectId);
});

it('runs ordered validation, test, and generation steps and opens their retained evidence', async () => {
  const definition: HeadlessPipelineDefinition = {
    name: 'Warehouse gate', checkpointTag: 'browser-ci',
    steps: [
      { id: 'step-1', kind: 'validate-model', modelId: 'warehouse' },
      { id: 'step-3', kind: 'run-tests', modelId: 'warehouse' },
      { id: 'step-2', kind: 'generate', modelId: 'warehouse', codegenProjectId: 'warehouse-usd' },
    ],
  };
  let finishRun: (run: HeadlessPipelineRun) => void = () => {};
  jest.mocked(lifecycleService.runPipeline).mockImplementation(() => new Promise(resolve => { finishRun = resolve; }));

  const dialog = await openBuilder();
  fireEvent.change(dialog.getByRole('textbox', { name: 'Pipeline name' }), { target: { value: ' Warehouse gate ' } });
  fireEvent.change(dialog.getByRole('textbox', { name: /Checkpoint tag/ }), { target: { value: 'browser-ci' } });
  await pick(step(1).getByRole('combobox', { name: 'Model' }), 'Warehouse');
  fireEvent.click(dialog.getByRole('button', { name: 'Add step' }));
  await pick(step(2).getByRole('combobox', { name: 'Step type' }), 'Generate code');
  await pick(step(2).getByRole('combobox', { name: 'Model' }), 'Warehouse');
  fireEvent.mouseDown(step(2).getByRole('combobox', { name: 'Code generation project' }));
  expect(screen.queryByRole('option', { name: 'Other JSON' })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('option', { name: 'Warehouse USD' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Add step' }));
  await pick(step(3).getByRole('combobox', { name: 'Step type' }), 'Run model tests');
  await pick(step(3).getByRole('combobox', { name: 'Model' }), 'Warehouse');
  fireEvent.click(step(3).getByRole('button', { name: 'Move up' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Add step' }));
  fireEvent.click(step(4).getByRole('button', { name: 'Remove' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Run pipeline' }));

  await waitFor(() => expect(lifecycleService.runPipeline).toHaveBeenCalledWith(projectId, definition));
  expect(modelApiSyncService.waitForPendingSave).toHaveBeenCalledTimes(1);
  expect(modelApiSyncService.waitForPendingSave).toHaveBeenCalledWith('warehouse');
  expect(dialog.getByRole('button', { name: 'Running…' })).toBeDisabled();
  finishRun({
    id: 'run-2', projectId, name: definition.name, definition, status: 'SUCCEEDED', sourceCheckpointId: checkpoint.id,
    results: [{ stepId: 'step-1', kind: 'validate-model', status: 'SUCCEEDED', output: { valid: true } }],
    createdById: 'user-1', createdAt: date, startedAt: date,
  });
  expect(await screen.findByText('step-1 · Validate model · SUCCEEDED')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View source checkpoint' })).toHaveAttribute('href', '?checkpoint=checkpoint-1');
});

it('requires transformation confirmation and updates the editor for saved steps in a failed run', async () => {
  const savedModel = { id: 'warehouse', elements: [], connections: [] };
  jest.mocked(lifecycleService.runPipeline).mockImplementation(async (_, definition) => ({
    id: 'run-3', projectId, name: definition.name, definition, status: 'FAILED',
    failureMessage: 'Model validation failed',
    results: [
      { stepId: 'step-1', kind: 'apply-transformation', status: 'SUCCEEDED', output: { model: savedModel, appliedIterations: 1 } },
      { stepId: 'step-2', kind: 'validate-model', status: 'FAILED' },
    ],
    createdById: 'user-1', createdAt: date, startedAt: date,
  }));

  const dialog = await openBuilder();
  fireEvent.change(dialog.getByRole('textbox', { name: 'Pipeline name' }), { target: { value: 'Assign and validate' } });
  await pick(step(1).getByRole('combobox', { name: 'Step type' }), 'Apply transformation');
  await pick(step(1).getByRole('combobox', { name: 'Model' }), 'Warehouse');
  await pick(step(1).getByRole('combobox', { name: 'Transformation rule' }), 'Assign a dock');
  fireEvent.click(dialog.getByRole('button', { name: 'Add step' }));
  await pick(step(2).getByRole('combobox', { name: 'Model' }), 'Warehouse');
  const run = dialog.getByRole('button', { name: 'Run pipeline' });
  const confirm = dialog.getByRole('checkbox', { name: /save model changes/ });
  expect(run).toBeDisabled();
  fireEvent.click(confirm);
  expect(run).toBeEnabled();
  fireEvent.change(step(1).getByRole('spinbutton', { name: 'Maximum iterations' }), { target: { value: '3' } });
  expect(run).toBeDisabled();
  fireEvent.click(confirm);
  fireEvent.click(run);

  expect(await screen.findByText('Model validation failed')).toBeInTheDocument();
  expect(lifecycleService.runPipeline).toHaveBeenCalledWith(projectId, {
    name: 'Assign and validate',
    steps: [
      { id: 'step-1', kind: 'apply-transformation', modelId: 'warehouse', ruleId: 'assign-dock', maxIterations: 3 },
      { id: 'step-2', kind: 'validate-model', modelId: 'warehouse' },
    ],
  });
  expect(modelService.useSavedModelContents).toHaveBeenCalledWith(savedModel);
});
