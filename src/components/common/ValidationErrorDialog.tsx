import React from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  Typography, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText 
} from '@mui/material';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import { ValidationIssue } from '../../models/types';

interface ValidationErrorDialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  issues: ValidationIssue[];
}

/**
 * A dialog component to display constraint validation errors
 */
const ValidationErrorDialog: React.FC<ValidationErrorDialogProps> = ({
  open,
  onClose,
  title = 'Validation Errors',
  issues
}) => {
  // Helper function to get the appropriate icon for the severity
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <ErrorIcon color="error" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      default:
        return <InfoIcon color="info" />;
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {issues.length === 0 ? (
          <Typography>No validation issues found.</Typography>
        ) : (
          <>
            <Typography variant="subtitle1" gutterBottom>
              The following {issues.length > 1 ? `${issues.length} issues were` : 'issue was'} found:
            </Typography>
            <List>
              {issues.map((issue, index) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    {getSeverityIcon(issue.severity)}
                  </ListItemIcon>
                  <ListItemText 
                    primary={issue.message} 
                    secondary={issue.constraintId ? `Constraint ID: ${issue.constraintId}` : undefined}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ValidationErrorDialog; 