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
  Alert,
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
import ShareIcon from '@mui/icons-material/Share';
import DataObjectIcon from '@mui/icons-material/DataObject';
import { Model, Metamodel } from '../../models/types';
import { modelService, modelXmiExportService, modelXmiImportService } from '../../services/model';
import { metamodelService } from '../../services/metamodel';
import { getParentGroupSurfaceColor, groupByParent } from '../../services/common/grouping.service';
import VisualModelEditor from './VisualModelEditor';
import { ShareDialog } from '../common';
import { useAuth } from '../../contexts/AuthContext';

const ModelManager: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canShare, canCreate, canDelete } = useAuth();
  const [models, setModels] = useState<Model[]>([]);
  const [metamodels, setMetamodels] = useState<Metamodel[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importData, setImportData] = useState('');
  const [importFileFormat, setImportFileFormat] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<Model | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  // Form states
  const [newModelName, setNewModelName] = useState('');
  const [newModelDescription, setNewModelDescription] = useState('');
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
      const newModel = modelService.createModel(newModelName, selectedMetamodelId, newModelDescription.trim());
      setModels([...models, newModel]);
      setSelectedModel(newModel);
      setNewModelName('');
      setNewModelDescription('');
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

  const handleExportModelAsXmi = (model: Model) => {
    const result = modelXmiExportService.exportModel(model);
    if (!result || !result.xml) {
      alert('Unable to export XMI: metamodel not found or model is invalid.');
      return;
    }

    if (result.warnings.length > 0) {
      const details = result.warnings.map(warning => (
        `${warning.message}${warning.details?.length ? `\n${warning.details.join('\n')}` : ''}`
      )).join('\n\n');
      if (!window.confirm(`${details}\n\nDownload anyway?`)) return;
    }

    const dataUri = `data:application/xml;charset=utf-8,${encodeURIComponent(result.xml)}`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', `${model.name.toLowerCase()}-model.xmi`);
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
          setImportFileFormat(file.name.split('.').pop()?.toLowerCase() || '');
          setImportFileName(file.name.replace(/\.[^.]+$/, ''));
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

  const handleImportModel = async () => {
    try {
      setImportStatus('');
      if (importFileFormat === 'xmi') {
        const result = modelXmiImportService.importModel(importData, importFileName || 'Imported XMI Model');
        if (!result.model) {
          alert(result.warnings.map(warning => warning.message).join('\n') || 'Unable to import XMI model.');
          return;
        }

        const importedModel = await modelService.importModel(result.model);
        if (result.warnings.length > 0) {
          alert(result.warnings.map(warning => warning.message).join('\n'));
        }

        setIsImportDialogOpen(false);
        setImportData('');
        setImportFileFormat('');
        setImportFileName('');

        const refreshedModels = modelService.getAllModels();
        setModels(refreshedModels);
        const refreshedImportedModel = refreshedModels.find(m => m.id === importedModel.id);
        if (refreshedImportedModel) {
          setSelectedModel(refreshedImportedModel);
          navigate(`/models/${refreshedImportedModel.id}`);
        }
        setImportStatus(`Imported ${importedModel.name}.`);
        return;
      }

      const modelData = JSON.parse(importData);
      
      // Validate that it's a proper model
      const metamodelId = modelData.conformsTo || modelData.metamodelId;
      if (!modelData.name || !metamodelId || !Array.isArray(modelData.elements)) {
        throw new Error('Invalid model format');
      }
      
      // Check if the referenced metamodel exists
      const metamodel = metamodelService.getMetamodelById(metamodelId);
      if (!metamodel) {
        throw new Error(`Referenced metamodel not found: ${metamodelId}`);
      }
      
      // Import as JSON, preserving the model ID, element IDs, references, and connections.
      const importedModel = await modelService.importModel(modelData);
      
      setIsImportDialogOpen(false);
      setImportData('');
      setImportFileFormat('');
      setImportFileName('');
      
      // Refresh the models list and select the newly imported model
      const refreshedModels = modelService.getAllModels();
      setModels(refreshedModels);
      
      const refreshedImportedModel = refreshedModels.find(m => m.id === importedModel.id);
      if (refreshedImportedModel) {
        setSelectedModel(refreshedImportedModel);
        navigate(`/models/${refreshedImportedModel.id}`);
      }
      setImportStatus(`Imported ${importedModel.name}.`);
      
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
        <TextField
          margin="dense"
          label="Description"
          fullWidth
          multiline
          minRows={2}
          value={newModelDescription}
          onChange={(e) => setNewModelDescription(e.target.value)}
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
          {importFileFormat === 'xmi'
            ? 'Importing Ecore XMI model. Press Import to continue.'
            : 'Review the model data before importing:'}
        </Typography>
        <TextField
          multiline
          rows={10}
          fullWidth
          value={importData}
          onChange={(e) => setImportData(e.target.value)}
          variant="outlined"
          InputProps={{ readOnly: importFileFormat === 'xmi' }}
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
          {canCreate && (
            <>
              <Tooltip title="Create Model">
                <IconButton color="primary" onClick={() => setIsCreateDialogOpen(true)}>
                  <AddIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Import Model">
                <IconButton color="primary" onClick={handleImportClick}>
                  <FileUploadIcon />
                </IconButton>
              </Tooltip>
            </>
          )}
          <input
            type="file"
            accept=".json,.xmi"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </Box>
      </Box>
      {importStatus && (
        <Alert severity="success" sx={{ mb: 1 }} onClose={() => setImportStatus('')}>
          {importStatus}
        </Alert>
      )}
      
      <List sx={{ flexGrow: 1 }}>
        {groupByParent(
          models,
          model => model.conformsTo || model.metamodelId,
          parentId => getMetamodelName(parentId)
        ).map(group => (
          <Box key={group.parentId} sx={{ mb: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                py: 0.75,
                mb: 0.5,
                borderRadius: 1,
                bgcolor: getParentGroupSurfaceColor(group.parentId),
              }}
            >
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: group.color, flexShrink: 0 }} />
              <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 0 }} noWrap>
                {group.parentName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {group.items.length}
              </Typography>
            </Box>
            {group.items.map((model) => (
              <ListItem
                key={model.id}
                disablePadding
                secondaryAction={
                  <Box>
                    {canShare && (
                      <Tooltip title="Share Model">
                        <IconButton edge="end" onClick={() => {
                          setShareTarget(model);
                          setShareDialogOpen(true);
                        }}>
                          <ShareIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Export Model">
                      <IconButton edge="end" onClick={() => handleExportModel(model)}>
                        <FileDownloadIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Export Model as XMI">
                      <IconButton edge="end" onClick={() => handleExportModelAsXmi(model)}>
                        <DataObjectIcon />
                      </IconButton>
                    </Tooltip>
                    {canDelete && (
                      <Tooltip title="Delete Model">
                        <IconButton edge="end" onClick={() => handleDeleteModel(model.id)}>
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                }
                sx={{ pr: 12 }}
              >
                <ListItemButton
                  selected={selectedModel?.id === model.id}
                  onClick={() => handleSelectModel(model)}
                  sx={{
                    height: 'auto',
                    py: 0.75,
                    minHeight: '42px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    borderLeft: '4px solid',
                    borderLeftColor: group.color,
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
                    secondary={model.description ? `${group.parentName} - ${model.description}` : group.parentName}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </Box>
        ))}
        {models.length === 0 && (
          <Box sx={{ px: 1, py: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No models found.
            </Typography>
          </Box>
        )}
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
      
      {/* Share Dialog */}
      {shareTarget && (
        <ShareDialog
          open={shareDialogOpen}
          onClose={() => {
            setShareDialogOpen(false);
            setShareTarget(null);
          }}
          resourceType="MODEL"
          resourceId={shareTarget.id}
          resourceName={shareTarget.name}
        />
      )}
    </Box>
  );
};

export default ModelManager;
