import { Router, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { validate, projectResourceParam, projectArgs } from '../middleware';
import { AuthenticatedRequest } from '../middleware/auth';
import { metametamodelService } from '../services';

const router = Router({ mergeParams: true });
router.param('id', projectResourceParam('ePackage'));

// Async handler wrapper
const asyncHandler = (fn: Function) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * @route   GET /api/epackages
 * @desc    Get all EPackages (meta-metamodels) for current user
 */
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const packages = await metametamodelService.getAll(req.user!.userId, ...projectArgs(req));
  res.json({ success: true, data: packages });
}));

/**
 * @route   GET /api/epackages/core
 * @desc    Get or initialize the core Ecore package for current user
 */
router.get('/core', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (req.projectContext?.status === 'ARCHIVED') {
    const existingCore = await metametamodelService.getByUri(
      'http://www.modeling-tool.com/ecore',
      req.user!.userId,
      req.projectContext.projectId
    );
    if (!existingCore) {
      return res.status(404).json({ success: false, error: 'No core EPackage exists in this archived project' });
    }
    return res.json({ success: true, data: existingCore });
  }

  const corePackage = await metametamodelService.initializeCoreEcore(
    req.user!.userId,
    ...(req.projectContext ? [req.projectContext.projectId, req.user!.role] as const : [])
  );
  res.json({ success: true, data: corePackage });
}));

/**
 * @route   GET /api/epackages/:id
 * @desc    Get a single EPackage by ID
 */
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const pkg = await metametamodelService.getById(req.params.id, req.user!.userId, ...projectArgs(req));
  if (!pkg) {
    return res.status(404).json({ success: false, error: 'EPackage not found' });
  }
  res.json({ success: true, data: pkg });
}));

/**
 * @route   GET /api/epackages/uri/:nsURI
 * @desc    Get an EPackage by namespace URI
 */
router.get('/uri/:nsURI', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const pkg = await metametamodelService.getByUri(
    decodeURIComponent(req.params.nsURI),
    req.user!.userId,
    ...projectArgs(req)
  );
  if (!pkg) {
    return res.status(404).json({ success: false, error: 'EPackage not found' });
  }
  res.json({ success: true, data: pkg });
}));

/**
 * @route   POST /api/epackages
 * @desc    Create a new EPackage
 */
router.post(
  '/',
  validate([
    body('name').notEmpty().withMessage('Name is required'),
    body('nsURI').notEmpty().withMessage('Namespace URI is required'),
    body('nsPrefix').notEmpty().withMessage('Namespace prefix is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const pkg = await metametamodelService.create(
      req.body,
      req.user!.userId,
      ...(req.projectContext ? [req.projectContext.projectId, req.user!.role] as const : [])
    );
    res.status(201).json({ success: true, data: pkg });
  })
);

/**
 * @route   PUT /api/epackages/:id
 * @desc    Update an EPackage
 */
router.put(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const pkg = await metametamodelService.update(
      req.params.id,
      req.body,
      req.user!.userId,
      ...(req.projectContext ? [req.projectContext.projectId, req.user!.role] as const : [])
    );
    res.json({ success: true, data: pkg });
  })
);

/**
 * @route   DELETE /api/epackages/:id
 * @desc    Delete an EPackage
 */
router.delete(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await metametamodelService.delete(
      req.params.id,
      req.user!.userId,
      ...(req.projectContext ? [req.projectContext.projectId, req.user!.role] as const : [])
    );
    res.json({ success: true, message: 'EPackage deleted successfully' });
  })
);

export default router;
