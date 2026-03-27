import { prismaMock } from '../helpers/prisma.mock';
import { Request, Response, NextFunction } from 'express';
import { errorHandler, notFoundHandler, ApiError } from '../../middleware/errorHandler';

describe('errorHandler middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    process.env.NODE_ENV = 'test';
  });

  it('handles ApiError with correct status code', () => {
    const err = new ApiError(404, 'Resource not found');

    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Resource not found',
    });
  });

  it('handles ApiError 400', () => {
    const err = new ApiError(400, 'Bad request');

    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('handles ApiError 403', () => {
    const err = new ApiError(403, 'Forbidden');

    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('handles Prisma P2002 (unique constraint) error as 409', () => {
    const err = Object.assign(new Error('Unique constraint'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
    });

    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'A record with this value already exists',
    });
  });

  it('handles Prisma P2025 (record not found) error as 404', () => {
    const err = Object.assign(new Error('Record not found'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2025',
    });

    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Record not found',
    });
  });

  it('handles ValidationError as 400', () => {
    const err = Object.assign(new Error('Invalid input'), {
      name: 'ValidationError',
    });

    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid input',
    });
  });

  it('handles unknown errors as 500', () => {
    const err = new Error('Something broke');

    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Internal server error',
    });
  });

  it('exposes error message in development mode', () => {
    process.env.NODE_ENV = 'development';
    const err = new Error('Detailed error message');

    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Detailed error message',
    });
  });
});

describe('notFoundHandler', () => {
  it('returns 404 with method and URL', () => {
    const req = {
      method: 'GET',
      originalUrl: '/api/nonexistent',
    } as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot GET /api/nonexistent',
    });
  });
});

describe('ApiError', () => {
  it('creates error with correct properties', () => {
    const err = new ApiError(422, 'Unprocessable Entity');

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(422);
    expect(err.message).toBe('Unprocessable Entity');
    expect(err.isOperational).toBe(true);
  });

  it('allows setting isOperational to false', () => {
    const err = new ApiError(500, 'System error', false);

    expect(err.isOperational).toBe(false);
  });
});
