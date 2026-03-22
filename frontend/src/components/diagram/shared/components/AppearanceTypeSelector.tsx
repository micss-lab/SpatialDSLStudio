import React from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Paper,
} from '@mui/material';
import SquareIcon from '@mui/icons-material/Square';
import CircleIcon from '@mui/icons-material/Circle';
import ChangeHistoryIcon from '@mui/icons-material/ChangeHistory';
import StarIcon from '@mui/icons-material/Star';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import { AppearanceOption } from '../hooks/useAppearanceState';

export interface AppearanceTypeSelectorProps {
  value: AppearanceOption;
  onChange: (event: SelectChangeEvent<AppearanceOption>) => void;
  disabled?: boolean;
}

export const AppearanceTypeSelector: React.FC<AppearanceTypeSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <FormControl fullWidth size="small">
      <InputLabel id="appearance-type-label">Shape</InputLabel>
      <Select
        labelId="appearance-type-label"
        id="appearance-type-select"
        value={value}
        label="Shape"
        onChange={onChange}
        disabled={disabled}
      >
        <MenuItem value="default">
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Paper sx={{ width: 20, height: 20, mr: 1, border: '1px solid #000' }} />
            Default
          </Box>
        </MenuItem>
        <MenuItem value="square">
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <SquareIcon sx={{ mr: 1 }} />
            Square
          </Box>
        </MenuItem>
        <MenuItem value="rectangle">
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Paper sx={{ width: 24, height: 16, mr: 1, borderRadius: 0 }} />
            Rectangle
          </Box>
        </MenuItem>
        <MenuItem value="circle">
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <CircleIcon sx={{ mr: 1 }} />
            Circle
          </Box>
        </MenuItem>
        <MenuItem value="triangle">
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ChangeHistoryIcon sx={{ mr: 1 }} />
            Triangle
          </Box>
        </MenuItem>
        <MenuItem value="star">
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <StarIcon sx={{ mr: 1 }} />
            Star
          </Box>
        </MenuItem>
        <MenuItem value="custom-image">
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <FileUploadIcon sx={{ mr: 1 }} />
            Custom Image
          </Box>
        </MenuItem>
        <MenuItem value="custom-3d-model">
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ViewInArIcon sx={{ mr: 1 }} />
            Custom 3D Model
          </Box>
        </MenuItem>
      </Select>
    </FormControl>
  );
};
