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
  ListItemText
} from '@mui/material';
import { Metamodel } from '../../../../models/types';

interface ReferenceSelectionDialogProps {
  open: boolean;
  onClose: () => void;
  availableReferences: any[];
  metamodel: Metamodel | null;
  onSelectReference: (referenceId: string) => void;
}

/**
 * Dialog for selecting the reference type when creating an edge
 * between two elements that have multiple possible reference types
 */
const ReferenceSelectionDialog: React.FC<ReferenceSelectionDialogProps> = ({
  open,
  onClose,
  availableReferences,
  metamodel,
  onSelectReference
}) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Select Reference Type</DialogTitle>
      <DialogContent>
        <Typography variant="body2" paragraph>
          Multiple reference types are available. Please select which one to use:
        </Typography>
        <List>
          {availableReferences.map(ref => (
            <ListItem 
              key={ref.id}
              component="div"
              sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' } }}
              onClick={() => onSelectReference(ref.id)}
            >
              <ListItemText
                primary={ref.name}
                secondary={`Type: ${metamodel?.classes.find(c => c.id === ref.target)?.name || 'Unknown'}`}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReferenceSelectionDialog;
