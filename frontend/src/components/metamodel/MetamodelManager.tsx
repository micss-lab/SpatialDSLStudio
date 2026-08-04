import React, { useState, useEffect, useRef } from 'react';
import { Alert, Box, Button, Typography, TextField, List, ListItem, ListItemIcon, ListItemText, Paper, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, ListItemButton, Menu, MenuItem, Snackbar, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import ShareIcon from '@mui/icons-material/Share';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Metamodel } from '../../models/types';
import { metamodelService } from '../../services/metamodel';
import VisualMetamodelEditor from './VisualMetamodelEditor';
import { exportService, ecoreService } from '../../services/metamodel';
import { ShareDialog, resolveOwnerEmail } from '../common';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../contexts/ProjectContext';
import { useNavigate, useParams } from 'react-router-dom';

const MetamodelManager: React.FC = () => {
  const { user } = useAuth();
  const { can, project } = useProject();
  const canShare = false;
  const canCreate = can('metamodel.create');
  const canDelete = can('metamodel.delete');
  const canEditMetamodel = can('metamodel.update');
  const navigate = useNavigate();
  const { id: routeMetamodelId } = useParams<{ id?: string }>();
  const [metamodels, setMetamodels] = useState<Metamodel[]>([]);
  const [selectedMetamodel, setSelectedMetamodel] = useState<Metamodel | null>(null);
  const [newMetamodelName, setNewMetamodelName] = useState('');
  const [newMetamodelDescription, setNewMetamodelDescription] = useState('');
  const [isMetamodelDialogOpen, setIsMetamodelDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importData, setImportData] = useState('');
  const [importFileFormat, setImportFileFormat] = useState('');
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<Metamodel | null>(null);
  const [actionsAnchorEl, setActionsAnchorEl] = useState<HTMLElement | null>(null);
  const [actionsTarget, setActionsTarget] = useState<Metamodel | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const closeActionsMenu = () => {
    setActionsAnchorEl(null);
    setActionsTarget(null);
  };

  useEffect(() => {
    // Load metamodels when component mounts
    refreshMetamodels();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshMetamodels = () => {
    const loadedMetamodels = metamodelService.getAllMetamodels();
    setMetamodels(loadedMetamodels);

    // Keep route-driven selection consistent after data refreshes.
    if (routeMetamodelId) {
      const routeSelection = loadedMetamodels.find(m => m.id === routeMetamodelId);
      setSelectedMetamodel(routeSelection || null);
      return;
    }
    
    // Update selected metamodel if it exists in the loaded metamodels
    if (selectedMetamodel) {
      const updatedMetamodel = loadedMetamodels.find(m => m.id === selectedMetamodel.id);
      setSelectedMetamodel(updatedMetamodel || null);
    }
  };

  const handleCreateMetamodel = () => {
    if (newMetamodelName.trim()) {
      metamodelService.createMetamodel(newMetamodelName.trim(), newMetamodelDescription.trim());
      setNewMetamodelName('');
      setNewMetamodelDescription('');
      setIsMetamodelDialogOpen(false);
      refreshMetamodels();
    }
  };

  const handleDeleteMetamodel = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this metamodel?')) {
      return;
    }

    try {
      await metamodelService.deleteMetamodel(id);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete metamodel');
      return;
    }

    if (selectedMetamodel?.id === id || routeMetamodelId === id) {
      setSelectedMetamodel(null);
      navigate(`/projects/${project.id}/metamodels`);
    }
    refreshMetamodels();
  };

  const handleSelectMetamodel = (metamodel: Metamodel) => {
    setSelectedMetamodel(metamodel);
    navigate(`/projects/${project.id}/metamodels/${metamodel.id}`);
  };

  useEffect(() => {
    if (!routeMetamodelId) {
      setSelectedMetamodel(null);
      return;
    }

    const routeSelection = metamodels.find(m => m.id === routeMetamodelId) || null;
    setSelectedMetamodel(routeSelection);
  }, [routeMetamodelId, metamodels]);

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
      if (importFileFormat === 'ecore') {
        // Import as Ecore
        const metamodelId = ecoreService.importFromEcore(importData);
        if (!metamodelId) {
          throw new Error('Failed to import Ecore metamodel');
        }
      } else {
        // Import as JSON, preserving the metamodel ID and nested class/reference IDs.
        const metamodelData = JSON.parse(importData);
        const importedMetamodel = metamodelService.importMetamodel(metamodelData);
        navigate(`/projects/${project.id}/metamodels/${importedMetamodel.id}`);
      }
      
      setIsImportDialogOpen(false);
      setImportData('');
      setImportFileFormat('');
      refreshMetamodels();
      
    } catch (error) {
      console.error('Error importing metamodel:', error);
      alert(`Error importing metamodel: ${error instanceof Error ? error.message : 'Invalid format'}`);
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
            {canCreate && (
              <>
                <Tooltip title="Create Metamodel">
                  <IconButton color="primary" onClick={() => setIsMetamodelDialogOpen(true)}>
                    <AddIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Import Metamodel">
                  <IconButton color="primary" onClick={handleImportClick}>
                    <FileUploadIcon />
                  </IconButton>
                </Tooltip>
              </>
            )}
            <input
              type="file"
              accept=".json,.ecore"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </Box>
        </Box>
        
        <List sx={{ flexGrow: 1 }}>
          {metamodels.map((metamodel) => {
            const ownerEmail = resolveOwnerEmail(
              { isOwner: metamodel.isOwner, ownerEmail: metamodel.ownerEmail },
              user?.email
            );
            const ownerLabel = ownerEmail
              ? (ownerEmail === user?.email ? `${ownerEmail} (you)` : ownerEmail)
              : null;
            return (
              <ListItem
                key={metamodel.id}
                disablePadding
                sx={{ mb: 0.5 }}
                secondaryAction={
                  <Tooltip title="Metamodel actions">
                    <IconButton
                      size="small"
                      edge="end"
                      aria-label={`Actions for ${metamodel.name}`}
                      aria-haspopup="menu"
                      aria-expanded={Boolean(actionsAnchorEl) && actionsTarget?.id === metamodel.id ? 'true' : undefined}
                      aria-controls={Boolean(actionsAnchorEl) && actionsTarget?.id === metamodel.id ? 'metamodel-actions-menu' : undefined}
                      onClick={(e) => {
                        setActionsAnchorEl(e.currentTarget);
                        setActionsTarget(metamodel);
                      }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
              >
                <ListItemButton
                  selected={selectedMetamodel?.id === metamodel.id}
                  onClick={() => handleSelectMetamodel(metamodel)}
                  sx={{ py: 0.75, pr: 6 }}
                >
                  <Tooltip
                    enterDelay={500}
                    title={
                      <>
                        <div>{metamodel.name}</div>
                        {metamodel.description && <div>{metamodel.description}</div>}
                        {ownerLabel && <div>Created by {ownerLabel}</div>}
                      </>
                    }
                  >
                    <Box sx={{ minWidth: 0, width: '100%' }}>
                      <Typography
                        noWrap
                        sx={{
                          fontSize: metamodel.name.length > 20 ? '0.875rem' : '1rem',
                          lineHeight: 1.2
                        }}
                      >
                        {metamodel.name}
                      </Typography>
                      {metamodel.description && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                          {metamodel.description}
                        </Typography>
                      )}
                    </Box>
                  </Tooltip>
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>

        <Menu
          id="metamodel-actions-menu"
          anchorEl={actionsAnchorEl}
          open={Boolean(actionsAnchorEl) && Boolean(actionsTarget)}
          onClose={closeActionsMenu}
        >
          {canShare && (
            <MenuItem onClick={() => {
              setShareTarget(actionsTarget);
              setShareDialogOpen(true);
              closeActionsMenu();
            }}>
              <ListItemIcon><ShareIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Share</ListItemText>
            </MenuItem>
          )}
          <MenuItem onClick={() => {
            if (actionsTarget) handleExportMetamodel(actionsTarget);
            closeActionsMenu();
          }}>
            <ListItemIcon><FileDownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Export (JSON or Ecore)</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => {
            if (actionsTarget) navigate(`/projects/${project.id}/metamodels/${actionsTarget.id}/viewpoints`);
            closeActionsMenu();
          }}>
            <ListItemIcon><AccountTreeIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Manage Viewpoints</ListItemText>
          </MenuItem>
          {canDelete && (
            <MenuItem onClick={() => {
              const targetId = actionsTarget?.id;
              closeActionsMenu();
              if (targetId) handleDeleteMetamodel(targetId);
            }}>
              <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
              <ListItemText sx={{ color: 'error.main' }}>Delete</ListItemText>
            </MenuItem>
          )}
        </Menu>
      </Paper>

      {/* Right Panel Content */}
      {selectedMetamodel ? (
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Visual Editor */}
          <Box sx={{ flexGrow: 1, height: '100%' }}>
            <VisualMetamodelEditor metamodelId={selectedMetamodel.id} readOnly={!canEditMetamodel} />
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
          <TextField
            margin="dense"
            label="Description"
            fullWidth
            multiline
            minRows={2}
            value={newMetamodelDescription}
            onChange={(e) => setNewMetamodelDescription(e.target.value)}
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
            {importFileFormat === 'ecore'
              ? 'Importing Ecore metamodel. Press Import to continue.'
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
              readOnly: importFileFormat === 'ecore'
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsImportDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleImportMetamodel} color="primary">Import</Button>
        </DialogActions>
      </Dialog>

      {/* Delete failure notice */}
      <Snackbar
        open={Boolean(deleteError)}
        autoHideDuration={8000}
        onClose={() => setDeleteError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setDeleteError(null)} sx={{ width: '100%' }}>
          {deleteError}
        </Alert>
      </Snackbar>

      {/* Share Dialog */}
      {shareTarget && (
        <ShareDialog
          open={shareDialogOpen}
          onClose={() => {
            setShareDialogOpen(false);
            setShareTarget(null);
          }}
          resourceType="METAMODEL"
          resourceId={shareTarget.id}
          resourceName={shareTarget.name}
        />
      )}
    </Box>
  );
};

export default MetamodelManager;
