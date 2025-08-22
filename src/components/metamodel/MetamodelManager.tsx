import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, 
  Button, 
  Typography, 
  TextField, 
  List, 
  ListItem, 
  ListItemText, 
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  ListItemButton,
  Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { Metamodel } from '../../models/types';
import { metamodelService } from '../../services/metamodel.service';
import VisualMetamodelEditor from './VisualMetamodelEditor';
import { exportService } from '../../services/export.service';
import { ecoreService } from '../../services/ecore.service';

const MetamodelManager: React.FC = () => {
  const [metamodels, setMetamodels] = useState<Metamodel[]>([]);
  const [selectedMetamodel, setSelectedMetamodel] = useState<Metamodel | null>(null);
  const [newMetamodelName, setNewMetamodelName] = useState('');
  const [isMetamodelDialogOpen, setIsMetamodelDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importData, setImportData] = useState('');
  const [importFileFormat, setImportFileFormat] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load metamodels when component mounts
    refreshMetamodels();
  }, []);

  const refreshMetamodels = () => {
    const loadedMetamodels = metamodelService.getAllMetamodels();
    setMetamodels(loadedMetamodels);
    
    // Update selected metamodel if it exists in the loaded metamodels
    if (selectedMetamodel) {
      const updatedMetamodel = loadedMetamodels.find(m => m.id === selectedMetamodel.id);
      setSelectedMetamodel(updatedMetamodel || null);
    }
  };

  const handleCreateMetamodel = () => {
    if (newMetamodelName.trim()) {
      metamodelService.createMetamodel(newMetamodelName.trim());
      setNewMetamodelName('');
      setIsMetamodelDialogOpen(false);
      refreshMetamodels();
    }
  };

  const handleDeleteMetamodel = (id: string) => {
    if (window.confirm('Are you sure you want to delete this metamodel?')) {
      metamodelService.deleteMetamodel(id);
      if (selectedMetamodel?.id === id) {
        setSelectedMetamodel(null);
      }
      refreshMetamodels();
    }
  };

  const handleSelectMetamodel = (metamodel: Metamodel) => {
    setSelectedMetamodel(metamodel);
  };

  const handleExportMetamodel = async (metamodel: Metamodel) => {
    await exportService.exportMetamodel(metamodel.id);
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          setImportData(content);
          
          // Store the file extension for format detection
          const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
          setImportFileFormat(fileExtension);
          
          setIsImportDialogOpen(true);
        } catch (error) {
          console.error('Error reading file:', error);
          alert('Error reading file');
        }
      };
      reader.readAsText(file);
    }
    
    // Reset the input so the same file can be selected again
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleImportMetamodel = () => {
    try {
      if (importFileFormat === 'ecore' || importFileFormat === 'xmi') {
        // Import as Ecore
        const metamodelId = ecoreService.importFromEcore(importData);
        if (!metamodelId) {
          throw new Error('Failed to import Ecore metamodel');
        }
      } else {
        // Import as JSON
      const metamodelData = JSON.parse(importData);
      
      // Validate that it's a proper metamodel
      if (!metamodelData.name || !metamodelData.classes) {
        throw new Error('Invalid metamodel format');
      }
      
      // Create a new metamodel with the imported data
      const newMetamodel = metamodelService.createMetamodel(metamodelData.name);
      
      // Update it with the imported data (preserving the new ID)
      const updatedData = {
        ...metamodelData,
        id: newMetamodel.id
      };
      
      metamodelService.updateMetamodel(newMetamodel.id, updatedData);
      }
      
      setIsImportDialogOpen(false);
      setImportData('');
      setImportFileFormat('');
      refreshMetamodels();
      
    } catch (error) {
      console.error('Error importing metamodel:', error);
      alert('Error importing metamodel: Invalid format');
    }
  };

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
      {/* Metamodel List Panel */}
      <Paper
        elevation={3}
        sx={{
          width: 250,
          p: 2,
          height: '100%',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Metamodels</Typography>
          <Box sx={{ display: 'flex' }}>
            <IconButton color="primary" onClick={() => setIsMetamodelDialogOpen(true)}>
              <AddIcon />
            </IconButton>
            <Tooltip title="Import Metamodel">
              <IconButton color="primary" onClick={handleImportClick}>
                <FileUploadIcon />
              </IconButton>
            </Tooltip>
            <input
              type="file"
              accept=".json,.ecore,.xmi"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </Box>
        </Box>
        
        <List sx={{ flexGrow: 1 }}>
          {metamodels.map((metamodel) => (
            <ListItem
              key={metamodel.id}
              disablePadding
              sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'stretch',
                mb: 0.5
              }}
            >
              <Box sx={{ display: 'flex', width: '100%' }}>
                <ListItemButton
                  selected={selectedMetamodel?.id === metamodel.id}
                  onClick={() => handleSelectMetamodel(metamodel)}
                  sx={{ 
                    flexGrow: 1,
                    height: 'auto',
                    py: 0.75,
                    pr: 0
                  }}
                >
                  <Tooltip title={metamodel.name} enterDelay={700}>
                    <Typography 
                      sx={{
                        fontSize: metamodel.name.length > 20 ? '0.875rem' : '1rem',
                        lineHeight: 1.2,
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {metamodel.name}
                    </Typography>
                  </Tooltip>
                </ListItemButton>
                
                <Box sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
                  <Tooltip title="Export Metamodel (JSON or Ecore)">
                    <IconButton size="small" onClick={() => handleExportMetamodel(metamodel)}>
                      <FileDownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <IconButton size="small" onClick={() => handleDeleteMetamodel(metamodel.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            </ListItem>
          ))}
        </List>
      </Paper>

      {/* Right Panel Content */}
      {selectedMetamodel ? (
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Visual Editor */}
          <Box sx={{ flexGrow: 1, height: '100%' }}>
            <VisualMetamodelEditor metamodelId={selectedMetamodel.id} />
          </Box>
        </Box>
      ) : (
        // No metamodel selected
        <Box 
          sx={{ 
            flexGrow: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}
        >
          <Typography color="textSecondary">
            Select a metamodel or create a new one to get started
          </Typography>
        </Box>
      )}

      {/* Create Metamodel Dialog */}
      <Dialog open={isMetamodelDialogOpen} onClose={() => setIsMetamodelDialogOpen(false)}>
        <DialogTitle>Create New Metamodel</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Metamodel Name"
            fullWidth
            value={newMetamodelName}
            onChange={(e) => setNewMetamodelName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsMetamodelDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateMetamodel}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Import Metamodel Dialog */}
      <Dialog open={isImportDialogOpen} onClose={() => setIsImportDialogOpen(false)}>
        <DialogTitle>
          Import Metamodel 
          {importFileFormat && ` (${importFileFormat.toUpperCase()} Format)`}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {importFileFormat === 'ecore' || importFileFormat === 'xmi' 
              ? 'Importing Ecore/XMI metamodel. Press Import to continue.' 
              : 'Review the JSON metamodel data before importing:'}
          </Typography>
          <TextField
            multiline
            rows={10}
            fullWidth
            value={importData}
            onChange={(e) => setImportData(e.target.value)}
            variant="outlined"
            InputProps={{
              readOnly: importFileFormat === 'ecore' || importFileFormat === 'xmi'
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsImportDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleImportMetamodel} color="primary">Import</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MetamodelManager; 