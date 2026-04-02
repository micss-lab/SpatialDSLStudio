/**
 * Admin Panel - Main Component
 * 
 * Central admin dashboard with tabs for different management sections.
 * Only accessible to users with ADMIN role.
 */

import React, { useState } from 'react';
import {
  Box,
  Container,
  Paper,
  Tabs,
  Tab,
  Typography,
  Breadcrumbs,
  Link as MuiLink,
} from '@mui/material';
import { Link } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import FolderIcon from '@mui/icons-material/Folder';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import HomeIcon from '@mui/icons-material/Home';

import AssignmentIcon from '@mui/icons-material/Assignment';
import { useAuth } from '../../contexts/AuthContext';
import UserManagement from './UserManagement';
import ResourceDashboard from './ResourceDashboard';
import ResourceManagement from './ResourceManagement';
import SystemMonitoring from './SystemMonitoring';
import RoleRequestManagement from './RoleRequestManagement';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `admin-tab-${index}`,
    'aria-controls': `admin-tabpanel-${index}`,
  };
}

const AdminPanel: React.FC = () => {
  const { isAdmin, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Show nothing while loading auth state
  if (isLoading) {
    return null;
  }

  // Show blank unauthorized page for non-admin users
  if (!isAdmin) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: 'background.default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="h5" color="error">
          Unauthorized
        </Typography>
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 3, pb: 4 }}>
      {/* Breadcrumb Navigation */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <MuiLink
          component={Link}
          to="/"
          sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}
          underline="hover"
        >
          <HomeIcon sx={{ mr: 0.5 }} fontSize="small" />
          Home
        </MuiLink>
        <Typography color="text.primary" sx={{ display: 'flex', alignItems: 'center' }}>
          <AdminPanelSettingsIcon sx={{ mr: 0.5 }} fontSize="small" />
          Admin Panel
        </Typography>
      </Breadcrumbs>

      {/* Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
          Admin Panel
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage users, resources, and monitor system health from this central dashboard.
        </Typography>
      </Paper>

      {/* Tabs Navigation */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTab-root': {
              minHeight: 64,
              textTransform: 'none',
              fontWeight: 500,
            },
          }}
        >
          <Tab
            icon={<DashboardIcon />}
            iconPosition="start"
            label="Dashboard"
            {...a11yProps(0)}
          />
          <Tab
            icon={<PeopleIcon />}
            iconPosition="start"
            label="User Management"
            {...a11yProps(1)}
          />
          <Tab
            icon={<FolderIcon />}
            iconPosition="start"
            label="Resource Management"
            {...a11yProps(2)}
          />
          <Tab
            icon={<MonitorHeartIcon />}
            iconPosition="start"
            label="System Monitoring"
            {...a11yProps(3)}
          />
          <Tab
            icon={<AssignmentIcon />}
            iconPosition="start"
            label="Role Requests"
            {...a11yProps(4)}
          />
        </Tabs>
      </Paper>

      {/* Tab Panels */}
      <TabPanel value={activeTab} index={0}>
        <ResourceDashboard />
      </TabPanel>
      <TabPanel value={activeTab} index={1}>
        <UserManagement />
      </TabPanel>
      <TabPanel value={activeTab} index={2}>
        <ResourceManagement />
      </TabPanel>
      <TabPanel value={activeTab} index={3}>
        <SystemMonitoring />
      </TabPanel>
      <TabPanel value={activeTab} index={4}>
        <RoleRequestManagement />
      </TabPanel>
    </Container>
  );
};

export default AdminPanel;
