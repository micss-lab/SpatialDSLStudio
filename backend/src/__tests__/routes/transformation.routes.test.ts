import { prismaMock } from '../helpers/prisma.mock';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';


const transformationServiceMock = {
  getAllRules: jest.fn(),
  getRuleById: jest.fn(),
  createRule: jest.fn(),
  updateRule: jest.fn(),
  deleteRule: jest.fn(),
};
jest.mock('../../services/transformation.service', () => ({
  transformationService: transformationServiceMock,
}));
jest.mock('../../services', () => ({
  transformationService: transformationServiceMock,
}));

beforeEach(() => {
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-uuid-1', role: 'DSL_DESIGNER', email: 'test@example.com' } as any);
  mockReset(prismaMock);
  jest.clearAllMocks();
  // Satisfy authenticate middleware (queries user role on every request)
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-uuid-1', role: 'DSL_DESIGNER', email: 'test@example.com' } as any);
});

import transformationRouter from '../../routes/transformation.routes';

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
  app.use('/api/transformations', transformationRouter);
  return app;
}

const mockRule = {
  id: 'rule-uuid-1',
  name: 'Test Rule',
  ownerId: 'user-uuid-1',
  patterns: [],
};

describe('GET /api/transformations/rules', () => {
  it('returns list of rules', async () => {
    transformationServiceMock.getAllRules.mockResolvedValue([mockRule]);

    const res = await request(buildApp())
      .get('/api/transformations/rules')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).get('/api/transformations/rules');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/transformations/rules/:id', () => {
  it('returns rule by ID', async () => {
    transformationServiceMock.getRuleById.mockResolvedValue(mockRule);

    const res = await request(buildApp())
      .get('/api/transformations/rules/rule-uuid-1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('rule-uuid-1');
  });

  it('returns 404 when not found', async () => {
    transformationServiceMock.getRuleById.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/transformations/rules/nonexistent')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/transformations/rules', () => {
  it('creates rule with valid data', async () => {
    transformationServiceMock.createRule.mockResolvedValue(mockRule);

    const res = await request(buildApp())
      .post('/api/transformations/rules')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Test Rule' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(buildApp())
      .post('/api/transformations/rules')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/transformations/rules/:id', () => {
  it('updates a rule', async () => {
    transformationServiceMock.updateRule.mockResolvedValue({ ...mockRule, name: 'Updated' });

    const res = await request(buildApp())
      .put('/api/transformations/rules/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated');
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await request(buildApp())
      .put('/api/transformations/rules/not-a-uuid')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/transformations/rules/:id', () => {
  it('deletes a rule', async () => {
    transformationServiceMock.deleteRule.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .delete('/api/transformations/rules/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Legacy pattern routes', () => {
  it('GET /api/transformations/patterns returns empty array', async () => {
    const res = await request(buildApp())
      .get('/api/transformations/patterns')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('POST /api/transformations/patterns returns body back', async () => {
    const res = await request(buildApp())
      .post('/api/transformations/patterns')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Pattern' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Pattern');
  });

  it('GET /api/transformations/executions returns empty array', async () => {
    const res = await request(buildApp())
      .get('/api/transformations/executions')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
