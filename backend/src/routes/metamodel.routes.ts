import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import {
  validate,
  authenticate,
  AuthenticatedRequest,
  projectResourceParam,
  projectArgs,
  requireProjectCapability,
  ApiError,
} from '../middleware';
import { metamodelEvolutionService, metamodelService } from '../services';

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(authenticate);
router.param('id', projectResourceParam('metamodel'));

// Async handler wrapper
const asyncHandler = (fn: Function) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * @route   GET /api/metamodels
 * @desc    Get all metamodels (owned + shared)
 */
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const metamodels = await metamodelService.getAll(req.user!.userId, ...projectArgs(req));
  res.json({ success: true, data: metamodels });
}));

router.post(
  '/:id/evolution/preview',
  requireProjectCapability('metamodel.evolve'),
  validate([
    param('id').isUUID().withMessage('Invalid metamodel ID format'),
    body('nextMetamodel').isObject().withMessage('nextMetamodel is required'),
    body('rules').optional().isArray(),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.projectContext) throw new ApiError(400, 'Metamodel evolution requires a project-scoped route');
    const report = await metamodelEvolutionService.preview(
      req.projectContext.projectId,
      req.params.id,
      req.body.nextMetamodel,
      req.body.rules || []
    );
    res.json({ success: true, data: report });
  })
);

router.post(
  '/:id/evolution/apply',
  requireProjectCapability('metamodel.evolve'),
  validate([
    param('id').isUUID().withMessage('Invalid metamodel ID format'),
    body('nextMetamodel').isObject().withMessage('nextMetamodel is required'),
    body('expectedSourceHash').isString().notEmpty(),
    body('rules').optional().isArray(),
    body('checkpointTag').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('message').optional().isString().trim().isLength({ max: 1000 }),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.projectContext) throw new ApiError(400, 'Metamodel evolution requires a project-scoped route');
    const result = await metamodelEvolutionService.apply(
      req.projectContext.projectId,
      req.params.id,
      req.body,
      req.user!.userId
    );
    res.json({ success: true, data: result });
  })
);

router.get(
  '/:id/evolution/migrations',
  requireProjectCapability('project.read'),
  validate([param('id').isUUID().withMessage('Invalid metamodel ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.projectContext) throw new ApiError(400, 'Metamodel evolution requires a project-scoped route');
    const migrations = await metamodelEvolutionService.list(req.projectContext.projectId, req.params.id);
    res.json({ success: true, data: migrations });
  })
);

/**
 * @route   GET /api/metamodels/:id
 * @desc    Get a single metamodel by ID
 */
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const metamodel = await metamodelService.getById(req.params.id, req.user!.userId, ...projectArgs(req));
  if (!metamodel) {
    return res.status(404).json({ success: false, error: 'Metamodel not found' });
  }
  res.json({ success: true, data: metamodel });
}));

/**
 * @route   POST /api/metamodels
 * @desc    Create a new metamodel (ADMIN/DSL_DESIGNER only)
 */
router.post(
  '/',
  validate([
    body('name').notEmpty().withMessage('Name is required'),
    body('uri').notEmpty().withMessage('URI is required'),
    body('prefix').notEmpty().withMessage('Prefix is required'),
    body('conformsTo').notEmpty().withMessage('conformsTo (meta-metamodel ID) is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const metamodel = await metamodelService.create(req.body, req.user!.userId, req.user!.role, ...projectArgs(req));
    res.status(201).json({ success: true, data: metamodel });
  })
);

/**
 * @route   PUT /api/metamodels/:id
 * @desc    Update a metamodel
 */
router.put(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const metamodel = await metamodelService.update(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data: metamodel });
  })
);

/**
 * @route   DELETE /api/metamodels/:id
 * @desc    Delete a metamodel (owner or admin)
 */
router.delete(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await metamodelService.delete(req.params.id, req.user!.userId, req.user!.role, ...projectArgs(req));
    res.json({ success: true, message: 'Metamodel deleted successfully' });
  })
);

/**
 * @route   POST /api/metamodels/:id/classes
 * @desc    Add a class to a metamodel
 */
router.post(
  '/:id/classes',
  validate([
    param('id').isUUID().withMessage('Invalid metamodel ID format'),
    body('id').notEmpty().withMessage('Class ID is required'),
    body('name').notEmpty().withMessage('Class name is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const metamodel = await metamodelService.addClass(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: metamodel });
  })
);

/**
 * @route   PUT /api/metamodels/:id/classes/:classId
 * @desc    Update a class in a metamodel
 */
router.put(
  '/:id/classes/:classId',
  validate([
    param('id').isUUID().withMessage('Invalid metamodel ID format'),
    param('classId').notEmpty().withMessage('Class ID is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const metamodel = await metamodelService.updateClass(req.params.id, req.params.classId, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data: metamodel });
  })
);

/**
 * @route   DELETE /api/metamodels/:id/classes/:classId
 * @desc    Delete a class from a metamodel
 */
router.delete(
  '/:id/classes/:classId',
  validate([
    param('id').isUUID().withMessage('Invalid metamodel ID format'),
    param('classId').notEmpty().withMessage('Class ID is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const metamodel = await metamodelService.deleteClass(req.params.id, req.params.classId, req.user!.userId, req.user!.role);
    res.json({ success: true, data: metamodel });
  })
);

/**
 * @route   POST /api/metamodels/:id/constraints
 * @desc    Add a global constraint to a metamodel
 */
router.post(
  '/:id/constraints',
  validate([
    param('id').isUUID().withMessage('Invalid metamodel ID format'),
    body('id').notEmpty().withMessage('Constraint ID is required'),
    body('name').notEmpty().withMessage('Constraint name is required'),
    body('expression').notEmpty().withMessage('Constraint expression is required'),
    body('type').isIn(['ocl', 'javascript']).withMessage('Constraint type must be ocl or javascript'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const metamodel = await metamodelService.addConstraint(req.params.id, req.body, undefined, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: metamodel });
  })
);

/**
 * @route   POST /api/metamodels/:id/classes/:classId/constraints
 * @desc    Add a constraint to a specific class
 */
router.post(
  '/:id/classes/:classId/constraints',
  validate([
    param('id').isUUID().withMessage('Invalid metamodel ID format'),
    param('classId').notEmpty().withMessage('Class ID is required'),
    body('id').notEmpty().withMessage('Constraint ID is required'),
    body('name').notEmpty().withMessage('Constraint name is required'),
    body('expression').notEmpty().withMessage('Constraint expression is required'),
    body('type').isIn(['ocl', 'javascript']).withMessage('Constraint type must be ocl or javascript'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const metamodel = await metamodelService.addConstraint(req.params.id, req.body, req.params.classId, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: metamodel });
  })
);

export default router;
