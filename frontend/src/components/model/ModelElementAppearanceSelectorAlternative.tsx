/**
 * Alternative solution using blob URLs instead of storing large base64 strings
 * This creates temporary URLs that don't take up localStorage space
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Paper,
  SelectChangeEvent,
  IconButton,
  Tooltip,
  Grid
} from '@mui/material';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import SquareIcon from '@mui/icons-material/Square';
import CircleIcon from '@mui/icons-material/Circle';
import ChangeHistoryIcon from '@mui/icons-material/ChangeHistory';
import StarIcon from '@mui/icons-material/Star';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import { ModelElement } from '../../models/types';

export type AppearanceOption = 
  | 'default' 
  | 'square' 
  | 'rectangle' 
  | 'circle' 
  | 'triangle' 
  | 'star' 
  | 'custom-image'
  | 'custom-3d-model';

interface AppearanceConfig {
  type: AppearanceOption;
  shape: string;
  imageUrl?: string;
  imageBlobUrl?: string; // URL.createObjectURL() result
  modelUrl?: string;
  modelBlobUrl?: string; // URL.createObjectURL() result
  color?: string;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
}

interface ModelElementAppearanceSelectorAlternativeProps {
  element: ModelElement;
  onUpdate: (propertyName: string, value: any) => void;
}

const ModelElementAppearanceSelectorAlternative: React.FC<ModelElementAppearanceSelectorAlternativeProps> = ({
  element,
  onUpdate
}) => {
  const [appearanceType, setAppearanceType] = useState<AppearanceOption>('default');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageBlobUrl, setImageBlobUrl] = useState<string>('');
  const [modelUrl, setModelUrl] = useState<string>('');
  const [modelBlobUrl, setModelBlobUrl] = useState<string>('');
  const [color, setColor] = useState<string>('#ffffff');

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      if (imageBlobUrl && imageBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageBlobUrl);
      }
      if (modelBlobUrl && modelBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(modelBlobUrl);
      }
    };
  }, [imageBlobUrl, modelBlobUrl]);

  // Handle file upload with blob URL creation
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (file) {
      if (file.type.startsWith('image/')) {
        if (file.size > 1024 * 1024) {
          alert('Image file size should be less than 1MB');
          return;
        }
        
        // Cleanup previous blob URL
        if (imageBlobUrl && imageBlobUrl.startsWith('blob:')) {
          URL.revokeObjectURL(imageBlobUrl);
        }
        
        // Create new blob URL
        const blobUrl = URL.createObjectURL(file);
        setImageBlobUrl(blobUrl);
        setAppearanceType('custom-image');
        updateAppearance('custom-image', '', blobUrl, modelUrl, modelBlobUrl, color);
        
      } else if (file.name.toLowerCase().endsWith('.glb')) {
        if (file.size > 5 * 1024 * 1024) {
          alert('3D model file size should be less than 5MB');
          return;
        }
        
        // Cleanup previous blob URL
        if (modelBlobUrl && modelBlobUrl.startsWith('blob:')) {
          URL.revokeObjectURL(modelBlobUrl);
        }
        
        // Create new blob URL
        const blobUrl = URL.createObjectURL(file);
        setModelBlobUrl(blobUrl);
        setAppearanceType('custom-3d-model');
        updateAppearance('custom-3d-model', imageUrl, imageBlobUrl, '', blobUrl, color);
        
      } else {
        alert('Please upload an image file or a 3D model file (.glb)');
      }
    }
  };

  const updateAppearance = (
    type: AppearanceOption,
    imgUrl: string,
    imgBlobUrl: string,
    mdlUrl: string,
    mdlBlobUrl: string,
    color: string
  ) => {
    const appearance: AppearanceConfig = {
      type,
      shape: type,
      color,
      fillColor: color,
      strokeColor: 'black',
      strokeWidth: 1
    };

    if (imgUrl) appearance.imageUrl = imgUrl;
    if (imgBlobUrl) appearance.imageBlobUrl = imgBlobUrl;
    if (mdlUrl) appearance.modelUrl = mdlUrl;
    if (mdlBlobUrl) appearance.modelBlobUrl = mdlBlobUrl;

    onUpdate('appearance', JSON.stringify(appearance));
  };

  return (
    <Box sx={{ mt: 3, mb: 4 }}>
      <Typography variant="subtitle1" gutterBottom fontWeight="bold">
        Appearance (Alternative - Blob URLs)
      </Typography>
      
      <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 2 }}>
        This version uses blob URLs to avoid localStorage quota issues with large files.
        Note: Files will need to be re-uploaded when the page is refreshed.
      </Typography>
      
      <Grid container spacing={2}>
        <Grid component={"div" as any} item xs={12} md={6}>
          <FormControl fullWidth size="small">
            <InputLabel>Shape</InputLabel>
            <Select
              value={appearanceType}
              label="Shape"
              onChange={(e) => setAppearanceType(e.target.value as AppearanceOption)}
            >
              <MenuItem value="default">Default</MenuItem>
              <MenuItem value="square">Square</MenuItem>
              <MenuItem value="rectangle">Rectangle</MenuItem>
              <MenuItem value="circle">Circle</MenuItem>
              <MenuItem value="triangle">Triangle</MenuItem>
              <MenuItem value="star">Star</MenuItem>
              <MenuItem value="custom-image">Custom Image</MenuItem>
              <MenuItem value="custom-3d-model">Custom 3D Model</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        
        <Grid component={"div" as any} item xs={12} md={6}>
          <TextField
            label="Fill Color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            fullWidth
            size="small"
            disabled={appearanceType === 'custom-image' || appearanceType === 'custom-3d-model'}
          />
        </Grid>

        {(appearanceType === 'custom-image' || appearanceType === 'custom-3d-model') && (
          <Grid component={"div" as any} item xs={12}>
            <Button
              variant="outlined"
              component="label"
              startIcon={appearanceType === 'custom-image' ? <FileUploadIcon /> : <ViewInArIcon />}
              size="small"
            >
              Upload {appearanceType === 'custom-image' ? 'Image' : '3D Model'}
              <input
                type="file"
                hidden
                accept={appearanceType === 'custom-image' ? 'image/*' : '.glb'}
                onChange={handleFileUpload}
              />
            </Button>
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
              {appearanceType === 'custom-image' 
                ? 'Max size: 1MB. Formats: PNG, JPG, SVG'
                : 'Max size: 5MB. Format: GLB (binary glTF)'}
            </Typography>
          </Grid>
        )}
      </Grid>
    </Box>
  );
};

export default ModelElementAppearanceSelectorAlternative;
