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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent
} from '@mui/material';
import { MetaEnum } from '../../../../models/types';

interface AttributeDialogProps {
  open: boolean;
  attributeName: string;
  attributeType: string;
  defaultValue: string;
  required: boolean;
  enums?: MetaEnum[];
  onClose: () => void;
  onAttributeNameChange: (name: string) => void;
  onAttributeTypeChange: (type: string) => void;
  onDefaultValueChange: (value: string) => void;
  onRequiredChange: (required: boolean) => void;
  onAdd: () => void;
}

/**
 * Dialog for adding an attribute to a metaclass
 */
export const AttributeDialog: React.FC<AttributeDialogProps> = ({
  open,
  attributeName,
  attributeType,
  defaultValue,
  required,
  enums = [],
  onClose,
  onAttributeNameChange,
  onAttributeTypeChange,
  onDefaultValueChange,
  onRequiredChange,
  onAdd
}) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Add New Attribute</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Attribute Name"
          fullWidth
          value={attributeName}
          onChange={(e) => onAttributeNameChange(e.target.value)}
        />
        <FormControl fullWidth margin="normal">
          <InputLabel>Type</InputLabel>
          <Select
            value={attributeType}
            onChange={(e: SelectChangeEvent) => onAttributeTypeChange(e.target.value)}
          >
            <MenuItem value="string">String</MenuItem>
            <MenuItem value="number">Number</MenuItem>
            <MenuItem value="boolean">Boolean</MenuItem>
            <MenuItem value="date">Date</MenuItem>
            {enums.map(metaEnum => (
              <MenuItem key={metaEnum.id} value={`enum:${metaEnum.id}`}>
                {metaEnum.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          margin="dense"
          label="Default Value"
          fullWidth
          value={defaultValue}
          onChange={(e) => onDefaultValueChange(e.target.value)}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={required}
              onChange={(e) => onRequiredChange(e.target.checked)}
            />
          }
          label="Required"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onAdd} color="primary">Add</Button>
      </DialogActions>
    </Dialog>
  );
};
