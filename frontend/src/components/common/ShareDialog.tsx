/**
 * ShareDialog Component
 * 
 * Dialog for sharing resources with other users.
 * Allows owner to share/unshare resources and manage permissions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  CircularProgress,
  Alert,
  Box,
  Chip,
  Divider,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ShareIcon from '@mui/icons-material/Share';
import {
  sharingService,
  ResourceType,
  SharePermission,
  SharedResource,
} from '../../services/common';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
}

const ShareDialog: React.FC<ShareDialogProps> = ({
  open,
  onClose,
  resourceType,
  resourceId,
  resourceName,
}) => {
  const [shares, setShares] = useState<SharedResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  
  // New share form
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<SharePermission>('VIEWER');
  const [submitting, setSubmitting] = useState(false);

  // Load existing shares
  const loadShares = useCallback(async () => {
    if (!open) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await sharingService.getResourceShares(resourceType, resourceId);
      setShares(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load shares');
    } finally {
      setLoading(false);
    }
  }, [open, resourceType, resourceId]);

  useEffect(() => {
    loadShares();
  }, [loadShares]);

  // Handle share submission
  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setWarning(null);

    try {
      const response = await sharingService.shareResource(resourceType, resourceId, {
        email: email.trim(),
        permission,
      });
      
      // The response may include information about cascaded shares and warnings
      const cascadedCount = (response as any)?.cascadedShares?.length;
      const warnings = (response as any)?.warnings;
      
      if (cascadedCount > 0) {
        setSuccess(`Successfully shared with ${email}. Also shared ${cascadedCount} dependent resource(s).`);
      } else {
        setSuccess(`Successfully shared with ${email}`);
      }
      
      // Show warnings if any (e.g., dependent resources owned by others)
      if (warnings && warnings.length > 0) {
        setWarning(warnings.join(' '));
      }
      
      setEmail('');
      setPermission('VIEWER');
      await loadShares();
    } catch (err: any) {
      setError(err.message || 'Failed to share resource');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle unshare
  const handleUnshare = async (share: SharedResource) => {
    setError(null);
    setSuccess(null);
    
    try {
      await sharingService.unshareResource(resourceType, resourceId, share.sharedWithId);
      setSuccess(`Removed access for ${share.sharedWithEmail}`);
      await loadShares();
    } catch (err: any) {
      setError(err.message || 'Failed to remove access');
    }
  };

  // Clear messages when dialog closes
  const handleClose = () => {
    setError(null);
    setSuccess(null);
    setWarning(null);
    setEmail('');
    setPermission('VIEWER');
    onClose();
  };

  const resourceTypeName = sharingService.getResourceTypeName(resourceType);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <ShareIcon />
          <span>Share {resourceTypeName}</span>
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        {/* Resource info */}
        <Typography variant="subtitle2" color="textSecondary" gutterBottom>
          Sharing: <strong>{resourceName}</strong>
        </Typography>

        {/* Error/Success/Warning messages */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}
        {warning && (
          <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setWarning(null)}>
            {warning}
          </Alert>
        )}

        {/* Add new share form */}
        <Box component="form" onSubmit={handleShare} sx={{ mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
            <PersonAddIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
            Share with User
          </Typography>
          
          <Box display="flex" gap={2} alignItems="flex-start">
            <TextField
              label="User Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              size="small"
              fullWidth
              disabled={submitting}
              required
            />
            
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Permission</InputLabel>
              <Select
                value={permission}
                onChange={(e) => setPermission(e.target.value as SharePermission)}
                label="Permission"
                disabled={submitting}
              >
                <MenuItem value="VIEWER">Can View</MenuItem>
                <MenuItem value="EDITOR">Can Edit</MenuItem>
              </Select>
            </FormControl>
            
            <Button
              type="submit"
              variant="contained"
              disabled={submitting || !email.trim()}
              startIcon={submitting ? <CircularProgress size={20} /> : <PersonAddIcon />}
            >
              Share
            </Button>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Current shares list */}
        <Typography variant="subtitle1" gutterBottom>
          People with Access
        </Typography>

        {loading ? (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress />
          </Box>
        ) : shares.length === 0 ? (
          <Typography color="textSecondary" sx={{ py: 2 }}>
            This {resourceTypeName.toLowerCase()} hasn't been shared with anyone yet.
          </Typography>
        ) : (
          <List dense>
            {shares.map((share) => (
              <ListItem key={share.id}>
                <ListItemText
                  primary={share.sharedWithEmail || share.sharedWithId}
                  secondary={
                    <Chip
                      label={sharingService.getPermissionName(share.permission)}
                      size="small"
                      color={share.permission === 'EDITOR' ? 'primary' : 'default'}
                      variant="outlined"
                    />
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    aria-label="remove access"
                    onClick={() => handleUnshare(share)}
                    color="error"
                    size="small"
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShareDialog;
