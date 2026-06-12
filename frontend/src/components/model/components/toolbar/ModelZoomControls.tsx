// Model Zoom Controls Component
import React from 'react';
import { Paper, IconButton, Typography, Tooltip } from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';

interface ModelZoomControlsProps {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onCenterView: () => void;
}

/**
 * Zoom and pan controls overlay
 * Displays zoom level and provides zoom in/out, reset, and center controls
 */
export const ModelZoomControls: React.FC<ModelZoomControlsProps> = ({
  scale,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onCenterView,
}) => {
  return (
    <Paper
      sx={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        p: 1,
        display: 'flex',
        gap: 1,
        alignItems: 'center',
        zIndex: 10,
      }}
    >
      <Tooltip title="Zoom Out">
        <IconButton size="small" onClick={onZoomOut}>
          <ZoomOutIcon />
        </IconButton>
      </Tooltip>
      
      <Typography variant="body2" sx={{ minWidth: '60px', textAlign: 'center' }}>
        {Math.round(scale * 100)}%
      </Typography>
      
      <Tooltip title="Zoom In">
        <IconButton size="small" onClick={onZoomIn}>
          <ZoomInIcon />
        </IconButton>
      </Tooltip>
      
      <Tooltip title="Reset View">
        <IconButton size="small" onClick={onResetZoom}>
          <RestartAltIcon />
        </IconButton>
      </Tooltip>
      
      <Tooltip title="Center Elements">
        <IconButton size="small" onClick={onCenterView}>
          <CenterFocusStrongIcon />
        </IconButton>
      </Tooltip>
    </Paper>
  );
};
