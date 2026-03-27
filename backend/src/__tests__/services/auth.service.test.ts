import { prismaMock } from '../helpers/prisma.mock';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock PrismaClient used by the service via the singleton in config/database

// Mock bcrypt to speed up tests
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$hashed$password'),
  compare: jest.fn(),
}));

// Mock metametamodel service to avoid cascade
jest.mock('../../services/metametamodel.service', () => ({
  metametamodelService: {
    initializeCoreEcore: jest.fn().mockResolvedValue({}),
  },
}));

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

// Import after mocks are set up
import { authService } from '../../services/auth.service';

describe('AuthService', () => {
  const mockUser = {
    id: 'user-uuid-1',
    email: 'test@example.com',
    password: '$hashed$password',
    role: 'DSL_DESIGNER' as const,
    isSuspended: false,
    lastLogin: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  describe('register', () => {
    it('creates a new user and returns auth response', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(mockUser);

      const result = await authService.register({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'test@example.com',
            role: 'DSL_DESIGNER',
          }),
        })
      );
      expect(result.user.email).toBe('test@example.com');
      expect(result.token).toBeDefined();
      expect(result.expiresIn).toBeDefined();
    });

    it('throws error when email is already taken', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        authService.register({ email: 'test@example.com', password: 'password123' })
      ).rejects.toThrow('User with this email already exists');
    });

    it('throws error when email format is invalid', async () => {
      await expect(
        authService.register({ email: 'not-an-email', password: 'password123' })
      ).rejects.toThrow('Invalid email format');
    });

    it('throws error when password is too short', async () => {
      await expect(
        authService.register({ email: 'test@example.com', password: '12345' })
      ).rejects.toThrow('Password must be at least 6 characters long');
    });

    it('stores email in lowercase', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({ ...mockUser, email: 'test@example.com' });

      await authService.register({ email: 'TEST@EXAMPLE.COM', password: 'password123' });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('still succeeds if ePackage initialization fails', async () => {
      const { metametamodelService } = require('../../services/metametamodel.service');
      metametamodelService.initializeCoreEcore.mockRejectedValue(new Error('DB error'));

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(mockUser);

      const result = await authService.register({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.user.email).toBe('test@example.com');
    });
  });

  describe('login', () => {
    it('returns auth response on valid credentials', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.token).toBeDefined();
    });

    it('throws error when user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'unknown@example.com', password: 'password123' })
      ).rejects.toThrow('Invalid email or password');
    });

    it('throws error when password is wrong', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.login({ email: 'test@example.com', password: 'wrongpassword' })
      ).rejects.toThrow('Invalid email or password');
    });

    it('looks up email in lowercase', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await authService.login({ email: 'TEST@EXAMPLE.COM', password: 'password123' });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });
  });

  describe('getUserById', () => {
    it('returns user when found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await authService.getUserById('user-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.email).toBe('test@example.com');
    });

    it('returns null when user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await authService.getUserById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('changePassword', () => {
    it('changes password successfully', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prismaMock.user.update.mockResolvedValue({ ...mockUser, password: '$new$hashed' });

      await expect(
        authService.changePassword('user-uuid-1', 'currentpass', 'newpassword123')
      ).resolves.toBeUndefined();

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-uuid-1' },
          data: { password: '$hashed$password' },
        })
      );
    });

    it('throws error when user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.changePassword('nonexistent', 'current', 'newpass123')
      ).rejects.toThrow('User not found');
    });

    it('throws error when current password is incorrect', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.changePassword('user-uuid-1', 'wrongcurrent', 'newpass123')
      ).rejects.toThrow('Current password is incorrect');
    });

    it('throws error when new password is too short', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        authService.changePassword('user-uuid-1', 'currentpass', 'short')
      ).rejects.toThrow('Password must be at least 6 characters long');
    });
  });

  describe('verifyToken', () => {
    it('returns payload for valid token', () => {
      const token = jwt.sign(
        { userId: 'user-uuid-1', email: 'test@example.com', role: 'DSL_DESIGNER' },
        'test-jwt-secret-at-least-32-characters-long',
        { expiresIn: '1h' }
      );

      const payload = authService.verifyToken(token);

      expect(payload.userId).toBe('user-uuid-1');
      expect(payload.email).toBe('test@example.com');
    });

    it('throws for invalid token', () => {
      expect(() => authService.verifyToken('invalid.token.here')).toThrow();
    });

    it('throws for expired token', () => {
      const token = jwt.sign(
        { userId: 'user-uuid-1', email: 'test@example.com', role: 'DSL_DESIGNER' },
        'test-jwt-secret-at-least-32-characters-long',
        { expiresIn: -1 }
      );

      expect(() => authService.verifyToken(token)).toThrow();
    });
  });
});
