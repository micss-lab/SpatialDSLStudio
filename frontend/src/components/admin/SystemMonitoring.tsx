/**
 * System Monitoring Component
 * 
 * Displays system health, database status, and API metrics.
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
  LinearProgress,
  Chip,
  IconButton,
  Tooltip,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import StorageIcon from '@mui/icons-material/Storage';
import SpeedIcon from '@mui/icons-material/Speed';
import MemoryIcon from '@mui/icons-material/Memory';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import FolderIcon from '@mui/icons-material/Folder';

import { adminService, SystemHealth } from '../../services/core';

interface StatusIndicatorProps {
  status: 'healthy' | 'degraded' | 'unhealthy';
  label?: string;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, label }) => {
  const config = {
    healthy: { color: 'success' as const, icon: <CheckCircleIcon />, text: 'Healthy' },
    degraded: { color: 'warning' as const, icon: <WarningIcon />, text: 'Degraded' },
    unhealthy: { color: 'error' as const, icon: <ErrorIcon />, text: 'Unhealthy' },
  };

  const { color, icon, text } = config[status];

  return (
    <Chip
      icon={icon}
      label={label || text}
      color={color}
      variant="outlined"
      size="small"
    />
  );
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
};

const SystemMonitoring: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminService.getSystemHealth();
      setHealth(data);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to load system health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  if (loading && !health) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !health) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
        <IconButton size="small" onClick={loadHealth} sx={{ ml: 1 }}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Alert>
    );
  }

  const memoryUsagePercent = health
    ? (health.api.memoryUsage.heapUsed / health.api.memoryUsage.heapTotal) * 100
    : 0;

  return (
    <Box>
      {/* Header with refresh */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            System Health Overview
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={loadHealth} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Grid container spacing={3}>
        {/* Database Health */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StorageIcon color="primary" />
                <Typography variant="h6">Database</Typography>
              </Box>
              {health && <StatusIndicator status={health.database.status} />}
            </Box>
            <Divider sx={{ mb: 2 }} />
            
            {health && (
              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <SpeedIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Response Time"
                    secondary={
                      health.database.responseTimeMs >= 0
                        ? `${health.database.responseTimeMs.toFixed(2)} ms`
                        : 'Connection failed'
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <CheckCircleIcon color={health.database.status === 'healthy' ? 'success' : 'error'} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Connection Status"
                    secondary={
                      health.database.status === 'healthy'
                        ? 'Connected and responsive'
                        : health.database.status === 'degraded'
                        ? 'Connected but slow'
                        : 'Connection issues detected'
                    }
                  />
                </ListItem>
              </List>
            )}
          </Paper>
        </Grid>

        {/* API Health */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SpeedIcon color="primary" />
                <Typography variant="h6">API Server</Typography>
              </Box>
              {health && <StatusIndicator status={health.api.status} />}
            </Box>
            <Divider sx={{ mb: 2 }} />
            
            {health && (
              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <AccessTimeIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Uptime"
                    secondary={formatUptime(health.api.uptime)}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <MemoryIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Memory Usage"
                    secondary={
                      <Box>
                        <Typography variant="body2">
                          {formatBytes(health.api.memoryUsage.heapUsed)} / {formatBytes(health.api.memoryUsage.heapTotal)}
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={memoryUsagePercent}
                          color={memoryUsagePercent > 80 ? 'error' : memoryUsagePercent > 60 ? 'warning' : 'success'}
                          sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
                        />
                      </Box>
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="RSS Memory"
                    secondary={formatBytes(health.api.memoryUsage.rss)}
                    sx={{ pl: 7 }}
                  />
                </ListItem>
              </List>
            )}
          </Paper>
        </Grid>

        {/* Storage Stats */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <FolderIcon color="primary" />
              <Typography variant="h6">File Storage</Typography>
            </Box>
            <Divider sx={{ mb: 2 }} />
            
            {health && (
              <Grid container spacing={2}>
                <Grid size={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">
                        Total Files
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 600, color: 'primary.main' }}>
                        {health.storage.totalFiles}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">
                        Storage Used
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 600, color: 'primary.main' }}>
                        {health.storage.totalSizeMB} MB
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            )}
          </Paper>
        </Grid>

        {/* System Information */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              System Information
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            <List dense>
              <ListItem>
                <ListItemText
                  primary="Node.js Environment"
                  secondary={process.env.NODE_ENV || 'development'}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="API Version"
                  secondary="1.0.0"
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Database"
                  secondary="PostgreSQL (Prisma ORM)"
                />
              </ListItem>
            </List>
          </Paper>
        </Grid>

        {/* Health Summary */}
        <Grid size={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Overall System Status
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            {health && (
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">Database:</Typography>
                  <StatusIndicator status={health.database.status} />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">API:</Typography>
                  <StatusIndicator status={health.api.status} />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">Storage:</Typography>
                  <StatusIndicator status="healthy" />
                </Box>
              </Box>
            )}

            {!health && !loading && (
              <Alert severity="warning">
                Unable to retrieve system health information. Please check server connectivity.
              </Alert>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SystemMonitoring;
