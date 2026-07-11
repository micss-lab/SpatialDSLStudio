import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Box,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CodeIcon from '@mui/icons-material/Code';
import SchemaIcon from '@mui/icons-material/Schema';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import BugReportIcon from '@mui/icons-material/BugReport';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import HomeIcon from '@mui/icons-material/Home';
import InfoIcon from '@mui/icons-material/Info';
import UpgradeIcon from '@mui/icons-material/Upgrade';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import { AuthUser } from '../../services/core';
import OwnerFilterControl from '../common/OwnerFilterControl';

const EXPANDED_WIDTH = 264;
const COLLAPSED_WIDTH = 72;
const STORAGE_KEY = 'spatialdsl.sidebar.collapsed';

interface SidebarProps {
  user: AuthUser | null;
  isAdmin: boolean;
  onLogout: () => void;
  onRoleRequest: () => void;
}

interface NavItem {
  label: string;
  path?: string;
  icon: React.ReactNode;
  onClick?: () => void;
  adminOnly?: boolean;
  nonAdminOnly?: boolean;
  match?: (pathname: string) => boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ user, isAdmin, onLogout, onRoleRequest }) => {
  const location = useLocation();
  const theme = useTheme();
  const shouldAutoCollapse = useMediaQuery(theme.breakpoints.down('md'));
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');

  useEffect(() => {
    if (shouldAutoCollapse) {
      setCollapsed(true);
    }
  }, [shouldAutoCollapse]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  const navItems = useMemo<NavItem[]>(() => [
    { label: 'Home', path: '/', icon: <HomeIcon />, match: pathname => pathname === '/' },
    { label: 'Metamodels', path: '/metamodels', icon: <SchemaIcon /> },
    {
      label: 'Viewpoints',
      path: '/viewpoints',
      icon: <AccountTreeIcon />,
      match: pathname => pathname.startsWith('/viewpoints') || /^\/metamodels\/[^/]+\/viewpoints/.test(pathname),
    },
    {
      label: 'Representations',
      path: '/representations',
      icon: <ViewModuleIcon />,
      match: pathname => pathname.startsWith('/representations'),
    },
    { label: 'Models', path: '/models', icon: <ModelTrainingIcon /> },
    {
      label: 'Views',
      path: '/views',
      icon: <DesignServicesIcon />,
      match: pathname => pathname.startsWith('/views') || pathname.startsWith('/diagrams'),
    },
    { label: 'Code Generation', path: '/code-generation', icon: <CodeIcon /> },
    { label: 'Transformations', path: '/transformations', icon: <AutorenewIcon /> },
    { label: 'Testing', path: '/testing', icon: <BugReportIcon /> },
    { label: 'Admin', path: '/admin', icon: <AdminPanelSettingsIcon />, adminOnly: true },
  ], []);

  const utilityItems = useMemo<NavItem[]>(() => [
    { label: 'Request Role', icon: <UpgradeIcon />, onClick: onRoleRequest, nonAdminOnly: true },
    { label: 'Help', path: '/help', icon: <HelpOutlineIcon /> },
    { label: 'About', path: '/about', icon: <InfoIcon /> },
    { label: 'Logout', icon: <LogoutIcon />, onClick: onLogout },
  ], [onLogout, onRoleRequest]);

  const visibleNavItems = navItems.filter(item => !item.adminOnly || isAdmin);
  const visibleUtilityItems = utilityItems.filter(item => !item.nonAdminOnly || !isAdmin);
  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  const renderItem = (item: NavItem) => {
    const selected = item.match
      ? item.match(location.pathname)
      : item.path ? location.pathname.startsWith(item.path) : false;
    const content = (
      <ListItemButton
        selected={selected}
        component={item.path ? Link : 'button'}
        to={item.path}
        onClick={item.onClick}
        sx={{
          minHeight: 44,
          justifyContent: collapsed ? 'center' : 'flex-start',
          px: collapsed ? 1.25 : 1.5,
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: 0,
            mr: collapsed ? 0 : 1.5,
            justifyContent: 'center',
          }}
        >
          {item.icon}
        </ListItemIcon>
        {!collapsed && <ListItemText primary={item.label} />}
      </ListItemButton>
    );

    return (
      <ListItem key={item.label} disablePadding sx={{ px: 1 }}>
        {collapsed ? (
          <Tooltip title={item.label} placement="right">
            {content}
          </Tooltip>
        ) : content}
      </ListItem>
    );
  };

  return (
    <Box
      component="aside"
      sx={{
        width,
        flexShrink: 0,
        height: '100vh',
        borderRight: '1px solid #e4e7ec',
        bgcolor: '#fff',
        display: 'flex',
        flexDirection: 'column',
        transition: theme.transitions.create('width', {
          duration: theme.transitions.duration.shorter,
        }),
      }}
    >
      <Box sx={{ height: 64, display: 'flex', alignItems: 'center', px: collapsed ? 1 : 2 }}>
        <Box
          component="img"
          src={`${process.env.PUBLIC_URL}/uantwerp-logo.svg`}
          alt="University of Antwerp"
          sx={{ height: 28, width: 28, objectFit: 'contain', mr: collapsed ? 0 : 1.25 }}
        />
        {!collapsed && (
          <Typography variant="subtitle1" fontWeight={700} noWrap>
            SpatialDSL Studio
          </Typography>
        )}
        <IconButton
          size="small"
          onClick={() => setCollapsed(value => !value)}
          sx={{ ml: 'auto' }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </Box>

      <Divider />

      {!collapsed && isAdmin && <OwnerFilterControl />}

      <List sx={{ py: 1, flex: 1 }}>
        {visibleNavItems.map(renderItem)}
      </List>

      <Divider />

      <Box sx={{ px: collapsed ? 1 : 2, py: 1.5 }}>
        <Tooltip title={user?.email || 'User'} placement="right" disableHoverListener={!collapsed}>
          <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 40, justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <PersonIcon sx={{ color: 'text.secondary', mr: collapsed ? 0 : 1 }} />
            {!collapsed && (
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                  {user?.email?.split('@')[0] || 'User'}
                </Typography>
                <Typography variant="caption" color="textSecondary" noWrap>
                  {user?.role || 'Viewer'}
                </Typography>
              </Box>
            )}
          </Box>
        </Tooltip>
      </Box>

      <List sx={{ py: 1 }}>
        {visibleUtilityItems.map(renderItem)}
      </List>
    </Box>
  );
};

export default Sidebar;
