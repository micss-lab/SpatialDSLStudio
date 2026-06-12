import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authService } from '../services/auth.service';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await authService.register({ email, password });
    res.status(201).json(result);
  } catch (error: any) {
    console.error('Register error:', error);
    
    // Handle known errors with appropriate status codes
    if (error.message === 'User with this email already exists') {
      return res.status(409).json({ error: error.message });
    }
    if (error.message === 'Invalid email format' || 
        error.message.includes('Password must be')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/verify-email
 * Verify a newly registered user's email code and return an auth token
 */
router.post('/verify-email', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }

    const result = await authService.verifyEmail(email, code);
    res.json(result);
  } catch (error: any) {
    console.error('Verify email error:', error);

    if (error.message === 'Invalid email format' ||
        error.message.includes('Verification code') ||
        error.message.includes('Invalid or expired')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Email verification failed' });
  }
});

/**
 * POST /api/auth/resend-verification-code
 * Resend a pending registration verification code
 */
router.post('/resend-verification-code', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    await authService.resendVerificationCode(email);
    res.json({ message: 'If this email has a pending account, a verification code has been sent.' });
  } catch (error: any) {
    console.error('Resend verification code error:', error);

    if (error.message === 'Invalid email format') {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'If this email has a pending account, a verification code has been sent.' });
  }
});

/**
 * POST /api/auth/login
 * Login existing user
 */
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await authService.login({ email, password });
    res.json(result);
  } catch (error: any) {
    console.error('Login error:', error);
    
    if (error.message === 'Invalid email or password') {
      return res.status(401).json({ error: error.message });
    }
    if (error.message === 'Email verification required') {
      return res.status(403).json({ error: error.message, verificationRequired: true });
    }
    
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info (requires authentication)
 */
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await authService.getUserById(req.user!.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user });
  } catch (error: any) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

/**
 * POST /api/auth/change-password
 * Change password (requires authentication)
 */
router.post('/change-password', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    await authService.changePassword(req.user!.userId, currentPassword, newPassword);
    res.json({ message: 'Password changed successfully' });
  } catch (error: any) {
    console.error('Change password error:', error);
    
    if (error.message === 'Current password is incorrect' ||
        error.message.includes('Password must be')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to change password' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Request a password reset email (public, rate-limited)
 */
router.post('/forgot-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    await authService.requestPasswordReset(email);
    // Always return success to prevent email enumeration
    res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (error: any) {
    console.error('Forgot password error:', error);
    res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password with token (public, rate-limited)
 */
router.post('/reset-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    await authService.resetPassword(token, newPassword);
    res.json({ message: 'Password has been reset successfully.' });
  } catch (error: any) {
    console.error('Reset password error:', error);

    if (error.message.includes('Password must be') ||
        error.message.includes('Invalid or expired') ||
        error.message.includes('already been used')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to reset password' });
  }
});

/**
 * POST /api/auth/verify
 * Verify a token is still valid
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const payload = authService.verifyToken(token);
    const user = await authService.getUserById(payload.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    res.json({ valid: true, user });
  } catch (error: any) {
    console.error('Token verify error:', error);
    res.status(401).json({ valid: false, error: 'Invalid or expired token' });
  }
});

export default router;
