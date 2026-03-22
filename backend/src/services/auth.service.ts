import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import config from '../config';
import { JwtPayload } from '../middleware/auth';
import { UserRole } from '../../../shared/types';
import { metametamodelService } from './metametamodel.service';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    role: UserRole;
    createdAt: Date;
  };
  token: string;
  expiresIn: string;
}

class AuthService {
  /**
   * Validate email format
   */
  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   */
  private validatePassword(password: string): { valid: boolean; message?: string } {
    if (password.length < 6) {
      return { valid: false, message: 'Password must be at least 6 characters long' };
    }
    return { valid: true };
  }

  /**
   * Generate JWT token for user
   */
  private generateToken(user: { id: string; email: string; role: string }): string {
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
    });
  }

  /**
   * Register a new user
   */
  async register(input: RegisterInput): Promise<AuthResponse> {
    const { email, password } = input;

    // Validate email format
    if (!this.validateEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Validate password
    const passwordValidation = this.validatePassword(password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.message);
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user with default DSL_DESIGNER role
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        role: 'DSL_DESIGNER',
      },
    });

    // Initialize core ePackage for the new user
    try {
      await metametamodelService.initializeCoreEcore(user.id);
    } catch (error) {
      console.error('Error initializing core ePackage for new user:', error);
      // Don't fail registration if ePackage init fails - user can still use the app
    }

    // Generate token
    const token = this.generateToken(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role as UserRole,
        createdAt: user.createdAt,
      },
      token,
      expiresIn: config.jwt.expiresIn,
    };
  }

  /**
   * Login existing user
   */
  async login(input: LoginInput): Promise<AuthResponse> {
    const { email, password } = input;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Generate token
    const token = this.generateToken(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role as UserRole,
        createdAt: user.createdAt,
      },
      token,
      expiresIn: config.jwt.expiresIn,
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<{ id: string; email: string; role: UserRole; createdAt: Date } | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) return null;

    return {
      ...user,
      role: user.role as UserRole,
    };
  }

  /**
   * Change password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    // Validate new password
    const passwordValidation = this.validatePassword(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.message);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }

  /**
   * Verify token and return payload
   */
  verifyToken(token: string): JwtPayload {
    return jwt.verify(token, config.jwt.secret) as JwtPayload;
  }
}

export const authService = new AuthService();
