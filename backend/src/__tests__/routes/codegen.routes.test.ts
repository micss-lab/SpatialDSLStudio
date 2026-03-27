import { prismaMock } from '../helpers/prisma.mock';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';


const codeGenerationServiceMock = {
  getAllProjects: jest.fn(),
  getProjectsByMetamodelId: jest.fn(),
  getProjectById: jest.fn(),
  createProject: jest.fn(),
  updateProject: jest.fn(),
  deleteProject: jest.fn(),
  addTemplate: jest.fn(),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
};
jest.mock('../../services/codegeneration.service', () => ({
  codeGenerationService: codeGenerationServiceMock,
}));
jest.mock('../../services', () => ({
  codeGenerationService: codeGenerationServiceMock,
}));

beforeEach(() => {
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-uuid-1', role: 'DSL_DESIGNER', email: 'test@example.com' } as any);
  mockReset(prismaMock);
  jest.clearAllMocks();
  // Satisfy authenticate middleware (queries user role on every request)
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-uuid-1', role: 'DSL_DESIGNER', email: 'test@example.com' } as any);
});

import codegenRouter from '../../routes/codegen.routes';

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
  app.use('/api/codegen', codegenRouter);
  return app;
}

const mockProject = {
  id: 'proj-uuid-1',
  name: 'Test Project',
  ownerId: 'user-uuid-1',
  targetMetamodelId: 'mm-uuid-1',
  templates: [],
};

describe('GET /api/codegen/projects', () => {
  it('returns all projects', async () => {
    codeGenerationServiceMock.getAllProjects.mockResolvedValue([mockProject]);

    const res = await request(buildApp())
      .get('/api/codegen/projects')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by metamodelId when provided', async () => {
    codeGenerationServiceMock.getProjectsByMetamodelId.mockResolvedValue([mockProject]);

    const res = await request(buildApp())
      .get('/api/codegen/projects?metamodelId=mm-uuid-1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(codeGenerationServiceMock.getProjectsByMetamodelId).toHaveBeenCalledWith('mm-uuid-1', 'user-uuid-1');
  });

  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).get('/api/codegen/projects');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/codegen/projects/:id', () => {
  it('returns project by ID', async () => {
    codeGenerationServiceMock.getProjectById.mockResolvedValue(mockProject);

    const res = await request(buildApp())
      .get('/api/codegen/projects/proj-uuid-1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('proj-uuid-1');
  });

  it('returns 404 when not found', async () => {
    codeGenerationServiceMock.getProjectById.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/codegen/projects/nonexistent')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/codegen/projects', () => {
  it('creates project with valid data', async () => {
    codeGenerationServiceMock.createProject.mockResolvedValue(mockProject);

    const res = await request(buildApp())
      .post('/api/codegen/projects')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Test Project', targetMetamodelId: 'mm-uuid-1' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(buildApp())
      .post('/api/codegen/projects')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ targetMetamodelId: 'mm-uuid-1' });

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/codegen/projects/:id', () => {
  it('updates a project', async () => {
    codeGenerationServiceMock.updateProject.mockResolvedValue({ ...mockProject, name: 'Updated' });

    const res = await request(buildApp())
      .put('/api/codegen/projects/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated');
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await request(buildApp())
      .put('/api/codegen/projects/not-a-uuid')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/codegen/projects/:id', () => {
  it('deletes a project', async () => {
    codeGenerationServiceMock.deleteProject.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .delete('/api/codegen/projects/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/codegen/projects/:id/templates', () => {
  it('adds a template to a project', async () => {
    codeGenerationServiceMock.addTemplate.mockResolvedValue(mockProject);

    const res = await request(buildApp())
      .post('/api/codegen/projects/a1b2c3d4-e5f6-7890-abcd-ef1234567890/templates')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        id: 'tmpl-1',
        name: 'My Template',
        language: 'java',
        templateContent: 'public class {{name}} {}',
        outputPattern: '{{name}}.java',
      });

    expect(res.status).toBe(201);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(buildApp())
      .post('/api/codegen/projects/a1b2c3d4-e5f6-7890-abcd-ef1234567890/templates')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        id: 'tmpl-1',
        language: 'java',
        templateContent: 'public class {{name}} {}',
        outputPattern: '{{name}}.java',
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid language', async () => {
    const res = await request(buildApp())
      .post('/api/codegen/projects/a1b2c3d4-e5f6-7890-abcd-ef1234567890/templates')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        id: 'tmpl-1',
        name: 'My Template',
        language: 'ruby',
        templateContent: 'class {{name}}; end',
        outputPattern: '{{name}}.rb',
      });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/codegen/projects/:id/templates/:templateId', () => {
  it('deletes a template from a project', async () => {
    codeGenerationServiceMock.deleteTemplate.mockResolvedValue(mockProject);

    const res = await request(buildApp())
      .delete('/api/codegen/projects/a1b2c3d4-e5f6-7890-abcd-ef1234567890/templates/tmpl-1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
  });
});
