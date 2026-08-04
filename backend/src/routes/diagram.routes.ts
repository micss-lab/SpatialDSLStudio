import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { validate, authenticate, AuthenticatedRequest, projectResourceParam, projectArgs } from '../middleware';
import { diagramService } from '../services';
import { validatePresentation } from '../../../shared/spatial';
import { requireNoSpatialErrors, spatialElementErrors } from '../middleware/presentationValidation';

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(authenticate);
router.param('id', projectResourceParam('diagram'));

// Async handler wrapper
const asyncHandler = (fn: Function) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const attachmentSides = ['top', 'right', 'bottom', 'left'];

/**
 * @route   GET /api/diagrams
 * @desc    Get all diagrams (owned + shared) or filter by model ID
 */
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { modelId } = req.query;
  
  if (modelId && typeof modelId === 'string') {
    const diagrams = await diagramService.getByModelId(modelId, req.user!.userId, ...projectArgs(req));
    return res.json({ success: true, data: diagrams });
  }
  
  const diagrams = await diagramService.getAll(req.user!.userId, ...projectArgs(req));
  res.json({ success: true, data: diagrams });
}));

/**
 * @route   GET /api/diagrams/:id
 * @desc    Get a single diagram by ID
 */
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const diagram = await diagramService.getById(req.params.id, req.user!.userId, ...projectArgs(req));
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
    body('viewpointId').optional().isString().withMessage('viewpointId must be a string'),
    body('representationDescriptionId').optional().isString().withMessage('representationDescriptionId must be a string'),
    body('elements').optional().isArray().withMessage('elements must be an array'),
    body('elements').optional().custom((elements: unknown[]) => requireNoSpatialErrors(
      elements.flatMap((element, index) => spatialElementErrors(element, `elements[${index}]`))
    )),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const diagram = await diagramService.create(req.body, req.user!.userId, req.user!.role, ...projectArgs(req));
    res.status(201).json({ success: true, data: diagram });
  })
);

/**
 * @route   PUT /api/diagrams/:id
 * @desc    Update a diagram
 */
router.put(
  '/:id',
  validate([
    param('id').isUUID().withMessage('Invalid ID format'),
    body('viewpointId').optional().isString().withMessage('viewpointId must be a string'),
    body('representationDescriptionId').optional().isString().withMessage('representationDescriptionId must be a string'),
    body('elements').optional().isArray().withMessage('elements must be an array'),
    body('elements').optional().custom((elements: unknown[]) => requireNoSpatialErrors(
      elements.flatMap((element, index) => spatialElementErrors(element, `elements[${index}]`))
    )),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const diagram = await diagramService.update(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data: diagram });
  })
);

/**
 * @route   DELETE /api/diagrams/:id
 * @desc    Delete a diagram (owner or admin)
 */
router.delete(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await diagramService.delete(req.params.id, req.user!.userId, req.user!.role, ...projectArgs(req));
    res.json({ success: true, message: 'Diagram deleted successfully' });
  })
);

/**
 * @route   POST /api/diagrams/:id/model-elements
 * @desc    Add an existing model element to a view
 */
router.post(
  '/:id/model-elements',
  validate([
    param('id').isUUID().withMessage('Invalid view ID format'),
    body('modelElementId').notEmpty().withMessage('modelElementId is required'),
    body('presentation').optional().isObject().withMessage('presentation must be an object'),
    body('presentation').optional().custom(value => requireNoSpatialErrors(validatePresentation(value))),
    body('presentation.attachedToElementId').optional().isString().trim().notEmpty().withMessage('attachedToElementId must be a non-empty string'),
    body('presentation.attachmentSide').optional().isIn(attachmentSides).withMessage('attachmentSide must be top, right, bottom, or left'),
    body('presentation.attachmentOffsetRatio').optional().isFloat({ min: 0, max: 1 }).withMessage('attachmentOffsetRatio must be between 0 and 1').toFloat(),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const diagram = await diagramService.addModelElementToView(
      req.params.id,
      req.body.modelElementId,
      req.user!.userId,
      req.user!.role,
      req.body.presentation
    );
    res.status(201).json({ success: true, data: diagram });
  })
);

/**
 * @route   POST /api/diagrams/:id/model-elements/create
 * @desc    Create a model element and include it in the current view
 */
router.post(
  '/:id/model-elements/create',
  validate([
    param('id').isUUID().withMessage('Invalid view ID format'),
    body('metaClassId').notEmpty().withMessage('metaClassId is required'),
    body('presentation').optional().isObject().withMessage('presentation must be an object'),
    body('presentation').optional().custom(value => requireNoSpatialErrors(validatePresentation(value))),
    body('presentation.attachedToElementId').optional().isString().trim().notEmpty().withMessage('attachedToElementId must be a non-empty string'),
    body('presentation.attachmentSide').optional().isIn(attachmentSides).withMessage('attachmentSide must be top, right, bottom, or left'),
    body('presentation.attachmentOffsetRatio').optional().isFloat({ min: 0, max: 1 }).withMessage('attachmentOffsetRatio must be between 0 and 1').toFloat(),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await diagramService.createModelElementInView(
      req.params.id,
      req.body.metaClassId,
      req.user!.userId,
      req.user!.role,
      req.body.presentation,
      req.body.style
    );
    res.status(201).json({ success: true, data: result });
  })
);

