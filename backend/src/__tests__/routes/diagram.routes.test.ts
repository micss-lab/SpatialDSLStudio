import { prismaMock } from '../helpers/prisma.mock';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { errorHandler } from '../../middleware/errorHandler';
import { ProjectCapability } from '../../../../shared/types';


const diagramServiceMock = {
  getAll: jest.fn(),
  getByModelId: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  addElement: jest.fn(),
  createModelElementInView: jest.fn(),
  updateModelPresentation: jest.fn(),
  updateElement: jest.fn(),
  deleteElement: jest.fn(),
  updateGridSettings: jest.fn(),
  previewSpatialQuickFix: jest.fn(),
  applySpatialQuickFix: jest.fn(),
};
jest.mock('../../services/diagram.service', () => ({
  diagramService: diagramServiceMock,
}));
jest.mock('../../services', () => ({
  diagramService: diagramServiceMock,
}));

beforeEach(() => {
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-uuid-1', role: 'DSL_DESIGNER', email: 'test@example.com' } as any);
  mockReset(prismaMock);
  jest.clearAllMocks();
  // Satisfy authenticate middleware (queries user role on every request)
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-uuid-1', role: 'DSL_DESIGNER', email: 'test@example.com' } as any);
});

import diagramRouter from '../../routes/diagram.routes';

const JWT_SECRET = process.env.JWT_SECRET!;

