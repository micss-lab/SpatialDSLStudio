import React from 'react';
import { Box, Typography } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import { AppearanceOption } from '../hooks/useAppearanceState';

export interface AppearancePreviewProps {
  appearanceType: AppearanceOption;
  imageSrc: string | null;
  imageUrl: string;
  imageFileId: string | null;
  modelSrc: string | null;
  modelUrl: string;
  modelFileId: string | null;
  color: string;
}

export const AppearancePreview: React.FC<AppearancePreviewProps> = ({
  appearanceType,
  imageSrc,
  imageUrl,
  imageFileId,
  modelSrc,
  modelUrl,
  modelFileId,
  color,
}) => {
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
