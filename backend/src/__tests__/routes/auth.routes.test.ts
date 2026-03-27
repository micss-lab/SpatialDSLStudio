import { prismaMock } from '../helpers/prisma.mock';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

// Mock Prisma for the auth middleware

// Mock auth service
const authServiceMock = {
  register: jest.fn(),
  login: jest.fn(),
  getUserById: jest.fn(),
  changePassword: jest.fn(),
  verifyToken: jest.fn(),
};
jest.mock('../../services/auth.service', () => ({
  authService: authServiceMock,
}));

// Mock metametamodel service
jest.mock('../../services/metametamodel.service', () => ({
  metametamodelService: {
    initializeCoreEcore: jest.fn().mockResolvedValue({}),
  },
}));

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

import authRouter from '../../routes/auth.routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

const JWT_SECRET = process.env.JWT_SECRET!;

function makeValidToken(overrides = {}) {
  return jwt.sign(
    { userId: 'user-uuid-1', email: 'test@example.com', role: 'DSL_DESIGNER', ...overrides },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('POST /api/auth/register', () => {
  it('returns 201 with token on success', async () => {
    const mockResponse = {
      user: { id: 'user-1', email: 'test@example.com', role: 'DSL_DESIGNER', createdAt: new Date() },
      token: 'jwt-token',
      expiresIn: '7d',
    };
    authServiceMock.register.mockResolvedValue(mockResponse);

    const res = await request(buildApp())
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBe('jwt-token');
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(buildApp())
      .post('/api/auth/register')
      .send({ password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(buildApp())
      .post('/api/auth/register')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
  });

  it('returns 409 on duplicate email', async () => {
    authServiceMock.register.mockRejectedValue(
      new Error('User with this email already exists')
    );

    const res = await request(buildApp())
      .post('/api/auth/register')
      .send({ email: 'existing@example.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('User with this email already exists');
  });

  it('returns 400 on invalid email format', async () => {
    authServiceMock.register.mockRejectedValue(new Error('Invalid email format'));

    const res = await request(buildApp())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
  });

  it('returns 400 on weak password', async () => {
    authServiceMock.register.mockRejectedValue(
      new Error('Password must be at least 6 characters long')
    );

    const res = await request(buildApp())
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: '123' });

    expect(res.status).toBe(400);
  });

  it('returns 500 on unexpected error', async () => {
    authServiceMock.register.mockRejectedValue(new Error('Unexpected DB error'));

    const res = await request(buildApp())
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/login', () => {
  it('returns 200 with token on valid credentials', async () => {
    const mockResponse = {
      user: { id: 'user-1', email: 'test@example.com', role: 'DSL_DESIGNER', createdAt: new Date() },
      token: 'jwt-token',
      expiresIn: '7d',
    };
    authServiceMock.login.mockResolvedValue(mockResponse);

    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe('jwt-token');
  });

  it('returns 400 when fields are missing', async () => {
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
  });

  it('returns 401 on invalid credentials', async () => {
    authServiceMock.login.mockRejectedValue(new Error('Invalid email or password'));

    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns user info when authenticated', async () => {
    const token = makeValidToken();
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);
    authServiceMock.getUserById.mockResolvedValue({
      id: 'user-uuid-1',
      email: 'test@example.com',
      role: 'DSL_DESIGNER',
      createdAt: new Date(),
    });

    const res = await request(buildApp())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('test@example.com');
  });

  it('returns 401 without token', async () => {
    const res = await request(buildApp()).get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  it('returns 404 when user not found', async () => {
    const token = makeValidToken();
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);
    authServiceMock.getUserById.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/auth/change-password', () => {
  it('returns 200 on success', async () => {
    const token = makeValidToken();
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);
    authServiceMock.changePassword.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'oldpass', newPassword: 'newpass123' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password changed successfully');
  });

  it('returns 400 when fields missing', async () => {
    const token = makeValidToken();
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);

    const res = await request(buildApp())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'oldpass' });

    expect(res.status).toBe(400);
  });

  it('returns 400 on incorrect current password', async () => {
    const token = makeValidToken();
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);
    authServiceMock.changePassword.mockRejectedValue(new Error('Current password is incorrect'));

    const res = await request(buildApp())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrongpass', newPassword: 'newpass123' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/verify', () => {
  it('returns valid when token is valid', async () => {
    const token = makeValidToken();
    authServiceMock.verifyToken.mockReturnValue({
      userId: 'user-uuid-1',
      email: 'test@example.com',
      role: 'DSL_DESIGNER',
    });
    authServiceMock.getUserById.mockResolvedValue({
      id: 'user-uuid-1',
      email: 'test@example.com',
      role: 'DSL_DESIGNER',
      createdAt: new Date(),
    });

    const res = await request(buildApp())
      .post('/api/auth/verify')
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it('returns 400 when token is missing', async () => {
    const res = await request(buildApp())
      .post('/api/auth/verify')
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 401 when token is invalid', async () => {
    authServiceMock.verifyToken.mockImplementation(() => {
      throw new Error('jwt malformed');
    });

    const res = await request(buildApp())
      .post('/api/auth/verify')
      .send({ token: 'invalid.token' });

    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
  });
});
