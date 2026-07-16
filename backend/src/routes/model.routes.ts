import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { validate, authenticate, AuthenticatedRequest } from '../middleware';
import { modelService } from '../services';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Async handler wrapper
const asyncHandler = (fn: Function) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * @route   GET /api/models
 * @desc    Get all models (owned + shared) or filter by metamodel ID
 */
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { metamodelId } = req.query;
  
  if (metamodelId && typeof metamodelId === 'string') {
    const models = await modelService.getByMetamodelId(metamodelId, req.user!.userId);
    return res.json({ success: true, data: models });
  }
  
  const models = await modelService.getAll(req.user!.userId);
  res.json({ success: true, data: models });
}));

/**
 * @route   GET /api/models/:id
 * @desc    Get a single model by ID
 */
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const model = await modelService.getById(req.params.id, req.user!.userId);
  if (!model) {
    return res.status(404).json({ success: false, error: 'Model not found' });
  }
  res.json({ success: true, data: model });
}));

/**
 * @route   POST /api/models
 * @desc    Create a new model (ADMIN/DSL_DESIGNER only)
 */
router.post(
  '/',
  validate([
    body('name').notEmpty().withMessage('Name is required'),
    body('metamodelId').notEmpty().withMessage('metamodelId is required'),
    body('conformsTo').notEmpty().withMessage('conformsTo is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const model = await modelService.create(req.body, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: model });
  })
);

/**
 * @route   PUT /api/models/:id
 * @desc    Update a model
 */
router.put(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const model = await modelService.update(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data: model });
  })
);

/**
 * @route   DELETE /api/models/:id
 * @desc    Delete a model (owner or admin)
 */
router.delete(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await modelService.delete(req.params.id, req.user!.userId, req.user!.role);
    res.json({ success: true, message: 'Model deleted successfully' });
  })
);

/**
 * @route   POST /api/models/:id/elements
 * @desc    Add an element to a model
 */
router.post(
  '/:id/elements',
  validate([
    param('id').isUUID().withMessage('Invalid model ID format'),
    body('id').notEmpty().withMessage('Element ID is required'),
    body('modelElementId').notEmpty().withMessage('modelElementId (metaclass ID) is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const model = await modelService.addElement(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: model });
  })
);

/**
 * @route   PUT /api/models/:id/elements/:elementId
 * @desc    Update an element in a model
 */
router.put(
  '/:id/elements/:elementId',
  validate([
    param('id').isUUID().withMessage('Invalid model ID format'),
    param('elementId').notEmpty().withMessage('Element ID is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const model = await modelService.updateElement(req.params.id, req.params.elementId, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data: model });
  })
);

/**
 * @route   PUT /api/models/:id/elements/:elementId/presentation
 * @desc    Update canonical presentation data for a model element
 */
router.put(
  '/:id/elements/:elementId/presentation',
  validate([
    param('id').isUUID().withMessage('Invalid model ID format'),
    param('elementId').notEmpty().withMessage('Element ID is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const model = await modelService.updateElementPresentation(
      req.params.id,
      req.params.elementId,
      req.body,
      req.user!.userId,
      req.user!.role
    );
    res.json({ success: true, data: model });
  })
);

/**
 * @route   DELETE /api/models/:id/elements/:elementId
 * @desc    Delete an element from a model
 */
router.delete(
  '/:id/elements/:elementId',
  validate([
    param('id').isUUID().withMessage('Invalid model ID format'),
    param('elementId').notEmpty().withMessage('Element ID is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const model = await modelService.deleteElement(req.params.id, req.params.elementId, req.user!.userId, req.user!.role);
    res.json({ success: true, data: model });
  })
);

/**
 * @route   POST /api/models/:id/connections
 * @desc    Add a connection to a model
 */
router.post(
  '/:id/connections',
  validate([
    param('id').isUUID().withMessage('Invalid model ID format'),
    body('id').notEmpty().withMessage('Connection ID is required'),
    body('sourceId').notEmpty().withMessage('Source ID is required'),
    body('targetId').notEmpty().withMessage('Target ID is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const model = await modelService.addConnection(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: model });
  })
);

/**
 * @route   DELETE /api/models/:id/connections/:connectionId
 * @desc    Delete a connection from a model
 */
router.delete(
  '/:id/connections/:connectionId',
  validate([
    param('id').isUUID().withMessage('Invalid model ID format'),
    param('connectionId').notEmpty().withMessage('Connection ID is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const model = await modelService.deleteConnection(req.params.id, req.params.connectionId, req.user!.userId, req.user!.role);
    res.json({ success: true, data: model });
  })
);

export default router;
