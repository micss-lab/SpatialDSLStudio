import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Alert,
  CircularProgress,
  Box,
  Chip,
  Divider,
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { roleRequestService, RoleRequest, UserRole } from '../../services/core';

const ROLE_HIERARCHY: UserRole[] = ['VIEWER', 'MODELER', 'DSL_DESIGNER', 'ADMIN'];

interface RoleRequestDialogProps {
  open: boolean;
  onClose: () => void;
}

const RoleRequestDialog: React.FC<RoleRequestDialogProps> = ({ open, onClose }) => {
  const { user } = useAuth();
  const [requestedRole, setRequestedRole] = useState<UserRole>('MODELER');
  const [reason, setReason] = useState('');
  const [myRequests, setMyRequests] = useState<RoleRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const currentRoleIndex = user ? ROLE_HIERARCHY.indexOf(user.role) : 0;
  const availableRoles = ROLE_HIERARCHY.filter((_, i) => i > currentRoleIndex && i < ROLE_HIERARCHY.length - 1); // Exclude ADMIN

  const loadMyRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const requests = await roleRequestService.getMyRequests();
      setMyRequests(requests);
    } catch (err: any) {
      console.error('Failed to load requests:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setError(null);
      setSuccess(false);
      setReason('');
      loadMyRequests();
      // Set default requested role based on available options
      const roles = ROLE_HIERARCHY.filter((_, i) => i > currentRoleIndex && i < ROLE_HIERARCHY.length - 1);
      if (roles.length > 0) {
        setRequestedRole(roles[0]);
      }
    }
  }, [open, loadMyRequests, currentRoleIndex]);

  const handleSubmit = async () => {
    setError(null);
    if (!reason.trim()) {
      setError('Please provide a reason for your request');
      return;
    }

    setIsSubmitting(true);
    try {
      await roleRequestService.createRequest(requestedRole, reason.trim());
      setSuccess(true);
      setReason('');
      loadMyRequests();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasPendingRequest = myRequests.some(r => r.status === 'PENDING');

  const statusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'warning';
      case 'APPROVED': return 'success';
      case 'REJECTED': return 'error';
      default: return 'default';
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Request Role Upgrade</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Current role: <strong>{user?.role}</strong>
        </Typography>

        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
            Role request submitted successfully! An admin will review it.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {availableRoles.length === 0 ? (
          <Alert severity="info">You already have the highest requestable role.</Alert>
        ) : hasPendingRequest ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            You have a pending role request. Please wait for an admin to review it.
          </Alert>
        ) : !success && (
          <Box sx={{ mt: 1 }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Requested Role</InputLabel>
              <Select
                value={requestedRole}
                label="Requested Role"
                onChange={(e) => setRequestedRole(e.target.value as UserRole)}
                disabled={isSubmitting}
              >
                {availableRoles.map(role => (
                  <MenuItem key={role} value={role}>{role}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Reason for request"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              placeholder="Explain why you need this role..."
            />
          </Box>
        )}

        {myRequests.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Request History</Typography>
            {isLoading ? (
              <CircularProgress size={24} />
            ) : (
              myRequests.map(req => (
                <Box key={req.id} sx={{ p: 1.5, mb: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2">
                      {req.currentRole} → {req.requestedRole}
                    </Typography>
                    <Chip
                      label={req.status}
                      color={statusColor(req.status) as any}
                      size="small"
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(req.createdAt).toLocaleDateString()}
                  </Typography>
                  {req.reviewNote && (
                    <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                      Admin note: {req.reviewNote}
                    </Typography>
                  )}
                </Box>
              ))
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {availableRoles.length > 0 && !hasPendingRequest && !success && (
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default RoleRequestDialog;
