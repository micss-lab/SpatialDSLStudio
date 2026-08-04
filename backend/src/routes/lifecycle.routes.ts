import { Router, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import {
  AuthenticatedRequest,
  requireProjectCapability,
  validate,
} from '../middleware';
import { projectCheckpointService } from '../services';

const router = Router({ mergeParams: true });
const asyncHandler = (fn: Function) => (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/graph', requireProjectCapability('project.read'), asyncHandler(async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const manifest = await projectCheckpointService.buildManifest(req.projectContext!.projectId);
  res.json({ success: true, data: manifest });
}));

router.get('/checkpoints', requireProjectCapability('project.read'), asyncHandler(async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const checkpoints = await projectCheckpointService.list(req.projectContext!.projectId);
  res.json({ success: true, data: checkpoints });
}));

router.post(
  '/checkpoints',
  requireProjectCapability('checkpoint.create'),
  validate([
    body('tag').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('message').optional().isString().trim().isLength({ max: 1000 }),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const checkpoint = await projectCheckpointService.create(
      req.projectContext!.projectId,
      req.user!.userId,
      req.body
    );
    res.status(201).json({ success: true, data: checkpoint });
  })
);

router.get(
  '/checkpoints/:checkpointId',
  requireProjectCapability('project.read'),
  validate([param('checkpointId').isUUID(), query('against').optional().isString()]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const checkpoint = await projectCheckpointService.get(
      req.projectContext!.projectId,
      req.params.checkpointId
    );
    res.json({ success: true, data: checkpoint });
  })
);

router.get(
  '/checkpoints/:checkpointId/diff',
  requireProjectCapability('project.read'),
  validate([param('checkpointId').isUUID(), query('against').optional().isString()]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const diff = await projectCheckpointService.diff(
      req.projectContext!.projectId,
      req.params.checkpointId,
      typeof req.query.against === 'string' ? req.query.against : undefined
    );
    res.json({ success: true, data: diff });
  })
);

router.post(
  '/checkpoints/:checkpointId/restore',
  requireProjectCapability('checkpoint.restore'),
  validate([
    param('checkpointId').isUUID(),
    body('confirmContentHash').isString().notEmpty(),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const manifest = await projectCheckpointService.restore(
      req.projectContext!.projectId,
      req.params.checkpointId,
      req.body.confirmContentHash
    );
    res.json({ success: true, data: manifest });
  })
);

export default router;
