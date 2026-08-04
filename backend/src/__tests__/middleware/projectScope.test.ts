import { NextFunction, Response } from 'express';
import { mockReset } from 'jest-mock-extended';
import { requireProjectAccess, requireProjectCapability, projectResourceParam } from '../../middleware/projectScope';
import { projectService } from '../../services/project.service';
import { prismaMock } from '../helpers/prisma.mock';

const activeModelerAccess = {
  projectId: 'project-1',
  role: 'MODELER' as const,
  capabilities: projectService.getCapabilities('MODELER'),
  isOwner: false,
  isPlatformAdmin: false,
  status: 'ACTIVE' as const,
};

const makeResponse = (): Partial<Response> => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

beforeEach(() => {
  mockReset(prismaMock);
  jest.restoreAllMocks();
});

describe('project scope middleware', () => {
  it('applies the membership role and capabilities to the request', async () => {
    jest.spyOn(projectService, 'getAccess').mockResolvedValue(activeModelerAccess);
    const req: any = {
      method: 'GET',
      params: { projectId: 'project-1' },
      user: { userId: 'user-1', email: 'modeler@example.com', role: 'VIEWER' },
      platformRole: 'VIEWER',
    };
    const res = makeResponse();
    const next: NextFunction = jest.fn();

    await requireProjectAccess(req, res as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user.role).toBe('MODELER');
    expect(req.projectContext).toEqual(activeModelerAccess);
  });

  it('makes archived projects read-only', async () => {
    jest.spyOn(projectService, 'getAccess').mockResolvedValue({
      ...activeModelerAccess,
      status: 'ARCHIVED',
    });
    const req: any = {
      method: 'POST',
      params: { projectId: 'project-1' },
      user: { userId: 'user-1', email: 'modeler@example.com', role: 'VIEWER' },
      platformRole: 'VIEWER',
    };
    const res = makeResponse();
    const next: NextFunction = jest.fn();

    await requireProjectAccess(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a capability the member does not hold', () => {
    const req: any = { projectContext: activeModelerAccess };
    const res = makeResponse();
    const next: NextFunction = jest.fn();

    requireProjectCapability('metamodel.update')(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('hides a resource addressed through a different project URL', async () => {
    prismaMock.model.findUnique.mockResolvedValue({ projectId: 'project-2' } as any);
    const req: any = {
      path: '/model-1',
      projectContext: activeModelerAccess,
    };
    const res = makeResponse();
    const next: NextFunction = jest.fn();

    await projectResourceParam('model')(req, res as Response, next, 'model-1');

    expect(prismaMock.model.findUnique).toHaveBeenCalledWith({
      where: { id: 'model-1' },
      select: { projectId: true },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
});
