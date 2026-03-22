import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { UserRole } from '../../../shared/types';
import prisma from '../config/database';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

/**
 * Middleware to authenticate JWT tokens
 * Adds user info to request object if token is valid
 * Fetches current role from database to ensure role changes take effect immediately
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({ error: 'Authorization header required' });
      return;
    }
    
    // Expect format: "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.status(401).json({ error: 'Invalid authorization format. Use: Bearer <token>' });
      return;
    }
    
    const token = parts[1];
    
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
      
      // Fetch current role from database to ensure role changes take effect immediately
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { role: true },
      });
      
      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }
      
      // Use the current role from database, not the one from JWT
      req.user = {
        ...decoded,
        role: user.role as UserRole,
      };
      next();
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        res.status(401).json({ error: 'Token expired' });
        return;
      }
      if (err instanceof jwt.JsonWebTokenError) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }
      throw err;
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * Optional authentication - doesn't fail if no token provided
 * Useful for public endpoints that can optionally be personalized
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      next();
      return;
    }
    
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      try {
        const decoded = jwt.verify(parts[1], config.jwt.secret) as JwtPayload;
        
        // Fetch current role from database
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { role: true },
        });
        
        if (user) {
          req.user = {
            ...decoded,
            role: user.role as UserRole,
          };
        }
      } catch {
        // Token invalid but that's okay for optional auth
      }
    }
    
    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next();
  }
};
