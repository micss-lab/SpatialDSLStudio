/**
 * SharedWithMe Component
 * 
 * Displays all resources that have been shared with the current user.
 * Provides navigation to the shared resources.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Card, CardContent, Typography, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Chip, CircularProgress, Alert, Tabs, Tab, IconButton, Tooltip } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
import TransformIcon from '@mui/icons-material/Transform';
import CodeIcon from '@mui/icons-material/Code';
import ScienceIcon from '@mui/icons-material/Science';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PersonIcon from '@mui/icons-material/Person';
import {
  sharingService,
  ResourceType,
  SharedResource,
} from '../../services/common';

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
      {...other}
    >
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

// Resource type configuration
const RESOURCE_CONFIG: Record<ResourceType, { icon: React.ReactNode; path: string }> = {
  METAMODEL: { icon: <FolderIcon />, path: '/metamodels' },
  MODEL: { icon: <AccountTreeIcon />, path: '/models' },
  DIAGRAM: { icon: <ViewQuiltIcon />, path: '/diagrams' },
  TRANSFORMATION_RULE: { icon: <TransformIcon />, path: '/transformations' },
  CODEGEN_PROJECT: { icon: <CodeIcon />, path: '/codegeneration' },
  TEST_CASE: { icon: <ScienceIcon />, path: '/testing' },
};

const RESOURCE_TYPES: ResourceType[] = [
  'METAMODEL',
  'MODEL',
  'DIAGRAM',
  'TRANSFORMATION_RULE',
  'CODEGEN_PROJECT',
  'TEST_CASE',
];

interface SharedWithMeProps {
  onNavigate?: (resourceType: ResourceType, resourceId: string) => void;
}

const SharedWithMe: React.FC<SharedWithMeProps> = ({ onNavigate }) => {
  const [shares, setShares] = useState<SharedResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);

  // Load shared resources
  const loadShares = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await sharingService.getSharedWithMe();
      setShares(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load shared resources');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShares();
  }, [loadShares]);

  // Group shares by resource type
  const groupedShares = RESOURCE_TYPES.reduce((acc, type) => {
    acc[type] = shares.filter((s) => s.resourceType === type);
    return acc;
  }, {} as Record<ResourceType, SharedResource[]>);

  // Handle navigation to a resource
  const handleNavigate = (share: SharedResource) => {
    if (onNavigate) {
      onNavigate(share.resourceType, share.resourceId);
    } else {
      // Default behavior: navigate using window.location
      const config = RESOURCE_CONFIG[share.resourceType];
      if (config) {
        window.location.href = `${config.path}/${share.resourceId}`;
      }
    }
  };

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  const totalShares = shares.length;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Shared with Me
          {totalShares > 0 && (
            <Chip
              label={totalShares}
              size="small"
              color="primary"
              sx={{ ml: 1 }}
            />
          )}
        </Typography>

        {totalShares === 0 ? (
          <Typography color="textSecondary" sx={{ py: 2 }}>
            No resources have been shared with you yet.
          </Typography>
        ) : (
          <>
            <Tabs
              value={tabValue}
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
            >
              {RESOURCE_TYPES.map((type, index) => {
                const count = groupedShares[type].length;
                const config = RESOURCE_CONFIG[type];
                return (
                  <Tab
                    key={type}
                    icon={config.icon as React.ReactElement}
                    label={
                      <Box display="flex" alignItems="center" gap={0.5}>
                        {sharingService.getResourceTypeName(type)}
                        {count > 0 && (
                          <Chip label={count} size="small" />
                        )}
                      </Box>
                    }
                    iconPosition="start"
                  />
                );
              })}
            </Tabs>

            {RESOURCE_TYPES.map((type, index) => (
              <TabPanel key={type} value={tabValue} index={index}>
                {groupedShares[type].length === 0 ? (
                  <Typography color="textSecondary">
                    No {sharingService.getResourceTypeName(type).toLowerCase()}s shared with you.
                  </Typography>
                ) : (
                  <List dense>
                    {groupedShares[type].map((share) => (
                      <ListItem
                        key={share.id}
                        disablePadding
                        secondaryAction={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Chip
                              label={sharingService.getPermissionName(share.permission)}
                              size="small"
                              color={share.permission === 'EDITOR' ? 'primary' : 'default'}
                              variant="outlined"
                            />
                            <Tooltip title="Open">
                              <IconButton
                                edge="end"
                                size="small"
                                onClick={() => handleNavigate(share)}
                              >
                                <OpenInNewIcon />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        }
                      >
                        <ListItemButton onClick={() => handleNavigate(share)}>
                          <ListItemIcon>
                            {RESOURCE_CONFIG[share.resourceType].icon}
                          </ListItemIcon>
                          <ListItemText
                            primary={share.resourceId}
                            secondary={
                              <Box display="flex" alignItems="center" gap={1}>
                                <PersonIcon fontSize="small" />
                                <span>Shared by: {share.ownerEmail || 'Unknown'}</span>
                              </Box>
                            }
                          />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                )}
              </TabPanel>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SharedWithMe;
