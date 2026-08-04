import { prismaMock } from '../helpers/prisma.mock';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockReset } from 'jest-mock-extended';
import { projectService } from '../../services/project.service';

const metamodelEvolutionServiceMock = {
  preview: jest.fn(),
  apply: jest.fn(),
  list: jest.fn(),
};
jest.mock('../../services', () => ({
  metamodelService: {},
  metamodelEvolutionService: metamodelEvolutionServiceMock,
}));

import metamodelRouter from '../../routes/metamodel.routes';
import { errorHandler } from '../../middleware/errorHandler';

const JWT_SECRET = process.env.JWT_SECRET!;
const projectId = 'ba1c2d3e-4f56-4789-8abc-def012345678';
const metamodelId = 'a1b2c3d4-5678-49ab-8cde-f01234567890';

const makeToken = (): string => jwt.sign(
  { userId: 'user-uuid-1', email: 'designer@example.com', role: 'DSL_DESIGNER' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

/**
 * The evolution endpoints only exist on the project-scoped mount, so the test
 * app installs a project context unless `scoped` is false.
 */
const buildApp = (role: 'OWNER' | 'DSL_DESIGNER' | 'MODELER' = 'DSL_DESIGNER', scoped = true) => {
  const app = express();
  app.use(express.json());
  app.use((req: any, res: any, next: any) => {
    if (scoped) {
      req.projectContext = {
        projectId,
        role,
        capabilities: projectService.getCapabilities(role),
        isOwner: role === 'OWNER',
        isPlatformAdmin: false,
        status: 'ACTIVE',
      };
    }
    next();
  });
  app.use('/api/projects/:projectId/metamodels', metamodelRouter);
  app.use(errorHandler);
  return app;
};

const nextMetamodel = {
  id: metamodelId,
  name: 'Warehouse DSL',
  uri: 'urn:warehouse',
  prefix: 'wh',
  classes: [],
};

const report = {
  metamodelId,
  sourceHash: 'sha256:source',
  targetHash: 'sha256:target',
  changes: [{ kind: 'attribute-renamed', classId: 'robot', featureId: 'name', breaking: true }],
  impacts: [{ artifact: { type: 'model', id: 'model-1' }, reasons: ['renamed attribute name'] }],
  blockers: [],
  warnings: [],
};

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
  // `metamodel.routes.ts` mounts the real `authenticate`, which reloads the
  // platform role, and the real `projectResourceParam` ownership guard.
  prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);
  prismaMock.metamodel.findUnique.mockResolvedValue({ projectId } as any);
});

describe('POST .../metamodels/:id/evolution/preview', () => {
  it('returns the change and impact report without mutating anything', async () => {
    metamodelEvolutionServiceMock.preview.mockResolvedValue(report);

    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/metamodels/${metamodelId}/evolution/preview`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ nextMetamodel });

    expect(res.status).toBe(200);
    expect(res.body.data.changes[0].breaking).toBe(true);
    expect(res.body.data.impacts).toHaveLength(1);
    expect(metamodelEvolutionServiceMock.preview).toHaveBeenCalledWith(
      projectId,
      metamodelId,
      nextMetamodel,
      []
    );
  });

  it('requires nextMetamodel', async () => {
    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/metamodels/${metamodelId}/evolution/preview`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(400);
    expect(metamodelEvolutionServiceMock.preview).not.toHaveBeenCalled();
  });

  it('rejects a member without the metamodel.evolve capability', async () => {
    const res = await request(buildApp('MODELER'))
      .post(`/api/projects/${projectId}/metamodels/${metamodelId}/evolution/preview`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ nextMetamodel });

    expect(res.status).toBe(403);
    expect(metamodelEvolutionServiceMock.preview).not.toHaveBeenCalled();
  });

  it('hides a metamodel that belongs to another project', async () => {
    prismaMock.metamodel.findUnique.mockResolvedValue({ projectId: 'other-project' } as any);

    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/metamodels/${metamodelId}/evolution/preview`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ nextMetamodel });

    expect(res.status).toBe(404);
    expect(metamodelEvolutionServiceMock.preview).not.toHaveBeenCalled();
  });
});

describe('POST .../metamodels/:id/evolution/apply', () => {
  it('applies a migration and returns the recovery checkpoint linkage', async () => {
    metamodelEvolutionServiceMock.apply.mockResolvedValue({
      id: 'migration-1',
      projectId,
      metamodelId,
      sourceCheckpointId: 'checkpoint-uuid-1',
      status: 'APPLIED',
      report,
      migratedModels: [{ modelId: 'model-1', changedElements: 2, deletedElements: 0 }],
    });

    const body = {
      nextMetamodel,
      expectedSourceHash: 'sha256:source',
      rules: [{ kind: 'rename-attribute', classId: 'robot', fromName: 'name', toName: 'label' }],
    };
    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/metamodels/${metamodelId}/evolution/apply`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPLIED');
    expect(res.body.data.sourceCheckpointId).toBe('checkpoint-uuid-1');
    expect(metamodelEvolutionServiceMock.apply).toHaveBeenCalledWith(
      projectId,
      metamodelId,
      body,
      'user-uuid-1'
    );
  });

  it('requires an expected source hash so stale previews cannot be applied', async () => {
    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/metamodels/${metamodelId}/evolution/apply`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ nextMetamodel });

    expect(res.status).toBe(400);
    expect(metamodelEvolutionServiceMock.apply).not.toHaveBeenCalled();
  });

  it('surfaces a stale source hash as a conflict', async () => {
    const { ApiError } = jest.requireActual('../../middleware/errorHandler');
    metamodelEvolutionServiceMock.apply.mockRejectedValue(
      new ApiError(409, 'Metamodel changed since the preview was generated')
    );

    const res = await request(buildApp())
      .post(`/api/projects/${projectId}/metamodels/${metamodelId}/evolution/apply`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ nextMetamodel, expectedSourceHash: 'sha256:stale' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects an unscoped flat request because migration needs a project', async () => {
    const res = await request(buildApp('DSL_DESIGNER', false))
      .post(`/api/projects/${projectId}/metamodels/${metamodelId}/evolution/apply`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ nextMetamodel, expectedSourceHash: 'sha256:source' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Metamodel evolution requires a project-scoped route');
  });
});

describe('GET .../metamodels/:id/evolution/migrations', () => {
  it('lists retained migration evidence', async () => {
    metamodelEvolutionServiceMock.list.mockResolvedValue([
      { id: 'migration-1', status: 'APPLIED', sourceCheckpointId: 'checkpoint-uuid-1' },
    ]);

    const res = await request(buildApp('MODELER'))
      .get(`/api/projects/${projectId}/metamodels/${metamodelId}/evolution/migrations`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(metamodelEvolutionServiceMock.list).toHaveBeenCalledWith(projectId, metamodelId);
  });
});
