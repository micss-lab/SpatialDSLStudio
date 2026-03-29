import { prismaMock } from '../helpers/prisma.mock';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';


const metamodelServiceMock = {
  getAll: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  addClass: jest.fn(),
  updateClass: jest.fn(),
  deleteClass: jest.fn(),
  addConstraint: jest.fn(),
};
jest.mock('../../services/metamodel.service', () => ({
  metamodelService: metamodelServiceMock,
}));
jest.mock('../../services', () => ({
  metamodelService: metamodelServiceMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

import metamodelRouter from '../../routes/metamodel.routes';

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
  // Mock authenticate middleware inline
  app.use((req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header required' });
    }
    const token = authHeader.split(' ')[1];
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      req.user = { ...payload, role: prismaMock.user.findUnique.mock.results[0]?.value?.role || payload.role };
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    next();
  });
  app.use('/api/metamodels', metamodelRouter);
  return app;
}

const mockMetamodel = {
  id: 'mm-uuid-1',
  name: 'TestMetamodel',
  uri: 'http://example.com/mm',
  prefix: 'tm',
  eClass: 'pkg-uuid-1',
  classes: [],
  constraints: [],
  conformsTo: 'pkg-uuid-1',
  isOwner: true,
};

describe('GET /api/metamodels', () => {
  it('returns list of metamodels', async () => {
    metamodelServiceMock.getAll.mockResolvedValue([mockMetamodel]);
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);

    const res = await request(buildApp())
      .get('/api/metamodels')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(buildApp()).get('/api/metamodels');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/metamodels/:id', () => {
  it('returns metamodel by ID', async () => {
    metamodelServiceMock.getById.mockResolvedValue(mockMetamodel);
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);

    const res = await request(buildApp())
      .get('/api/metamodels/mm-uuid-1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('mm-uuid-1');
  });

  it('returns 404 when not found', async () => {
    metamodelServiceMock.getById.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);

    const res = await request(buildApp())
      .get('/api/metamodels/nonexistent')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/metamodels', () => {
  it('creates metamodel with valid data', async () => {
    metamodelServiceMock.create.mockResolvedValue(mockMetamodel);
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);

    const res = await request(buildApp())
      .post('/api/metamodels')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        name: 'TestMetamodel',
        uri: 'http://example.com/mm',
        prefix: 'tm',
        conformsTo: 'pkg-uuid-1',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when required fields missing', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);

    const res = await request(buildApp())
      .post('/api/metamodels')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'TestMetamodel' }); // missing uri, prefix, conformsTo

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/metamodels/:id', () => {
  it('updates metamodel', async () => {
    metamodelServiceMock.update.mockResolvedValue({ ...mockMetamodel, name: 'Updated' });
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);

    const validUUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const res = await request(buildApp())
      .put(`/api/metamodels/${validUUID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated');
  });

  it('returns 400 for invalid UUID', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);

    const res = await request(buildApp())
      .put('/api/metamodels/not-a-uuid')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/metamodels/:id', () => {
  it('deletes metamodel', async () => {
    metamodelServiceMock.delete.mockResolvedValue(undefined);
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);

    const validUUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const res = await request(buildApp())
      .delete(`/api/metamodels/${validUUID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Metamodel deleted successfully');
  });
});

describe('POST /api/metamodels/:id/classes', () => {
  it('adds class to metamodel', async () => {
    metamodelServiceMock.addClass.mockResolvedValue(mockMetamodel);
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);

    const validUUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const res = await request(buildApp())
      .post(`/api/metamodels/${validUUID}/classes`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ id: 'cls-1', name: 'NewClass' });

    expect(res.status).toBe(201);
  });

  it('returns 400 when class name missing', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);

    const validUUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const res = await request(buildApp())
      .post(`/api/metamodels/${validUUID}/classes`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ id: 'cls-1' }); // missing name

    expect(res.status).toBe(400);
  });
});
