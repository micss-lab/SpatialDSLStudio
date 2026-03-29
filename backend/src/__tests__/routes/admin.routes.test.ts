import { prismaMock } from '../helpers/prisma.mock';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';


const adminServiceMock = {
  getUsers: jest.fn(),
  getUserById: jest.fn(),
  changeUserRole: jest.fn(),
  resetUserPassword: jest.fn(),
  deleteUser: jest.fn(),
  bulkChangeRole: jest.fn(),
  bulkDeleteUsers: jest.fn(),
  getResourceStats: jest.fn(),
  getResources: jest.fn(),
  getResourceDetails: jest.fn(),
  deleteResource: jest.fn(),
  transferResourceOwnership: jest.fn(),
  forceUnshareResource: jest.fn(),
  getSystemHealth: jest.fn(),
};
jest.mock('../../services/admin.service', () => ({
  adminService: adminServiceMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

import adminRouter from '../../routes/admin.routes';

const JWT_SECRET = process.env.JWT_SECRET!;

function makeToken(role = 'ADMIN') {
  return jwt.sign(
    { userId: 'admin-uuid-1', email: 'admin@example.com', role },
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
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as any;
      req.user = decoded;
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    // requireRole checks req.user.role
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  });
  app.use('/api/admin', adminRouter);
  return app;
}

const mockUser = {
  id: 'user-uuid-2',
  email: 'user@example.com',
  role: 'DSL_DESIGNER',
  createdAt: new Date().toISOString(),
};

describe('GET /api/admin/users', () => {
  it('returns paginated users list', async () => {
    adminServiceMock.getUsers.mockResolvedValue({
      users: [mockUser],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await request(buildApp())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.users).toHaveLength(1);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(buildApp())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${makeToken('DSL_DESIGNER')}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/users/:userId', () => {
  it('returns user by ID', async () => {
    adminServiceMock.getUserById.mockResolvedValue(mockUser);

    const res = await request(buildApp())
      .get('/api/admin/users/user-uuid-2')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('user-uuid-2');
  });

  it('returns 404 when user not found', async () => {
    adminServiceMock.getUserById.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/admin/users/nonexistent')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/users/:userId/role', () => {
  it('changes user role', async () => {
    adminServiceMock.changeUserRole.mockResolvedValue({ ...mockUser, role: 'MODELER' });

    const res = await request(buildApp())
      .patch('/api/admin/users/user-uuid-2/role')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ role: 'MODELER' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('MODELER');
  });

  it('returns 400 for invalid role', async () => {
    const res = await request(buildApp())
      .patch('/api/admin/users/user-uuid-2/role')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ role: 'SUPER_ADMIN' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/users/:userId/reset-password', () => {
  it('resets user password', async () => {
    adminServiceMock.resetUserPassword.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post('/api/admin/users/user-uuid-2/reset-password')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ newPassword: 'NewSecurePass123!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(buildApp())
      .post('/api/admin/users/user-uuid-2/reset-password')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/admin/users/:userId', () => {
  it('deletes a user', async () => {
    adminServiceMock.deleteUser.mockResolvedValue({ deletedResources: 3 });

    const res = await request(buildApp())
      .delete('/api/admin/users/user-uuid-2')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/admin/users/bulk/role', () => {
  it('bulk changes user roles', async () => {
    adminServiceMock.bulkChangeRole.mockResolvedValue(3);

    const res = await request(buildApp())
      .post('/api/admin/users/bulk/role')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ userIds: ['user-1', 'user-2', 'user-3'], role: 'MODELER' });

    expect(res.status).toBe(200);
    expect(res.body.data.updatedCount).toBe(3);
  });

  it('returns 400 when userIds is empty', async () => {
    const res = await request(buildApp())
      .post('/api/admin/users/bulk/role')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ userIds: [], role: 'MODELER' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid role', async () => {
    const res = await request(buildApp())
      .post('/api/admin/users/bulk/role')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ userIds: ['user-1'], role: 'INVALID' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/users/bulk/delete', () => {
  it('bulk deletes users', async () => {
    adminServiceMock.bulkDeleteUsers.mockResolvedValue(2);

    const res = await request(buildApp())
      .post('/api/admin/users/bulk/delete')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ userIds: ['user-1', 'user-2'] });

    expect(res.status).toBe(200);
    expect(res.body.data.deletedCount).toBe(2);
  });

  it('returns 400 when userIds is empty', async () => {
    const res = await request(buildApp())
      .post('/api/admin/users/bulk/delete')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ userIds: [] });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/stats', () => {
  it('returns resource statistics', async () => {
    adminServiceMock.getResourceStats.mockResolvedValue({
      totalUsers: 10,
      totalMetamodels: 5,
      totalModels: 20,
    });

    const res = await request(buildApp())
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalUsers).toBe(10);
  });
});

describe('GET /api/admin/resources', () => {
  it('returns paginated resources', async () => {
    adminServiceMock.getResources.mockResolvedValue({
      resources: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    const res = await request(buildApp())
      .get('/api/admin/resources')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('DELETE /api/admin/resources/:type/:resourceId', () => {
  it('deletes a resource', async () => {
    adminServiceMock.deleteResource.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .delete('/api/admin/resources/METAMODEL/mm-uuid-1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/admin/resources/:type/:resourceId/transfer', () => {
  it('transfers resource ownership', async () => {
    adminServiceMock.transferResourceOwnership.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post('/api/admin/resources/METAMODEL/mm-uuid-1/transfer')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ newOwnerId: 'user-uuid-3' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when newOwnerId is missing', async () => {
    const res = await request(buildApp())
      .post('/api/admin/resources/METAMODEL/mm-uuid-1/transfer')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/health', () => {
  it('returns system health info', async () => {
    adminServiceMock.getSystemHealth.mockResolvedValue({
      status: 'healthy',
      dbConnected: true,
    });

    const res = await request(buildApp())
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('healthy');
  });
});
