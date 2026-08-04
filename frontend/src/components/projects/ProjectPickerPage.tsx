import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { StudioProject } from '../../models/project.types';
import { projectService } from '../../services/project.service';
import { LAST_PROJECT_KEY } from '../../contexts/ProjectContext';
import { useAuth } from '../../contexts/AuthContext';

const roleLabel = (project: StudioProject) => project.isPlatformAdmin
  ? 'Platform Admin'
  : project.role === 'DSL_DESIGNER'
    ? 'DSL Designer'
    : project.role.charAt(0) + project.role.slice(1).toLowerCase();

export const ProjectPickerPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, logout } = useAuth();
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [includeSmartWarehouse, setIncludeSmartWarehouse] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    projectService.list(showArchived)
      .then(items => { if (active) setProjects(items); })
      .catch(loadError => { if (active) setError(loadError?.message || 'Unable to load projects'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [showArchived]);

  const openProject = (projectId: string) => {
    localStorage.setItem(LAST_PROJECT_KEY, projectId);
    navigate(`/projects/${projectId}`);
  };

  const createProject = async () => {
    if (!name.trim()) return;
    let projectCreated = false;
    try {
      setCreating(true);
      setError(null);
      const project = await projectService.create({ name: name.trim(), description: description.trim() || undefined });
      projectCreated = true;
      if (includeSmartWarehouse) {
        const { smartWarehouseProjectImportService } = await import(
          '../../services/smart-warehouse-project-import.service'
        );
        await smartWarehouseProjectImportService.importInto(project.id);
      }
      setDialogOpen(false);
      openProject(project.id);
    } catch (createError: any) {
      setError(projectCreated
        ? `The project was created, but the Smart Warehouse starter could not be imported: ${createError?.message || 'unknown error'}`
        : createError?.message || 'Unable to create project');
    } finally {
      setCreating(false);
    }
  };

  const restoreProject = async (project: StudioProject) => {
    try {
      setError(null);
      const restored = await projectService.restore(project.id);
      setProjects(current => current.map(item => item.id === restored.id ? restored : item));
    } catch (restoreError: any) {
      setError(restoreError?.message || 'Unable to restore project');
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 6 }}>
      <Container maxWidth="lg">
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} mb={4}>
          <Box>
            <Typography variant="h4" gutterBottom>Projects</Typography>
            <Typography color="text.secondary">
              Open one workspace to load only its metamodels, models, viewpoints, views, and automation.
            </Typography>
          </Box>
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <FormControlLabel
              control={<Switch checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />}
              label="Show archived"
            />
            {isAdmin && <Button variant="outlined" onClick={() => navigate('/admin')}>Admin</Button>}
            <Button variant="text" onClick={logout}>Logout</Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
              New project
            </Button>
          </Stack>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {loading ? (
          <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
        ) : projects.length === 0 ? (
          <Card variant="outlined" sx={{ textAlign: 'center', py: 7 }}>
            <CardContent>
              <FolderOpenIcon color="primary" sx={{ fontSize: 48, mb: 1 }} />
              <Typography variant="h6">Create your first project</Typography>
              <Typography color="text.secondary" mb={3}>
                A project keeps one related artifact graph and its members together.
              </Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
                New project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Grid container spacing={2}>
            {projects.map(project => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={project.id}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardActionArea onClick={() => openProject(project.id)} sx={{ height: '100%', alignItems: 'stretch' }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                        <Typography variant="h6">{project.name}</Typography>
                        <Stack direction="row" gap={0.5}>
                          {project.status === 'ARCHIVED' && <Chip size="small" color="default" label="Archived" />}
                          <Chip size="small" label={roleLabel(project)} />
                        </Stack>
                      </Stack>
                      <Typography color="text.secondary" sx={{ mt: 1, minHeight: 48 }}>
                        {project.description || 'No project description'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {project.memberCount} member{project.memberCount === 1 ? '' : 's'} · Updated {new Date(project.updatedAt).toLocaleDateString()}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                  {project.status === 'ARCHIVED' && project.capabilities.includes('project.archive') && (
                    <CardActions>
                      <Button size="small" onClick={() => restoreProject(project)}>Restore project</Button>
                    </CardActions>
                  )}
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>

      <Dialog open={dialogOpen} onClose={() => !creating && setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create project</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            required
            margin="normal"
            label="Project name"
            value={name}
            onChange={event => setName(event.target.value)}
          />
          <TextField
            fullWidth
            multiline
            minRows={3}
            margin="normal"
            label="Description"
            value={description}
            onChange={event => setDescription(event.target.value)}
          />
          <FormControlLabel
            control={(
              <Switch
                checked={includeSmartWarehouse}
                onChange={event => setIncludeSmartWarehouse(event.target.checked)}
              />
            )}
            label="Include Smart Warehouse starter"
          />
          <Typography variant="caption" color="text.secondary" display="block">
            Imports the metamodel, model, viewpoints, saved views, and both Visual Components and Omniverse generator configurations into this project.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={creating}>Cancel</Button>
          <Button variant="contained" onClick={createProject} disabled={creating || !name.trim()}>
            {creating ? 'Creating…' : 'Create and open'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
