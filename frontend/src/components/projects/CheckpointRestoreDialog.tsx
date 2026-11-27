import React, { useEffect, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Button, Checkbox, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Stack, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { ProjectCheckpointDiff, ProjectCheckpointRestorePreview } from '../../models/lifecycle.types';
import { lifecycleService } from '../../services/lifecycle.service';

const diffKinds = ['added', 'changed', 'removed'] as const;
const restoreLabels = { added: 'will be restored', changed: 'will be replaced', removed: 'will be removed' };

export function CheckpointChanges({ diff, restoring = false }: { diff: ProjectCheckpointDiff; restoring?: boolean }) {
  return (
    <>
      <Typography variant="body2" gutterBottom>{diff.unchanged} unchanged</Typography>
      {diffKinds.map(kind => {
        const changes = diff[kind];
        const label = restoring ? restoreLabels[kind] : kind;
        return (
          <Accordion key={kind} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" color={restoring && kind === 'removed' && changes.length ? 'error' : undefined}>
                {changes.length} {label}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              {changes.map(ref => (
                <Typography key={`${ref.type}:${ref.id}`} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  {ref.name || ref.id} · {ref.type}
                </Typography>
              ))}
              {changes.length === 0 && <Typography variant="body2">No artifacts.</Typography>}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </>
  );
}

interface CheckpointRestoreDialogProps {
  projectId: string;
  checkpointId: string;
  label: string;
  onClose: () => void;
  onRestored: (recoveryId: string) => void;
}

export function CheckpointRestoreDialog({ projectId, checkpointId, label, onClose, onRestored }: CheckpointRestoreDialogProps) {
  const [preview, setPreview] = useState<ProjectCheckpointRestorePreview | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let active = true;
    lifecycleService.previewCheckpointRestore(projectId, checkpointId).then(review => {
      if (active) setPreview(review);
    }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : 'Could not preview checkpoint restore.');
    });
    return () => { active = false; };
  }, [projectId, checkpointId, attempt]);

  const hasChanges = !!preview && preview.diff.fromHash !== preview.diff.toHash;
  const settingsChanged = !!preview && (
    preview.currentProject.name !== preview.targetProject.name ||
    preview.currentProject.description !== preview.targetProject.description
  );

  const restore = async () => {
    if (!preview || !hasChanges || !confirmed || restoring) return;
    setRestoring(true);
    let recoveryId: string;
    try {
      const result = await lifecycleService.restoreCheckpointWithRecovery(
        projectId, checkpointId, preview.diff.toHash, preview.diff.fromHash
      );
      recoveryId = result.recoveryCheckpoint.id;
    } catch (error) {
      setPreview(null);
      setConfirmed(false);
      setError(error instanceof Error ? error.message : 'Could not restore this checkpoint.');
      setRestoring(false);
      return;
    }
    onRestored(recoveryId);
  };

  return (
    <Dialog open fullWidth maxWidth="sm" aria-labelledby="checkpoint-restore-title" disableEscapeKeyDown={restoring}
      onClose={() => { if (!restoring) onClose(); }}>
      <DialogTitle id="checkpoint-restore-title">Restore {label}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && (
            <Alert severity="error" action={<Button onClick={() => { setError(''); setAttempt(value => value + 1); }}>
              Refresh preview
            </Button>}>{error}</Alert>
          )}
          {!preview && !error && <CircularProgress size={24} aria-label="Loading restore preview" />}
          {preview && !hasChanges && <Alert severity="info">The current project already matches this checkpoint.</Alert>}
          {preview && hasChanges && (
            <>
              <Alert severity="warning">
                Studio will save a recovery checkpoint of the current project before replacing its artifacts.
              </Alert>
              {settingsChanged && (
                <Stack spacing={1}>
                  <Typography variant="subtitle2">Project settings</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
                    {([{ label: 'Current project', project: preview.currentProject },
                      { label: 'After restore', project: preview.targetProject }]).map(({ label, project }) => (
                      <Paper key={label} variant="outlined" sx={{ flex: 1, p: 1, overflowWrap: 'anywhere' }}>
                        <Typography color="text.secondary" variant="caption">{label}</Typography>
                        <Typography variant="body2" fontWeight={600}>{project.name}</Typography>
                        {project.description && <Typography variant="body2">{project.description}</Typography>}
                      </Paper>
                    ))}
                  </Stack>
                </Stack>
              )}
              <div aria-label="Changes from restore">
                <CheckpointChanges diff={preview.diff} restoring />
              </div>
              <FormControlLabel control={<Checkbox checked={confirmed} disabled={restoring}
                onChange={event => setConfirmed(event.target.checked)} />}
                label="Replace the current project with this checkpoint" />
            </>
          )}
          {restoring && <Typography role="status">Restoring the project and saving its recovery checkpoint…</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={restoring} onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" disabled={!hasChanges || !confirmed || restoring} onClick={restore}>
          {restoring ? 'Restoring…' : 'Restore checkpoint'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
