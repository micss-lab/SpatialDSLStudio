// Validation Dialog Component
import React from 'react';
import { ValidationIssue } from '../../../../models/types';
import ValidationErrorDialog from '../../../common/ValidationErrorDialog';

interface ValidationDialogProps {
  open: boolean;
  onClose: () => void;
  issues: ValidationIssue[];
}

/**
 * Dialog for displaying model validation issues
 * TODO: Wire up in VisualModelEditor.tsx (Phase 4)
 */
export const ValidationDialog: React.FC<ValidationDialogProps> = ({
  open,
  onClose,
  issues,
}) => {
  return (
    <ValidationErrorDialog
      open={open}
      onClose={onClose}
      title="Constraint Validation Error"
      issues={issues}
    />
  );
};
