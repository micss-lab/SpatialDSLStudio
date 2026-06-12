import { Router, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthenticatedRequest, validate } from '../middleware';
import { siriusInteropService } from '../services';

const router = Router();

const asyncHandler = (fn: Function) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

router.post(
  '/sirius/validate',
  validate([
    body('content').isString().notEmpty().withMessage('content is required'),
    body('sourceFormat').optional().isIn(['ecore', 'xmi', 'odesign', 'aird', 'project-zip']),
    body('metamodelId').optional().isString().withMessage('metamodelId must be a string'),
    body('options').optional().isObject().withMessage('options must be an object'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const preview = await siriusInteropService.validate(req.body, req.user!.userId);
    res.json({ success: true, data: preview });
  })
);

router.post(
  '/sirius/import',
  validate([
    body('content').isString().notEmpty().withMessage('content is required'),
    body('metamodelId').isString().notEmpty().withMessage('metamodelId is required'),
    body('options').optional().isObject().withMessage('options must be an object'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await siriusInteropService.importOdesign(req.body, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: result });
  })
);

router.post(
  '/sirius/export',
  validate([
    body('metamodelId').isString().notEmpty().withMessage('metamodelId is required'),
    body('viewpointIds').optional().isArray().withMessage('viewpointIds must be an array'),
    body('options').optional().isObject().withMessage('options must be an object'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await siriusInteropService.exportOdesign(req.body, req.user!.userId);
    res.json({ success: true, data: result });
  })
);

export default router;
