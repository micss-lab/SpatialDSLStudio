// Model Properties Panel Component
import React from 'react';
import { Box, Typography } from '@mui/material';
import { Model, Metamodel, ModelElement } from '../../../../models/types';

interface ModelPropertiesPanelProps {
  selectedElement: ModelElement | null;
  model: Model | null;
  metamodel: Metamodel | null;
  onUpdateElement: (elementId: string, updates: any) => void;
  onDeleteElement: (elementId: string) => void;
}

/**
 * Panel for displaying and editing model element properties
 * TODO: Extract from VisualModelEditor.tsx right drawer (Phase 4)
 */
export const ModelPropertiesPanel: React.FC<ModelPropertiesPanelProps> = ({
  selectedElement,
  model,
  metamodel,
  onUpdateElement,
  onDeleteElement,
}) => {
  // To be implemented in Phase 4
  if (!selectedElement) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="textSecondary">
          Select an element to view and edit its properties.
        </Typography>
      </Box>
    );
  }
  return <></>;
};
