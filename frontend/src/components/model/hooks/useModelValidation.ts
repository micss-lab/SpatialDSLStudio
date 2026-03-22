// Hook for managing model validation
import { useState } from 'react';
import { ValidationIssue } from '../../../models/types';

/**
 * Custom hook for managing model validation
 */
export const useModelValidation = () => {
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [isValidationDialogOpen, setIsValidationDialogOpen] = useState(false);

  return {
    validationIssues,
    setValidationIssues,
    isValidationDialogOpen,
    setIsValidationDialogOpen,
  };
};
