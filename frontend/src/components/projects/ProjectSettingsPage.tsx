import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useProject } from '../../contexts/ProjectContext';
import { ProjectMember, ProjectRole } from '../../models/project.types';
import { projectService } from '../../services/project.service';

type AssignableRole = Exclude<ProjectRole, 'OWNER'>;
const ASSIGNABLE_ROLES: AssignableRole[] = ['DSL_DESIGNER', 'MODELER', 'VIEWER'];
const roleLabel = (role: ProjectRole) => role === 'DSL_DESIGNER'
  ? 'DSL Designer'
  : role.charAt(0) + role.slice(1).toLowerCase();

export const ProjectSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { project, can, refreshProject } = useProject();
  const canManage = can('project.members.manage');
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableRole>('MODELER');
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  const loadMembers = () => projectService.listMembers(project.id)
    .then(setMembers)
    .catch(error => setMessage({ severity: 'error', text: error?.message || 'Unable to load members' }));

  useEffect(() => { loadMembers(); }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSettings = async () => {
    try {
      await projectService.update(project.id, { name, description });
      await refreshProject();
      setMessage({ severity: 'success', text: 'Project settings saved' });
    } catch (error: any) {
      setMessage({ severity: 'error', text: error?.message || 'Unable to save project' });
    }
  };

  const addMember = async () => {
    try {
      await projectService.addMember(project.id, email, role);
      setDialogOpen(false);
      setEmail('');
      await loadMembers();
    } catch (error: any) {
      setMessage({ severity: 'error', text: error?.message || 'Unable to add member' });
    }
  };

  const changeRole = async (member: ProjectMember, nextRole: AssignableRole) => {
    try {
      await projectService.updateMember(project.id, member.userId, nextRole);
      await loadMembers();
    } catch (error: any) {
      setMessage({ severity: 'error', text: error?.message || 'Unable to update member' });
    }
  };

  const removeMember = async (member: ProjectMember) => {
    if (!window.confirm(`Remove ${member.email} from this project?`)) return;
    try {
      await projectService.removeMember(project.id, member.userId);
      await loadMembers();
    } catch (error: any) {
      setMessage({ severity: 'error', text: error?.message || 'Unable to remove member' });
    }
  };

  const archiveProject = async () => {
    if (!window.confirm('Archive this project? Its artifacts will become read-only.')) return;
    try {
      await projectService.archive(project.id);
      navigate('/projects');
    } catch (error: any) {
      setMessage({ severity: 'error', text: error?.message || 'Unable to archive project' });
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>Project settings</Typography>
      <Typography color="text.secondary" mb={3}>Members receive one role across this project's artifact graph.</Typography>
      {message && <Alert severity={message.severity} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Details</Typography>
        <Stack spacing={2}>
          <TextField label="Name" value={name} onChange={event => setName(event.target.value)} disabled={!canManage} />
          <TextField label="Description" multiline minRows={3} value={description} onChange={event => setDescription(event.target.value)} disabled={!canManage} />
          {canManage && <Button variant="contained" onClick={saveSettings} sx={{ alignSelf: 'flex-start' }}>Save</Button>}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Box>
            <Typography variant="h6">Members</Typography>
            <Typography variant="body2" color="text.secondary">
              DSL Designers define languages; Modelers create and edit Models and Views.
            </Typography>
          </Box>
          {canManage && <Button startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>Add member</Button>}
        </Stack>
        <Table size="small">
          <TableHead><TableRow><TableCell>User</TableCell><TableCell>Role</TableCell>{canManage && <TableCell align="right">Actions</TableCell>}</TableRow></TableHead>
          <TableBody>
            {members.map(member => (
              <TableRow key={member.id}>
                <TableCell>{member.email}</TableCell>
                <TableCell>
                  {canManage && member.role !== 'OWNER' ? (
                    <Select size="small" value={member.role} onChange={event => changeRole(member, event.target.value as AssignableRole)}>
                      {ASSIGNABLE_ROLES.map(item => <MenuItem value={item} key={item}>{roleLabel(item)}</MenuItem>)}
                    </Select>
                  ) : roleLabel(member.role)}
                </TableCell>
                {canManage && <TableCell align="right">
                  {member.role !== 'OWNER' && <IconButton aria-label={`Remove ${member.email}`} onClick={() => removeMember(member)}><DeleteOutlineIcon /></IconButton>}
                </TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {can('project.archive') && (
        <Paper variant="outlined" sx={{ p: 3, borderColor: 'error.light' }}>
          <Typography variant="h6" color="error" gutterBottom>Archive project</Typography>
          <Typography color="text.secondary" mb={2}>Archived projects remain available for reading and Sirius export.</Typography>
          <Button color="error" variant="outlined" onClick={archiveProject}>Archive project</Button>
        </Paper>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add project member</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth margin="normal" label="User email" value={email} onChange={event => setEmail(event.target.value)} />
          <FormControl fullWidth margin="normal">
            <InputLabel>Role</InputLabel>
            <Select label="Role" value={role} onChange={event => setRole(event.target.value as AssignableRole)}>
              {ASSIGNABLE_ROLES.map(item => <MenuItem value={item} key={item}>{roleLabel(item)}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={addMember} disabled={!email.trim()}>Add</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

