import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { requireRole } from '../middleware/permissions';
import { sharingService } from '../services/sharing.service';
import { ResourceType, SharePermission } from '../../../shared/types';

const router = Router();

// Valid resource types for validation
const validResourceTypes: ResourceType[] = [
  'METAMODEL',
  'MODEL', 
  'DIAGRAM',
  'TRANSFORMATION_RULE',
  'CODEGEN_PROJECT',
  'TEST_CASE'
];

const isValidResourceType = (type: string): type is ResourceType => {
  return validResourceTypes.includes(type as ResourceType);
};

const isValidPermission = (perm: string): perm is SharePermission => {
  return perm === 'VIEWER' || perm === 'EDITOR';
};

/**
 * POST /api/share/:resourceType/:resourceId/share
 * Share a resource with another user by email
 */
router.post(
  '/:resourceType/:resourceId/share',
  requireRole('ADMIN', 'DSL_DESIGNER'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { resourceType, resourceId } = req.params;
      const { email, permission } = req.body;

      if (!isValidResourceType(resourceType)) {
        return res.status(400).json({ error: `Invalid resource type: ${resourceType}` });
      }

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }

      if (!permission || !isValidPermission(permission)) {
        return res.status(400).json({ error: 'Permission must be VIEWER or EDITOR' });
      }

      // Use cascading share to automatically share dependencies
      const result = await sharingService.shareResourceWithCascade(
        resourceType,
        resourceId,
        req.user!.userId,
        email,
        permission
      );

      let message = 'Resource shared successfully.';
      if (result.cascadedShares.length > 0) {
        message = `Resource shared successfully. Also shared ${result.cascadedShares.length} dependent resource(s).`;
      }
      if (result.warnings.length > 0) {
        message += ' ' + result.warnings.join(' ');
      }

      res.status(201).json({ 
        success: true, 
        data: result.mainShare,
        cascadedShares: result.cascadedShares,
        warnings: result.warnings,
        message
      });
    } catch (error: any) {
      console.error('Share resource error:', error);

      // Surface the ApiError reason (e.g. ownership, unknown email) instead
      // of a generic message the user cannot act on
      const status = error.statusCode || error.status;
      if (status) {
        return res.status(status).json({ error: error.message || 'Failed to share resource' });
      }

      res.status(500).json({ error: 'Failed to share resource' });
    }
  }
);

/**
 * DELETE /api/share/:resourceType/:resourceId/share/:userId
 * Remove sharing for a resource
 */
router.delete(
  '/:resourceType/:resourceId/share/:userId',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { resourceType, resourceId, userId } = req.params;

      if (!isValidResourceType(resourceType)) {
        return res.status(400).json({ error: `Invalid resource type: ${resourceType}` });
      }

      await sharingService.unshareResource(
        resourceType,
        resourceId,
        req.user!.userId,
        userId
      );

      res.json({ success: true, message: 'Resource unshared successfully' });
    } catch (error: any) {
      console.error('Unshare resource error:', error);

      const status = error.statusCode || error.status;
      if (status) {
        return res.status(status).json({ error: error.message || 'Failed to unshare resource' });
      }

      res.status(500).json({ error: 'Failed to unshare resource' });
    }
  }
);

/**
 * GET /api/share/:resourceType/:resourceId/shares
 * Get all users a resource is shared with
 */
router.get(
  '/:resourceType/:resourceId/shares',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { resourceType, resourceId } = req.params;

      if (!isValidResourceType(resourceType)) {
        return res.status(400).json({ error: `Invalid resource type: ${resourceType}` });
      }

      const shares = await sharingService.getResourceShares(
        resourceType,
        resourceId,
        req.user!.userId
      );

      res.json({ success: true, data: shares });
    } catch (error: any) {
      console.error('Get resource shares error:', error);

      const status = error.statusCode || error.status;
      if (status) {
        return res.status(status).json({ error: error.message || 'Failed to get shares' });
      }

      res.status(500).json({ error: 'Failed to get shares' });
    }
  }
);

/**
 * GET /api/share/shared-with-me
 * Get all resources shared with the current user
 */
router.get('/shared-with-me', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const shares = await sharingService.getResourcesSharedWithUser(req.user!.userId);
    res.json({ success: true, data: shares });
  } catch (error: any) {
    console.error('Get shared with me error:', error);
    res.status(500).json({ error: 'Failed to get shared resources' });
  }
});

/**
 * GET /api/share/:resourceType/:resourceId/access
 * Check current user's access level for a resource
 */
router.get(
  '/:resourceType/:resourceId/access',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { resourceType, resourceId } = req.params;

      if (!isValidResourceType(resourceType)) {
        return res.status(400).json({ error: `Invalid resource type: ${resourceType}` });
      }

      const effectivePermission = await sharingService.getEffectivePermission(
        resourceType,
        resourceId,
        req.user!.userId
      );

      res.json({ success: true, data: effectivePermission });
    } catch (error: any) {
      console.error('Check access error:', error);
      res.status(500).json({ error: 'Failed to check access' });
    }
  }
);

export default router;
