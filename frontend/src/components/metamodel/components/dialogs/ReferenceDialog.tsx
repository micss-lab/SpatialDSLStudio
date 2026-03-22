import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControlLabel,
  Checkbox,
  Box
} from '@mui/material';

interface ReferenceDialogProps {
  open: boolean;
  referenceName: string;
  lowerBound: string;
  upperBound: string;
  containment: boolean;
  onClose: () => void;
  onReferenceNameChange: (name: string) => void;
  onLowerBoundChange: (bound: string) => void;
  onUpperBoundChange: (bound: string) => void;
  onContainmentChange: (containment: boolean) => void;
  onAdd: () => void;
  onCancel: () => void;
}

/**
 * Dialog for adding a reference between metaclasses
 */
export const ReferenceDialog: React.FC<ReferenceDialogProps> = ({
  open,
  referenceName,
  lowerBound,
  upperBound,
  containment,
  onClose,
  onReferenceNameChange,
  onLowerBoundChange,
  onUpperBoundChange,
  onContainmentChange,
  onAdd,
  onCancel
}) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Add New Reference</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Reference Name"
          fullWidth
          value={referenceName}
          onChange={(e) => onReferenceNameChange(e.target.value)}
        />
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <TextField
            label="Lower Bound"
            value={lowerBound}
            onChange={(e) => onLowerBoundChange(e.target.value)}
            sx={{ width: '100px' }}
          />
          <TextField
            label="Upper Bound"
            value={upperBound}
            onChange={(e) => onUpperBoundChange(e.target.value)}
            sx={{ width: '100px' }}
          />
        </Box>
        <FormControlLabel
          control={
            <Checkbox
              checked={containment}
              onChange={(e) => onContainmentChange(e.target.checked)}
            />
          }
          label="Containment"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={onAdd} color="primary">Add</Button>
      </DialogActions>
    </Dialog>
  );
};
