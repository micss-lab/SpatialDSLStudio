/**
 * Resource Management Component
 * 
 * View and manage all resources across all users.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, TextField, InputAdornment, IconButton, Button, Chip, Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, CircularProgress, Alert, Tooltip, Toolbar, Snackbar, SelectChangeEvent } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/Delete';
import ShareIcon from '@mui/icons-material/Share';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SchemaIcon from '@mui/icons-material/Schema';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import CodeIcon from '@mui/icons-material/Code';
import BugReportIcon from '@mui/icons-material/BugReport';

import {
  adminService,
  AdminResourceItem,
  ResourceListParams,
  AdminUser,
  ResourceType,
} from '../../services/core';

const RESOURCE_TYPES: ResourceType[] = [
  'METAMODEL',
  'MODEL',
  'DIAGRAM',
  'TRANSFORMATION_RULE',
  'CODEGEN_PROJECT',
  'TEST_CASE',
];

const RESOURCE_ICONS: Record<ResourceType, React.ReactNode> = {
  METAMODEL: <SchemaIcon fontSize="small" />,
  MODEL: <ModelTrainingIcon fontSize="small" />,
  DIAGRAM: <DesignServicesIcon fontSize="small" />,
  TRANSFORMATION_RULE: <AutorenewIcon fontSize="small" />,
  CODEGEN_PROJECT: <CodeIcon fontSize="small" />,
  TEST_CASE: <BugReportIcon fontSize="small" />,
};

const RESOURCE_COLORS: Record<ResourceType, 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'> = {
  METAMODEL: 'primary',
  MODEL: 'secondary',
  DIAGRAM: 'info',
  TRANSFORMATION_RULE: 'warning',
  CODEGEN_PROJECT: 'success',
  TEST_CASE: 'error',
};

const ResourceManagement: React.FC = () => {
  // State
  const [resources, setResources] = useState<AdminResourceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Pagination & Filtering
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ResourceType | ''>('');
  const [sortBy] = useState<ResourceListParams['sortBy']>('createdAt');
  const [sortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Action Menu
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuResource, setMenuResource] = useState<AdminResourceItem | null>(null);
  
  // Users for transfer (loaded on demand)
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // Dialogs
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [unshareDialogOpen, setUnshareDialogOpen] = useState(false);

  // Load resources
  const loadResources = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: ResourceListParams = {
        page: page + 1,
        pageSize: rowsPerPage,
        search: search || undefined,
        type: typeFilter || undefined,
        sortBy,
        sortOrder,
      };
      const response = await adminService.getResources(params);
      setResources(response.resources);
      setTotal(response.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load resources');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, typeFilter, sortBy, sortOrder]);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  // Load users for transfer dialog
  const loadUsers = useCallback(async () => {
    if (users.length > 0) return;
    try {
      setLoadingUsers(true);
      const response = await adminService.getUsers({ pageSize: 100 });
      setUsers(response.users);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  }, [users.length]);

  // Handlers
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
    setPage(0);
  };

  const handleTypeFilterChange = (event: SelectChangeEvent<ResourceType | ''>) => {
    setTypeFilter(event.target.value as ResourceType | '');
    setPage(0);
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, resource: AdminResourceItem) => {
    setMenuAnchorEl(event.currentTarget);
    setMenuResource(resource);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuResource(null);
  };

  // Action handlers
  const handleDeleteResource = async () => {
    if (!menuResource) return;
    try {
      await adminService.deleteResource(menuResource.type, menuResource.id);
      setSuccessMessage(`${menuResource.type} "${menuResource.name}" deleted`);
      loadResources();
    } catch (err: any) {
      setError(err.message || 'Failed to delete resource');
    }
    setDeleteDialogOpen(false);
    handleMenuClose();
  };

  const handleTransferOwnership = async () => {
    if (!menuResource || !selectedUserId) return;
    try {
      await adminService.transferOwnership(menuResource.type, menuResource.id, selectedUserId);
      setSuccessMessage(`Ownership transferred for "${menuResource.name}"`);
      loadResources();
    } catch (err: any) {
      setError(err.message || 'Failed to transfer ownership');
    }
    setTransferDialogOpen(false);
    setSelectedUserId('');
    handleMenuClose();
  };

  const handleForceUnshare = async () => {
    if (!menuResource) return;
    try {
      const result = await adminService.forceUnshare(menuResource.type, menuResource.id);
      setSuccessMessage(`Removed ${result.removedSharesCount} shares from "${menuResource.name}"`);
      loadResources();
    } catch (err: any) {
      setError(err.message || 'Failed to unshare resource');
    }
    setUnshareDialogOpen(false);
    handleMenuClose();
  };

  const handlePreviewResource = async () => {
    if (!menuResource) return;
    try {
      setLoadingPreview(true);
      setPreviewDialogOpen(true);
      const data = await adminService.getResourceDetails(menuResource.type, menuResource.id);
      setPreviewData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load resource details');
      setPreviewDialogOpen(false);
    } finally {
      setLoadingPreview(false);
    }
    handleMenuClose();
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Box>
      {/* Error/Success Messages */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Snackbar
        open={!!successMessage}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="success" onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      </Snackbar>

      {/* Toolbar */}
      <Paper sx={{ mb: 2 }}>
        <Toolbar sx={{ pl: { sm: 2 }, pr: { xs: 1, sm: 1 } }}>
          <TextField
            placeholder="Search resources..."
            size="small"
            value={search}
            onChange={handleSearchChange}
            sx={{ minWidth: 250, mr: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          <FormControl size="small" sx={{ minWidth: 150, mr: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={typeFilter}
              label="Type"
              onChange={handleTypeFilterChange}
            >
              <MenuItem value="">All Types</MenuItem>
              {RESOURCE_TYPES.map(type => (
                <MenuItem key={type} value={type}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {RESOURCE_ICONS[type]}
                    {type.replace('_', ' ')}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title="Refresh">
            <IconButton onClick={loadResources}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </Paper>

      {/* Resource Table */}
      <TableContainer component={Paper}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Owner</TableCell>
                  <TableCell>Shared With</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {resources.map(resource => (
                  <TableRow key={`${resource.type}-${resource.id}`} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {resource.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        icon={RESOURCE_ICONS[resource.type] as React.ReactElement}
                        label={resource.type.replace('_', ' ')}
                        color={RESOURCE_COLORS[resource.type]}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{resource.userEmail}</TableCell>
                    <TableCell>
                      {resource.sharedWith > 0 ? (
                        <Chip
                          size="small"
                          icon={<ShareIcon />}
                          label={`${resource.sharedWith} users`}
                          color="info"
                          variant="outlined"
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Not shared
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(resource.createdAt)}</TableCell>
                    <TableCell>{formatDate(resource.updatedAt)}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, resource)}
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {resources.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No resources found</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination
              rowsPerPageOptions={[5, 10, 25, 50]}
              component="div"
              count={total}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
            />
          </>
        )}
      </TableContainer>

      {/* Action Menu */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handlePreviewResource}>
          <VisibilityIcon fontSize="small" sx={{ mr: 1 }} />
          Preview
        </MenuItem>
        <MenuItem onClick={() => { setTransferDialogOpen(true); loadUsers(); }}>
          <SwapHorizIcon fontSize="small" sx={{ mr: 1 }} />
          Transfer Ownership
        </MenuItem>
        {(menuResource?.sharedWith || 0) > 0 && (
          <MenuItem onClick={() => setUnshareDialogOpen(true)}>
            <ShareIcon fontSize="small" sx={{ mr: 1 }} />
            Force Unshare
          </MenuItem>
        )}
        <MenuItem onClick={() => setDeleteDialogOpen(true)} sx={{ color: 'error.main' }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Resource</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone!
          </Alert>
          <Typography>
            Are you sure you want to delete <strong>{menuResource?.name}</strong>?
          </Typography>
          {menuResource?.type === 'METAMODEL' && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Warning: Deleting a metamodel may affect models that depend on it.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteResource} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Transfer Ownership Dialog */}
      <Dialog open={transferDialogOpen} onClose={() => setTransferDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Transfer Ownership</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Transfer <strong>{menuResource?.name}</strong> to another user.
          </Typography>
          {loadingUsers ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <FormControl fullWidth sx={{ mt: 1 }}>
              <InputLabel>New Owner</InputLabel>
              <Select
                value={selectedUserId}
                label="New Owner"
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                {users
                  .filter(u => u.id !== menuResource?.userId)
                  .map(user => (
                    <MenuItem key={user.id} value={user.id}>
                      {user.email} ({user.role})
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setTransferDialogOpen(false); setSelectedUserId(''); }}>Cancel</Button>
          <Button
            onClick={handleTransferOwnership}
            variant="contained"
            disabled={!selectedUserId}
          >
            Transfer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Force Unshare Dialog */}
      <Dialog open={unshareDialogOpen} onClose={() => setUnshareDialogOpen(false)}>
        <DialogTitle>Force Unshare</DialogTitle>
        <DialogContent>
          <Typography>
            Remove all shares for <strong>{menuResource?.name}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This will remove access from {menuResource?.sharedWith} user(s).
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnshareDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleForceUnshare} variant="contained" color="warning">
            Force Unshare
          </Button>
        </DialogActions>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog
        open={previewDialogOpen}
        onClose={() => { setPreviewDialogOpen(false); setPreviewData(null); }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Resource Preview: {menuResource?.name}
        </DialogTitle>
        <DialogContent>
          {loadingPreview ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : previewData ? (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Details
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                <pre style={{ margin: 0, overflow: 'auto', maxHeight: 400 }}>
                  {JSON.stringify(previewData, null, 2)}
                </pre>
              </Paper>
            </Box>
          ) : (
            <Typography color="text.secondary">No data available</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setPreviewDialogOpen(false); setPreviewData(null); }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ResourceManagement;
