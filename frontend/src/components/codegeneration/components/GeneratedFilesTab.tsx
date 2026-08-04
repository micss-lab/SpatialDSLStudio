/**
 * GeneratedFilesTab - Displays generated code files with preview
 */

import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  IconButton,
  Button
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { okaidia } from '@uiw/codemirror-theme-okaidia';
import { CodeGenerationResult } from '../../../models/types';

interface GeneratedFilesTabProps {
  files: CodeGenerationResult[];
  selectedIndex: number | null;
  onSelectFile: (index: number) => void;
  onDownloadFile: (content: string, filename: string) => void;
  onDownloadAll: (files: CodeGenerationResult[]) => void;
}

/**
 * GeneratedFilesTab displays generated code files with a sidebar list and code preview
 */
export const GeneratedFilesTab: React.FC<GeneratedFilesTabProps> = ({
  files,
  selectedIndex,
  onSelectFile,
  onDownloadFile,
  onDownloadAll
}) => {
  if (files.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary" align="center">
        No files generated yet. Select a generator configuration and generate code.
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={() => onDownloadAll(files)}
          sx={{ mr: 2 }}
        >
          Download All
        </Button>
      </Box>
      <Box sx={{ display: 'flex', flexGrow: 1, minHeight: 0 }}>
        <List sx={{ width: 250, borderRight: '1px solid #eee', overflowY: 'auto' }}>
          {files.map((file, index) => (
            <ListItem
              key={index}
              disablePadding
              secondaryAction={
                <IconButton edge="end" onClick={() => onDownloadFile(file.content, file.filename)}>
                  <DownloadIcon />
                </IconButton>
              }
            >
              <ListItemButton
                selected={selectedIndex === index}
                onClick={() => onSelectFile(index)}
              >
                <ListItemText primary={file.filename} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        <Box sx={{ flexGrow: 1, p: 2, overflowY: 'auto', height: '100%' }}>
          {selectedIndex !== null && (
            <>
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                mb: 2,
                backgroundColor: '#333333',
                padding: '8px',
                color: 'white',
                borderTopLeftRadius: '4px',
                borderTopRightRadius: '4px'
              }}>
                <Typography variant="subtitle1">
                  {files[selectedIndex].filename}
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={() => onDownloadFile(
                    files[selectedIndex].content,
                    files[selectedIndex].filename
                  )}
                  sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
                >
                  Download
                </Button>
              </Box>
              <Box sx={{ 
                height: 'calc(100% - 60px)', 
                backgroundColor: '#1e1e1e',
                borderBottomLeftRadius: '4px',
                borderBottomRightRadius: '4px',
                overflow: 'auto'
              }}>
                <CodeMirror
                  value={files[selectedIndex].content}
                  height="calc(100% - 60px)"
                  extensions={[javascript(), okaidia]}
                  theme="dark"
                />
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};
