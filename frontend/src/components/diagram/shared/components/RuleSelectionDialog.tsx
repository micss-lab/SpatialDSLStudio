import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Typography,
  Box,
  Alert,
} from '@mui/material';

export interface RuleSelectionDialogProps {
  open: boolean;
  onClose: () => void;
  availableRules: any[];
  selectedRuleIds: string[];
  onToggleRule: (ruleId: string) => void;
  onCreate: () => void;
}

export const RuleSelectionDialog: React.FC<RuleSelectionDialogProps> = ({
  open,
  onClose,
  availableRules,
  selectedRuleIds,
  onToggleRule,
  onCreate,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Select Rules to Execute on View</DialogTitle>
      <DialogContent>
        {availableRules.length === 0 ? (
          <Alert severity="info" sx={{ mt: 1 }}>
            No rules available. Import rules first using the upload button.
          </Alert>
        ) : (
          <FormControl component="fieldset" sx={{ width: '100%' }}>
            <FormGroup>
              {availableRules.map(rule => (
                <FormControlLabel
                  key={rule.id}
                  control={
                    <Checkbox
                      checked={selectedRuleIds.includes(rule.id)}
                      onChange={() => onToggleRule(rule.id)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1">{rule.name}</Typography>
                      {rule.description && (
                        <Typography variant="caption" color="text.secondary">
                          {rule.description}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              ))}
            </FormGroup>
          </FormControl>
        )}

        {availableRules.length > 0 && selectedRuleIds.length === 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Select at least one rule to execute.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onCreate}
          variant="contained"
          color="primary"
          disabled={selectedRuleIds.length === 0}
        >
          Create Execution
        </Button>
      </DialogActions>
    </Dialog>
  );
};
