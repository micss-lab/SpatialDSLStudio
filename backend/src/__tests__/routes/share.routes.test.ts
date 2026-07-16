import { prismaMock } from '../helpers/prisma.mock';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { ApiError } from '../../middleware/errorHandler';


const sharingServiceMock = {
  shareResourceWithCascade: jest.fn(),
  unshareResource: jest.fn(),
  getResourceShares: jest.fn(),
  getResourcesSharedWithUser: jest.fn(),
  getEffectivePermission: jest.fn(),
};
jest.mock('../../services/sharing.service', () => ({
  sharingService: sharingServiceMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

import shareRouter from '../../routes/share.routes';

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
  app.use('/api/share', shareRouter);
  return app;
}

const mockShare = {
  id: 'share-uuid-1',
  resourceType: 'METAMODEL',
  resourceId: 'mm-uuid-1',
  sharedWithUserId: 'user-uuid-2',
  permission: 'EDITOR',
};

describe('POST /api/share/:resourceType/:resourceId/share', () => {
  it('shares a resource successfully', async () => {
    sharingServiceMock.shareResourceWithCascade.mockResolvedValue({
      mainShare: mockShare,
      cascadedShares: [],
      warnings: [],
    });

    const res = await request(buildApp())
      .post('/api/share/METAMODEL/mm-uuid-1/share')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ email: 'other@example.com', permission: 'EDITOR' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockShare);
  });

  it('returns 400 for invalid resource type', async () => {
    const res = await request(buildApp())
      .post('/api/share/INVALID_TYPE/mm-uuid-1/share')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ email: 'other@example.com', permission: 'EDITOR' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(buildApp())
      .post('/api/share/METAMODEL/mm-uuid-1/share')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ permission: 'EDITOR' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid permission', async () => {
    const res = await request(buildApp())
      .post('/api/share/METAMODEL/mm-uuid-1/share')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ email: 'other@example.com', permission: 'OWNER' });

    expect(res.status).toBe(400);
  });

  it('includes cascade info in message when cascaded shares exist', async () => {
    sharingServiceMock.shareResourceWithCascade.mockResolvedValue({
      mainShare: mockShare,
      cascadedShares: [{ id: 'share-uuid-2' }],
      warnings: ['Warning: something minor'],
    });

    const res = await request(buildApp())
      .post('/api/share/METAMODEL/mm-uuid-1/share')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ email: 'other@example.com', permission: 'EDITOR' });

    expect(res.status).toBe(201);
    expect(res.body.message).toContain('1 dependent resource');
    expect(res.body.message).toContain('Warning');
  });

  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).post('/api/share/METAMODEL/mm-uuid-1/share');
    expect(res.status).toBe(401);
  });

  it('surfaces the service refusal reason instead of a generic message', async () => {
    sharingServiceMock.shareResourceWithCascade.mockRejectedValue(
      new ApiError(403, 'You can only share resources you own')
    );

    const res = await request(buildApp())
      .post('/api/share/METAMODEL/mm-uuid-1/share')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ email: 'other@example.com', permission: 'EDITOR' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You can only share resources you own');
  });

  it('surfaces the unknown-email reason', async () => {
    sharingServiceMock.shareResourceWithCascade.mockRejectedValue(
      new ApiError(404, 'User with this email not found')
    );

    const res = await request(buildApp())
      .post('/api/share/METAMODEL/mm-uuid-1/share')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ email: 'nobody@example.com', permission: 'EDITOR' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User with this email not found');
  });
});

describe('DELETE /api/share/:resourceType/:resourceId/share/:userId', () => {
  it('unshares a resource successfully', async () => {
    sharingServiceMock.unshareResource.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .delete('/api/share/METAMODEL/mm-uuid-1/share/user-uuid-2')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 for invalid resource type', async () => {
    const res = await request(buildApp())
      .delete('/api/share/INVALID_TYPE/mm-uuid-1/share/user-uuid-2')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/share/:resourceType/:resourceId/shares', () => {
  it('returns list of shares for resource', async () => {
    sharingServiceMock.getResourceShares.mockResolvedValue([mockShare]);

    const res = await request(buildApp())
      .get('/api/share/METAMODEL/mm-uuid-1/shares')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 400 for invalid resource type', async () => {
    const res = await request(buildApp())
      .get('/api/share/INVALID_TYPE/mm-uuid-1/shares')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
  });

  it('surfaces the ownership reason with its status code', async () => {
    sharingServiceMock.getResourceShares.mockRejectedValue(
      new ApiError(403, 'Only resource owners can view sharing details')
    );

    const res = await request(buildApp())
      .get('/api/share/METAMODEL/mm-uuid-1/shares')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Only resource owners can view sharing details');
  });
});

describe('GET /api/share/shared-with-me', () => {
  it('returns resources shared with current user', async () => {
    sharingServiceMock.getResourcesSharedWithUser.mockResolvedValue([mockShare]);

    const res = await request(buildApp())
      .get('/api/share/shared-with-me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('GET /api/share/:resourceType/:resourceId/access', () => {
  it('returns access level for resource', async () => {
    sharingServiceMock.getEffectivePermission.mockResolvedValue('EDITOR');

    const res = await request(buildApp())
      .get('/api/share/METAMODEL/mm-uuid-1/access')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBe('EDITOR');
  });

  it('returns 400 for invalid resource type', async () => {
    const res = await request(buildApp())
      .get('/api/share/INVALID_TYPE/mm-uuid-1/access')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
  });
});
