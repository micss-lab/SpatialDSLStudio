import { prismaMock } from '../helpers/prisma.mock';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockReset } from 'jest-mock-extended';
import { projectService } from '../../services/project.service';

const projectCheckpointServiceMock = {
  buildManifest: jest.fn(),
  list: jest.fn(),
  create: jest.fn(),
  get: jest.fn(),
  diff: jest.fn(),
  restore: jest.fn(),
};
jest.mock('../../services', () => ({
  projectCheckpointService: projectCheckpointServiceMock,
}));

import lifecycleRouter from '../../routes/lifecycle.routes';
import { errorHandler } from '../../middleware/errorHandler';

const JWT_SECRET = process.env.JWT_SECRET!;
const projectId = 'ba1c2d3e-4f56-4789-8abc-def012345678';
const checkpointId = 'c1d2e3f4-5678-49ab-8cde-f01234567890';

const makeToken = (): string => jwt.sign(
  { userId: 'user-uuid-1', email: 'designer@example.com', role: 'DSL_DESIGNER' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

/**
 * Mounts the router with a fixed project context so the tests exercise the
 * route contract and its capability guards rather than membership lookup,
 * which `projectScope.test.ts` already covers.
 */
const buildApp = (role: 'OWNER' | 'MODELER' | 'VIEWER' = 'OWNER') => {
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
  app.use('/api/projects/:projectId/lifecycle', lifecycleRouter);
  app.use(errorHandler);
  return app;
};

const manifest = {
  schemaVersion: 1 as const,
  projectId,
  project: { name: 'Warehouse' },
  artifacts: [],
  contentHash: 'sha256:abc',
};

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

describe('GET /api/projects/:projectId/lifecycle/graph', () => {
  it('returns the project artifact manifest', async () => {
    projectCheckpointServiceMock.buildManifest.mockResolvedValue(manifest);

    const res = await request(buildApp())
      .get(`/api/projects/${projectId}/lifecycle/graph`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: manifest });
    expect(projectCheckpointServiceMock.buildManifest).toHaveBeenCalledWith(projectId);
  });
});

describe('POST /api/projects/:projectId/lifecycle/checkpoints', () => {
  it('creates a checkpoint scoped to the request project and user', async () => {
    projectCheckpointServiceMock.create.mockResolvedValue({
      id: checkpointId,
      projectId,
      sequence: 1,
      tag: 'phase-11',
      contentHash: manifest.contentHash,
    });

    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/lifecycle/checkpoints`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ tag: 'phase-11', message: 'Lifecycle checkpoint' });

    expect(res.status).toBe(201);
    expect(res.body.data.sequence).toBe(1);
    expect(projectCheckpointServiceMock.create).toHaveBeenCalledWith(
      projectId,
      'user-uuid-1',
      { tag: 'phase-11', message: 'Lifecycle checkpoint' }
    );
  });

  it('rejects a member without the checkpoint.create capability', async () => {
    const res = await request(buildApp('VIEWER'))
      .post(`/api/projects/${projectId}/lifecycle/checkpoints`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ tag: 'phase-11' });

    expect(res.status).toBe(403);
    expect(projectCheckpointServiceMock.create).not.toHaveBeenCalled();
  });

  it('rejects an over-long tag', async () => {
    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/lifecycle/checkpoints`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ tag: 'x'.repeat(101) });

    expect(res.status).toBe(400);
    expect(projectCheckpointServiceMock.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/projects/:projectId/lifecycle/checkpoints', () => {
  it('lists checkpoints for the project', async () => {
    projectCheckpointServiceMock.list.mockResolvedValue([{ id: checkpointId, sequence: 1 }]);

    const res = await request(buildApp('VIEWER'))
      .get(`/api/projects/${projectId}/lifecycle/checkpoints`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(projectCheckpointServiceMock.list).toHaveBeenCalledWith(projectId);
  });
});

describe('GET /api/projects/:projectId/lifecycle/checkpoints/:checkpointId/diff', () => {
  it('passes an explicit comparison target through', async () => {
    projectCheckpointServiceMock.diff.mockResolvedValue({
      fromHash: 'sha256:abc',
      toHash: 'sha256:def',
      added: [],
      removed: [],
      changed: [],
      unchanged: 3,
    });

    const res = await request(buildApp())
      .get(`/api/projects/${projectId}/lifecycle/checkpoints/${checkpointId}/diff`)
      .query({ against: 'current' })
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.unchanged).toBe(3);
    expect(projectCheckpointServiceMock.diff).toHaveBeenCalledWith(projectId, checkpointId, 'current');
  });

  it('rejects a non-UUID checkpoint ID', async () => {
    const res = await request(buildApp())
      .get(`/api/projects/${projectId}/lifecycle/checkpoints/not-a-uuid/diff`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(projectCheckpointServiceMock.diff).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/:projectId/lifecycle/checkpoints/:checkpointId/restore', () => {
  it('requires the caller to confirm the checkpoint content hash', async () => {
    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/lifecycle/checkpoints/${checkpointId}/restore`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(400);
    expect(projectCheckpointServiceMock.restore).not.toHaveBeenCalled();
  });

  it('restores a confirmed checkpoint and returns the restored manifest', async () => {
    projectCheckpointServiceMock.restore.mockResolvedValue(manifest);

    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/lifecycle/checkpoints/${checkpointId}/restore`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ confirmContentHash: manifest.contentHash });

    expect(res.status).toBe(200);
    expect(res.body.data.contentHash).toBe(manifest.contentHash);
    expect(projectCheckpointServiceMock.restore).toHaveBeenCalledWith(
      projectId,
      checkpointId,
      manifest.contentHash
    );
  });

  it('rejects a restore from a member without the checkpoint.restore capability', async () => {
    const res = await request(buildApp('MODELER'))
      .post(`/api/projects/${projectId}/lifecycle/checkpoints/${checkpointId}/restore`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ confirmContentHash: manifest.contentHash });

    expect(res.status).toBe(403);
    expect(projectCheckpointServiceMock.restore).not.toHaveBeenCalled();
  });

  it('surfaces a confirmation mismatch as a client error', async () => {
    const { ApiError } = jest.requireActual('../../middleware/errorHandler');
    projectCheckpointServiceMock.restore.mockRejectedValue(
      new ApiError(400, 'confirmContentHash must match the checkpoint content hash')
    );

    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/lifecycle/checkpoints/${checkpointId}/restore`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ confirmContentHash: 'sha256:stale' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('surfaces a failed manifest integrity check as a conflict', async () => {
    const { ApiError } = jest.requireActual('../../middleware/errorHandler');
    projectCheckpointServiceMock.restore.mockRejectedValue(
      new ApiError(409, 'Checkpoint manifest failed integrity verification')
    );

    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/lifecycle/checkpoints/${checkpointId}/restore`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ confirmContentHash: manifest.contentHash });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });
});
