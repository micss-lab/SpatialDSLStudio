import { NextFunction, Response } from 'express';
import prisma from '../config/database';
import { projectService } from '../services/project.service';
import { AuthenticatedRequest } from './auth';
import { ProjectCapability } from '../../../shared/types';

export const requireProjectAccess = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const projectId = req.params.projectId;
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required' });
      return;
    }

    const platformRole = req.platformRole || req.user.role;
    const access = await projectService.getAccess(projectId, req.user.userId, platformRole);
    if (!access) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    if (access.status === 'ARCHIVED' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      res.status(409).json({ error: 'This project is archived and is read-only' });
      return;
    }

    req.projectContext = access;
    req.user = {
      ...req.user,
      role: projectService.toEffectiveUserRole(access),
    };
    next();
  } catch (error) {
    next(error);
  }
};

export const requireProjectCapability = (capability: ProjectCapability) => (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.projectContext) {
    next();
    return;
  }
  if (!req.projectContext.capabilities.includes(capability)) {
    res.status(403).json({ error: `Project capability required: ${capability}` });
    return;
  }
  next();
};

export type ProjectResourceKind =
  | 'ePackage'
  | 'metamodel'
  | 'viewpoint'
  | 'model'
  | 'diagram'
  | 'transformationRule'
  | 'codeGenerationProject'
  | 'testCase'
  | 'storedFile';

/** Preserve the exact legacy service call shape on flat compatibility routes. */
export const projectArgs = (req: AuthenticatedRequest): [] | [string] => (
  req.projectContext ? [req.projectContext.projectId] : []
);

/**
 * Router-param guard for nested project routes. It prevents a valid member of
 * two projects from addressing project B's artifact through project A's URL.
 */
export const projectResourceParam = (resourceKind: ProjectResourceKind) => async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  resourceId: string
): Promise<void> => {
  try {
    if (!req.projectContext) {
      next();
      return;
    }

    // Transformation pattern compatibility endpoints do not address persisted
    // top-level resources; patterns are embedded in their parent rule.
    if (resourceKind === 'transformationRule' && req.path.startsWith('/patterns/')) {
      next();
      return;
    }

    const delegate = (prisma as any)[resourceKind];
    const resource = await delegate.findUnique({
      where: { id: resourceId },
      select: { projectId: true },
    });
    if (!resource || resource.projectId !== req.projectContext.projectId) {
      res.status(404).json({ error: 'Resource not found in this project' });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};
