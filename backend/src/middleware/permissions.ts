import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { UserRole, ResourceType, SharePermission } from '../../../shared/types';
import { sharingService } from '../services/sharing.service';

/**
 * Middleware to check if user has a specific role or higher
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ 
        error: `This action requires one of the following roles: ${allowedRoles.join(', ')}` 
      });
      return;
    }

    next();
  };
};

/**
 * Check if user role allows creation of resources
 */
export const canCreate = (role: UserRole): boolean => {
  return role === 'ADMIN' || role === 'DSL_DESIGNER';
};

/**
 * Check if user role allows editing (not role-specific resource editing, but general)
 */
export const canEdit = (role: UserRole): boolean => {
  return role !== 'VIEWER';
};

/**
 * Get the effective permission for a user on a resource
 * Combines user role restrictions with sharing permissions
 */
export interface EffectivePermission {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
  isOwner: boolean;
}

export const getEffectivePermission = async (
  resourceType: ResourceType,
  resourceId: string,
  userId: string,
  userRole: UserRole
): Promise<EffectivePermission> => {
  const access = await sharingService.checkAccess(resourceType, resourceId, userId);

  if (!access.hasAccess) {
    return {
      canView: false,
      canEdit: false,
      canDelete: false,
      canShare: false,
      isOwner: false,
    };
  }

  // Owner permissions based on role
  if (access.isOwner) {
    return {
      canView: true,
      canEdit: userRole !== 'VIEWER',
      canDelete: true,
      canShare: userRole === 'ADMIN' || userRole === 'DSL_DESIGNER',
      isOwner: true,
    };
  }

  // Shared resource permissions
  // VIEWER role can only view regardless of share permission
  if (userRole === 'VIEWER') {
    return {
      canView: true,
      canEdit: false,
      canDelete: false,
      canShare: false,
      isOwner: false,
    };
  }

  // EDITOR share permission allows editing (user role already checked above)
  const shareAllowsEdit = access.permission === 'EDITOR';

  return {
    canView: true,
    canEdit: shareAllowsEdit,
    canDelete: false, // Only owner can delete
    canShare: false,  // Only owner can share
    isOwner: false,
  };
};

/**
 * Middleware factory for checking resource access
 */
export const requireResourceAccess = (
  resourceType: ResourceType,
  getResourceId: (req: AuthenticatedRequest) => string,
  requiredPermission: 'view' | 'edit' | 'delete' | 'share' = 'view'
) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const resourceId = getResourceId(req);
    if (!resourceId) {
      res.status(400).json({ error: 'Resource ID is required' });
      return;
    }

    const permission = await getEffectivePermission(
      resourceType,
      resourceId,
      req.user.userId,
      req.user.role
    );

    let hasPermission = false;
    switch (requiredPermission) {
      case 'view':
        hasPermission = permission.canView;
        break;
      case 'edit':
        hasPermission = permission.canEdit;
        break;
      case 'delete':
        hasPermission = permission.canDelete;
        break;
      case 'share':
        hasPermission = permission.canShare;
        break;
    }

    if (!hasPermission) {
      res.status(403).json({ 
        error: `You don't have ${requiredPermission} permission for this resource` 
      });
      return;
    }

    // Attach permission info to request for use in route handlers
    (req as any).resourcePermission = permission;
    next();
  };
};

/**
 * Role hierarchy utilities
 */
export const roleHierarchy: Record<UserRole, number> = {
  ADMIN: 4,
  DSL_DESIGNER: 3,
  MODELER: 2,
  VIEWER: 1,
};

export const isRoleAtLeast = (userRole: UserRole, requiredRole: UserRole): boolean => {
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
};

/**
 * Check specific operation permissions based on resource type and user role
 * These define what operations each role can perform
 */
export const roleOperationPermissions: Record<UserRole, {
  metamodel: { create: boolean; addClass: boolean; editClass: boolean; deleteClass: boolean };
  model: { create: boolean; addInstance: boolean; editInstance: boolean; deleteInstance: boolean };
  diagram: { create: boolean; editPositions: boolean };
  transformation: { create: boolean; execute: boolean };
  codegen: { create: boolean; editTemplate: boolean; generate: boolean };
  test: { create: boolean; edit: boolean; run: boolean };
}> = {
  ADMIN: {
    metamodel: { create: true, addClass: true, editClass: true, deleteClass: true },
    model: { create: true, addInstance: true, editInstance: true, deleteInstance: true },
    diagram: { create: true, editPositions: true },
    transformation: { create: true, execute: true },
    codegen: { create: true, editTemplate: true, generate: true },
    test: { create: true, edit: true, run: true },
  },
  DSL_DESIGNER: {
    metamodel: { create: true, addClass: true, editClass: true, deleteClass: true },
    model: { create: true, addInstance: true, editInstance: true, deleteInstance: true },
    diagram: { create: true, editPositions: true },
    transformation: { create: true, execute: true },
    codegen: { create: true, editTemplate: true, generate: true },
    test: { create: true, edit: true, run: true },
  },
  MODELER: {
    metamodel: { create: false, addClass: false, editClass: false, deleteClass: false },
    model: { create: false, addInstance: true, editInstance: true, deleteInstance: true },
    diagram: { create: false, editPositions: true },
    transformation: { create: false, execute: true },
    codegen: { create: false, editTemplate: false, generate: true },
    test: { create: false, edit: false, run: true },
  },
  VIEWER: {
    metamodel: { create: false, addClass: false, editClass: false, deleteClass: false },
    model: { create: false, addInstance: false, editInstance: false, deleteInstance: false },
    diagram: { create: false, editPositions: false },
    transformation: { create: false, execute: false },
    codegen: { create: false, editTemplate: false, generate: false },
    test: { create: false, edit: false, run: false },
  },
};

export const canPerformOperation = (
  userRole: UserRole,
  resourceCategory: keyof typeof roleOperationPermissions.ADMIN,
  operation: string
): boolean => {
  const permissions = roleOperationPermissions[userRole]?.[resourceCategory];
  return permissions ? (permissions as any)[operation] === true : false;
};
