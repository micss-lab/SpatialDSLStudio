// Reference Properties Panel Component
import React from 'react';
import { Box, Typography } from '@mui/material';
import { Model, Metamodel, ModelElement } from '../../../../models/types';

interface ReferencePropertiesPanelProps {
  selectedReference: {
    sourceElement: ModelElement;
    targetElement: ModelElement;
    refName: string;
  } | null;
  model: Model | null;
  metamodel: Metamodel | null;
  onDeleteReference: () => void;
}

/**
 * Panel for displaying and editing reference properties
 * TODO: Extract from VisualModelEditor.tsx right drawer (Phase 4)
 */
export const ReferencePropertiesPanel: React.FC<ReferencePropertiesPanelProps> = ({
  selectedReference,
  model,
  metamodel,
  onDeleteReference,
}) => {
  // To be implemented in Phase 4
  if (!selectedReference) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="textSecondary">
          Select a reference to view its properties.
        </Typography>
      </Box>
    );
  }
  return <></>;
};
