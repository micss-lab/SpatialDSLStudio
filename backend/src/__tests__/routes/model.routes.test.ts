import { prismaMock } from '../helpers/prisma.mock';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';


const modelServiceMock = {
  getAll: jest.fn(),
  getByMetamodelId: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  addElement: jest.fn(),
  updateElement: jest.fn(),
  updateElementPresentation: jest.fn(),
  deleteElement: jest.fn(),
  addConnection: jest.fn(),
  deleteConnection: jest.fn(),
};
jest.mock('../../services/model.service', () => ({
  modelService: modelServiceMock,
}));
jest.mock('../../services', () => ({
  modelService: modelServiceMock,
}));

beforeEach(() => {
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-uuid-1', role: 'DSL_DESIGNER', email: 'test@example.com' } as any);
  mockReset(prismaMock);
  jest.clearAllMocks();
  // Satisfy authenticate middleware (queries user role on every request)
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-uuid-1', role: 'DSL_DESIGNER', email: 'test@example.com' } as any);
});

import modelRouter from '../../routes/model.routes';

const JWT_SECRET = process.env.JWT_SECRET!;

function makeToken(role = 'DSL_DESIGNER') {
  return jwt.sign(
    { userId: 'user-uuid-1', email: 'test@example.com', role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return _res.status(401).json({ error: 'No auth' });
    try {
      req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    } catch {
      return _res.status(401).json({ error: 'Invalid token' });
    }
    next();
  });
  app.use('/api/models', modelRouter);
  return app;
}

const mockModel = {
  id: 'model-uuid-1',
  name: 'TestModel',
  metamodelId: 'mm-uuid-1',
  elements: [],
  connections: [],
  conformsTo: 'mm-uuid-1',
  isOwner: true,
};

describe('GET /api/models', () => {
  it('returns all models', async () => {
    modelServiceMock.getAll.mockResolvedValue([mockModel]);

    const res = await request(buildApp())
      .get('/api/models')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by metamodelId when provided', async () => {
    modelServiceMock.getByMetamodelId.mockResolvedValue([mockModel]);

    const res = await request(buildApp())
      .get('/api/models?metamodelId=mm-uuid-1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(modelServiceMock.getByMetamodelId).toHaveBeenCalledWith('mm-uuid-1', 'user-uuid-1');
  });
});

describe('GET /api/models/:id', () => {
  it('returns model by ID', async () => {
    modelServiceMock.getById.mockResolvedValue(mockModel);

    const res = await request(buildApp())
      .get('/api/models/model-uuid-1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('model-uuid-1');
  });

  it('returns 404 when not found', async () => {
    modelServiceMock.getById.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/models/nonexistent')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/models', () => {
  it('creates model with valid data', async () => {
    modelServiceMock.create.mockResolvedValue(mockModel);

    const res = await request(buildApp())
      .post('/api/models')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'TestModel', metamodelId: 'mm-uuid-1', conformsTo: 'mm-uuid-1' });

    expect(res.status).toBe(201);
  });

  it('returns 400 when required fields missing', async () => {
    const res = await request(buildApp())
      .post('/api/models')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'TestModel' });

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/models/:id', () => {
  it('updates model', async () => {
    modelServiceMock.update.mockResolvedValue({ ...mockModel, name: 'Updated' });

    const validUUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const res = await request(buildApp())
      .put(`/api/models/${validUUID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/models/:id', () => {
  it('deletes model', async () => {
    modelServiceMock.delete.mockResolvedValue(undefined);

    const validUUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const res = await request(buildApp())
      .delete(`/api/models/${validUUID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
  });
});

describe('POST /api/models/:id/elements', () => {
  it('adds element to model', async () => {
    modelServiceMock.addElement.mockResolvedValue(mockModel);

    const validUUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const res = await request(buildApp())
      .post(`/api/models/${validUUID}/elements`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ id: 'elem-1', modelElementId: 'cls-1' });

    expect(res.status).toBe(201);
  });

  it('returns 400 when element fields missing', async () => {
    const validUUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const res = await request(buildApp())
      .post(`/api/models/${validUUID}/elements`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ id: 'elem-1' }); // missing modelElementId

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/models/:id/elements/:elementId/presentation', () => {
  const modelId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

  it.each([0, 4500])('accepts a finite base elevation of %s mm', async z => {
    modelServiceMock.updateElementPresentation.mockResolvedValue(mockModel);

    const res = await request(buildApp())
      .put(`/api/models/${modelId}/elements/elem-1/presentation`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        position3D: { x: 1200, y: 800, z },
        size3D: { widthMm: 1200, heightMm: 800, depthMm: 400 },
        rotationZ: 15,
      });

    expect(res.status).toBe(200);
    expect(modelServiceMock.updateElementPresentation).toHaveBeenCalledWith(
      modelId,
      'elem-1',
      expect.objectContaining({ position3D: { x: 1200, y: 800, z } }),
      'user-uuid-1',
      'DSL_DESIGNER'
    );
  });

  it.each([
    { position3D: { x: 1 } },
    { position3D: { x: 1, y: 2, z: '4500' } },
    { position3D: { x: null, y: 2, z: 0 } },
    { size3D: { widthMm: 1, heightMm: 2 } },
    { rotationZ: '15' },
  ])('rejects malformed or non-finite presentation data: %j', async presentation => {
    const res = await request(buildApp())
      .put(`/api/models/${modelId}/elements/elem-1/presentation`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(presentation);

    expect(res.status).toBe(400);
    expect(modelServiceMock.updateElementPresentation).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/models/:id/elements/:elementId', () => {
  it('deletes element from model', async () => {
    modelServiceMock.deleteElement.mockResolvedValue(mockModel);

    const validUUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const res = await request(buildApp())
      .delete(`/api/models/${validUUID}/elements/elem-1`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
  });
});
