/**
 * Resource Dashboard Component
 * 
 * Displays overview metrics and statistics for the admin panel.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import SchemaIcon from '@mui/icons-material/Schema';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import CodeIcon from '@mui/icons-material/Code';
import BugReportIcon from '@mui/icons-material/BugReport';
import ShareIcon from '@mui/icons-material/Share';
import StorageIcon from '@mui/icons-material/Storage';
import RefreshIcon from '@mui/icons-material/Refresh';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import FolderIcon from '@mui/icons-material/Folder';

import { adminService, ResourceStats } from '../../services/core';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color?: string;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color = '#3641f5', subtitle }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {title}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 600, color }}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <Avatar sx={{ bgcolor: `${color}15`, color }}>
          {icon}
        </Avatar>
      </Box>
    </CardContent>
  </Card>
);

const ResourceDashboard: React.FC = () => {
  const [stats, setStats] = useState<ResourceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminService.getStats();
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'METAMODEL':
        return <SchemaIcon />;
      case 'MODEL':
        return <ModelTrainingIcon />;
      case 'DIAGRAM':
        return <DesignServicesIcon />;
      default:
        return <FolderIcon />;
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
        <IconButton size="small" onClick={loadStats} sx={{ ml: 1 }}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Alert>
    );
  }

  if (!stats) {
    return <Alert severity="info">No statistics available</Alert>;
  }

  const totalResources =
    stats.resources.metamodels +
    stats.resources.models +
    stats.resources.diagrams +
    stats.resources.transformations +
    stats.resources.codegenProjects +
    stats.resources.testCases;

  return (
    <Box>
      {/* Refresh Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Tooltip title="Refresh Statistics">
          <IconButton onClick={loadStats} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* User Statistics */}
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
        User Statistics
      </Typography>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 6 }}>
          <StatCard
            title="Total Users"
            value={stats.users.total}
            icon={<PeopleIcon />}
            color="#3641f5"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Users by Role
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                <Chip
                  size="small"
                  icon={<AdminPanelSettingsIcon />}
                  label={`Admin: ${stats.users.byRole.ADMIN}`}
                  color="error"
                  variant="outlined"
                />
                <Chip
                  size="small"
                  icon={<DesignServicesIcon />}
                  label={`DSL-Designer: ${stats.users.byRole.DSL_DESIGNER}`}
                  color="primary"
                  variant="outlined"
                />
                <Chip
                  size="small"
                  icon={<EditIcon />}
                  label={`Modeler: ${stats.users.byRole.MODELER}`}
                  color="secondary"
                  variant="outlined"
                />
                <Chip
                  size="small"
                  icon={<VisibilityIcon />}
                  label={`Viewer: ${stats.users.byRole.VIEWER}`}
                  variant="outlined"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Resource Statistics */}
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
        Resource Statistics
      </Typography>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <StatCard
            title="Metamodels"
            value={stats.resources.metamodels}
            icon={<SchemaIcon />}
            color="#3641f5"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <StatCard
            title="Models"
            value={stats.resources.models}
            icon={<ModelTrainingIcon />}
            color="#7c3aed"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <StatCard
            title="Diagrams"
            value={stats.resources.diagrams}
            icon={<DesignServicesIcon />}
            color="#0891b2"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <StatCard
            title="Transformations"
            value={stats.resources.transformations}
            icon={<AutorenewIcon />}
            color="#ea580c"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <StatCard
            title="Code Gen Projects"
            value={stats.resources.codegenProjects}
            icon={<CodeIcon />}
            color="#16a34a"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <StatCard
            title="Test Cases"
            value={stats.resources.testCases}
            icon={<BugReportIcon />}
            color="#dc2626"
          />
        </Grid>
      </Grid>

      {/* Storage & Sharing */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            title="Total Resources"
            value={totalResources}
            icon={<FolderIcon />}
            color="#475467"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            title="Shared Resources"
            value={stats.resources.sharedResources}
            icon={<ShareIcon />}
            color="#f59e0b"
            subtitle="Active sharing relationships"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            title="Storage Used"
            value={formatBytes(stats.storage.totalSizeBytes)}
            icon={<StorageIcon />}
            color="#6366f1"
            subtitle={`${stats.storage.totalFiles} files`}
          />
        </Grid>
      </Grid>

      {/* Recent Activity & Top Users */}
      <Grid container spacing={3}>
        {/* Recent Resources */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Recently Created Resources
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {stats.recentResources.length === 0 ? (
              <Typography color="text.secondary">No recent resources</Typography>
            ) : (
              <List dense>
                {stats.recentResources.map((resource, index) => (
                  <ListItem key={index} divider={index < stats.recentResources.length - 1}>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: 'primary.light', width: 36, height: 36 }}>
                        {getResourceIcon(resource.type)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={resource.name}
                      secondary={
                        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip size="small" label={resource.type} variant="outlined" />
                          <Typography variant="caption" component="span">
                            by {resource.userEmail}
                          </Typography>
                        </Box>
                      }
                    />
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(resource.createdAt)}
                    </Typography>
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        {/* Most Active Users */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Most Active Users
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {stats.mostActiveUsers.length === 0 ? (
              <Typography color="text.secondary">No user activity</Typography>
            ) : (
              <List dense>
                {stats.mostActiveUsers.map((user, index) => (
                  <ListItem key={user.id} divider={index < stats.mostActiveUsers.length - 1}>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: index < 3 ? 'primary.main' : 'grey.400', width: 36, height: 36 }}>
                        {index + 1}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={user.email}
                      secondary={`${user.resourceCount} resources created`}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ResourceDashboard;
