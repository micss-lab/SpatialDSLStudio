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
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Chip
} from '@mui/material';
import { Metamodel } from '../../../../models/types';

interface ClassDialogProps {
  open: boolean;
  className: string;
  isAbstract: boolean;
  superTypes: string[];
  metamodel: Metamodel | null;
  onClose: () => void;
  onClassNameChange: (name: string) => void;
  onAbstractChange: (isAbstract: boolean) => void;
  onSuperTypesChange: (superTypes: string[]) => void;
  onAdd: () => void;
}

/**
 * Dialog for adding a new metaclass to the metamodel
 */
export const ClassDialog: React.FC<ClassDialogProps> = ({
  open,
  className,
  isAbstract,
  superTypes,
  metamodel,
  onClose,
  onClassNameChange,
  onAbstractChange,
  onSuperTypesChange,
  onAdd
}) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Add New Class</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Class Name"
          fullWidth
          value={className}
          onChange={(e) => onClassNameChange(e.target.value)}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={isAbstract}
              onChange={(e) => onAbstractChange(e.target.checked)}
            />
          }
          label="Abstract Class"
          sx={{ mt: 2 }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Abstract classes cannot be instantiated directly in models. They serve as base classes for inheritance.
        </Typography>
        
        {/* Supertype Selection */}
        <FormControl fullWidth sx={{ mt: 2 }}>
          <InputLabel>Supertypes</InputLabel>
          <Select
            multiple
            value={superTypes}
            onChange={(e) => onSuperTypesChange(e.target.value as string[])}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {(selected as string[]).map((value) => {
                  const supertype = metamodel?.classes.find(cls => cls.id === value);
                  return (
                    <Chip key={value} label={supertype?.name || value} size="small" />
                  );
                })}
              </Box>
            )}
          >
            {metamodel?.classes.map(cls => (
              <MenuItem key={cls.id} value={cls.id}>
                {cls.name} {cls.abstract ? '(abstract)' : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onAdd} color="primary">Add</Button>
      </DialogActions>
    </Dialog>
  );
};
