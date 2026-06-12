import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { adminService, AdminNotificationResult, AdminUser } from '../../services/core/admin.service';
import { UserRole } from '../../services/core';

type RecipientMode = 'all' | 'selected';

const AdminNotifications: React.FC = () => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('all');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<AdminNotificationResult | null>(null);
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setError('');

    try {
      const response = await adminService.getUsers({
        page: 1,
        pageSize: 1000,
        search: userSearch.trim() || undefined,
        role: roleFilter || undefined,
        sortBy: 'email',
        sortOrder: 'asc',
      });
      setUsers(response.users);
    } catch (err: any) {
      setError(err?.message || 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, [roleFilter, userSearch]);

  useEffect(() => {
    if (recipientMode === 'selected') {
      loadUsers();
    }
  }, [loadUsers, recipientMode]);

  const selectedUsers = useMemo(
    () => users.filter(user => selectedUserIds.includes(user.id)),
    [selectedUserIds, users]
  );

  const hasRecipients = recipientMode === 'all' || selectedUserIds.length > 0;
  const canSend = subject.trim().length > 0 && message.trim().length > 0 && hasRecipients && !isSending;

  const toggleUser = (userId: string) => {
    setSelectedUserIds(current =>
      current.includes(userId)
        ? current.filter(id => id !== userId)
        : [...current, userId]
    );
  };

  const selectVisibleUsers = () => {
    setSelectedUserIds(current => Array.from(new Set([...current, ...users.map(user => user.id)])));
  };

  const clearSelectedUsers = () => {
    setSelectedUserIds([]);
  };

  const handleSend = async () => {
    if (!canSend) return;

    const recipientSummary = recipientMode === 'all'
      ? 'all users'
      : `${selectedUserIds.length} selected user(s)`;
    const confirmed = window.confirm(
      `Send this notification to ${recipientSummary}? Admins will be CCed and non-admin users will be BCCed.`
    );
    if (!confirmed) return;

    setIsSending(true);
    setResult(null);
    setError('');

    try {
      const response = await adminService.sendBroadcastNotification({
        subject: subject.trim(),
        message: message.trim(),
        ...(recipientMode === 'selected' ? { userIds: selectedUserIds } : {}),
      });
      setResult(response);
      setSubject('');
      setMessage('');
      if (recipientMode === 'selected') {
        setSelectedUserIds([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to send notification');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Broadcast Notification
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Send a platform notification email for major changes. Admins are CCed for visibility; non-admin users are BCCed for privacy.
        </Typography>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Stack spacing={2.5}>
          {error && <Alert severity="error">{error}</Alert>}
          {result && (
            <Alert severity="success">
              Sent notification to {result.totalUsers} user(s): {result.ccAdmins} admin(s) CCed, {result.bccUsers} user(s) BCCed across {result.batches} email batch{result.batches === 1 ? '' : 'es'}.
            </Alert>
          )}

          <TextField
            label="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            fullWidth
            inputProps={{ maxLength: 160 }}
            helperText={`${subject.length}/160`}
            disabled={isSending}
          />

          <TextField
            label="Message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            fullWidth
            multiline
            minRows={10}
            inputProps={{ maxLength: 10000 }}
            helperText={`${message.length}/10000`}
            disabled={isSending}
          />

          <FormControl>
            <FormLabel>Recipients</FormLabel>
            <RadioGroup
              row
              value={recipientMode}
              onChange={(event) => setRecipientMode(event.target.value as RecipientMode)}
            >
              <FormControlLabel value="all" control={<Radio />} label="All users" disabled={isSending} />
              <FormControlLabel value="selected" control={<Radio />} label="Selected users" disabled={isSending} />
            </RadioGroup>
          </FormControl>

          {recipientMode === 'selected' && (
            <Stack spacing={1.5}>
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 220px' } }}>
                <TextField
                  label="Search users"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  disabled={isSending || usersLoading}
                  size="small"
                />
                <TextField
                  label="Role"
                  select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value as UserRole | '')}
                  disabled={isSending || usersLoading}
                  size="small"
                >
                  <MenuItem value="">All roles</MenuItem>
                  <MenuItem value="ADMIN">Admin</MenuItem>
                  <MenuItem value="DSL_DESIGNER">DSL designer</MenuItem>
                  <MenuItem value="MODELER">Modeler</MenuItem>
                  <MenuItem value="VIEWER">Viewer</MenuItem>
                </TextField>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {selectedUserIds.length} selected{selectedUsers.length > 0 ? `, ${selectedUsers.filter(user => user.role === 'ADMIN').length} admin(s)` : ''}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={selectVisibleUsers} disabled={usersLoading || users.length === 0 || isSending}>
                    Select visible
                  </Button>
                  <Button size="small" onClick={clearSelectedUsers} disabled={selectedUserIds.length === 0 || isSending}>
                    Clear
                  </Button>
                </Stack>
              </Box>

              {selectedUserIds.length === 0 && (
                <Alert severity="info">Pick at least one user before sending a targeted notification.</Alert>
              )}

              <Box sx={{ maxHeight: 360, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                {usersLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : (
                  <List dense disablePadding>
                    {users.map(user => (
                      <ListItem key={user.id} disablePadding divider>
                        <ListItemButton onClick={() => toggleUser(user.id)} disabled={isSending}>
                          <Checkbox
                            edge="start"
                            checked={selectedUserIds.includes(user.id)}
                            tabIndex={-1}
                            disableRipple
                          />
                          <ListItemText
                            primary={user.email}
                            secondary={user.role.replace('_', ' ').toLowerCase()}
                          />
                        </ListItemButton>
                      </ListItem>
                    ))}
                    {users.length === 0 && (
                      <ListItem>
                        <ListItemText primary="No users found" />
                      </ListItem>
                    )}
                  </List>
                )}
              </Box>
            </Stack>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={isSending ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
              onClick={handleSend}
              disabled={!canSend}
            >
              Send Notification
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
};

export default AdminNotifications;
