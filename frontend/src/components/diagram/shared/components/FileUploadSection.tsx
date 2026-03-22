import React from 'react';
import {
  Box,
  TextField,
  Button,
  Grid,
} from '@mui/material';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import ViewInArIcon from '@mui/icons-material/ViewInAr';

export interface FileUploadSectionProps {
  type: 'image' | 'model';
  url: string;
  src: string | null;
  onUrlChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  disabled?: boolean;
}

export const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  type,
  url,
  src,
  onUrlChange,
  onFileUpload,
  onClear,
  disabled = false,
}) => {
  const isImage = type === 'image';
  const label = isImage ? 'Image URL' : '3D Model URL';
  const placeholder = isImage
    ? 'Enter image URL or upload an image'
    : 'Enter GLB model URL or upload a GLB file';
  const uploadLabel = isImage ? 'Upload Image' : 'Upload 3D Model';
  const accept = isImage ? 'image/*' : '.glb';
  const icon = isImage ? <FileUploadIcon /> : <ViewInArIcon />;

  return (
    <>
      <Grid component={"div" as any} item xs={12}>
        <TextField
          label={label}
          value={url}
          onChange={onUrlChange}
          fullWidth
          size="small"
          InputLabelProps={{ shrink: true }}
          placeholder={placeholder}
          disabled={disabled}
        />
      </Grid>

      <Grid component={"div" as any} item xs={12}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            variant="outlined"
            component="label"
            startIcon={icon}
            size="small"
            disabled={disabled}
          >
            {uploadLabel}
            <input
              type="file"
              hidden
              accept={accept}
              onChange={onFileUpload}
              disabled={disabled}
            />
          </Button>
          {src && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={onClear}
              size="small"
              disabled={disabled}
            >
              Remove
            </Button>
          )}
        </Box>
      </Grid>
    </>
  );
};
