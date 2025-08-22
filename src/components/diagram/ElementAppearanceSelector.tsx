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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  SelectChangeEvent,
  IconButton,
  Tooltip,
  Grid
} from '@mui/material';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import SquareIcon from '@mui/icons-material/Square';
import CircleIcon from '@mui/icons-material/Circle';
import ChangeHistoryIcon from '@mui/icons-material/ChangeHistory'; // Triangle
import StarIcon from '@mui/icons-material/Star';
import LinkIcon from '@mui/icons-material/Link';
import ViewInArIcon from '@mui/icons-material/ViewInAr'; // 3D model icon
import { DiagramElement } from '../../models/types';
import fileStorageService from '../../services/fileStorage.service';

// Appearance options
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
  imageUrl?: string;
  imageSrc?: string; // For base64 encoded images
  imageFileId?: string; // ID for stored image files
  modelUrl?: string;
  modelSrc?: string; // For base64 encoded models
  modelFileId?: string; // ID for stored model files
  color?: string;
  shape?: string;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
}

interface ElementAppearanceSelectorProps {
  element: DiagramElement;
  onChange: (propertyName: string, value: any) => void;
}

const ElementAppearanceSelector: React.FC<ElementAppearanceSelectorProps> = ({
  element,
  onChange
}) => {
  const [appearanceType, setAppearanceType] = useState<AppearanceOption>('default');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageFileId, setImageFileId] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string>('');
  const [modelSrc, setModelSrc] = useState<string | null>(null);
  const [modelFileId, setModelFileId] = useState<string | null>(null);
  const [color, setColor] = useState<string>('#ffffff');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string } | null>(null);

  // Initialize from element style
  useEffect(() => {
    const initializeAppearance = async () => {
      if (element.style.appearance) {
        try {
          const appearance = JSON.parse(element.style.appearance);
          setAppearanceType(appearance.type || 'default');
          setImageUrl(appearance.imageUrl || '');
          setImageSrc(appearance.imageSrc || null);
          setModelUrl(appearance.modelUrl || '');
          setModelSrc(appearance.modelSrc || null);
          setColor(appearance.color || '#ffffff');

          // Handle stored file IDs
          if (appearance.imageFileId) {
            setImageFileId(appearance.imageFileId);
            try {
              const imageData = await fileStorageService.getFile(appearance.imageFileId);
              if (imageData) {
                setImageSrc(imageData);
              }
            } catch (error) {
              console.error('Error loading stored image:', error);
              setImageFileId(null);
            }
          } else {
            setImageFileId(null);
          }

          if (appearance.modelFileId) {
            setModelFileId(appearance.modelFileId);
            try {
              const modelData = await fileStorageService.getFile(appearance.modelFileId);
              if (modelData) {
                setModelSrc(modelData);
              }
            } catch (error) {
              console.error('Error loading stored model:', error);
              setModelFileId(null);
            }
          } else {
            setModelFileId(null);
          }
        } catch (e) {
          console.error('Error parsing appearance JSON:', e);
        }
      } else {
        setAppearanceType('default');
        setImageUrl('');
        setImageSrc(null);
        setImageFileId(null);
        setModelUrl('');
        setModelSrc(null);
        setModelFileId(null);
        setColor('#ffffff');
      }
    };

    initializeAppearance();
  }, [element.style.appearance]);

  // Handle appearance type change
  const handleAppearanceTypeChange = (event: SelectChangeEvent<AppearanceOption>) => {
    const newType = event.target.value as AppearanceOption;
    setAppearanceType(newType);
    updateAppearance(newType, imageUrl, imageSrc, imageFileId, modelUrl, modelSrc, modelFileId, color);
  };

  // Handle image URL change
  const handleImageUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = event.target.value;
    setImageUrl(newUrl);
    
    // If there's a valid URL, use it
    if (newUrl && (newUrl.startsWith('http://') || newUrl.startsWith('https://'))) {
      updateAppearance(appearanceType, newUrl, imageSrc, imageFileId, modelUrl, modelSrc, modelFileId, color);
    }
  };

  // Handle model URL change
  const handleModelUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = event.target.value;
    setModelUrl(newUrl);
    
    // If there's a valid URL, use it
    if (newUrl && (newUrl.startsWith('http://') || newUrl.startsWith('https://'))) {
      updateAppearance(appearanceType, imageUrl, imageSrc, imageFileId, newUrl, modelSrc, modelFileId, color);
    }
  };

  // Handle color change
  const handleColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = event.target.value;
    setColor(newColor);
    updateAppearance(appearanceType, imageUrl, imageSrc, imageFileId, modelUrl, modelSrc, modelFileId, newColor);
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (file) {
      // Check file type
      if (file.type.startsWith('image/')) {
        // Handle image files
        if (file.size > 5 * 1024 * 1024) { // 5MB limit for images
          alert('Image file size should be less than 5MB');
          return;
        }
        
        const reader = new FileReader();
        reader.onload = async (e) => {
          const result = e.target?.result as string;
          
          try {
            // Store large files in IndexedDB to avoid localStorage quota issues
            const fileId = await fileStorageService.storeFile(result, 'image', file.name);
            setImageFileId(fileId);
            setImageSrc(result);
            setAppearanceType('custom-image');
            updateAppearance('custom-image', '', result, fileId, modelUrl, modelSrc, modelFileId, color);
          } catch (error) {
            console.error('Error storing image file:', error);
            alert('Error storing image file. Please try again.');
          }
        };
        reader.readAsDataURL(file);
      } else if (file.name.toLowerCase().endsWith('.glb')) {
        // Handle GLB files
        if (file.size > 10 * 1024 * 1024) { // 10MB limit for 3D models
          alert('3D model file size should be less than 10MB');
          return;
        }
        
        const reader = new FileReader();
        reader.onload = async (e) => {
          const result = e.target?.result as string;
          
          try {
            // Store large files in IndexedDB to avoid localStorage quota issues
            const fileId = await fileStorageService.storeFile(result, 'model', file.name);
            setModelFileId(fileId);
            setModelSrc(result);
            setAppearanceType('custom-3d-model');
            updateAppearance('custom-3d-model', imageUrl, imageSrc, imageFileId, '', result, fileId, color);
          } catch (error) {
            console.error('Error storing model file:', error);
            alert('Error storing model file. Please try again.');
          }
        };
        reader.readAsDataURL(file);
      } else {
        alert('Please upload an image file (PNG, JPG, SVG) or a 3D model file (.glb)');
        return;
      }
    }
  };

  // Update the appearance in the element style
  const updateAppearance = (
    type: AppearanceOption, 
    url: string, 
    src: string | null, 
    imgFileId: string | null,
    mUrl: string,
    mSrc: string | null,
    mdlFileId: string | null,
    color: string
  ) => {
    // Create a shape property based on the type to ensure compatibility
    const shape = type;
    
    const appearance: AppearanceConfig = { 
      type, 
      shape,
      color,
      fillColor: color,
      strokeColor: 'black',
      strokeWidth: 1
    };
    
    // Only include imageUrl or imageSrc if they're defined
    if (url) appearance.imageUrl = url;
    if (src) appearance.imageSrc = src;
    if (imgFileId) appearance.imageFileId = imgFileId;
    
    // Only include modelUrl or modelSrc if they're defined
    if (mUrl) appearance.modelUrl = mUrl;
    if (mSrc) appearance.modelSrc = mSrc;
    if (mdlFileId) appearance.modelFileId = mdlFileId;
    
    // Convert to JSON string and save to element style
    onChange('appearance', JSON.stringify(appearance));
  };

  // Clear image
  const clearImage = async () => {
    // Delete stored file if exists
    if (imageFileId) {
      try {
        await fileStorageService.deleteFile(imageFileId);
      } catch (error) {
        console.error('Error deleting stored image:', error);
      }
    }
    
    setImageSrc(null);
    setImageUrl('');
    setImageFileId(null);
    updateAppearance(appearanceType, '', null, null, modelUrl, modelSrc, modelFileId, color);
  };

  // Clear model
  const clearModel = async () => {
    // Delete stored file if exists
    if (modelFileId) {
      try {
        await fileStorageService.deleteFile(modelFileId);
      } catch (error) {
        console.error('Error deleting stored model:', error);
      }
    }
    
    setModelSrc(null);
    setModelUrl('');
    setModelFileId(null);
    updateAppearance(appearanceType, imageUrl, imageSrc, imageFileId, '', null, null, color);
  };

  // Preview the current appearance
  const renderAppearancePreview = () => {
    const previewSize = 100;
    
    switch (appearanceType) {
      case 'custom-image':
        if (imageSrc) {
          return (
            <Box 
              component="img" 
              src={imageSrc} 
              alt="Custom shape" 
              sx={{ 
                width: previewSize, 
                height: previewSize, 
                objectFit: 'contain',
                border: '1px solid #ccc'
              }} 
            />
          );
        } else if (imageUrl) {
          return (
            <Box 
              component="img" 
              src={imageUrl} 
              alt="Custom shape" 
              sx={{ 
                width: previewSize, 
                height: previewSize, 
                objectFit: 'contain',
                border: '1px solid #ccc'
              }} 
              onError={() => console.log('Error loading image')}
            />
          );
        } else if (imageFileId) {
          return (
            <Box 
              sx={{ 
                width: previewSize, 
                height: previewSize, 
                backgroundColor: '#f5f5f5',
                border: '1px solid #ccc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                borderRadius: 1
              }} 
            >
              <Typography variant="caption" color="textSecondary">
                Stored Image
              </Typography>
            </Box>
          );
        }
        return <Typography>No image selected</Typography>;

      case 'custom-3d-model':
        if (modelSrc || modelUrl || modelFileId) {
          return (
            <Box 
              sx={{ 
                width: previewSize, 
                height: previewSize, 
                backgroundColor: '#f5f5f5',
                border: '1px solid #ccc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                borderRadius: 1
              }} 
            >
              <ViewInArIcon sx={{ fontSize: 40, color: '#666', mb: 1 }} />
              <Typography variant="caption" color="textSecondary">
                3D Model
              </Typography>
            </Box>
          );
        }
        return <Typography>No 3D model selected</Typography>;
        
      case 'square':
        return (
          <Box 
            sx={{ 
              width: previewSize, 
              height: previewSize, 
              backgroundColor: color || '#ffffff',
              border: '1px solid #000'
            }} 
          />
        );
        
      case 'rectangle':
        return (
          <Box 
            sx={{ 
              width: previewSize, 
              height: previewSize * 0.7, 
              backgroundColor: color || '#ffffff',
              border: '1px solid #000'
            }} 
          />
        );
        
      case 'circle':
        return (
          <Box 
            sx={{ 
              width: previewSize, 
              height: previewSize, 
              backgroundColor: color || '#ffffff',
              border: '1px solid #000',
              borderRadius: '50%'
            }} 
          />
        );
        
      case 'triangle':
        return (
          <Box 
            sx={{ 
              width: 0,
              height: 0,
              borderLeft: `${previewSize / 2}px solid transparent`,
              borderRight: `${previewSize / 2}px solid transparent`,
              borderBottom: `${previewSize}px solid ${color || '#ffffff'}`,
              mx: 'auto'
            }} 
          />
        );
        
      case 'star':
        return (
          <StarIcon 
            sx={{ 
              width: previewSize, 
              height: previewSize, 
              color: color || '#ffffff',
              stroke: '#000',
              strokeWidth: 1
            }} 
          />
        );
        
      case 'default':
      default:
        return (
          <Box 
            sx={{ 
              width: previewSize, 
              height: previewSize * 0.7, 
              backgroundColor: '#ffffff',
              border: '1px solid #000',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }} 
          >
            <Box sx={{ 
              height: '24px', 
              backgroundColor: '#e5e5e5', 
              borderBottom: '1px solid #000',
              p: 0.5,
              fontSize: '10px',
              fontWeight: 'bold'
            }}>
              Default
            </Box>
            <Box sx={{ p: 0.5, fontSize: '10px' }}>
              Element
            </Box>
          </Box>
        );
    }
  };

  return (
    <Box sx={{ mt: 3, mb: 4 }}>
      <Typography variant="subtitle1" gutterBottom fontWeight="500">
        Element Appearance
      </Typography>
      
      {/* Add a notice when element is linked to a model element */}
      {element.style.linkedModelElementId && (
        <Box sx={{ mb: 2, p: 1, bgcolor: 'rgba(25, 118, 210, 0.08)', borderRadius: 1 }}>
          <Typography variant="caption" color="primary">
            This element inherits its appearance from the linked model element. 
            The appearance settings below reflect the model element appearance but cannot be edited directly.
          </Typography>
        </Box>
      )}
      
      <Grid container spacing={2}>
        <Grid component={"div" as any} item xs={12} md={6}>
          <FormControl fullWidth size="small">
            <InputLabel id="appearance-type-label">Shape</InputLabel>
            <Select
              labelId="appearance-type-label"
              id="appearance-type-select"
              value={appearanceType}
              label="Shape"
              onChange={handleAppearanceTypeChange}
              disabled={!!element.style.linkedModelElementId}
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
        </Grid>
        
        <Grid component={"div" as any} item xs={12} md={6}>
          <TextField
            label="Fill Color"
            type="color"
            value={color}
            onChange={handleColorChange}
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
            disabled={!!element.style.linkedModelElementId || appearanceType === 'custom-image' || appearanceType === 'custom-3d-model'}
          />
        </Grid>
        
        {appearanceType === 'custom-image' && (
          <>
            <Grid component={"div" as any} item xs={12}>
              <TextField
                label="Image URL"
                value={imageUrl}
                onChange={handleImageUrlChange}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
                placeholder="Enter image URL or upload an image"
                disabled={!!element.style.linkedModelElementId}
              />
            </Grid>
            
            <Grid component={"div" as any} item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button 
                  variant="outlined" 
                  component="label" 
                  startIcon={<FileUploadIcon />}
                  size="small"
                  disabled={!!element.style.linkedModelElementId}
                >
                  Upload Image
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={!!element.style.linkedModelElementId}
                  />
                </Button>
                {imageSrc && (
                  <Button 
                    variant="outlined" 
                    color="error" 
                    startIcon={<DeleteIcon />} 
                    onClick={clearImage}
                    size="small"
                    disabled={!!element.style.linkedModelElementId}
                  >
                    Remove
                  </Button>
                )}
              </Box>
            </Grid>
          </>
        )}

        {appearanceType === 'custom-3d-model' && (
          <>
            <Grid component={"div" as any} item xs={12}>
              <TextField
                label="3D Model URL"
                value={modelUrl}
                onChange={handleModelUrlChange}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
                placeholder="Enter GLB model URL or upload a GLB file"
                disabled={!!element.style.linkedModelElementId}
              />
            </Grid>
            
            <Grid component={"div" as any} item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button 
                  variant="outlined" 
                  component="label" 
                  startIcon={<ViewInArIcon />}
                  size="small"
                  disabled={!!element.style.linkedModelElementId}
                >
                  Upload 3D Model
                  <input
                    type="file"
                    hidden
                    accept=".glb"
                    onChange={handleFileUpload}
                    disabled={!!element.style.linkedModelElementId}
                  />
                </Button>
                {modelSrc && (
                  <Button 
                    variant="outlined" 
                    color="error" 
                    startIcon={<DeleteIcon />} 
                    onClick={clearModel}
                    size="small"
                    disabled={!!element.style.linkedModelElementId}
                  >
                    Remove
                  </Button>
                )}
              </Box>
            </Grid>
          </>
        )}
      </Grid>

      {element && element.style.linkedModelElementId && (
        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center' }}>
          <Tooltip title="This element inherits appearance from its model element">
            <IconButton size="small" color="primary" sx={{ mr: 1 }}>
              <LinkIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="caption" color="text.secondary">
            Linked to model element - appearance will be inherited
          </Typography>
        </Box>
      )}

      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          Preview
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2, border: '1px dashed #ccc' }}>
          <Box sx={{ width: 100, height: 80 }}>
            {renderAppearancePreview()}
          </Box>
        </Box>
      </Box>

      <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)}>
        <DialogTitle>Image Preview</DialogTitle>
        <DialogContent>
          {previewImage && (
            <Box 
              component="img" 
              src={previewImage.url}
              alt="Preview" 
              sx={{ 
                maxWidth: '100%', 
                maxHeight: '300px',
                display: 'block',
                mx: 'auto'
              }} 
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ElementAppearanceSelector; 