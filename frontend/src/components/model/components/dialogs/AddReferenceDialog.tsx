// Add Reference Dialog Component
import React from 'react';
import { Model, Metamodel, ModelElement } from '../../../../models/types';

interface AddReferenceDialogProps {
  open: boolean;
  onClose: () => void;
  model: Model | null;
  metamodel: Metamodel | null;
  referenceStartElement: ModelElement | null;
  referenceTarget: string;
  onCreateReference: (referenceId: string) => void;
}

/**
 * Dialog for creating references between model elements
 * TODO: Extract from VisualModelEditor.tsx renderAddReferenceDialog (Phase 4)
 */
export const AddReferenceDialog: React.FC<AddReferenceDialogProps> = ({
  open,
  onClose,
  model,
  metamodel,
  referenceStartElement,
  referenceTarget,
  onCreateReference,
}) => {
  // To be implemented in Phase 4
  return <></>;
};
