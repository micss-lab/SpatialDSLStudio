import { Router, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { AuthenticatedRequest, authenticate, requireProjectAccess, validate } from '../middleware';
import { projectService } from '../services';
import epackageRoutes from './epackage.routes';
import metamodelRoutes from './metamodel.routes';
import viewpointRoutes from './viewpoint.routes';
import modelRoutes from './model.routes';
import diagramRoutes from './diagram.routes';
import transformationRoutes from './transformation.routes';
import codegenRoutes from './codegen.routes';
import testRoutes from './test.routes';
import fileRoutes from './file.routes';
import interoperabilityRoutes from './interoperability.routes';
import lifecycleRoutes from './lifecycle.routes';
import pipelineRoutes from './pipeline.routes';

const router = Router({ mergeParams: true });
router.use(authenticate);

const asyncHandler = (fn: Function) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const projectRoleValidation = body('role')
  .isIn(['DSL_DESIGNER', 'MODELER', 'VIEWER'])
  .withMessage('Role must be DSL_DESIGNER, MODELER, or VIEWER');

router.get(
  '/',
  validate([query('includeArchived').optional().isBoolean().toBoolean()]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const projects = await projectService.getAll(
      req.user!.userId,
      req.platformRole || req.user!.role,
      String(req.query.includeArchived) === 'true'
    );
    res.json({ success: true, data: projects });
  })
);

router.post(
  '/',
  validate([
    body('name').trim().notEmpty().withMessage('Project name is required'),
    body('description').optional().isString(),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const project = await projectService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: project });
  })
);

router.get(
  '/:projectId',
  validate([param('projectId').isUUID().withMessage('Invalid project ID format')]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const project = await projectService.getById(
      req.params.projectId,
      req.user!.userId,
      req.platformRole || req.user!.role
    );
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    res.json({ success: true, data: project });
  })
);

router.put(
  '/:projectId',
  validate([
    param('projectId').isUUID().withMessage('Invalid project ID format'),
    body('name').optional().trim().notEmpty().withMessage('Project name cannot be empty'),
    body('description').optional().isString(),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const project = await projectService.update(
      req.params.projectId,
      req.body,
      req.user!.userId,
      req.platformRole || req.user!.role
    );
    res.json({ success: true, data: project });
  })
);

router.post('/:projectId/archive', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const project = await projectService.setArchived(
    req.params.projectId,
    true,
    req.user!.userId,
    req.platformRole || req.user!.role
  );
  res.json({ success: true, data: project });
}));

router.post('/:projectId/restore', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const project = await projectService.setArchived(
    req.params.projectId,
    false,
    req.user!.userId,
    req.platformRole || req.user!.role
  );
  res.json({ success: true, data: project });
}));

router.get('/:projectId/members', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const members = await projectService.getMembers(
    req.params.projectId,
    req.user!.userId,
    req.platformRole || req.user!.role
  );
  res.json({ success: true, data: members });
}));

router.post(
  '/:projectId/members',
  validate([
    body('email').isEmail().normalizeEmail().withMessage('A valid email is required'),
    projectRoleValidation,
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const member = await projectService.addMember(
      req.params.projectId,
      req.body,
      req.user!.userId,
      req.platformRole || req.user!.role
    );
    res.status(201).json({ success: true, data: member });
  })
);

router.patch(
  '/:projectId/members/:userId',
  validate([projectRoleValidation]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const member = await projectService.updateMember(
      req.params.projectId,
      req.params.userId,
      req.body,
      req.user!.userId,
      req.platformRole || req.user!.role
    );
    res.json({ success: true, data: member });
  })
);

router.delete('/:projectId/members/:userId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await projectService.removeMember(
    req.params.projectId,
    req.params.userId,
    req.user!.userId,
    req.platformRole || req.user!.role
  );
  res.json({ success: true, message: 'Project member removed successfully' });
}));

// Canonical project-scoped feature routes. Existing flat routes remain as
// compatibility adapters while clients move to these URLs.
router.use('/:projectId/epackages', requireProjectAccess, epackageRoutes);
router.use('/:projectId/metamodels', requireProjectAccess, metamodelRoutes);
router.use('/:projectId/viewpoints', requireProjectAccess, viewpointRoutes);
router.use('/:projectId/models', requireProjectAccess, modelRoutes);
router.use('/:projectId/views', requireProjectAccess, diagramRoutes);
router.use('/:projectId/transformations', requireProjectAccess, transformationRoutes);
router.use('/:projectId/code-generation', requireProjectAccess, codegenRoutes);
router.use('/:projectId/tests', requireProjectAccess, testRoutes);
router.use('/:projectId/files', requireProjectAccess, fileRoutes);
router.use('/:projectId/interoperability', requireProjectAccess, interoperabilityRoutes);
router.use('/:projectId/lifecycle', requireProjectAccess, lifecycleRoutes);
router.use('/:projectId/pipelines', requireProjectAccess, pipelineRoutes);

export default router;
