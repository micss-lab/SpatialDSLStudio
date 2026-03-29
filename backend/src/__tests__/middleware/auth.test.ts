import { prismaMock } from '../helpers/prisma.mock';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';


beforeEach(() => {
  mockReset(prismaMock);
});

import { authenticate, optionalAuth } from '../../middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET!;

function makeToken(payload = {}, secret = JWT_SECRET) {
  return jwt.sign(
    { userId: 'user-uuid-1', email: 'test@example.com', role: 'DSL_DESIGNER', ...payload },
    secret,
    { expiresIn: '1h' }
  );
}

function makeExpiredToken() {
  return jwt.sign(
    { userId: 'user-uuid-1', email: 'test@example.com', role: 'DSL_DESIGNER' },
    JWT_SECRET,
    { expiresIn: -1 }
  );
}

describe('authenticate middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('calls next() with valid token and user in database', async () => {
    const token = makeToken();
    req.headers = { authorization: `Bearer ${token}` };
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);

    await authenticate(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).user).toBeDefined();
    expect((req as any).user.userId).toBe('user-uuid-1');
  });

  it('returns 401 when no authorization header', async () => {
    req.headers = {};

    await authenticate(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when authorization format is wrong (no Bearer)', async () => {
    req.headers = { authorization: 'Token abc123' };

    await authenticate(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when token is expired', async () => {
    const token = makeExpiredToken();
    req.headers = { authorization: `Bearer ${token}` };

    await authenticate(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Token expired' }));
  });

  it('returns 401 when token is invalid', async () => {
    req.headers = { authorization: 'Bearer not.a.valid.token' };

    await authenticate(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid token' }));
  });

  it('returns 401 when user not found in database', async () => {
    const token = makeToken();
    req.headers = { authorization: `Bearer ${token}` };
    prismaMock.user.findUnique.mockResolvedValue(null);

    await authenticate(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'User not found' }));
  });

  it('uses role from database, not token', async () => {
    const token = makeToken({ role: 'DSL_DESIGNER' });
    req.headers = { authorization: `Bearer ${token}` };
    prismaMock.user.findUnique.mockResolvedValue({ role: 'ADMIN' } as any);

    await authenticate(req as any, res as any, next);

    expect((req as any).user.role).toBe('ADMIN');
  });

  it('returns 500 on unexpected error', async () => {
    const token = makeToken();
    req.headers = { authorization: `Bearer ${token}` };
    prismaMock.user.findUnique.mockRejectedValue(new Error('DB Connection failed'));

    await authenticate(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('optionalAuth middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { headers: {} };
    res = {};
    next = jest.fn();
  });

  it('calls next() without token', async () => {
    req.headers = {};

    await optionalAuth(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).user).toBeUndefined();
  });

  it('sets user when valid token provided', async () => {
    const token = makeToken();
    req.headers = { authorization: `Bearer ${token}` };
    prismaMock.user.findUnique.mockResolvedValue({ role: 'DSL_DESIGNER' } as any);

    await optionalAuth(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).user).toBeDefined();
  });

  it('calls next() even with invalid token (graceful)', async () => {
    req.headers = { authorization: 'Bearer invalid.token' };

    await optionalAuth(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).user).toBeUndefined();
  });
});
