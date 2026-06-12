import React from 'react';
import { Box, Typography } from '@mui/material';

interface ColorSwatchFieldProps {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

const ColorSwatchField: React.FC<ColorSwatchFieldProps> = ({
  label,
  value,
  disabled = false,
  onChange,
}) => (
  <Box sx={{ minWidth: 128 }}>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
      {label}
    </Typography>
    <Box
      component="label"
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        height: 40,
        px: 1,
        border: 1,
        borderColor: disabled ? 'action.disabled' : 'divider',
        borderRadius: 1,
        bgcolor: disabled ? 'action.disabledBackground' : 'background.paper',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 24,
          border: 1,
          borderColor: 'divider',
          borderRadius: 0.75,
          bgcolor: value,
          flexShrink: 0,
        }}
      />
      <Typography variant="body2" sx={{ fontFamily: 'monospace', lineHeight: 1 }}>
        {value}
      </Typography>
      <Box
        component="input"
        type="color"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      />
    </Box>
  </Box>
);

export default ColorSwatchField;
