import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { validate, authenticate, AuthenticatedRequest } from '../middleware';
import { testService } from '../services';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Async handler wrapper
const asyncHandler = (fn: Function) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * @route   GET /api/tests
 * @desc    Get all test cases (owned + shared) or filter by model ID
 */
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { modelId } = req.query;
  
  if (modelId && typeof modelId === 'string') {
    const testCases = await testService.getByModelId(modelId, req.user!.userId);
    return res.json({ success: true, data: testCases });
  }
  
  const testCases = await testService.getAll(req.user!.userId);
  res.json({ success: true, data: testCases });
}));

/**
 * @route   GET /api/tests/cases
 * @desc    Get all test cases (alias for /)
 */
router.get('/cases', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { modelId } = req.query;
  
  if (modelId && typeof modelId === 'string') {
    const testCases = await testService.getByModelId(modelId, req.user!.userId);
    return res.json({ success: true, data: testCases });
  }
  
  const testCases = await testService.getAll(req.user!.userId);
  res.json({ success: true, data: testCases });
}));

/**
 * @route   POST /api/tests/cases
 * @desc    Create a new test case (ADMIN/DSL_DESIGNER only)
 */
router.post(
  '/cases',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const testCase = await testService.create(req.body, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: testCase });
  })
);

/**
 * @route   PUT /api/tests/cases/:id
 * @desc    Update a test case
 */
router.put(
  '/cases/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const testCase = await testService.update(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data: testCase });
  })
);

/**
 * @route   GET /api/tests/:id
 * @desc    Get a single test case by ID
 */
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const testCase = await testService.getById(req.params.id, req.user!.userId);
  if (!testCase) {
    return res.status(404).json({ success: false, error: 'Test case not found' });
  }
  res.json({ success: true, data: testCase });
}));

/**
 * @route   POST /api/tests
 * @desc    Create a new test case (ADMIN/DSL_DESIGNER only)
 */
router.post(
  '/',
  validate([
    body('name').notEmpty().withMessage('Name is required'),
    body('type').isIn(['attribute', 'reference', 'constraint', 'reference_attribute']).withMessage('Invalid test type'),
    body('targetMetaClassId').notEmpty().withMessage('targetMetaClassId is required'),
    body('targetMetaClassName').notEmpty().withMessage('targetMetaClassName is required'),
    body('modelId').isUUID().withMessage('Valid model ID is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const testCase = await testService.create(req.body, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: testCase });
  })
);

/**
 * @route   POST /api/tests/batch
 * @desc    Create multiple test cases at once (ADMIN/DSL_DESIGNER only)
 */
router.post(
  '/batch',
  validate([
    body().isArray().withMessage('Request body must be an array of test cases'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const testCases = await testService.createMany(req.body, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: testCases });
  })
);

/**
 * @route   PUT /api/tests/:id
 * @desc    Update a test case
 */
router.put(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const testCase = await testService.update(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data: testCase });
  })
);

/**
 * @route   PUT /api/tests/:id/status
 * @desc    Update test case status
 */
router.put(
  '/:id/status',
  validate([
    param('id').isUUID().withMessage('Invalid ID format'),
    body('status').isIn(['pending', 'running', 'passed', 'failed']).withMessage('Invalid status'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, errorMessage, actualOutput } = req.body;
    const testCase = await testService.updateStatus(req.params.id, status, req.user!.userId, req.user!.role, errorMessage, actualOutput);
    res.json({ success: true, data: testCase });
  })
);

/**
 * @route   PUT /api/tests/:id/values
 * @desc    Update test values for a test case
 */
router.put(
  '/:id/values',
  validate([
    param('id').isUUID().withMessage('Invalid ID format'),
    body().isArray().withMessage('Request body must be an array of test values'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const testCase = await testService.updateTestValues(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data: testCase });
  })
);

/**
 * @route   DELETE /api/tests/:id
 * @desc    Delete a test case (owner only)
 */
router.delete(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await testService.delete(req.params.id, req.user!.userId);
    res.json({ success: true, message: 'Test case deleted successfully' });
  })
);

/**
 * @route   DELETE /api/tests/model/:modelId
 * @desc    Delete all test cases for a model (owner only)
 */
router.delete(
  '/model/:modelId',
  validate([param('modelId').isUUID().withMessage('Invalid model ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const count = await testService.deleteByModelId(req.params.modelId, req.user!.userId);
    res.json({ success: true, message: `${count} test case(s) deleted successfully` });
  })
);

/**
 * @route   POST /api/tests/model/:modelId/reset
 * @desc    Reset all test cases for a model to pending status
 */
router.post(
  '/model/:modelId/reset',
  validate([param('modelId').isUUID().withMessage('Invalid model ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const count = await testService.resetByModelId(req.params.modelId, req.user!.userId, req.user!.role);
    res.json({ success: true, message: `${count} test case(s) reset successfully` });
  })
);

export default router;
