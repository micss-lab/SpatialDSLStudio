import React from 'react';
import { Paper, Button, Divider, Box } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import BugReportIcon from '@mui/icons-material/BugReport';
import SearchBar from '../../../common/SearchBar';

interface MetamodelToolbarProps {
  isDrawingReference: boolean;
  readOnly: boolean;
  searchResults: any[];
  onAddClass: () => void;
  onToggleDrawReference: () => void;
  onSaveChanges: () => void;
  onTestMetamodel: () => void;
  onSearch: (query: string) => void;
  onSelectSearchResult: (result: any) => void;
  onHighlightAllResults: (query: string) => void;
}

export const MetamodelToolbar: React.FC<MetamodelToolbarProps> = ({
  isDrawingReference,
  readOnly,
  searchResults,
  onAddClass,
  onToggleDrawReference,
  onSaveChanges,
  onTestMetamodel,
  onSearch,
  onSelectSearchResult,
  onHighlightAllResults
}) => {
  return (
    <Paper
      sx={{
        position: 'absolute',
        top: 16,
        left: 16,
        p: 1,
        display: 'flex',
        gap: 1,
        maxWidth: '95%',
        zIndex: 10,
        alignItems: 'center'
      }}
    >
      <Button
        variant="contained"
        size="small"
        startIcon={<AddIcon />}
        onClick={onAddClass}
        disabled={readOnly}
      >
        Add Class
      </Button>
      
      <Button
        variant={isDrawingReference ? "contained" : "outlined"}
        color="primary"
        size="small"
        disabled={readOnly}
        onClick={onToggleDrawReference}
      >
        {isDrawingReference ? "Cancel Reference" : "Add Reference"}
      </Button>
      
      <Button
        variant="contained"
        color="success"
        size="small"
        onClick={onSaveChanges}
        startIcon={<SaveIcon />}
        disabled={readOnly}
      >
        Save Changes
      </Button>

      <Button
        variant="contained"
        size="small"
        startIcon={<BugReportIcon />}
        color="secondary"
        onClick={onTestMetamodel}
      >
        Test Metamodel
      </Button>

      <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
      
      {/* Search Bar */}
      <Box sx={{ width: 200 }}>
        <SearchBar
          onSearch={onSearch}
          results={searchResults}
          onSelectResult={onSelectSearchResult}
          onHighlightAll={onHighlightAllResults}
          placeholder="Search metamodel..."
          showShortcutHint={false}
        />
      </Box>
    </Paper>
  );
};

export default MetamodelToolbar;
