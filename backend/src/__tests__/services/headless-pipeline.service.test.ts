import { mockReset } from 'jest-mock-extended';
import { prismaMock } from '../helpers/prisma.mock';
import { headlessPipelineService } from '../../services/pipeline/headless-pipeline.service';
import { projectCheckpointService } from '../../services/lifecycle/project-checkpoint.service';

const projectId = 'project-uuid-1';
const userId = 'user-uuid-1';

const metamodelRow = {
  id: 'metamodel-uuid-1',
  projectId,
  name: 'Robot DSL',
  description: null,
  eClass: null,
  uri: 'urn:robot',
  prefix: 'robot',
  conformsToId: 'package-uuid-1',
  classes: [{
    id: 'robot-class', name: 'Robot', eClass: '', abstract: false, superTypes: [],
    attributes: [{
      id: 'name-attribute', name: 'name', eClass: '', type: 'string', required: true, many: false,
    }],
    references: [],
  }],
  enums: [],
  constraints: [],
};

const validModelRow = {
  id: 'model-uuid-1',
  projectId,
  name: 'Fleet',
  description: null,
  metamodelId: metamodelRow.id,
  conformsToId: metamodelRow.id,
  elements: [{
    id: 'robot-1', modelElementId: 'robot-class', style: { name: 'Alpha' }, references: {},
  }],
  connections: [],
};

beforeEach(() => {
  mockReset(prismaMock);
  jest.restoreAllMocks();
  prismaMock.model.findFirst.mockResolvedValue(validModelRow as any);
  prismaMock.metamodel.findFirst.mockResolvedValue(metamodelRow as any);
  jest.spyOn(projectCheckpointService, 'create').mockResolvedValue({
    id: 'checkpoint-uuid-1',
    projectId,
    sequence: 1,
    contentHash: 'sha256:source-checkpoint',
    createdById: userId,
    createdAt: '2026-07-23T12:00:00.000Z',
  });
  let runNumber = 0;
  (prismaMock.pipelineRun.create as any).mockImplementation(async ({ data }: any) => ({
    id: `run-${++runNumber}`,
    ...data,
    result: null,
    contentHash: null,
    failureMessage: null,
    createdAt: new Date('2026-07-23T12:00:00.000Z'),
    completedAt: null,
  }));
});

describe('HeadlessPipelineService', () => {
  it('retains a source checkpoint and produces a reproducible result hash', async () => {
    const definition = {
      name: 'Validate fleet',
      steps: [{ id: 'validate', kind: 'validate-model' as const, modelId: validModelRow.id }],
    };

    const first = await headlessPipelineService.run(projectId, definition, userId);
    const second = await headlessPipelineService.run(projectId, definition, userId);

    expect(first.status).toBe('SUCCEEDED');
    expect(first.sourceCheckpointId).toBe('checkpoint-uuid-1');
    expect(second.contentHash).toBe(first.contentHash);
    expect(first.results).toEqual([expect.objectContaining({
      stepId: 'validate', status: 'SUCCEEDED', output: { valid: true, issues: [] },
    })]);
    expect(prismaMock.pipelineRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SUCCEEDED', contentHash: first.contentHash }),
    }));
  });

  it('stops at a failed validation and retains its issues', async () => {
    prismaMock.model.findFirst.mockResolvedValue({
      ...validModelRow,
      elements: [{
        id: 'robot-1', modelElementId: 'robot-class', style: { name: 42 }, references: {},
      }],
    } as any);
    const run = await headlessPipelineService.run(projectId, {
      name: 'Fail fast',
      steps: [
        { id: 'validate', kind: 'validate-model', modelId: validModelRow.id },
        { id: 'never-run', kind: 'run-tests', modelId: validModelRow.id },
      ],
    }, userId);

    expect(run.status).toBe('FAILED');
    expect(run.failureMessage).toBe('Model validation failed');
    expect(run.results).toHaveLength(1);
    expect(run.results[0]).toEqual(expect.objectContaining({
      stepId: 'validate', status: 'FAILED', error: 'Model validation failed',
    }));
    expect(run.results[0].output).toEqual(expect.objectContaining({ valid: false }));
  });
});

