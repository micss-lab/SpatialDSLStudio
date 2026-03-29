import { prismaMock } from '../helpers/prisma.mock';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';


const metametamodelServiceMock = {
  getAll: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  initializeCoreEcore: jest.fn(),
};
jest.mock('../../services/metametamodel.service', () => ({
  metametamodelService: metametamodelServiceMock,
}));
jest.mock('../../services', () => ({
  metametamodelService: metametamodelServiceMock,
}));

beforeEach(() => {
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-uuid-1', role: 'DSL_DESIGNER', email: 'test@example.com' } as any);
  mockReset(prismaMock);
  jest.clearAllMocks();
  // Satisfy authenticate middleware (queries user role on every request)
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-uuid-1', role: 'DSL_DESIGNER', email: 'test@example.com' } as any);
});

import epackageRouter from '../../routes/epackage.routes';

const JWT_SECRET = process.env.JWT_SECRET!;

function makeToken() {
  return jwt.sign(
    { userId: 'user-uuid-1', email: 'test@example.com', role: 'DSL_DESIGNER' },
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
  app.use('/api/epackages', epackageRouter);
  return app;
}

const mockEPackage = {
  id: 'pkg-uuid-1',
  name: 'Ecore',
  nsURI: 'http://ecore',
  nsPrefix: 'ecore',
  classes: [],
};

describe('GET /api/epackages', () => {
  it('returns list of epackages', async () => {
    metametamodelServiceMock.getAll.mockResolvedValue([mockEPackage]);

    const res = await request(buildApp())
      .get('/api/epackages')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).get('/api/epackages');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/epackages/:id', () => {
  it('returns epackage by ID', async () => {
    metametamodelServiceMock.getById.mockResolvedValue(mockEPackage);

    const res = await request(buildApp())
      .get('/api/epackages/f47ac10b-58cc-4372-a567-0e02b2c3d479')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('pkg-uuid-1');
  });

  it('returns 404 when not found', async () => {
    metametamodelServiceMock.getById.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/epackages/nonexistent')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/epackages', () => {
  it('creates epackage with valid data', async () => {
    metametamodelServiceMock.create.mockResolvedValue(mockEPackage);

    const res = await request(buildApp())
      .post('/api/epackages')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Ecore', nsURI: 'http://ecore', nsPrefix: 'ecore' });

    expect(res.status).toBe(201);
  });

  it('returns 400 when fields missing', async () => {
    const res = await request(buildApp())
      .post('/api/epackages')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Ecore' }); // missing nsURI and nsPrefix

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/epackages/:id', () => {
  it('updates epackage', async () => {
    metametamodelServiceMock.update.mockResolvedValue({ ...mockEPackage, name: 'Updated' });

    const res = await request(buildApp())
      .put('/api/epackages/f47ac10b-58cc-4372-a567-0e02b2c3d479')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated');
  });
});

describe('DELETE /api/epackages/:id', () => {
  it('deletes epackage', async () => {
    metametamodelServiceMock.delete.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .delete('/api/epackages/f47ac10b-58cc-4372-a567-0e02b2c3d479')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
  });
});
