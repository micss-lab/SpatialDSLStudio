// Add Element Dialog Component
import React from 'react';
import { MetaClass, Model } from '../../../../models/types';

interface AddElementDialogProps {
  open: boolean;
  onClose: () => void;
  availableMetaClasses: MetaClass[];
  model: Model | null;
  metamodel: any;
  onAddElement: (metaClassId: string) => void;
}

/**
 * Dialog for creating new model elements
 * TODO: Extract from VisualModelEditor.tsx renderAddElementDialog (Phase 4)
 */
export const AddElementDialog: React.FC<AddElementDialogProps> = ({
  open,
  onClose,
  availableMetaClasses,
  model,
  metamodel,
  onAddElement,
}) => {
  // To be implemented in Phase 4
  return <></>;
};
