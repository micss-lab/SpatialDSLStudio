import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { validate, authenticate, AuthenticatedRequest } from '../middleware';
import { transformationService } from '../services';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Async handler wrapper
const asyncHandler = (fn: Function) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============ Rule Routes (with embedded patterns) ============

/**
 * @route   GET /api/transformations/rules
 * @desc    Get all rules (owned + shared)
 */
router.get('/rules', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rules = await transformationService.getAllRules(req.user!.userId);
  res.json({ success: true, data: rules });
}));

/**
 * @route   GET /api/transformations/rules/:id
 * @desc    Get a single rule by ID
 */
router.get('/rules/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rule = await transformationService.getRuleById(req.params.id, req.user!.userId);
  if (!rule) {
    return res.status(404).json({ success: false, error: 'Rule not found' });
  }
  res.json({ success: true, data: rule });
}));

/**
 * @route   POST /api/transformations/rules
 * @desc    Create a new rule with embedded patterns (ADMIN/DSL_DESIGNER only)
 */
router.post(
  '/rules',
  validate([
    body('name').notEmpty().withMessage('Name is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rule = await transformationService.createRule(req.body, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: rule });
  })
);

/**
 * @route   PUT /api/transformations/rules/:id
 * @desc    Update a rule
 */
router.put(
  '/rules/:id',
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rule = await transformationService.updateRule(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data: rule });
  })
);

/**
 * @route   DELETE /api/transformations/rules/:id
 * @desc    Delete a rule (owner only)
 */
router.delete(
  '/rules/:id',
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await transformationService.deleteRule(req.params.id, req.user!.userId);
    res.json({ success: true, message: 'Rule deleted successfully' });
  })
);

// ============ Legacy Routes (for backward compatibility) ============

/**
 * @route   GET /api/transformations/patterns
 * @desc    Get all patterns (returns empty array - patterns are now embedded in rules)
 */
router.get('/patterns', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Return empty array - patterns are now embedded in rules
  res.json({ success: true, data: [] });
}));

/**
 * @route   POST /api/transformations/patterns
 * @desc    Create a pattern (no-op, patterns are now embedded in rules)
 */
router.post('/patterns', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Just return the pattern data back - it will be stored when the rule is saved
  res.status(201).json({ success: true, data: req.body });
}));

/**
 * @route   PUT /api/transformations/patterns/:id
 * @desc    Update a pattern (no-op, patterns are now embedded in rules)
 */
router.put('/patterns/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Just return the pattern data back - it will be stored when the rule is saved
  res.json({ success: true, data: { id: req.params.id, ...req.body } });
}));

/**
 * @route   DELETE /api/transformations/patterns/:id
 * @desc    Delete a pattern (no-op, patterns are now embedded in rules)
 */
router.delete('/patterns/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, message: 'Pattern deleted successfully' });
}));

/**
 * @route   GET /api/transformations/executions
 * @desc    Get all executions (returns empty array - executions are handled in-memory)
 */
router.get('/executions', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, data: [] });
}));

export default router;
