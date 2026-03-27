import { prismaMock } from '../helpers/prisma.mock';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';


const testServiceMock = {
  getAll: jest.fn(),
  getByModelId: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  createMany: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  updateTestValues: jest.fn(),
  delete: jest.fn(),
  deleteByModelId: jest.fn(),
  resetByModelId: jest.fn(),
};
jest.mock('../../services/test.service', () => ({
  testService: testServiceMock,
}));
jest.mock('../../services', () => ({
  testService: testServiceMock,
}));

beforeEach(() => {
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-uuid-1', role: 'DSL_DESIGNER', email: 'test@example.com' } as any);
  mockReset(prismaMock);
  jest.clearAllMocks();
  // Satisfy authenticate middleware (queries user role on every request)
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-uuid-1', role: 'DSL_DESIGNER', email: 'test@example.com' } as any);
});

import testRouter from '../../routes/test.routes';

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
  app.use((req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No auth' });
    try {
      req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    next();
  });
  app.use('/api/tests', testRouter);
  return app;
}

const mockTestCase = {
  id: 'test-uuid-1',
  name: 'Test Case 1',
  type: 'attribute',
  targetMetaClassId: 'cls-1',
  targetMetaClassName: 'Person',
  modelId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  ownerId: 'user-uuid-1',
  status: 'pending',
};

describe('GET /api/tests', () => {
  it('returns all test cases', async () => {
    testServiceMock.getAll.mockResolvedValue([mockTestCase]);

    const res = await request(buildApp())
      .get('/api/tests')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by modelId when provided', async () => {
    testServiceMock.getByModelId.mockResolvedValue([mockTestCase]);

    const res = await request(buildApp())
      .get('/api/tests?modelId=model-uuid-1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(testServiceMock.getByModelId).toHaveBeenCalledWith('model-uuid-1', 'user-uuid-1');
  });

  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).get('/api/tests');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/tests/cases', () => {
  it('returns all test cases via alias', async () => {
    testServiceMock.getAll.mockResolvedValue([mockTestCase]);

    const res = await request(buildApp())
      .get('/api/tests/cases')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('GET /api/tests/:id', () => {
  it('returns test case by ID', async () => {
    testServiceMock.getById.mockResolvedValue(mockTestCase);

    const res = await request(buildApp())
      .get('/api/tests/test-uuid-1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('test-uuid-1');
  });

  it('returns 404 when not found', async () => {
    testServiceMock.getById.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/tests/nonexistent')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/tests', () => {
  it('creates test case with valid data', async () => {
    testServiceMock.create.mockResolvedValue(mockTestCase);

    const res = await request(buildApp())
      .post('/api/tests')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        name: 'Test Case 1',
        type: 'attribute',
        targetMetaClassId: 'cls-1',
        targetMetaClassName: 'Person',
        modelId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(buildApp())
      .post('/api/tests')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        type: 'attribute',
        targetMetaClassId: 'cls-1',
        targetMetaClassName: 'Person',
        modelId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid type', async () => {
    const res = await request(buildApp())
      .post('/api/tests')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        name: 'Test',
        type: 'invalid_type',
        targetMetaClassId: 'cls-1',
        targetMetaClassName: 'Person',
        modelId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid modelId UUID', async () => {
    const res = await request(buildApp())
      .post('/api/tests')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        name: 'Test',
        type: 'attribute',
        targetMetaClassId: 'cls-1',
        targetMetaClassName: 'Person',
        modelId: 'not-a-uuid',
      });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/tests/batch', () => {
  it('creates multiple test cases', async () => {
    testServiceMock.createMany.mockResolvedValue([mockTestCase]);

    const res = await request(buildApp())
      .post('/api/tests/batch')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send([mockTestCase]);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when body is not array', async () => {
    const res = await request(buildApp())
      .post('/api/tests/batch')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'single object' });

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/tests/:id', () => {
  it('updates a test case', async () => {
    testServiceMock.update.mockResolvedValue({ ...mockTestCase, name: 'Updated' });

    const res = await request(buildApp())
      .put('/api/tests/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated');
  });
});

describe('PUT /api/tests/:id/status', () => {
  it('updates test case status', async () => {
    testServiceMock.updateStatus.mockResolvedValue({ ...mockTestCase, status: 'passed' });

    const res = await request(buildApp())
      .put('/api/tests/a1b2c3d4-e5f6-7890-abcd-ef1234567890/status')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ status: 'passed' });

    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid status', async () => {
    const res = await request(buildApp())
      .put('/api/tests/a1b2c3d4-e5f6-7890-abcd-ef1234567890/status')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ status: 'invalid_status' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/tests/:id', () => {
  it('deletes a test case', async () => {
    testServiceMock.delete.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .delete('/api/tests/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/tests/model/:modelId', () => {
  it('deletes all test cases for a model', async () => {
    testServiceMock.deleteByModelId.mockResolvedValue(3);

    const res = await request(buildApp())
      .delete('/api/tests/model/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('3');
  });
});

describe('POST /api/tests/model/:modelId/reset', () => {
  it('resets all test cases for a model', async () => {
    testServiceMock.resetByModelId.mockResolvedValue(5);

    const res = await request(buildApp())
      .post('/api/tests/model/a1b2c3d4-e5f6-7890-abcd-ef1234567890/reset')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('5');
  });
});
