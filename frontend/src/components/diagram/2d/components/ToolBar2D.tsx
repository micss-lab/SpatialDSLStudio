import React from 'react';
import { 
  Paper, 
  Button, 
  Typography, 
  IconButton, 
  Tooltip 
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import { DiagramElement } from '../../../../models/types';

interface ToolBar2DProps {
  // Edge creation state
  isDrawingEdge: boolean;
  edgeStartElement: DiagramElement | null;
  onToggleDrawingEdge: () => void;
  
  // Refresh
  onRefresh: () => void;
  
  // Zoom controls
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onCenterView: () => void;
}

/**
 * Toolbar for 2D diagram editor with edge creation and zoom controls
 */
const ToolBar2D: React.FC<ToolBar2DProps> = ({
  isDrawingEdge,
  edgeStartElement,
  onToggleDrawingEdge,
  onRefresh,
  scale,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onCenterView
}) => {
  return (
    <>
      {/* Edge creation & refresh tool - top left */}
      <Paper
        sx={{
          position: 'absolute',
          top: 16,
          left: 16,
          p: 1,
          display: 'flex',
          alignItems: 'center',
          zIndex: 10
        }}
      >
        <Button
          variant={isDrawingEdge ? "contained" : "outlined"}
          color="primary"
          size="small"
          onClick={onToggleDrawingEdge}
        >
          {isDrawingEdge ? "Cancel Edge" : "Create Edge"}
        </Button>
        
        {isDrawingEdge && !edgeStartElement && (
          <Typography variant="caption" sx={{ ml: 1 }}>
            Select source element
          </Typography>
        )}
        
        {isDrawingEdge && edgeStartElement && (
          <Typography variant="caption" sx={{ ml: 1 }}>
            Select target element
          </Typography>
        )}
        
        <Button
          variant="outlined"
          color="secondary"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={onRefresh}
          sx={{ ml: 2 }}
        >
          Refresh
        </Button>
      </Paper>

      {/* Zoom Controls - bottom left */}
      <Paper
        sx={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          p: 1,
          display: 'flex',
          gap: 1,
          alignItems: 'center',
          zIndex: 10
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
    </>
  );
};

export default ToolBar2D;