function makeToken(role = 'DSL_DESIGNER') {
  return jwt.sign(
    { userId: 'user-uuid-1', email: 'test@example.com', role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const projectId = 'project-1';

function buildApp(capabilities?: ProjectCapability[]) {
  const app = express();
  app.use(express.json());
  app.use((req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No auth' });
    try {
      req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (capabilities) req.projectContext = { projectId, capabilities };
    next();
  });
  app.use(capabilities ? '/api/projects/:projectId/views' : '/api/diagrams', diagramRouter);
  if (capabilities) app.use(errorHandler);
  return app;
}

const mockDiagram = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  name: 'Test Diagram',
  modelId: 'model-uuid-1',
  ownerId: 'user-uuid-1',
  elements: [],
  connections: [],
};

describe('project-scoped spatial quick fixes', () => {
  const path = `/api/projects/${projectId}/views/${mockDiagram.id}/quick-fixes`;
  const payload = { ruleId: 'rule', elementId: 'rack-a', relatedElementId: 'rack-b', moveElementId: 'rack-a' };
  const previewHash = `sha256:${'0'.repeat(64)}`;

  beforeEach(() => {
    prismaMock.diagram.findUnique.mockResolvedValue({ projectId } as any);
  });

  it('requires both view and model update permissions', async () => {
    const res = await request(buildApp(['project.read', 'view.update'])).post(`${path}/preview`)
      .set('Authorization', `Bearer ${makeToken()}`).send(payload);
    expect(res.status).toBe(403);
    expect(diagramServiceMock.previewSpatialQuickFix).not.toHaveBeenCalled();
  });

  it('rejects a view from a different project', async () => {
    prismaMock.diagram.findUnique.mockResolvedValue({ projectId: 'other-project' } as any);
    const res = await request(buildApp(['view.update', 'model.update'])).post(`${path}/preview`)
      .set('Authorization', `Bearer ${makeToken()}`).send(payload);
    expect(res.status).toBe(404);
    expect(diagramServiceMock.previewSpatialQuickFix).not.toHaveBeenCalled();
  });

  it('passes the scoped pair and reviewed hash through to apply', async () => {
    diagramServiceMock.previewSpatialQuickFix.mockResolvedValue({ previewHash });
    diagramServiceMock.applySpatialQuickFix.mockResolvedValue({ elementId: 'rack-a' });
    const app = buildApp(['view.update', 'model.update']);
    const auth = `Bearer ${makeToken()}`;
    const preview = await request(app).post(`${path}/preview`).set('Authorization', auth).send(payload);
    const apply = await request(app).post(`${path}/apply`).set('Authorization', auth).send({ ...payload, expectedPreviewHash: previewHash });
    expect(preview.status).toBe(200);
    expect(apply.status).toBe(200);
    expect(diagramServiceMock.previewSpatialQuickFix).toHaveBeenCalledWith(projectId, mockDiagram.id, payload);
    expect(diagramServiceMock.applySpatialQuickFix).toHaveBeenCalledWith(projectId, mockDiagram.id, payload, previewHash);
  });
});

describe('GET /api/diagrams', () => {
  it('returns all diagrams', async () => {
    diagramServiceMock.getAll.mockResolvedValue([mockDiagram]);

    const res = await request(buildApp())
      .get('/api/diagrams')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by modelId when provided', async () => {
    diagramServiceMock.getByModelId.mockResolvedValue([mockDiagram]);

    const res = await request(buildApp())
      .get('/api/diagrams?modelId=model-uuid-1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(diagramServiceMock.getByModelId).toHaveBeenCalledWith('model-uuid-1', 'user-uuid-1');
  });

  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).get('/api/diagrams');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/diagrams/:id', () => {
  it('returns diagram by ID', async () => {
    diagramServiceMock.getById.mockResolvedValue(mockDiagram);

    const res = await request(buildApp())
      .get('/api/diagrams/f47ac10b-58cc-4372-a567-0e02b2c3d479')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
  });

  it('returns 404 when not found', async () => {
    diagramServiceMock.getById.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/diagrams/nonexistent')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/diagrams', () => {
  it('creates diagram with valid data', async () => {
    diagramServiceMock.create.mockResolvedValue(mockDiagram);

    const res = await request(buildApp())
      .post('/api/diagrams')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Test Diagram', modelId: 'model-uuid-1' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(buildApp())
      .post('/api/diagrams')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ modelId: 'model-uuid-1' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when modelId is missing', async () => {
    const res = await request(buildApp())
      .post('/api/diagrams')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Test Diagram' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when a bulk diagram element contains malformed elevation', async () => {
    const res = await request(buildApp())
      .post('/api/diagrams')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        name: 'Test Diagram',
        modelId: 'model-uuid-1',
        elements: [{
          id: 'elem-1',
          type: 'node',
          modelElementId: 'cls-1',
          style: { position3D: { x: 1, y: 2, z: '4500' } },
        }],
      });

    expect(res.status).toBe(400);
    expect(diagramServiceMock.create).not.toHaveBeenCalled();
  });
});

describe('PUT /api/diagrams/:id', () => {
  it('updates a diagram', async () => {
    diagramServiceMock.update.mockResolvedValue({ ...mockDiagram, name: 'Updated' });

    const res = await request(buildApp())
      .put('/api/diagrams/f47ac10b-58cc-4372-a567-0e02b2c3d479')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated');
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await request(buildApp())
      .put('/api/diagrams/not-a-uuid')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when a bulk view update contains malformed 3D extents', async () => {
    const res = await request(buildApp())
      .put('/api/diagrams/f47ac10b-58cc-4372-a567-0e02b2c3d479')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        elements: [{
          id: 'elem-1',
          type: 'node',
          modelElementId: 'cls-1',
          style: { widthMm: 1200, heightMm: null, depthMm: 400 },
        }],
      });

    expect(res.status).toBe(400);
    expect(diagramServiceMock.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/diagrams/:id', () => {
  it('deletes a diagram', async () => {
    diagramServiceMock.delete.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .delete('/api/diagrams/f47ac10b-58cc-4372-a567-0e02b2c3d479')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/diagrams/:id/elements', () => {
  it('adds an element to a diagram', async () => {
    diagramServiceMock.addElement.mockResolvedValue(mockDiagram);

    const res = await request(buildApp())
      .post('/api/diagrams/a1b2c3d4-e5f6-7890-abcd-ef1234567890/elements')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        id: 'elem-1',
        type: 'node',
        modelElementId: 'cls-1',
      });

    expect(res.status).toBe(201);
  });

  it('returns 400 for missing element ID', async () => {
    const res = await request(buildApp())
      .post('/api/diagrams/a1b2c3d4-e5f6-7890-abcd-ef1234567890/elements')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ type: 'node', modelElementId: 'cls-1' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid element type', async () => {
    const res = await request(buildApp())
      .post('/api/diagrams/a1b2c3d4-e5f6-7890-abcd-ef1234567890/elements')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ id: 'elem-1', type: 'invalid', modelElementId: 'cls-1' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/diagrams/:id/model-elements/create', () => {
  it('creates a model element in a view', async () => {
    diagramServiceMock.createModelElementInView.mockResolvedValue({
      diagram: mockDiagram,
      modelElement: { id: 'elem-1', modelElementId: 'cls-1', style: {}, references: {} },
    });

    const res = await request(buildApp())
      .post('/api/diagrams/a1b2c3d4-e5f6-7890-abcd-ef1234567890/model-elements/create')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        metaClassId: 'cls-1',
        presentation: { position2D: { x: 100, y: 120 } },
        style: { name: 'Robot 1' },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.modelElement.id).toBe('elem-1');
    expect(diagramServiceMock.createModelElementInView).toHaveBeenCalledWith(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      'cls-1',
      'user-uuid-1',
      'DSL_DESIGNER',
      { position2D: { x: 100, y: 120 } },
      { name: 'Robot 1' }
    );
  });

  it('returns 400 when metaClassId is missing', async () => {
    const res = await request(buildApp())
      .post('/api/diagrams/a1b2c3d4-e5f6-7890-abcd-ef1234567890/model-elements/create')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 400 when pin attachment side is invalid', async () => {
    const res = await request(buildApp())
      .post('/api/diagrams/a1b2c3d4-e5f6-7890-abcd-ef1234567890/model-elements/create')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        metaClassId: 'pin-cls',
        presentation: {
          attachedToElementId: 'owner-1',
          attachmentSide: 'diagonal',
        },
      });

    expect(res.status).toBe(400);
    expect(diagramServiceMock.createModelElementInView).not.toHaveBeenCalled();
  });
});

describe('PUT /api/diagrams/:id/model-elements/:elementId/presentation', () => {
  const diagramId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it('round-trips a valid elevated pose through the view endpoint', async () => {
    diagramServiceMock.updateModelPresentation.mockResolvedValue(mockDiagram);

    const res = await request(buildApp())
      .put(`/api/diagrams/${diagramId}/model-elements/elem-1/presentation`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ position3D: { x: 1200, y: 800, z: 4500 } });

    expect(res.status).toBe(200);
    expect(diagramServiceMock.updateModelPresentation).toHaveBeenCalledWith(
      diagramId,
      'elem-1',
      { position3D: { x: 1200, y: 800, z: 4500 } },
      'user-uuid-1',
      'DSL_DESIGNER'
    );
  });

  it.each([
    { position3D: { x: 1200, y: '800', z: 4500 } },
    { position2D: { x: 1 } },
    { size3D: { widthMm: 1200, heightMm: null, depthMm: 400 } },
  ])('returns 400 for malformed view presentation data: %j', async presentation => {
    const res = await request(buildApp())
      .put(`/api/diagrams/${diagramId}/model-elements/elem-1/presentation`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(presentation);

    expect(res.status).toBe(400);
    expect(diagramServiceMock.updateModelPresentation).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/diagrams/:id/elements/:elementId', () => {
  it('deletes an element from a diagram', async () => {
    diagramServiceMock.deleteElement.mockResolvedValue(mockDiagram);

    const res = await request(buildApp())
      .delete('/api/diagrams/a1b2c3d4-e5f6-7890-abcd-ef1234567890/elements/elem-1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
  });
});

describe('PUT /api/diagrams/:id/grid-settings', () => {
  it('updates grid settings', async () => {
    diagramServiceMock.updateGridSettings.mockResolvedValue({ ...mockDiagram, gridSettings: { sizeX: 10, sizeY: 10 } });

    const res = await request(buildApp())
      .put('/api/diagrams/a1b2c3d4-e5f6-7890-abcd-ef1234567890/grid-settings')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ sizeX: 10, sizeY: 10 });

    expect(res.status).toBe(200);
  });

  it('returns 400 when sizeX/sizeY missing', async () => {
    const res = await request(buildApp())
      .put('/api/diagrams/a1b2c3d4-e5f6-7890-abcd-ef1234567890/grid-settings')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ sizeX: 10 });

    expect(res.status).toBe(400);
  });
});
