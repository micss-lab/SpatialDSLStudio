/**
 * User Management Component
 * 
 * Displays user list with search, filtering, and management actions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  CircularProgress,
  Alert,
  Tooltip,
  Checkbox,
  Toolbar,
  alpha,
  Snackbar,
  SelectChangeEvent,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
import LockResetIcon from '@mui/icons-material/LockReset';
import FilterListIcon from '@mui/icons-material/FilterList';

import {
  adminService,
  AdminUser,
  UserListParams,
  UserRole,
} from '../../services/core';
import { useAuth } from '../../contexts/AuthContext';

const ROLE_OPTIONS: UserRole[] = ['ADMIN', 'DSL_DESIGNER', 'MODELER', 'VIEWER'];

const ROLE_CONFIG: Record<UserRole, { color: 'error' | 'primary' | 'secondary' | 'default'; icon: React.ReactNode }> = {
  ADMIN: { color: 'error', icon: <AdminPanelSettingsIcon fontSize="small" /> },
  DSL_DESIGNER: { color: 'primary', icon: <DesignServicesIcon fontSize="small" /> },
  MODELER: { color: 'secondary', icon: <EditIcon fontSize="small" /> },
  VIEWER: { color: 'default', icon: <VisibilityIcon fontSize="small" /> },
};

const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  
  // State
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Pagination & Filtering
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [sortBy, setSortBy] = useState<UserListParams['sortBy']>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Selection
  const [selected, setSelected] = useState<string[]>([]);
  
  // Action Menu
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuUser, setMenuUser] = useState<AdminUser | null>(null);
  
  // Dialogs
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState<UserRole>('DSL_DESIGNER');
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkRoleDialogOpen, setBulkRoleDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  // Load users
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: UserListParams = {
        page: page + 1,
        pageSize: rowsPerPage,
        search: search || undefined,
        role: roleFilter || undefined,
        sortBy,
        sortOrder,
      };
      const response = await adminService.getUsers(params);
      setUsers(response.users);
      setTotal(response.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, roleFilter, sortBy, sortOrder]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Handlers
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
    setPage(0);
  };

  const handleRoleFilterChange = (event: SelectChangeEvent<UserRole | ''>) => {
    setRoleFilter(event.target.value as UserRole | '');
    setPage(0);
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, user: AdminUser) => {
    setMenuAnchorEl(event.currentTarget);
    setMenuUser(user);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuUser(null);
  };

  // Selection handlers
  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const newSelected = users
        .filter(u => u.id !== currentUser?.id)
        .map(u => u.id);
      setSelected(newSelected);
    } else {
      setSelected([]);
    }
  };

  const handleSelectOne = (id: string) => {
    if (id === currentUser?.id) return; // Can't select self
    
    const selectedIndex = selected.indexOf(id);
    let newSelected: string[] = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selected, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selected.slice(1));
    } else if (selectedIndex === selected.length - 1) {
      newSelected = newSelected.concat(selected.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selected.slice(0, selectedIndex),
        selected.slice(selectedIndex + 1),
      );
    }

    setSelected(newSelected);
  };

  const isSelected = (id: string) => selected.indexOf(id) !== -1;

  // Action handlers
  const handleChangeRole = async () => {
    if (!menuUser) return;
    try {
      await adminService.changeUserRole(menuUser.id, newRole);
      setSuccessMessage(`Role changed to ${newRole} for ${menuUser.email}`);
      loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to change role');
    }
    setRoleDialogOpen(false);
    handleMenuClose();
  };

  const handleResetPassword = async () => {
    if (!menuUser || !newPassword) return;
    try {
      await adminService.resetUserPassword(menuUser.id, newPassword);
      setSuccessMessage(`Password reset for ${menuUser.email}`);
      setNewPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    }
    setResetPasswordDialogOpen(false);
    handleMenuClose();
  };

  const handleDeleteUser = async () => {
    if (!menuUser) return;
    try {
      await adminService.deleteUser(menuUser.id);
      setSuccessMessage(`User ${menuUser.email} deleted`);
      loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    }
    setDeleteDialogOpen(false);
    handleMenuClose();
  };

  const handleBulkRoleChange = async () => {
    try {
      const result = await adminService.bulkChangeRole(selected, newRole);
      setSuccessMessage(`Role changed for ${result.updatedCount} users`);
      setSelected([]);
      loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to change roles');
    }
    setBulkRoleDialogOpen(false);
  };

  const handleBulkDelete = async () => {
    try {
      const result = await adminService.bulkDeleteUsers(selected);
      setSuccessMessage(`${result.deletedCount} users deleted`);
      setSelected([]);
      loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete users');
    }
    setBulkDeleteDialogOpen(false);
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Never';
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
        <Toolbar
          sx={{
            pl: { sm: 2 },
            pr: { xs: 1, sm: 1 },
            ...(selected.length > 0 && {
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
            }),
          }}
        >
          {selected.length > 0 ? (
            <>
              <Typography sx={{ flex: '1 1 100%' }} color="primary" variant="subtitle1">
                {selected.length} selected
              </Typography>
              <Tooltip title="Change Role">
                <Button
                  size="small"
                  startIcon={<EditIcon />}
                  onClick={() => setBulkRoleDialogOpen(true)}
                  sx={{ mr: 1 }}
                >
                  Change Role
                </Button>
              </Tooltip>
              <Tooltip title="Delete">
                <Button
                  size="small"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => setBulkDeleteDialogOpen(true)}
                >
                  Delete
                </Button>
              </Tooltip>
            </>
          ) : (
            <>
              <TextField
                placeholder="Search by email..."
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
              <FormControl size="small" sx={{ minWidth: 120, mr: 2 }}>
                <InputLabel>Role</InputLabel>
                <Select
                  value={roleFilter}
                  label="Role"
                  onChange={handleRoleFilterChange}
                >
                  <MenuItem value="">All</MenuItem>
                  {ROLE_OPTIONS.map(role => (
                    <MenuItem key={role} value={role}>{role}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box sx={{ flexGrow: 1 }} />
              <Tooltip title="Refresh">
                <IconButton onClick={loadUsers}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Toolbar>
      </Paper>

      {/* User Table */}
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
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={selected.length > 0 && selected.length < users.length - 1}
                      checked={users.length > 0 && selected.length === users.filter(u => u.id !== currentUser?.id).length}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Resources</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map(user => {
                  const isItemSelected = isSelected(user.id);
                  const isSelf = user.id === currentUser?.id;
                  
                  return (
                    <TableRow
                      key={user.id}
                      hover
                      selected={isItemSelected}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={isItemSelected}
                          onChange={() => handleSelectOne(user.id)}
                          disabled={isSelf}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {user.email}
                          {isSelf && (
                            <Chip size="small" label="You" color="info" variant="outlined" />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          icon={ROLE_CONFIG[user.role].icon as React.ReactElement}
                          label={user.role}
                          color={ROLE_CONFIG[user.role].color}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Tooltip title={`Metamodels: ${user.resourceCounts.metamodels}, Models: ${user.resourceCounts.models}, Diagrams: ${user.resourceCounts.diagrams}`}>
                          <Typography variant="body2">
                            {user.resourceCounts.metamodels + user.resourceCounts.models + user.resourceCounts.diagrams} resources
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>{formatDate(user.createdAt)}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={(e) => handleMenuOpen(e, user)}
                          disabled={isSelf}
                        >
                          <MoreVertIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No users found</Typography>
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
        <MenuItem onClick={() => { setRoleDialogOpen(true); setNewRole(menuUser?.role || 'DSL_DESIGNER'); }}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          Change Role
        </MenuItem>
        <MenuItem onClick={() => setResetPasswordDialogOpen(true)}>
          <LockResetIcon fontSize="small" sx={{ mr: 1 }} />
          Reset Password
        </MenuItem>
        <MenuItem onClick={() => setDeleteDialogOpen(true)} sx={{ color: 'error.main' }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete User
        </MenuItem>
      </Menu>

      {/* Change Role Dialog */}
      <Dialog open={roleDialogOpen} onClose={() => setRoleDialogOpen(false)}>
        <DialogTitle>Change User Role</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Change role for <strong>{menuUser?.email}</strong>
          </Typography>
          <FormControl fullWidth>
            <InputLabel>New Role</InputLabel>
            <Select
              value={newRole}
              label="New Role"
              onChange={(e) => setNewRole(e.target.value as UserRole)}
            >
              {ROLE_OPTIONS.map(role => (
                <MenuItem key={role} value={role}>{role}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleChangeRole} variant="contained">Change Role</Button>
        </DialogActions>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordDialogOpen} onClose={() => setResetPasswordDialogOpen(false)}>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Set new password for <strong>{menuUser?.email}</strong>
          </Typography>
          <TextField
            autoFocus
            label="New Password"
            type="password"
            fullWidth
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            helperText="Minimum 6 characters"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setResetPasswordDialogOpen(false); setNewPassword(''); }}>Cancel</Button>
          <Button
            onClick={handleResetPassword}
            variant="contained"
            disabled={newPassword.length < 6}
          >
            Reset Password
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete User</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone!
          </Alert>
          <Typography>
            Are you sure you want to delete <strong>{menuUser?.email}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            All resources owned by this user will also be deleted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteUser} variant="contained" color="error">
            Delete User
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Role Change Dialog */}
      <Dialog open={bulkRoleDialogOpen} onClose={() => setBulkRoleDialogOpen(false)}>
        <DialogTitle>Change Role for {selected.length} Users</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>New Role</InputLabel>
            <Select
              value={newRole}
              label="New Role"
              onChange={(e) => setNewRole(e.target.value as UserRole)}
            >
              {ROLE_OPTIONS.map(role => (
                <MenuItem key={role} value={role}>{role}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkRoleDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleBulkRoleChange} variant="contained">Change Role</Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteDialogOpen} onClose={() => setBulkDeleteDialogOpen(false)}>
        <DialogTitle>Delete {selected.length} Users</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone!
          </Alert>
          <Typography>
            Are you sure you want to delete {selected.length} users and all their resources?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleBulkDelete} variant="contained" color="error">
            Delete Users
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserManagement;
