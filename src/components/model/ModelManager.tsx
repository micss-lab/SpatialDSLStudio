import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ListItemButton,
  Tooltip,
  SelectChangeEvent
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { Model, Metamodel } from '../../models/types';
import { modelService } from '../../services/model.service';
import { metamodelService } from '../../services/metamodel.service';
import VisualModelEditor from './VisualModelEditor';

const ModelManager: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [models, setModels] = useState<Model[]>([]);
  const [metamodels, setMetamodels] = useState<Metamodel[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importData, setImportData] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  // Form states
  const [newModelName, setNewModelName] = useState('');
  const [selectedMetamodelId, setSelectedMetamodelId] = useState('');
  
  // Load models and metamodels
  useEffect(() => {
    const loadData = () => {
      setModels(modelService.getAllModels());
      setMetamodels(metamodelService.getAllMetamodels());
      
      // If we have an id parameter, select that model
      if (id) {
        const model = modelService.getModelById(id);
        if (model) {
          setSelectedModel(model);
        }
      }
    };
    
    loadData();
  }, [id]);
  
  // Handle selecting a model
  const handleSelectModel = (model: Model) => {
    setSelectedModel(model);
  };
  
  // Handle creating a new model
  const handleCreateModel = () => {
    if (newModelName.trim() && selectedMetamodelId) {
      const newModel = modelService.createModel(newModelName, selectedMetamodelId);
      setModels([...models, newModel]);
      setSelectedModel(newModel);
      setNewModelName('');
      setSelectedMetamodelId('');
      setIsCreateDialogOpen(false);
    }
  };
  
  // Handle deleting a model
  const handleDeleteModel = (modelId: string) => {
    if (window.confirm('Are you sure you want to delete this model?')) {
      modelService.deleteModel(modelId);
      setModels(models.filter(m => m.id !== modelId));
      if (selectedModel?.id === modelId) {
        setSelectedModel(null);
      }
    }
  };
  
  // Handle metamodel change in create dialog
  const handleMetamodelChange = (event: SelectChangeEvent) => {
    setSelectedMetamodelId(event.target.value);
  };
  
  // Export model to JSON
  const handleExportModel = (model: Model) => {
    const dataStr = JSON.stringify(model, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `${model.name.toLowerCase()}-model.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  // Import model from JSON
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

  const handleImportModel = () => {
    try {
      const modelData = JSON.parse(importData);
      
      // Validate that it's a proper model
      if (!modelData.name || !modelData.conformsTo || !Array.isArray(modelData.elements)) {
        throw new Error('Invalid model format');
      }
      
      // Check if the referenced metamodel exists
      const metamodel = metamodelService.getMetamodelById(modelData.conformsTo);
      if (!metamodel) {
        throw new Error(`Referenced metamodel not found: ${modelData.conformsTo}`);
      }
      
      // Create a new model with the imported data
      const newModel = modelService.createModel(modelData.name, modelData.conformsTo);
      
      // Add all elements from the imported model
      modelData.elements.forEach((element: any) => {
        modelService.addImportedModelElement(newModel.id, element);
      });
      
      setIsImportDialogOpen(false);
      setImportData('');
      
      // Refresh the models list and select the newly imported model
      const refreshedModels = modelService.getAllModels();
      setModels(refreshedModels);
      
      const importedModel = refreshedModels.find(m => m.id === newModel.id);
      if (importedModel) {
        setSelectedModel(importedModel);
      }
      
    } catch (error) {
      console.error('Error importing model:', error);
      alert(`Error importing model: ${error instanceof Error ? error.message : 'Invalid format'}`);
    }
  };
  
  // Render the Create Model dialog
  const renderCreateModelDialog = () => (
    <Dialog open={isCreateDialogOpen} onClose={() => setIsCreateDialogOpen(false)}>
      <DialogTitle>Create New Model</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Model Name"
          fullWidth
          value={newModelName}
          onChange={(e) => setNewModelName(e.target.value)}
        />
        <FormControl fullWidth margin="normal">
          <InputLabel>Conforms to Metamodel</InputLabel>
          <Select
            value={selectedMetamodelId}
            onChange={handleMetamodelChange}
            label="Conforms to Metamodel"
          >
            {metamodels.map(metamodel => (
              <MenuItem key={metamodel.id} value={metamodel.id}>
                {metamodel.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
        <Button 
          onClick={handleCreateModel} 
          color="primary"
          disabled={!newModelName || !selectedMetamodelId}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
  
  // Render the Import Model dialog
  const renderImportModelDialog = () => (
    <Dialog open={isImportDialogOpen} onClose={() => setIsImportDialogOpen(false)}>
      <DialogTitle>Import Model</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Review the model data before importing:
        </Typography>
        <TextField
          multiline
          rows={10}
          fullWidth
          value={importData}
          onChange={(e) => setImportData(e.target.value)}
          variant="outlined"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setIsImportDialogOpen(false)}>Cancel</Button>
        <Button onClick={handleImportModel} color="primary">Import</Button>
      </DialogActions>
    </Dialog>
  );
  
  // Render the model list
  const renderModelList = () => (
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
        <Typography variant="h6">Models</Typography>
        <Box sx={{ display: 'flex' }}>
          <IconButton color="primary" onClick={() => setIsCreateDialogOpen(true)}>
            <AddIcon />
          </IconButton>
          <Tooltip title="Import Model">
            <IconButton color="primary" onClick={handleImportClick}>
              <FileUploadIcon />
            </IconButton>
          </Tooltip>
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </Box>
      </Box>
      
      <List sx={{ flexGrow: 1 }}>
        {models.map((model) => (
          <ListItem
            key={model.id}
            disablePadding
            secondaryAction={
              <Box>
                <Tooltip title="Export Model">
                  <IconButton edge="end" onClick={() => handleExportModel(model)}>
                    <FileDownloadIcon />
                  </IconButton>
                </Tooltip>
                <IconButton edge="end" onClick={() => handleDeleteModel(model.id)}>
                  <DeleteIcon />
                </IconButton>
              </Box>
            }
            sx={{ pr: 10 }}
          >
            <ListItemButton
              selected={selectedModel?.id === model.id}
              onClick={() => handleSelectModel(model)}
              sx={{ 
                height: 'auto',
                py: 0.75,
                minHeight: '42px',
                display: 'flex',
                alignItems: 'flex-start'
              }}
            >
              <ListItemText 
                primary={model.name} 
                primaryTypographyProps={{ 
                  sx: { 
                    wordBreak: 'keep-all',
                    overflowWrap: 'normal',
                    hyphens: 'none',
                    lineHeight: '1.2',
                    maxWidth: '210px',
                    whiteSpace: 'normal',
                    fontSize: (theme) => 
                      model.name.length > 20 ? theme.typography.body2.fontSize : theme.typography.body1.fontSize
                  }
                }}
                secondary={getMetamodelName(model.conformsTo)}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Paper>
  );
  
  // Helper to get the metamodel name
  const getMetamodelName = (metamodelId: string): string => {
    const metamodel = metamodels.find(m => m.id === metamodelId);
    return metamodel ? metamodel.name : 'Unknown metamodel';
  };
  
  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
      {/* Models List */}
      {renderModelList()}
      
      {/* Model Visualizer */}
      {selectedModel ? (
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <VisualModelEditor modelId={selectedModel.id} />
        </Box>
      ) : (
        <Box 
          sx={{ 
            flexGrow: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}
        >
          <Typography color="textSecondary">
            Select a model or create a new one to get started
          </Typography>
        </Box>
      )}
      
      {/* Dialogs */}
      {renderCreateModelDialog()}
      {renderImportModelDialog()}
    </Box>
  );
};

export default ModelManager; 