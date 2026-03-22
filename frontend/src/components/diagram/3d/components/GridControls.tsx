import React from 'react';
import {
  Box,
  Popover,
  Typography,
  Stack,
  FormControlLabel,
  Checkbox,
  Divider,
  Slider
} from '@mui/material';

interface GridControlsProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  gridSizeX: number;
  gridSizeY: number;
  defaultGridSize: number;
  selectedAxes: { x: boolean; y: boolean };
  onAxisToggle: (axis: 'x' | 'y') => void;
  onSliderChange: (event: Event, newValue: number | number[]) => void;
}

/**
 * Grid size control popover for 3D diagram editor
 * Allows independent control of X and Y axis grid sizes
 */
const GridControls: React.FC<GridControlsProps> = ({
  anchorEl,
  onClose,
  gridSizeX,
  gridSizeY,
  defaultGridSize,
  selectedAxes,
  onAxisToggle,
  onSliderChange
}) => {
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'center',
      }}
      transformOrigin={{
        vertical: 'top',
        horizontal: 'center',
      }}
    >
      <Box sx={{ p: 2, width: 280 }}>
        <Typography variant="subtitle2" gutterBottom>
          Grid Size Control
        </Typography>
        
        <Stack spacing={2}>
          {/* Axis Selection */}
          <Box>
            <Typography variant="caption" color="textSecondary" gutterBottom>
              Select axes to modify:
            </Typography>
            <Stack direction="row" spacing={1}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedAxes.x}
                    onChange={() => onAxisToggle('x')}
                    size="small"
                  />
                }
                label="X Axis"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedAxes.y}
                    onChange={() => onAxisToggle('y')}
                    size="small"
                  />
                }
                label="Y Axis"
              />
            </Stack>
          </Box>
          
          <Divider />
          
          {/* Current Sizes Display */}
          <Box>
            <Typography variant="caption" color="textSecondary">
              Current sizes:
            </Typography>
            <Stack direction="row" spacing={2}>
              <Typography variant="body2">
                X: {Math.round(gridSizeX/1000)}m
              </Typography>
              <Typography variant="body2">
                Y: {Math.round(gridSizeY/1000)}m
              </Typography>
            </Stack>
          </Box>
          
          {/* Slider Control */}
          <Box>
            <Typography variant="caption" color="textSecondary" gutterBottom>
              Grid Size:
            </Typography>
            <Box sx={{ px: 1 }}>
              <Slider
                value={Math.max(gridSizeX, gridSizeY) / 1000} // Convert to meters for display
                onChange={onSliderChange}
                min={defaultGridSize / 1000} // Minimum 20m
                max={500} // Maximum 500m
                step={5} // 5m increments
                marks={[
                  { value: 20, label: '20m' },
                  { value: 100, label: '100m' },
                  { value: 250, label: '250m' },
                  { value: 500, label: '500m' }
                ]}
                valueLabelDisplay="on"
                valueLabelFormat={(value) => `${value}m`}
                disabled={!selectedAxes.x && !selectedAxes.y}
                sx={{
                  '& .MuiSlider-thumb': {
                    width: 20,
                    height: 20,
                  },
                  '& .MuiSlider-track': {
                    height: 6,
                  },
                  '& .MuiSlider-rail': {
                    height: 6,
                  },
                }}
              />
            </Box>
          </Box>
        </Stack>
      </Box>
    </Popover>
  );
};

export default GridControls;
