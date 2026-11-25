import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useParams } from 'react-router-dom';
import { MetamodelEvolutionPage } from '../../components/metamodel/MetamodelEvolutionPage';
import { useProject } from '../../contexts/ProjectContext';
import { MetamodelEvolutionReport } from '../../models/lifecycle.types';
import { Metamodel } from '../../models/types';
import { lifecycleService } from '../../services/lifecycle.service';
import { metamodelService } from '../../services/metamodel';
import { initializeProjectSession } from '../../services/project-session.service';

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }: React.PropsWithChildren<{ to: string }>) => <a href={to} {...props}>{children}</a>,
  useParams: jest.fn(),
}));
jest.mock('../../contexts/ProjectContext', () => ({ useProject: jest.fn() }));
jest.mock('../../services/lifecycle.service', () => ({ lifecycleService: {
  getMetamodel: jest.fn(), listMigrations: jest.fn(), previewEvolution: jest.fn(), applyEvolution: jest.fn(),
} }));
jest.mock('../../services/metamodel', () => ({ metamodelService: { waitForPendingSave: jest.fn().mockResolvedValue(undefined) } }));
jest.mock('../../services/project-session.service', () => ({ initializeProjectSession: jest.fn().mockResolvedValue(undefined) }));

const projectId = 'project-1';
const source: Metamodel = {
  id: 'mm-1', name: 'Warehouse DSL', eClass: '', uri: 'urn:warehouse', prefix: 'wh', conformsTo: 'epackage-1',
  classes: [{
    id: 'robot', name: 'Robot', eClass: '', abstract: false, superTypes: [], references: [],
    attributes: [{ id: 'speed', name: 'speed', eClass: '', type: 'number', many: false }],
  }],
};
const report: MetamodelEvolutionReport = {
  metamodelId: source.id, sourceHash: 'hash-current', targetHash: 'hash-proposed', blockers: [], warnings: [],
  changes: [{ kind: 'attribute-renamed', classId: 'robot', featureId: 'speed', before: { name: 'speed' }, after: { name: 'maximumSpeed' }, breaking: true }],
  impacts: [{ artifact: { type: 'model', id: 'model-1' }, name: 'Warehouse A', reasons: ['One robot uses this attribute'] }],
};
const result = {
  id: 'migration-1', projectId, metamodelId: source.id, sourceCheckpointId: 'checkpoint-1', sourceHash: report.sourceHash,
  targetHash: report.targetHash, status: 'APPLIED' as const, report, migratedModels: [{ modelId: 'model-1', changedElements: 1, deletedElements: 0 }],
  createdAt: '2026-11-25T15:00:00Z',
};
const context: ReturnType<typeof useProject> = {
  project: { id: projectId } as ReturnType<typeof useProject>['project'],
  can: () => true, refreshProject: jest.fn(), openProject: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useParams).mockReturnValue({ id: source.id });
  jest.mocked(useProject).mockReturnValue(context);
  jest.mocked(metamodelService.waitForPendingSave).mockResolvedValue(undefined);
  jest.mocked(initializeProjectSession).mockResolvedValue(undefined);
  jest.mocked(lifecycleService.getMetamodel).mockResolvedValue(source);
  jest.mocked(lifecycleService.listMigrations).mockResolvedValue([]);
});

async function stageAndPreviewRename() {
  render(<MetamodelEvolutionPage />);
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Class' }));
  fireEvent.click(screen.getByRole('option', { name: 'Robot' }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Attribute' }));
  fireEvent.click(screen.getByRole('option', { name: 'speed' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'New name' }), { target: { value: 'maximumSpeed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Stage change' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview migration' }));
  return screen.findByRole('checkbox', { name: 'Move Robot.speed values to maximumSpeed' });
}

it('stages an attribute rename, previews explicit value migration, and links the recovery checkpoint', async () => {
  jest.mocked(lifecycleService.previewEvolution)
    .mockResolvedValueOnce({ ...report, blockers: ['Attribute speed has instance values'] })
    .mockResolvedValueOnce(report);
  jest.mocked(lifecycleService.applyEvolution).mockResolvedValue(result);
  const migrateValues = await stageAndPreviewRename();
  expect(screen.getByText('Attribute speed has instance values')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Review and apply' })).toBeDisabled();
  fireEvent.click(migrateValues);
  fireEvent.click(screen.getByRole('button', { name: 'Preview again' }));

  expect(await screen.findByText('0 blockers')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review and apply' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Apply migration' }));

  expect(await screen.findByText(/Migration applied/)).toBeInTheDocument();
  expect((await screen.findAllByRole('link', { name: 'View recovery checkpoint' }))[0])
    .toHaveAttribute('href', '/projects/project-1/history?checkpoint=checkpoint-1');
  expect(lifecycleService.applyEvolution).toHaveBeenCalledWith(projectId, source.id, {
    expectedSourceHash: report.sourceHash,
    nextMetamodel: expect.objectContaining({ classes: [expect.objectContaining({
      attributes: [expect.objectContaining({ id: 'speed', name: 'maximumSpeed' })],
    })] }),
    rules: [{ kind: 'rename-attribute', classId: 'robot', featureId: 'speed', fromName: 'speed', toName: 'maximumSpeed' }],
  });
  expect(initializeProjectSession).toHaveBeenCalledTimes(1);
});

it('requires a fresh preview after an apply conflict', async () => {
  jest.mocked(lifecycleService.previewEvolution).mockResolvedValueOnce(report);
  jest.mocked(lifecycleService.applyEvolution).mockRejectedValueOnce(new Error('Metamodel changed after the preview'));
  await stageAndPreviewRename();
  fireEvent.click(screen.getByRole('button', { name: 'Review and apply' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Apply migration' }));

  expect(await screen.findByText('Metamodel changed after the preview')).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Review and apply' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Preview again' })).toBeEnabled();
  expect(initializeProjectSession).not.toHaveBeenCalled();
});

it('shows migration history for a project role with read access', async () => {
  jest.mocked(useProject).mockReturnValue({ ...context, can: () => false });
  jest.mocked(lifecycleService.listMigrations).mockResolvedValue([result]);
  render(<MetamodelEvolutionPage />);
  expect(await screen.findByText('APPLIED')).toBeInTheDocument();
  expect(await screen.findByText(source.name)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Load proposal JSON' })).not.toBeInTheDocument();
});
