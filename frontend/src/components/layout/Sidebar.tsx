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
  MenuItem,
  Select,
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
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SettingsIcon from '@mui/icons-material/Settings';
import { AuthUser } from '../../services/core';
import { useProject } from '../../contexts/ProjectContext';
import { StudioProject } from '../../models/project.types';
import { projectService } from '../../services/project.service';

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
  const { project, openProject } = useProject();
  const location = useLocation();
  const theme = useTheme();
  const shouldAutoCollapse = useMediaQuery(theme.breakpoints.down('md'));
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [projects, setProjects] = useState<StudioProject[]>([project]);

  useEffect(() => {
    projectService.list(project.status === 'ARCHIVED')
      .then(items => setProjects(items.some(item => item.id === project.id) ? items : [project, ...items]))
      .catch(() => setProjects([project]));
  }, [project]);

  useEffect(() => {
    if (shouldAutoCollapse) {
      setCollapsed(true);
    }
  }, [shouldAutoCollapse]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  const navItems = useMemo<NavItem[]>(() => {
    const base = `/projects/${project.id}`;
    return [
    { label: 'Overview', path: base, icon: <HomeIcon />, match: pathname => pathname === base },
    { label: 'Metamodels', path: `${base}/metamodels`, icon: <SchemaIcon /> },
    { label: 'Models', path: `${base}/models`, icon: <ModelTrainingIcon /> },
    {
      label: 'Viewpoints',
      path: `${base}/viewpoints`,
      icon: <AccountTreeIcon />,
      match: pathname => pathname.startsWith(`${base}/viewpoints`)
        || (pathname.startsWith(`${base}/metamodels/`) && pathname.endsWith('/viewpoints')),
    },
    {
      label: 'Views',
      path: `${base}/views`,
      icon: <DesignServicesIcon />,
      match: pathname => pathname.startsWith(`${base}/views`) || pathname.startsWith(`${base}/diagrams`),
    },
    { label: 'Code Generation', path: `${base}/code-generation`, icon: <CodeIcon /> },
    { label: 'Transformations', path: `${base}/transformations`, icon: <AutorenewIcon /> },
    { label: 'Testing', path: `${base}/testing`, icon: <BugReportIcon /> },
    { label: 'Project Settings', path: `${base}/settings`, icon: <SettingsIcon /> },
    { label: 'Admin', path: '/admin', icon: <AdminPanelSettingsIcon />, adminOnly: true },
  ];
  }, [project.id]);

  const utilityItems = useMemo<NavItem[]>(() => [
    { label: 'Request Role', icon: <UpgradeIcon />, onClick: onRoleRequest, nonAdminOnly: true },
    { label: 'All Projects', path: '/projects', icon: <FolderOpenIcon /> },
    { label: 'Help', path: `/projects/${project.id}/help`, icon: <HelpOutlineIcon /> },
    { label: 'About', path: `/projects/${project.id}/about`, icon: <InfoIcon /> },
    { label: 'Logout', icon: <LogoutIcon />, onClick: onLogout },
  ], [onLogout, onRoleRequest, project.id]);

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

      <Box sx={{ px: collapsed ? 1 : 2, py: 1.5 }}>
        {collapsed ? (
          <Tooltip title={`Project: ${project.name}`} placement="right">
            <IconButton component={Link} to="/projects" aria-label="Switch project">
              <FolderOpenIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <Select
            fullWidth
            size="small"
            value={project.id}
            onChange={event => openProject(event.target.value)}
            aria-label="Active project"
          >
            {projects.map(item => <MenuItem value={item.id} key={item.id}>{item.name}</MenuItem>)}
          </Select>
        )}
      </Box>

      <Divider />

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
                  {project.isPlatformAdmin
                    ? 'Platform Admin'
                    : project.role === 'DSL_DESIGNER'
                      ? 'DSL Designer'
                      : project.role.charAt(0) + project.role.slice(1).toLowerCase()}
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
