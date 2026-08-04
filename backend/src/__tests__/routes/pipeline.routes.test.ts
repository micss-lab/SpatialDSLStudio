import { prismaMock } from '../helpers/prisma.mock';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockReset } from 'jest-mock-extended';
import { projectService } from '../../services/project.service';

const headlessPipelineServiceMock = {
  list: jest.fn(),
  get: jest.fn(),
  run: jest.fn(),
};
jest.mock('../../services', () => ({
  headlessPipelineService: headlessPipelineServiceMock,
}));

import pipelineRouter from '../../routes/pipeline.routes';
import { errorHandler } from '../../middleware/errorHandler';

const JWT_SECRET = process.env.JWT_SECRET!;
const projectId = 'ba1c2d3e-4f56-4789-8abc-def012345678';
const runId = 'e1d2c3b4-5678-49ab-8cde-f01234567890';

const makeToken = (): string => jwt.sign(
  { userId: 'user-uuid-1', email: 'modeler@example.com', role: 'MODELER' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const buildApp = (role: 'OWNER' | 'MODELER' | 'VIEWER' = 'MODELER') => {
  const app = express();
  app.use(express.json());
  app.use((req: any, res: any, next: any) => {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'Authorization header required' });
    try {
      req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.projectContext = {
      projectId,
      role,
      capabilities: projectService.getCapabilities(role),
      isOwner: role === 'OWNER',
      isPlatformAdmin: false,
      status: 'ACTIVE',
    };
    next();
  });
  app.use('/api/projects/:projectId/pipelines', pipelineRouter);
  app.use(errorHandler);
  return app;
};

const definition = {
  name: 'Validate fleet',
  steps: [{ id: 'validate', kind: 'validate-model', modelId: 'model-uuid-1' }],
};

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

describe('POST /api/projects/:projectId/pipelines/runs', () => {
  it('executes a definition and returns the retained run', async () => {
    headlessPipelineServiceMock.run.mockResolvedValue({
      id: runId,
      projectId,
      status: 'SUCCEEDED',
      sourceCheckpointId: 'checkpoint-uuid-1',
      contentHash: 'sha256:run',
      results: [{ stepId: 'validate', kind: 'validate-model', status: 'SUCCEEDED' }],
    });

    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/pipelines/runs`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(definition);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('SUCCEEDED');
    expect(res.body.data.sourceCheckpointId).toBe('checkpoint-uuid-1');
    expect(headlessPipelineServiceMock.run).toHaveBeenCalledWith(projectId, definition, 'user-uuid-1');
  });

  it('returns a failed run rather than an error response so CI can read the evidence', async () => {
    headlessPipelineServiceMock.run.mockResolvedValue({
      id: runId,
      projectId,
      status: 'FAILED',
      failureMessage: 'Model validation failed',
      results: [{ stepId: 'validate', kind: 'validate-model', status: 'FAILED' }],
    });

    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/pipelines/runs`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(definition);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('FAILED');
    expect(res.body.data.failureMessage).toBe('Model validation failed');
  });

  it('rejects a definition with no steps', async () => {
    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/pipelines/runs`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Empty', steps: [] });

    expect(res.status).toBe(400);
    expect(headlessPipelineServiceMock.run).not.toHaveBeenCalled();
  });

  it('rejects a definition without a name', async () => {
    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/pipelines/runs`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ steps: definition.steps });

    expect(res.status).toBe(400);
    expect(headlessPipelineServiceMock.run).not.toHaveBeenCalled();
  });

  it('rejects a member without the pipeline.execute capability', async () => {
    const res = await request(buildApp('VIEWER'))
      .post(`/api/projects/${projectId}/pipelines/runs`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(definition);

    expect(res.status).toBe(403);
    expect(headlessPipelineServiceMock.run).not.toHaveBeenCalled();
  });
});

describe('GET /api/projects/:projectId/pipelines/runs', () => {
  it('lists retained runs for the project', async () => {
    headlessPipelineServiceMock.list.mockResolvedValue([{ id: runId, status: 'SUCCEEDED' }]);

    const res = await request(buildApp('VIEWER'))
      .get(`/api/projects/${projectId}/pipelines/runs`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(headlessPipelineServiceMock.list).toHaveBeenCalledWith(projectId);
  });

  it('returns a single run with its step evidence', async () => {
    headlessPipelineServiceMock.get.mockResolvedValue({
      id: runId,
      status: 'SUCCEEDED',
      results: [{ stepId: 'validate', kind: 'validate-model', status: 'SUCCEEDED' }],
    });

    const res = await request(buildApp('VIEWER'))
      .get(`/api/projects/${projectId}/pipelines/runs/${runId}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(1);
    expect(headlessPipelineServiceMock.get).toHaveBeenCalledWith(projectId, runId);
  });

  it('rejects a non-UUID run ID', async () => {
    const res = await request(buildApp())
      .get(`/api/projects/${projectId}/pipelines/runs/not-a-uuid`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(headlessPipelineServiceMock.get).not.toHaveBeenCalled();
  });
});
