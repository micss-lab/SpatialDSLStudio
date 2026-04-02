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
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Check as CheckIcon, Close as CloseIcon } from '@mui/icons-material';
import { roleRequestService, RoleRequest } from '../../services/core';

const RoleRequestManagement: React.FC = () => {
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review dialog state
  const [reviewDialog, setReviewDialog] = useState<{ open: boolean; request: RoleRequest | null; approve: boolean }>({
    open: false,
    request: null,
    approve: true,
  });
  const [reviewNote, setReviewNote] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await roleRequestService.getAllRequests(statusFilter || undefined);
      setRequests(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const openReviewDialog = (request: RoleRequest, approve: boolean) => {
    setReviewDialog({ open: true, request, approve });
    setReviewNote('');
  };

  const handleReview = async () => {
    if (!reviewDialog.request) return;
    setIsReviewing(true);
    try {
      await roleRequestService.reviewRequest(
        reviewDialog.request.id,
        reviewDialog.approve,
        reviewNote || undefined
      );
      setReviewDialog({ open: false, request: null, approve: true });
      loadRequests();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsReviewing(false);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'warning';
      case 'APPROVED': return 'success';
      case 'REJECTED': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" fontWeight={600}>Role Requests</Typography>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Filter by Status</InputLabel>
          <Select
            value={statusFilter}
            label="Filter by Status"
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="PENDING">Pending</MenuItem>
            <MenuItem value="APPROVED">Approved</MenuItem>
            <MenuItem value="REJECTED">Rejected</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : requests.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No role requests found.</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Current Role</TableCell>
                <TableCell>Requested Role</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>{req.user?.email || req.userId}</TableCell>
                  <TableCell>{req.currentRole}</TableCell>
                  <TableCell>{req.requestedRole}</TableCell>
                  <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {req.reason}
                  </TableCell>
                  <TableCell>
                    <Chip label={req.status} color={statusColor(req.status) as any} size="small" />
                  </TableCell>
                  <TableCell>{new Date(req.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {req.status === 'PENDING' ? (
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          startIcon={<CheckIcon />}
                          onClick={() => openReviewDialog(req, true)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<CloseIcon />}
                          onClick={() => openReviewDialog(req, false)}
                        >
                          Reject
                        </Button>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {req.reviewedBy?.email && `by ${req.reviewedBy.email}`}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Review Dialog */}
      <Dialog open={reviewDialog.open} onClose={() => setReviewDialog({ open: false, request: null, approve: true })} maxWidth="sm" fullWidth>
        <DialogTitle>
          {reviewDialog.approve ? 'Approve' : 'Reject'} Role Request
        </DialogTitle>
        <DialogContent>
          {reviewDialog.request && (
            <>
              <Typography variant="body2" sx={{ mb: 2 }}>
                <strong>{reviewDialog.request.user?.email}</strong> is requesting{' '}
                <strong>{reviewDialog.request.requestedRole}</strong> role (currently {reviewDialog.request.currentRole}).
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                <strong>Reason:</strong> {reviewDialog.request.reason}
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Review note (optional)"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                disabled={isReviewing}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewDialog({ open: false, request: null, approve: true })} disabled={isReviewing}>
            Cancel
          </Button>
          <Button
            onClick={handleReview}
            variant="contained"
            color={reviewDialog.approve ? 'success' : 'error'}
            disabled={isReviewing}
            startIcon={isReviewing ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {isReviewing ? 'Processing...' : reviewDialog.approve ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RoleRequestManagement;
