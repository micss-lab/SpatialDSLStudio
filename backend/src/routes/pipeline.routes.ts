import { Router, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { AuthenticatedRequest, requireProjectCapability, validate } from '../middleware';
import { headlessPipelineService } from '../services';

const router = Router({ mergeParams: true });
const asyncHandler = (fn: Function) => (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/runs', requireProjectCapability('project.read'), asyncHandler(async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const runs = await headlessPipelineService.list(req.projectContext!.projectId);
  res.json({ success: true, data: runs });
}));

router.get(
  '/runs/:runId',
  requireProjectCapability('project.read'),
  validate([param('runId').isUUID().withMessage('Invalid run ID')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const run = await headlessPipelineService.get(req.projectContext!.projectId, req.params.runId);
    res.json({ success: true, data: run });
  })
);

router.post(
  '/runs',
  requireProjectCapability('pipeline.execute'),
  validate([
    body('name').isString().trim().notEmpty().withMessage('Pipeline name is required'),
    body('steps').isArray({ min: 1 }).withMessage('At least one pipeline step is required'),
    body('checkpointTag').optional().isString().trim().isLength({ min: 1, max: 100 }),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const run = await headlessPipelineService.run(
      req.projectContext!.projectId,
      req.body,
      req.user!.userId
    );
    res.status(201).json({ success: true, data: run });
  })
);

export default router;

