/**
 * TabPanel component for code generation tabs
 */

import React from 'react';
import { Box } from '@mui/material';
import { TabPanelProps } from '../types';

export const TabPanel: React.FC<TabPanelProps> = (props) => {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`code-tabpanel-${index}`}
      {...other}
      style={{ height: 'calc(100% - 48px)', overflow: 'auto' }}
    >
      {value === index && (
        <Box sx={{ p: 2, height: '100%' }}>
          {children}
        </Box>
      )}
    </div>
  );
};