/**
 * @route   POST /api/diagrams/:id/model-elements/add-all
 * @desc    Include every remaining model element in a view
 */
router.post(
  '/:id/model-elements/add-all',
  validate([param('id').isUUID().withMessage('Invalid view ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const diagram = await diagramService.addAllModelElementsToView(req.params.id, req.user!.userId, req.user!.role);
    res.json({ success: true, data: diagram });
  })
);

/**
 * @route   PUT /api/diagrams/:id/model-elements/:modelElementId/presentation
 * @desc    Update canonical model presentation data from a view
 */
router.put(
  '/:id/model-elements/:modelElementId/presentation',
  validate([
    param('id').isUUID().withMessage('Invalid view ID format'),
    param('modelElementId').notEmpty().withMessage('modelElementId is required'),
    body().custom(value => requireNoSpatialErrors(validatePresentation(value))),
    body('attachedToElementId').optional().isString().trim().notEmpty().withMessage('attachedToElementId must be a non-empty string'),
    body('attachmentSide').optional().isIn(attachmentSides).withMessage('attachmentSide must be top, right, bottom, or left'),
    body('attachmentOffsetRatio').optional().isFloat({ min: 0, max: 1 }).withMessage('attachmentOffsetRatio must be between 0 and 1').toFloat(),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const diagram = await diagramService.updateModelPresentation(
      req.params.id,
      req.params.modelElementId,
      req.body,
      req.user!.userId,
      req.user!.role
    );
    res.json({ success: true, data: diagram });
  })
);

/**
 * @route   DELETE /api/diagrams/:id/model-elements/:modelElementId
 * @desc    Remove a model element from a view without deleting the model element
 */
router.delete(
  '/:id/model-elements/:modelElementId',
  validate([
    param('id').isUUID().withMessage('Invalid view ID format'),
    param('modelElementId').notEmpty().withMessage('modelElementId is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const diagram = await diagramService.removeModelElementFromView(
      req.params.id,
      req.params.modelElementId,
      req.user!.userId,
      req.user!.role
    );
    res.json({ success: true, data: diagram });
  })
);

/**
 * @route   POST /api/diagrams/:id/elements
 * @desc    Compatibility route to add an element to a view
 */
router.post(
  '/:id/elements',
  validate([
    param('id').isUUID().withMessage('Invalid diagram ID format'),
    body('id').notEmpty().withMessage('Element ID is required'),
    body('type').isIn(['node', 'edge']).withMessage('Element type must be node or edge'),
    body('modelElementId').notEmpty().withMessage('modelElementId is required'),
    body('attachedToElementId').optional().isString().trim().notEmpty().withMessage('attachedToElementId must be a non-empty string'),
    body('attachmentSide').optional().isIn(attachmentSides).withMessage('attachmentSide must be top, right, bottom, or left'),
    body('attachmentOffsetRatio').optional().isFloat({ min: 0, max: 1 }).withMessage('attachmentOffsetRatio must be between 0 and 1').toFloat(),
    body('style.attachedToElementId').optional().isString().trim().notEmpty().withMessage('style.attachedToElementId must be a non-empty string'),
    body('style.attachmentSide').optional().isIn(attachmentSides).withMessage('style.attachmentSide must be top, right, bottom, or left'),
    body('style.attachmentOffsetRatio').optional().isFloat({ min: 0, max: 1 }).withMessage('style.attachmentOffsetRatio must be between 0 and 1').toFloat(),
    body().custom(value => requireNoSpatialErrors(spatialElementErrors(value))),
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
    body('attachedToElementId').optional().isString().trim().notEmpty().withMessage('attachedToElementId must be a non-empty string'),
    body('attachmentSide').optional().isIn(attachmentSides).withMessage('attachmentSide must be top, right, bottom, or left'),
    body('attachmentOffsetRatio').optional().isFloat({ min: 0, max: 1 }).withMessage('attachmentOffsetRatio must be between 0 and 1').toFloat(),
    body('style.attachedToElementId').optional().isString().trim().notEmpty().withMessage('style.attachedToElementId must be a non-empty string'),
    body('style.attachmentSide').optional().isIn(attachmentSides).withMessage('style.attachmentSide must be top, right, bottom, or left'),
    body('style.attachmentOffsetRatio').optional().isFloat({ min: 0, max: 1 }).withMessage('style.attachmentOffsetRatio must be between 0 and 1').toFloat(),
    body().custom(value => requireNoSpatialErrors(spatialElementErrors(value))),
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
