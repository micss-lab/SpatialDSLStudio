import { prismaMock } from '../helpers/prisma.mock';
import { Request, Response, NextFunction } from 'express';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';


const sharingServiceMock = {
  checkAccess: jest.fn(),
};
jest.mock('../../services/sharing.service', () => ({
  sharingService: sharingServiceMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
  jest.clearAllMocks();
});

import {
  requireRole,
  canCreate,
  canEdit,
  isRoleAtLeast,
  canPerformOperation,
  roleHierarchy,
  getEffectivePermission,
  requireResourceAccess,
} from '../../middleware/permissions';
import { UserRole } from '../../../../shared/types';

describe('requireRole middleware', () => {
  let req: any;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('calls next() when user has required role', () => {
    req.user = { role: 'ADMIN' };

    requireRole('ADMIN')(req, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when no user on request', () => {
    req.user = undefined;

    requireRole('ADMIN')(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user lacks required role', () => {
    req.user = { role: 'VIEWER' };

    requireRole('ADMIN')(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('allows multiple roles', () => {
    req.user = { role: 'DSL_DESIGNER' };

    requireRole('ADMIN', 'DSL_DESIGNER')(req, res as Response, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('canCreate', () => {
  it('returns true for ADMIN', () => {
    expect(canCreate('ADMIN')).toBe(true);
  });

  it('returns true for DSL_DESIGNER', () => {
    expect(canCreate('DSL_DESIGNER')).toBe(true);
  });

  it('returns false for MODELER', () => {
    expect(canCreate('MODELER')).toBe(false);
  });

  it('returns false for VIEWER', () => {
    expect(canCreate('VIEWER')).toBe(false);
  });
});

describe('canEdit', () => {
  it('returns true for ADMIN', () => {
    expect(canEdit('ADMIN')).toBe(true);
  });

  it('returns true for DSL_DESIGNER', () => {
    expect(canEdit('DSL_DESIGNER')).toBe(true);
  });

  it('returns true for MODELER', () => {
    expect(canEdit('MODELER')).toBe(true);
  });

  it('returns false for VIEWER', () => {
    expect(canEdit('VIEWER')).toBe(false);
  });
});

describe('isRoleAtLeast', () => {
  it('ADMIN is at least ADMIN', () => {
    expect(isRoleAtLeast('ADMIN', 'ADMIN')).toBe(true);
  });

  it('ADMIN is at least VIEWER', () => {
    expect(isRoleAtLeast('ADMIN', 'VIEWER')).toBe(true);
  });

  it('VIEWER is not at least ADMIN', () => {
    expect(isRoleAtLeast('VIEWER', 'ADMIN')).toBe(false);
  });

  it('MODELER is at least MODELER', () => {
    expect(isRoleAtLeast('MODELER', 'MODELER')).toBe(true);
  });

  it('DSL_DESIGNER is not at least ADMIN', () => {
    expect(isRoleAtLeast('DSL_DESIGNER', 'ADMIN')).toBe(false);
  });
});

describe('roleHierarchy', () => {
  it('ADMIN has highest priority', () => {
    expect(roleHierarchy.ADMIN).toBeGreaterThan(roleHierarchy.DSL_DESIGNER);
    expect(roleHierarchy.ADMIN).toBeGreaterThan(roleHierarchy.MODELER);
    expect(roleHierarchy.ADMIN).toBeGreaterThan(roleHierarchy.VIEWER);
  });

  it('VIEWER has lowest priority', () => {
    expect(roleHierarchy.VIEWER).toBeLessThan(roleHierarchy.MODELER);
    expect(roleHierarchy.VIEWER).toBeLessThan(roleHierarchy.DSL_DESIGNER);
  });
});

describe('canPerformOperation', () => {
  it('ADMIN can create metamodels', () => {
    expect(canPerformOperation('ADMIN', 'metamodel', 'create')).toBe(true);
  });

  it('MODELER cannot create metamodels', () => {
    expect(canPerformOperation('MODELER', 'metamodel', 'create')).toBe(false);
  });

  it('MODELER can add model instances', () => {
    expect(canPerformOperation('MODELER', 'model', 'addInstance')).toBe(true);
  });

  it('VIEWER cannot do anything', () => {
    expect(canPerformOperation('VIEWER', 'metamodel', 'create')).toBe(false);
    expect(canPerformOperation('VIEWER', 'model', 'addInstance')).toBe(false);
    expect(canPerformOperation('VIEWER', 'test', 'run')).toBe(false);
  });

  it('returns false for unknown operation', () => {
    expect(canPerformOperation('ADMIN', 'metamodel', 'unknownOp')).toBe(false);
  });
});

describe('getEffectivePermission', () => {
  it('returns full permissions for owner DSL_DESIGNER', async () => {
    sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

    const result = await getEffectivePermission('METAMODEL', 'mm-1', 'user-1', 'DSL_DESIGNER');

    expect(result.canView).toBe(true);
    expect(result.canEdit).toBe(true);
    expect(result.canDelete).toBe(true);
    expect(result.canShare).toBe(true);
    expect(result.isOwner).toBe(true);
  });

  it('returns no permissions when no access', async () => {
    sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: false, isOwner: false });

    const result = await getEffectivePermission('METAMODEL', 'mm-1', 'stranger', 'DSL_DESIGNER');

    expect(result.canView).toBe(false);
    expect(result.canEdit).toBe(false);
    expect(result.canDelete).toBe(false);
  });

  it('VIEWER owner can view but not edit', async () => {
    sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

    const result = await getEffectivePermission('METAMODEL', 'mm-1', 'user-1', 'VIEWER');

    expect(result.canView).toBe(true);
    expect(result.canEdit).toBe(false);
    expect(result.canDelete).toBe(true); // owners can always delete
    expect(result.canShare).toBe(false);
  });

  it('EDITOR share allows editing for DSL_DESIGNER', async () => {
    sharingServiceMock.checkAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: false,
      permission: 'EDITOR',
    });

    const result = await getEffectivePermission('METAMODEL', 'mm-1', 'shared-user', 'DSL_DESIGNER');

    expect(result.canView).toBe(true);
    expect(result.canEdit).toBe(true);
    expect(result.canDelete).toBe(false);
    expect(result.canShare).toBe(false);
  });

  it('VIEWER share only allows viewing', async () => {
    sharingServiceMock.checkAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: false,
      permission: 'VIEWER',
    });

    const result = await getEffectivePermission('METAMODEL', 'mm-1', 'shared-user', 'DSL_DESIGNER');

    expect(result.canView).toBe(true);
    expect(result.canEdit).toBe(false);
  });

  it('VIEWER role on shared EDITOR resource still cannot edit', async () => {
    sharingServiceMock.checkAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: false,
      permission: 'EDITOR',
    });

    const result = await getEffectivePermission('METAMODEL', 'mm-1', 'viewer-user', 'VIEWER');

    expect(result.canView).toBe(true);
    expect(result.canEdit).toBe(false);
  });

  it('MODELER owner can edit but not share', async () => {
    sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

    const result = await getEffectivePermission('METAMODEL', 'mm-1', 'modeler-user', 'MODELER');

    expect(result.canView).toBe(true);
    expect(result.canEdit).toBe(true);
    expect(result.canDelete).toBe(true);
    expect(result.canShare).toBe(false);
  });

  it('VIEWER share prevents editing for MODELER', async () => {
    sharingServiceMock.checkAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: false,
      permission: 'VIEWER',
    });

    const result = await getEffectivePermission('METAMODEL', 'mm-1', 'modeler-user', 'MODELER');

    expect(result.canView).toBe(true);
    expect(result.canEdit).toBe(false);
    expect(result.canDelete).toBe(false);
    expect(result.canShare).toBe(false);
    expect(result.isOwner).toBe(false);
  });
});

describe('requireResourceAccess middleware', () => {
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    req = {
      user: { userId: 'user-uuid-1', role: 'DSL_DESIGNER' },
      params: { id: 'resource-uuid-1' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('calls next when user has view permission', async () => {
    sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

    const middleware = requireResourceAccess('METAMODEL', (r) => r.params.id, 'view');
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.resourcePermission).toBeDefined();
  });

  it('returns 403 when user lacks view permission', async () => {
    sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: false, isOwner: false });

    const middleware = requireResourceAccess('METAMODEL', (r) => r.params.id, 'view');
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when no user on request', async () => {
    req.user = undefined;

    const middleware = requireResourceAccess('METAMODEL', (r) => r.params.id);
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when resource id is empty', async () => {
    req.params.id = '';

    const middleware = requireResourceAccess('METAMODEL', (r) => r.params.id);
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('checks edit permission correctly', async () => {
    sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

    const middleware = requireResourceAccess('METAMODEL', (r) => r.params.id, 'edit');
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when user lacks edit permission', async () => {
    req.user = { userId: 'viewer-uuid', role: 'VIEWER' };
    sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

    const middleware = requireResourceAccess('METAMODEL', (r) => r.params.id, 'edit');
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('checks delete permission correctly', async () => {
    sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

    const middleware = requireResourceAccess('METAMODEL', (r) => r.params.id, 'delete');
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when user lacks delete permission (shared non-owner)', async () => {
    sharingServiceMock.checkAccess.mockResolvedValue({
      hasAccess: true,
      isOwner: false,
      permission: 'EDITOR',
    });

    const middleware = requireResourceAccess('METAMODEL', (r) => r.params.id, 'delete');
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('checks share permission correctly', async () => {
    sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

    const middleware = requireResourceAccess('METAMODEL', (r) => r.params.id, 'share');
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when user lacks share permission (VIEWER owner)', async () => {
    req.user = { userId: 'viewer-uuid', role: 'VIEWER' };
    sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

    const middleware = requireResourceAccess('METAMODEL', (r) => r.params.id, 'share');
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches resourcePermission to request', async () => {
    sharingServiceMock.checkAccess.mockResolvedValue({ hasAccess: true, isOwner: true });

    const middleware = requireResourceAccess('METAMODEL', (r) => r.params.id, 'view');
    await middleware(req, res, next);

    expect((req as any).resourcePermission).toMatchObject({
      canView: true,
      isOwner: true,
    });
  });
});
