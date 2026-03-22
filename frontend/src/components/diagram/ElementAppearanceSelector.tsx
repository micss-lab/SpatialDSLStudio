import React from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Tooltip,
  Grid,
  SelectChangeEvent,
} from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import { DiagramElement } from '../../models/types';
import {
  useAppearanceState,
  useFileUpload,
  AppearanceOption,
} from './shared/hooks';
import {
  AppearancePreview,
  AppearanceTypeSelector,
  FileUploadSection,
} from './shared/components';

interface ElementAppearanceSelectorProps {
  element: DiagramElement;
  onChange: (propertyName: string, value: any) => void;
}

const ElementAppearanceSelector: React.FC<ElementAppearanceSelectorProps> = ({
  element,
  onChange
}) => {
  const appearanceState = useAppearanceState({ element, onChange });
  
  const fileUpload = useFileUpload({
    setImageFileId: appearanceState.setImageFileId,
    setImageSrc: appearanceState.setImageSrc,
    setAppearanceType: appearanceState.setAppearanceType,
    setModelFileId: appearanceState.setModelFileId,
    setModelSrc: appearanceState.setModelSrc,
    updateAppearance: appearanceState.updateAppearance,
    modelUrl: appearanceState.modelUrl,
    modelSrc: appearanceState.modelSrc,
    modelFileId: appearanceState.modelFileId,
    imageUrl: appearanceState.imageUrl,
    imageSrc: appearanceState.imageSrc,
    imageFileId: appearanceState.imageFileId,
    color: appearanceState.color,
  });

  const isLinked = !!element.style.linkedModelElementId;

  // Handle appearance type change
  const handleAppearanceTypeChange = (event: SelectChangeEvent<AppearanceOption>) => {
    const newType = event.target.value as AppearanceOption;
    appearanceState.setAppearanceType(newType);
    appearanceState.updateAppearance(
      newType,
      appearanceState.imageUrl,
      appearanceState.imageSrc,
      appearanceState.imageFileId,
      appearanceState.modelUrl,
      appearanceState.modelSrc,
      appearanceState.modelFileId,
      appearanceState.color
    );
  };

  // Handle image URL change
  const handleImageUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = event.target.value;
    appearanceState.setImageUrl(newUrl);

    if (newUrl && (newUrl.startsWith('http://') || newUrl.startsWith('https://'))) {
      appearanceState.updateAppearance(
        appearanceState.appearanceType,
        newUrl,
        appearanceState.imageSrc,
        appearanceState.imageFileId,
        appearanceState.modelUrl,
        appearanceState.modelSrc,
        appearanceState.modelFileId,
        appearanceState.color
      );
    }
  };

  // Handle model URL change
  const handleModelUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = event.target.value;
    appearanceState.setModelUrl(newUrl);

    if (newUrl && (newUrl.startsWith('http://') || newUrl.startsWith('https://'))) {
      appearanceState.updateAppearance(
        appearanceState.appearanceType,
        appearanceState.imageUrl,
        appearanceState.imageSrc,
        appearanceState.imageFileId,
        newUrl,
        appearanceState.modelSrc,
        appearanceState.modelFileId,
        appearanceState.color
      );
    }
  };

  // Handle color change
  const handleColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = event.target.value;
    appearanceState.setColor(newColor);
    appearanceState.updateAppearance(
      appearanceState.appearanceType,
      appearanceState.imageUrl,
      appearanceState.imageSrc,
      appearanceState.imageFileId,
      appearanceState.modelUrl,
      appearanceState.modelSrc,
      appearanceState.modelFileId,
      newColor
    );
  };

  return (
    <Box sx={{ mt: 3, mb: 4 }}>
      <Typography variant="subtitle1" gutterBottom fontWeight="500">
        Element Appearance
      </Typography>

      {/* Add a notice when element is linked to a model element */}
      {isLinked && (
        <Box sx={{ mb: 2, p: 1, bgcolor: 'rgba(25, 118, 210, 0.08)', borderRadius: 1 }}>
          <Typography variant="caption" color="primary">
            This element inherits its appearance from the linked model element.
            The appearance settings below reflect the model element appearance but cannot be edited directly.
          </Typography>
        </Box>
      )}

      <Grid container spacing={2}>
        <Grid component={"div" as any} item xs={12} md={6}>
          <AppearanceTypeSelector
            value={appearanceState.appearanceType}
            onChange={handleAppearanceTypeChange}
            disabled={isLinked}
          />
        </Grid>

        <Grid component={"div" as any} item xs={12} md={6}>
          <TextField
            label="Fill Color"
            type="color"
            value={appearanceState.color}
            onChange={handleColorChange}
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
            disabled={
              isLinked ||
              appearanceState.appearanceType === 'custom-image' ||
              appearanceState.appearanceType === 'custom-3d-model'
            }
          />
        </Grid>

        {appearanceState.appearanceType === 'custom-image' && (
          <FileUploadSection
            type="image"
            url={appearanceState.imageUrl}
            src={appearanceState.imageSrc}
            onUrlChange={handleImageUrlChange}
            onFileUpload={fileUpload.handleFileUpload}
            onClear={appearanceState.clearImage}
            disabled={isLinked}
          />
        )}

        {appearanceState.appearanceType === 'custom-3d-model' && (
          <FileUploadSection
            type="model"
            url={appearanceState.modelUrl}
            src={appearanceState.modelSrc}
            onUrlChange={handleModelUrlChange}
            onFileUpload={fileUpload.handleFileUpload}
            onClear={appearanceState.clearModel}
            disabled={isLinked}
          />
        )}
      </Grid>

      {isLinked && (
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
            <AppearancePreview
              appearanceType={appearanceState.appearanceType}
              imageSrc={appearanceState.imageSrc}
              imageUrl={appearanceState.imageUrl}
              imageFileId={appearanceState.imageFileId}
              modelSrc={appearanceState.modelSrc}
              modelUrl={appearanceState.modelUrl}
              modelFileId={appearanceState.modelFileId}
              color={appearanceState.color}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default ElementAppearanceSelector;
