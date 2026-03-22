import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { requireRole } from '../middleware/permissions';
import { adminService } from '../services/admin.service';
import { UserRole, ResourceType } from '../../../shared/types';

const router = Router();

// All admin routes require ADMIN role
router.use(requireRole('ADMIN'));

// ============================================
// User Management Endpoints
// ============================================

/**
 * GET /api/admin/users
 * Get paginated list of users with resource counts
 */
router.get('/users', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      page = '1',
      pageSize = '20',
      search,
      role,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const result = await adminService.getUsers({
      page: parseInt(page as string, 10),
      pageSize: parseInt(pageSize as string, 10),
      search: search as string | undefined,
      role: role as UserRole | undefined,
      sortBy: sortBy as 'email' | 'createdAt' | 'role',
      sortOrder: sortOrder as 'asc' | 'desc',
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Get users error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to get users',
    });
  }
});

/**
 * GET /api/admin/users/:userId
 * Get single user details
 */
router.get('/users/:userId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await adminService.getUserById(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: user });
  } catch (error: any) {
    console.error('Get user error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to get user',
    });
  }
});

/**
 * PATCH /api/admin/users/:userId/role
 * Change user role
 */
router.patch('/users/:userId/role', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role || !['ADMIN', 'DSL_DESIGNER', 'MODELER', 'VIEWER'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    const user = await adminService.changeUserRole(req.user!.userId, userId, role);
    res.json({ success: true, data: user });
  } catch (error: any) {
    console.error('Change role error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to change role',
    });
  }
});

/**
 * POST /api/admin/users/:userId/reset-password
 * Admin-initiated password reset
 */
router.post('/users/:userId/reset-password', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ success: false, error: 'New password is required' });
    }

    await adminService.resetUserPassword(req.user!.userId, userId, newPassword);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error: any) {
    console.error('Reset password error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to reset password',
    });
  }
});

/**
 * DELETE /api/admin/users/:userId
 * Delete user and optionally reassign resources
 */
router.delete('/users/:userId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { reassignToUserId } = req.body || {};

    const result = await adminService.deleteUser(
      req.user!.userId,
      userId,
      reassignToUserId as string | undefined
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Delete user error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to delete user',
    });
  }
});

/**
 * POST /api/admin/users/bulk/role
 * Bulk change user roles
 */
router.post('/users/bulk/role', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userIds, role } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, error: 'User IDs are required' });
    }

    if (!role || !['ADMIN', 'DSL_DESIGNER', 'MODELER', 'VIEWER'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    const count = await adminService.bulkChangeRole(req.user!.userId, userIds, role);
    res.json({ success: true, data: { updatedCount: count } });
  } catch (error: any) {
    console.error('Bulk role change error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to change roles',
    });
  }
});

/**
 * POST /api/admin/users/bulk/delete
 * Bulk delete users
 */
router.post('/users/bulk/delete', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, error: 'User IDs are required' });
    }

    const count = await adminService.bulkDeleteUsers(req.user!.userId, userIds);
    res.json({ success: true, data: { deletedCount: count } });
  } catch (error: any) {
    console.error('Bulk delete error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to delete users',
    });
  }
});

// ============================================
// Resource Statistics & Dashboard
// ============================================

/**
 * GET /api/admin/stats
 * Get resource statistics for dashboard
 */
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await adminService.getResourceStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    console.error('Get stats error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to get statistics',
    });
  }
});

// ============================================
// Resource Management
// ============================================

/**
 * GET /api/admin/resources
 * Get paginated list of all resources
 */
router.get('/resources', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      page = '1',
      pageSize = '20',
      search,
      type,
      userId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const result = await adminService.getResources({
      page: parseInt(page as string, 10),
      pageSize: parseInt(pageSize as string, 10),
      search: search as string | undefined,
      type: type as ResourceType | undefined,
      userId: userId as string | undefined,
      sortBy: sortBy as 'name' | 'createdAt' | 'updatedAt' | 'type' | 'userEmail',
      sortOrder: sortOrder as 'asc' | 'desc',
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Get resources error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to get resources',
    });
  }
});

/**
 * GET /api/admin/resources/:type/:resourceId
 * Get resource details for preview
 */
router.get('/resources/:type/:resourceId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, resourceId } = req.params;
    const resource = await adminService.getResourceDetails(type as ResourceType, resourceId);

    if (!resource) {
      return res.status(404).json({ success: false, error: 'Resource not found' });
    }

    res.json({ success: true, data: resource });
  } catch (error: any) {
    console.error('Get resource details error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to get resource details',
    });
  }
});

/**
 * DELETE /api/admin/resources/:type/:resourceId
 * Delete a resource
 */
router.delete('/resources/:type/:resourceId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, resourceId } = req.params;
    await adminService.deleteResource(type as ResourceType, resourceId);
    res.json({ success: true, message: 'Resource deleted' });
  } catch (error: any) {
    console.error('Delete resource error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to delete resource',
    });
  }
});

/**
 * POST /api/admin/resources/:type/:resourceId/transfer
 * Transfer resource ownership
 */
router.post('/resources/:type/:resourceId/transfer', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, resourceId } = req.params;
    const { newOwnerId } = req.body;

    if (!newOwnerId) {
      return res.status(400).json({ success: false, error: 'New owner ID is required' });
    }

    await adminService.transferResourceOwnership(type as ResourceType, resourceId, newOwnerId);
    res.json({ success: true, message: 'Ownership transferred' });
  } catch (error: any) {
    console.error('Transfer ownership error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to transfer ownership',
    });
  }
});

/**
 * POST /api/admin/resources/:type/:resourceId/unshare
 * Force unshare a resource
 */
router.post('/resources/:type/:resourceId/unshare', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, resourceId } = req.params;
    const count = await adminService.forceUnshareResource(type as ResourceType, resourceId);
    res.json({ success: true, data: { removedSharesCount: count } });
  } catch (error: any) {
    console.error('Force unshare error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to unshare resource',
    });
  }
});

// ============================================
// System Monitoring
// ============================================

/**
 * GET /api/admin/health
 * Get system health information
 */
router.get('/health', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const health = await adminService.getSystemHealth();
    res.json({ success: true, data: health });
  } catch (error: any) {
    console.error('Get health error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to get health status',
    });
  }
});

export default router;
