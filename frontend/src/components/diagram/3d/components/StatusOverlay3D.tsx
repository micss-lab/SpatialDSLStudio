import React from 'react';
import { Paper, Typography } from '@mui/material';
import { Diagram } from '../../../../models/types';
import { Element3D } from '../../Node3D';

interface StatusOverlay3DProps {
  diagram: Diagram | null;
  isDraggingPaletteItem: boolean;
  isDragging: boolean;
  selectedElement: Element3D | null;
  movementMode: 'translate' | 'rotate';
  gridSizeX: number;
  gridSizeY: number;
}

/**
 * Status information overlay for 3D diagram editor
 * Shows diagram name, interaction hints, and grid information
 */
const StatusOverlay3D: React.FC<StatusOverlay3DProps> = ({
  diagram,
  isDraggingPaletteItem,
  isDragging,
  selectedElement,
  movementMode,
  gridSizeX,
  gridSizeY
}) => {
  return (
    <Paper
      sx={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        padding: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        border: selectedElement ? '2px solid #00ff00' : 'none',
      }}
    >
      <Typography variant="body2">
        View: {diagram?.name}
      </Typography>
      <Typography variant="caption" color="textSecondary">
        {isDraggingPaletteItem 
          ? 'Click on the grid to place the new element' 
          : 'Drag elements from palette and click to place them'}
      </Typography>
      <Typography variant="caption" display="block" color="textSecondary">
        {isDragging 
          ? '🔄 Moving element... Release to set position.' 
          : selectedElement 
            ? `✅ Selected: ${selectedElement.style.name || 'Unnamed element'}`
            : 'Click an element to select it'}
      </Typography>
      <Typography variant="caption" display="block" color="textSecondary">
        <strong>Direct Drag:</strong> Click and drag any selected element directly
      </Typography>
      <Typography variant="caption" display="block" color="textSecondary">
        <strong>Movement:</strong> Select an element then drag it to move
      </Typography>
      <Typography variant="caption" display="block" color="textSecondary">
        <strong>Units:</strong> All measurements in millimeters (real-world scale)
      </Typography>
      <Typography variant="caption" display="block" color="textSecondary">
        {selectedElement && movementMode === 'translate' 
          ? 'Click and drag selected element to move it around' 
          : selectedElement && movementMode === 'rotate'
            ? 'Use rotation controls in properties panel'
            : ''}
      </Typography>
      <Typography variant="caption" display="block" color="textSecondary">
        Elements: {diagram?.elements.filter(e => e.type === 'node').length} • Grid X: {Math.round(gridSizeX/1000)}m • Grid Y: {Math.round(gridSizeY/1000)}m
      </Typography>
    </Paper>
  );
};

export default StatusOverlay3D;
