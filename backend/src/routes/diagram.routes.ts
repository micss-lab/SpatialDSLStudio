import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { validate, authenticate, AuthenticatedRequest } from '../middleware';
import { diagramService } from '../services';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Async handler wrapper
const asyncHandler = (fn: Function) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * @route   GET /api/diagrams
 * @desc    Get all diagrams (owned + shared) or filter by model ID
 */
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { modelId } = req.query;
  
  if (modelId && typeof modelId === 'string') {
    const diagrams = await diagramService.getByModelId(modelId, req.user!.userId);
    return res.json({ success: true, data: diagrams });
  }
  
  const diagrams = await diagramService.getAll(req.user!.userId);
  res.json({ success: true, data: diagrams });
}));

/**
 * @route   GET /api/diagrams/:id
 * @desc    Get a single diagram by ID
 */
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const diagram = await diagramService.getById(req.params.id, req.user!.userId);
  if (!diagram) {
    return res.status(404).json({ success: false, error: 'Diagram not found' });
  }
  res.json({ success: true, data: diagram });
}));

/**
 * @route   POST /api/diagrams
 * @desc    Create a new diagram (ADMIN/DSL_DESIGNER only)
 */
router.post(
  '/',
  validate([
    body('name').notEmpty().withMessage('Name is required'),
    body('modelId').notEmpty().withMessage('modelId is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const diagram = await diagramService.create(req.body, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: diagram });
  })
);

/**
 * @route   PUT /api/diagrams/:id
 * @desc    Update a diagram
 */
router.put(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const diagram = await diagramService.update(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data: diagram });
  })
);

/**
 * @route   DELETE /api/diagrams/:id
 * @desc    Delete a diagram (owner only)
 */
router.delete(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await diagramService.delete(req.params.id, req.user!.userId);
    res.json({ success: true, message: 'Diagram deleted successfully' });
  })
);

/**
 * @route   POST /api/diagrams/:id/elements
 * @desc    Add an element to a diagram
 */
router.post(
  '/:id/elements',
  validate([
    param('id').isUUID().withMessage('Invalid diagram ID format'),
    body('id').notEmpty().withMessage('Element ID is required'),
    body('type').isIn(['node', 'edge']).withMessage('Element type must be node or edge'),
    body('modelElementId').notEmpty().withMessage('modelElementId is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const diagram = await diagramService.addElement(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: diagram });
  })
);

/**
 * @route   PUT /api/diagrams/:id/elements/:elementId
 * @desc    Update an element in a diagram
 */
router.put(
  '/:id/elements/:elementId',
  validate([
    param('id').isUUID().withMessage('Invalid diagram ID format'),
    param('elementId').notEmpty().withMessage('Element ID is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const diagram = await diagramService.updateElement(req.params.id, req.params.elementId, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data: diagram });
  })
);

/**
 * @route   DELETE /api/diagrams/:id/elements/:elementId
 * @desc    Delete an element from a diagram
 */
router.delete(
  '/:id/elements/:elementId',
  validate([
    param('id').isUUID().withMessage('Invalid diagram ID format'),
    param('elementId').notEmpty().withMessage('Element ID is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const diagram = await diagramService.deleteElement(req.params.id, req.params.elementId, req.user!.userId, req.user!.role);
    res.json({ success: true, data: diagram });
  })
);

/**
 * @route   PUT /api/diagrams/:id/grid-settings
 * @desc    Update grid settings for a diagram
 */
router.put(
  '/:id/grid-settings',
  validate([
    param('id').isUUID().withMessage('Invalid diagram ID format'),
    body('sizeX').isNumeric().withMessage('sizeX must be a number'),
    body('sizeY').isNumeric().withMessage('sizeY must be a number'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const diagram = await diagramService.updateGridSettings(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data: diagram });
  })
);

export default router;
