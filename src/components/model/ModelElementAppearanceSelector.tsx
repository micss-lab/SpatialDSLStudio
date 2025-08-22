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
import ChangeHistoryIcon from '@mui/icons-material/ChangeHistory'; // Triangle
import StarIcon from '@mui/icons-material/Star';
import ViewInArIcon from '@mui/icons-material/ViewInAr'; // 3D model icon
import { ModelElement } from '../../models/types';
import fileStorageService from '../../services/fileStorage.service';

// Appearance options - same as in ElementAppearanceSelector to maintain compatibility
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
  imageSrc?: string;
  imageFileId?: string; // ID for stored image files
  modelUrl?: string;
  modelSrc?: string;
  modelFileId?: string; // ID for stored model files
  color?: string;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
}

interface ModelElementAppearanceSelectorProps {
  element: ModelElement;
  onUpdate: (propertyName: string, value: any) => void;
}

const ModelElementAppearanceSelector: React.FC<ModelElementAppearanceSelectorProps> = ({
  element,
  onUpdate
}) => {
  const [appearanceType, setAppearanceType] = useState<AppearanceOption>('default');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageFileId, setImageFileId] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string>('');
  const [modelSrc, setModelSrc] = useState<string | null>(null);
  const [modelFileId, setModelFileId] = useState<string | null>(null);
  const [color, setColor] = useState<string>('#ffffff');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Initialize from element style
  useEffect(() => {
    const loadAppearanceData = async () => {
      if (element.style.appearance) {
        try {
          const appearance = JSON.parse(element.style.appearance);
          setAppearanceType(appearance.type || 'default');
          setImageUrl(appearance.imageUrl || '');
          setModelUrl(appearance.modelUrl || '');
          setColor(appearance.color || '#ffffff');
          
          // Load stored files if file IDs are present
          if (appearance.imageFileId) {
            setImageFileId(appearance.imageFileId);
            try {
              const imageData = await fileStorageService.getFile(appearance.imageFileId);
              setImageSrc(imageData);
            } catch (error) {
              console.error('Error loading stored image:', error);
            }
          } else {
            setImageSrc(appearance.imageSrc || null);
            setImageFileId(null);
          }
          
          if (appearance.modelFileId) {
            setModelFileId(appearance.modelFileId);
            try {
              const modelData = await fileStorageService.getFile(appearance.modelFileId);
              setModelSrc(modelData);
            } catch (error) {
              console.error('Error loading stored model:', error);
            }
          } else {
            setModelSrc(appearance.modelSrc || null);
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

    loadAppearanceData();
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
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (file) {
      setIsLoading(true);
      
      try {
        // Check file type
        if (file.type.startsWith('image/')) {
          // Handle image files
          if (file.size > 1024 * 1024) {
            alert('Image file size should be less than 1MB');
            return;
          }
          
          const reader = new FileReader();
          reader.onload = async (e) => {
            const result = e.target?.result as string;
            
            try {
              // Store large images in IndexedDB
              const fileId = await fileStorageService.storeFile(result, 'image', file.name);
              setImageSrc(result);
              setImageFileId(fileId);
              setAppearanceType('custom-image');
              updateAppearance('custom-image', '', null, fileId, modelUrl, modelSrc, modelFileId, color);
            } catch (error) {
              console.error('Error storing image file:', error);
              alert('Error storing image file. Please try a smaller file.');
            } finally {
              setIsLoading(false);
            }
          };
          reader.readAsDataURL(file);
        } else if (file.name.toLowerCase().endsWith('.glb')) {
          // Handle GLB files
          if (file.size > 5 * 1024 * 1024) { // 5MB limit for 3D models
            alert('3D model file size should be less than 5MB');
            setIsLoading(false);
            return;
          }
          
          const reader = new FileReader();
          reader.onload = async (e) => {
            const result = e.target?.result as string;
            
            try {
              // Store model in IndexedDB
              const fileId = await fileStorageService.storeFile(result, 'model', file.name);
              setModelSrc(result);
              setModelFileId(fileId);
              setAppearanceType('custom-3d-model');
              updateAppearance('custom-3d-model', imageUrl, imageSrc, imageFileId, '', null, fileId, color);
            } catch (error) {
              console.error('Error storing model file:', error);
              alert('Error storing 3D model file. Please try a smaller file.');
            } finally {
              setIsLoading(false);
            }
          };
          reader.readAsDataURL(file);
        } else {
          alert('Please upload an image file (PNG, JPG, SVG) or a 3D model file (.glb)');
          setIsLoading(false);
          return;
        }
      } catch (error) {
        console.error('Error processing file:', error);
        alert('Error processing file. Please try again.');
        setIsLoading(false);
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
    if (src && !imgFileId) appearance.imageSrc = src; // Only store src if not using fileId
    if (imgFileId) appearance.imageFileId = imgFileId;
    
    // Only include modelUrl or modelSrc if they're defined
    if (mUrl) appearance.modelUrl = mUrl;
    if (mSrc && !mdlFileId) appearance.modelSrc = mSrc; // Only store src if not using fileId
    if (mdlFileId) appearance.modelFileId = mdlFileId;
    
    // Convert to JSON string and save to element style
    onUpdate('appearance', JSON.stringify(appearance));
  };

  // Clear image
  const clearImage = async () => {
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
      <Typography variant="subtitle1" gutterBottom fontWeight="bold">
        Appearance
      </Typography>
      
      <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 2 }}>
        Choose how this element appears in diagrams. This will be used when diagram elements link to this model element.
      </Typography>
      
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
                  <Box sx={{ width: 24, height: 16, border: '1px solid', mr: 1 }} />
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
            disabled={appearanceType === 'custom-image' || appearanceType === 'custom-3d-model'}
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
                placeholder="https://example.com/image.png"
                InputProps={{
                  endAdornment: imageUrl && (
                    <IconButton size="small" onClick={clearImage}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )
                }}
              />
            </Grid>
            
            <Grid component={"div" as any} item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button 
                  variant="outlined" 
                  component="label" 
                  startIcon={<FileUploadIcon />}
                  size="small"
                  disabled={isLoading}
                >
                  {isLoading ? 'Uploading...' : 'Upload Image'}
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={isLoading}
                  />
                </Button>
                
                {(imageSrc || imageFileId) && (
                  <Tooltip title="Remove Uploaded Image">
                    <IconButton size="small" onClick={clearImage} disabled={isLoading}>
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
              
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
                Max size: 1MB. Formats: PNG, JPG, SVG
              </Typography>
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
                placeholder="https://example.com/model.glb"
                InputProps={{
                  endAdornment: modelUrl && (
                    <IconButton size="small" onClick={clearModel}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )
                }}
              />
            </Grid>
            
            <Grid component={"div" as any} item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button 
                  variant="outlined" 
                  component="label" 
                  startIcon={<ViewInArIcon />}
                  size="small"
                  disabled={isLoading}
                >
                  {isLoading ? 'Uploading...' : 'Upload 3D Model'}
                  <input
                    type="file"
                    hidden
                    accept=".glb"
                    onChange={handleFileUpload}
                    disabled={isLoading}
                  />
                </Button>
                
                {(modelSrc || modelFileId) && (
                  <Tooltip title="Remove Uploaded 3D Model">
                    <IconButton size="small" onClick={clearModel} disabled={isLoading}>
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
              
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
                Max size: 5MB. Format: GLB (binary glTF)
              </Typography>
            </Grid>
          </>
        )}
      </Grid>
      
      <Box sx={{ mt: 2, p: 2, border: '1px dashed #ccc', borderRadius: 1 }}>
        <Typography variant="subtitle2" gutterBottom align="center">
          Preview
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
          {renderAppearancePreview()}
        </Box>
      </Box>
    </Box>
  );
};

export default ModelElementAppearanceSelector; 