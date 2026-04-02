import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { roleRequestService } from '../services/roleRequest.service';

const router = Router();

/**
 * POST /api/role-requests
 * Submit a role upgrade request (any authenticated user)
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { requestedRole, reason } = req.body;

    if (!requestedRole || !reason) {
      return res.status(400).json({ error: 'requestedRole and reason are required' });
    }

    const request = await roleRequestService.createRequest(
      req.user!.userId,
      requestedRole,
      reason
    );

    res.status(201).json({ success: true, data: request });
  } catch (error: any) {
    console.error('Create role request error:', error);

    if (error.message.includes('already have a pending') ||
        error.message.includes('must be higher') ||
        error.message.includes('Cannot request ADMIN')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to create role request' });
  }
});

/**
 * GET /api/role-requests/my
 * Get current user's role requests
 */
router.get('/my', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requests = await roleRequestService.getMyRequests(req.user!.userId);
    res.json({ success: true, data: requests });
  } catch (error: any) {
    console.error('Get my role requests error:', error);
    res.status(500).json({ error: 'Failed to get role requests' });
  }
});

/**
 * GET /api/role-requests
 * List all role requests (ADMIN only)
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const status = req.query.status as string | undefined;
    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
    const filters = status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' } : undefined;

    const requests = await roleRequestService.getAllRequests(filters);
    res.json({ success: true, data: requests });
  } catch (error: any) {
    console.error('Get all role requests error:', error);
    res.status(500).json({ error: 'Failed to get role requests' });
  }
});

/**
 * PATCH /api/role-requests/:requestId
 * Approve or reject a role request (ADMIN only)
 */
router.patch('/:requestId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { approved, reviewNote } = req.body;

    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'approved (boolean) is required' });
    }

    const result = await roleRequestService.reviewRequest(
      req.params.requestId,
      req.user!.userId,
      approved,
      reviewNote
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Review role request error:', error);

    if (error.message.includes('not found') ||
        error.message.includes('already been reviewed')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to review role request' });
  }
});

export default router;
