import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { validate, authenticate, AuthenticatedRequest } from '../middleware';
import { codeGenerationService } from '../services';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Async handler wrapper
const asyncHandler = (fn: Function) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * @route   GET /api/codegen/projects
 * @desc    Get all projects (owned + shared) or filter by metamodel ID
 */
router.get('/projects', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { metamodelId } = req.query;
  
  if (metamodelId && typeof metamodelId === 'string') {
    const projects = await codeGenerationService.getProjectsByMetamodelId(metamodelId, req.user!.userId);
    return res.json({ success: true, data: projects });
  }
  
  const projects = await codeGenerationService.getAllProjects(req.user!.userId);
  res.json({ success: true, data: projects });
}));

/**
 * @route   GET /api/codegen/projects/:id
 * @desc    Get a single project by ID
 */
router.get('/projects/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const project = await codeGenerationService.getProjectById(req.params.id, req.user!.userId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }
  res.json({ success: true, data: project });
}));

/**
 * @route   POST /api/codegen/projects
 * @desc    Create a new project (ADMIN/DSL_DESIGNER only)
 */
router.post(
  '/projects',
  validate([
    body('name').notEmpty().withMessage('Name is required'),
    // targetMetamodelId is optional - allow any string or null for example projects
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const project = await codeGenerationService.createProject(req.body, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: project });
  })
);

/**
 * @route   PUT /api/codegen/projects/:id
 * @desc    Update a project
 */
router.put(
  '/projects/:id',
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const project = await codeGenerationService.updateProject(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data: project });
  })
);

/**
 * @route   DELETE /api/codegen/projects/:id
 * @desc    Delete a project (owner only)
 */
router.delete(
  '/projects/:id',
  validate([param('id').isUUID().withMessage('Invalid ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await codeGenerationService.deleteProject(req.params.id, req.user!.userId);
    res.json({ success: true, message: 'Project deleted successfully' });
  })
);

/**
 * @route   POST /api/codegen/projects/:id/templates
 * @desc    Add a template to a project
 */
router.post(
  '/projects/:id/templates',
  validate([
    param('id').isUUID().withMessage('Invalid project ID format'),
    body('id').notEmpty().withMessage('Template ID is required'),
    body('name').notEmpty().withMessage('Template name is required'),
    body('language').isIn(['java', 'python']).withMessage('Language must be java or python'),
    body('templateContent').notEmpty().withMessage('Template content is required'),
    body('outputPattern').notEmpty().withMessage('Output pattern is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const project = await codeGenerationService.addTemplate(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.status(201).json({ success: true, data: project });
  })
);

/**
 * @route   PUT /api/codegen/projects/:id/templates/:templateId
 * @desc    Update a template in a project
 */
router.put(
  '/projects/:id/templates/:templateId',
  validate([
    param('id').isUUID().withMessage('Invalid project ID format'),
    param('templateId').notEmpty().withMessage('Template ID is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const project = await codeGenerationService.updateTemplate(req.params.id, req.params.templateId, req.body, req.user!.userId, req.user!.role);
    res.json({ success: true, data: project });
  })
);

/**
 * @route   DELETE /api/codegen/projects/:id/templates/:templateId
 * @desc    Delete a template from a project
 */
router.delete(
  '/projects/:id/templates/:templateId',
  validate([
    param('id').isUUID().withMessage('Invalid project ID format'),
    param('templateId').notEmpty().withMessage('Template ID is required'),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const project = await codeGenerationService.deleteTemplate(req.params.id, req.params.templateId, req.user!.userId, req.user!.role);
    res.json({ success: true, data: project });
  })
);

export default router;
