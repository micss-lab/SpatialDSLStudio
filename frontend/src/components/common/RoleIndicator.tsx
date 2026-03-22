/**
 * RoleIndicator Component
 * 
 * Displays the current user's role as a badge/chip.
 * Useful for showing in header or user profile areas.
 */

import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useAuth } from '../../contexts/AuthContext';
import type { UserRole } from '../../services/core';

interface RoleConfig {
  label: string;
  color: 'error' | 'primary' | 'secondary' | 'default';
  icon: React.ReactElement;
  description: string;
}

const ROLE_CONFIG: Record<UserRole, RoleConfig> = {
  ADMIN: {
    label: 'Admin',
    color: 'error',
    icon: <AdminPanelSettingsIcon fontSize="small" />,
    description: 'Full access: Can manage users and all resources',
  },
  DSL_DESIGNER: {
    label: 'DSL-Designer',
    color: 'primary',
    icon: <DesignServicesIcon fontSize="small" />,
    description: 'Can create, edit, delete, and share resources',
  },
  MODELER: {
    label: 'Modeler',
    color: 'secondary',
    icon: <EditIcon fontSize="small" />,
    description: 'Can view and edit resources',
  },
  VIEWER: {
    label: 'Viewer',
    color: 'default',
    icon: <VisibilityIcon fontSize="small" />,
    description: 'Can only view resources',
  },
};

interface RoleIndicatorProps {
  size?: 'small' | 'medium';
  showIcon?: boolean;
  showTooltip?: boolean;
}

const RoleIndicator: React.FC<RoleIndicatorProps> = ({
  size = 'small',
  showIcon = true,
  showTooltip = true,
}) => {
  const { role } = useAuth();

  if (!role) {
    return null;
  }

  const config = ROLE_CONFIG[role];
  
  const chip = (
    <Chip
      label={config.label}
      color={config.color}
      size={size}
      icon={showIcon ? config.icon : undefined}
      variant="outlined"
    />
  );

  if (showTooltip) {
    return (
      <Tooltip title={config.description} arrow>
        {chip}
      </Tooltip>
    );
  }

  return chip;
};

export default RoleIndicator;

/**
 * PermissionGate Component
 * 
 * Conditionally renders children based on user permissions.
 * Useful for hiding UI elements that the user doesn't have access to.
 */
interface PermissionGateProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  operation?: 'create' | 'edit' | 'delete' | 'share' | 'view';
  fallback?: React.ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  children,
  requiredRole,
  operation,
  fallback = null,
}) => {
  const { hasRole, canPerformOperation } = useAuth();

  let hasPermission = true;

  if (requiredRole) {
    hasPermission = hasPermission && hasRole(requiredRole);
  }

  if (operation) {
    hasPermission = hasPermission && canPerformOperation(operation);
  }

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
