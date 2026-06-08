import { Router, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { validate, AuthenticatedRequest } from '../middleware';
import { viewpointService } from '../services';

const router = Router();

const asyncHandler = (fn: Function) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

router.get(
  '/',
  validate([
    query('metamodelId').optional().isString().withMessage('metamodelId must be a string'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const metamodelId = typeof req.query.metamodelId === 'string' ? req.query.metamodelId : undefined;
    const viewpoints = await viewpointService.getAll(req.user!.userId, metamodelId);
    res.json({ success: true, data: viewpoints });
  })
);

router.get(
  '/default',
  validate([
    query('metamodelId').notEmpty().withMessage('metamodelId is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const viewpoint = await viewpointService.getDefaultForMetamodel(
      req.query.metamodelId as string,
      req.user!.userId
    );
    res.json({ success: true, data: viewpoint });
  })
);

router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const viewpoint = await viewpointService.getById(req.params.id, req.user!.userId);
  if (!viewpoint) {
    return res.status(404).json({ success: false, error: 'Viewpoint not found' });
  }

  res.json({ success: true, data: viewpoint });
}));

router.post(
  '/',
  validate([
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('metamodelId').notEmpty().withMessage('metamodelId is required'),
    body('isDefault').optional().isBoolean().withMessage('isDefault must be a boolean'),
    body('representationDescriptions').optional().isArray().withMessage('representationDescriptions must be an array'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const viewpoint = await viewpointService.create(req.body, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: viewpoint });
  })
);

router.put(
  '/:id',
  validate([
    param('id').notEmpty().withMessage('id is required'),
    body('name').optional().trim().notEmpty().withMessage('Name is required'),
    body('isDefault').optional().isBoolean().withMessage('isDefault must be a boolean'),
    body('representationDescriptions').optional().isArray().withMessage('representationDescriptions must be an array'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const viewpoint = await viewpointService.update(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data: viewpoint });
  })
);

router.delete(
  '/:id',
  validate([param('id').notEmpty().withMessage('id is required')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await viewpointService.delete(req.params.id, req.user!.userId, req.user!.role);
    res.json({ success: true, message: 'Viewpoint deleted successfully' });
  })
);

router.get(
  '/:id/representation-descriptions',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const viewpoint = await viewpointService.getById(req.params.id, req.user!.userId);
    if (!viewpoint) {
      return res.status(404).json({ success: false, error: 'Viewpoint not found' });
    }

    res.json({ success: true, data: viewpoint.representationDescriptions });
  })
);

router.post(
  '/:id/representation-descriptions',
  validate([
    param('id').notEmpty().withMessage('id is required'),
    body('id').optional().isString().withMessage('id must be a string'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('kind').isIn(['diagram', 'table', 'tree']).withMessage('kind must be diagram, table, or tree'),
    body('visibleMetaClassIds').optional().isArray().withMessage('visibleMetaClassIds must be an array'),
    body('creatableMetaClassIds').optional().isArray().withMessage('creatableMetaClassIds must be an array'),
    body('pinMappings').optional().isArray().withMessage('pinMappings must be an array'),
    body('isDefault').optional().isBoolean().withMessage('isDefault must be a boolean'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const viewpoint = await viewpointService.addRepresentationDescription(
      req.params.id,
      req.body,
      req.user!.userId,
      req.user!.role
    );
    res.status(201).json({ success: true, data: viewpoint });
  })
);

router.put(
  '/:id/representation-descriptions/:representationDescriptionId',
  validate([
    param('id').notEmpty().withMessage('id is required'),
    param('representationDescriptionId').notEmpty().withMessage('representationDescriptionId is required'),
    body('id').optional().isString().withMessage('id must be a string'),
    body('name').optional().trim().notEmpty().withMessage('Name is required'),
    body('kind').optional().isIn(['diagram', 'table', 'tree']).withMessage('kind must be diagram, table, or tree'),
    body('visibleMetaClassIds').optional().isArray().withMessage('visibleMetaClassIds must be an array'),
    body('creatableMetaClassIds').optional().isArray().withMessage('creatableMetaClassIds must be an array'),
    body('pinMappings').optional().isArray().withMessage('pinMappings must be an array'),
    body('isDefault').optional().isBoolean().withMessage('isDefault must be a boolean'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const viewpoint = await viewpointService.updateRepresentationDescription(
      req.params.id,
      req.params.representationDescriptionId,
      req.body,
      req.user!.userId,
      req.user!.role
    );
    res.json({ success: true, data: viewpoint });
  })
);

router.delete(
  '/:id/representation-descriptions/:representationDescriptionId',
  validate([
    param('id').notEmpty().withMessage('id is required'),
    param('representationDescriptionId').notEmpty().withMessage('representationDescriptionId is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const viewpoint = await viewpointService.deleteRepresentationDescription(
      req.params.id,
      req.params.representationDescriptionId,
      req.user!.userId,
      req.user!.role
    );
    res.json({ success: true, data: viewpoint });
  })
);

export default router;
