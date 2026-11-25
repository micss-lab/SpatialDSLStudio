import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProjectHistoryPage } from '../../components/projects/ProjectHistoryPage';
import { useProject } from '../../contexts/ProjectContext';
import { lifecycleService } from '../../services/lifecycle.service';

jest.mock('react-router-dom');
jest.mock('../../contexts/ProjectContext', () => ({ useProject: jest.fn() }));
jest.mock('../../services/lifecycle.service', () => ({
  lifecycleService: {
    listCheckpoints: jest.fn(), createCheckpoint: jest.fn(), diffCheckpoint: jest.fn(), listPipelineRuns: jest.fn(),
  },
}));

const projectId = 'project-1';
const date = '2026-11-25T15:00:00Z';
const checkpoint = { id: 'checkpoint-1', projectId, sequence: 1, contentHash: 'hash-1', createdById: 'user-1', createdAt: date };
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
});

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
  expect(lifecycleService.listPipelineRuns).toHaveBeenCalledWith(projectId);
});
