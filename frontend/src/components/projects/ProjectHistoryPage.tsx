import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip,
  CircularProgress, Container, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useProject } from '../../contexts/ProjectContext';
import { HeadlessPipelineRun, ProjectCheckpoint, ProjectCheckpointDiff } from '../../models/lifecycle.types';
import { lifecycleService } from '../../services/lifecycle.service';

const dateLabel = (value: string) => new Date(value).toLocaleString();
const checkpointLabel = (checkpoint: ProjectCheckpoint) => (
  checkpoint.tag ? `#${checkpoint.sequence} · ${checkpoint.tag}` : `Checkpoint #${checkpoint.sequence}`
);
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

function Checkpoints({ projectId, canCreate, initialCheckpointId }: { projectId: string; canCreate: boolean; initialCheckpointId: string }) {
  const [checkpoints, setCheckpoints] = useState<ProjectCheckpoint[] | null>(null);
  const [error, setError] = useState('');
  const [tag, setTag] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [sourceId, setSourceId] = useState(initialCheckpointId);
  const [againstId, setAgainstId] = useState('');
  const [diff, setDiff] = useState<ProjectCheckpointDiff | null>(null);
  const [diffLabel, setDiffLabel] = useState('');
  const [comparing, setComparing] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    lifecycleService.listCheckpoints(projectId).then(items => {
      if (active) setCheckpoints(items);
    }).catch(error => {
      if (active) setError(errorMessage(error, 'Could not load checkpoints.'));
    });
    return () => { active = false; };
  }, [projectId, refresh]);

  const source = checkpoints?.find(item => item.id === sourceId) ?? checkpoints?.[0];
  const target = checkpoints?.find(item => item.id === againstId);

  const createCheckpoint = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const checkpoint = await lifecycleService.createCheckpoint(projectId, {
        tag: tag.trim() || undefined, message: message.trim() || undefined,
      });
      setCheckpoints(previous => [checkpoint, ...(previous ?? [])]);
      setSourceId(checkpoint.id);
      setDiff(null);
      setTag('');
      setMessage('');
    } catch (error) {
      setError(errorMessage(error, 'Could not create checkpoint.'));
    } finally {
      setSaving(false);
    }
  };

  const compare = async () => {
    if (!source) return;
    setComparing(true);
    setError('');
    setDiff(null);
    try {
      setDiff(await lifecycleService.diffCheckpoint(projectId, source.id, target?.id));
      setDiffLabel(`${checkpointLabel(source)} → ${target ? checkpointLabel(target) : 'Current project'}`);
    } catch (error) {
      setError(errorMessage(error, 'Could not compare checkpoints.'));
    } finally {
      setComparing(false);
    }
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {checkpoints === null && !error && <CircularProgress size={24} aria-label="Loading checkpoints" />}
      {checkpoints === null && error && <Button onClick={() => { setError(''); setRefresh(value => value + 1); }}>Retry</Button>}
      {canCreate && checkpoints !== null && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Box component="form" onSubmit={createCheckpoint}>
            <Stack gap={2} direction={{ xs: 'column', md: 'row' }}>
              <TextField label="Tag" size="small" value={tag} onChange={event => setTag(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 100 } }} />
              <TextField label="Message" size="small" value={message} onChange={event => setMessage(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 1000 } }} sx={{ flexGrow: 1 }} />
              <Button type="submit" variant="contained" disabled={saving || comparing}>
                {saving ? 'Creating…' : 'Create checkpoint'}
              </Button>
            </Stack>
          </Box>
        </Paper>
      )}
      {checkpoints?.length === 0 && <Typography color="text.secondary">No checkpoints yet.</Typography>}
      {source && checkpoints && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Stack gap={2} direction={{ xs: 'column', md: 'row' }}>
              <TextField select size="small" label="From checkpoint" value={source.id} disabled={comparing}
                onChange={event => {
                  setSourceId(event.target.value);
                  if (event.target.value === againstId) setAgainstId('');
                  setDiff(null);
                }} sx={{ flex: 1 }}>
                {checkpoints.map(item => <MenuItem key={item.id} value={item.id}>{checkpointLabel(item)}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Compare with" value={againstId} disabled={comparing}
                onChange={event => { setAgainstId(event.target.value); setDiff(null); }} sx={{ flex: 1 }}>
                <MenuItem value="">Current project</MenuItem>
                {checkpoints.filter(item => item.id !== source.id).map(item => (
                  <MenuItem key={item.id} value={item.id}>{checkpointLabel(item)}</MenuItem>
                ))}
              </TextField>
              <Button variant="outlined" onClick={compare} disabled={comparing || saving}>
                {comparing ? 'Comparing…' : 'Compare'}
              </Button>
            </Stack>
            {diff && (
              <Box aria-label="Checkpoint comparison">
                <Typography variant="subtitle2" gutterBottom>{diffLabel}</Typography>
                <Typography variant="body2" gutterBottom>{diff.unchanged} unchanged</Typography>
                {(['added', 'changed', 'removed'] as const).map(kind => (
                  <Accordion key={kind} disableGutters>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      {diff[kind].length} {kind}
                    </AccordionSummary>
                    <AccordionDetails>
                      {diff[kind].map(ref => (
                        <Typography key={`${ref.type}:${ref.id}`} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                          {ref.name || ref.id} · {ref.type}
                        </Typography>
                      ))}
                      {diff[kind].length === 0 && <Typography variant="body2">No {kind} artifacts.</Typography>}
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Box>
            )}
          </Stack>
        </Paper>
      )}
      {checkpoints?.map(checkpoint => (
        <Paper key={checkpoint.id} variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1">{checkpointLabel(checkpoint)}</Typography>
          <Typography color="text.secondary" variant="body2">{dateLabel(checkpoint.createdAt)}</Typography>
          {checkpoint.message && <Typography variant="body2" sx={{ mt: 1 }}>{checkpoint.message}</Typography>}
          <Typography component="code" variant="caption" sx={{ overflowWrap: 'anywhere' }}>{checkpoint.contentHash}</Typography>
        </Paper>
      ))}
    </Stack>
  );
}

function PipelineRuns({ projectId }: { projectId: string }) {
  const [runs, setRuns] = useState<HeadlessPipelineRun[] | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [expandedId, setExpandedId] = useState('');

  useEffect(() => {
    let active = true;
    lifecycleService.listPipelineRuns(projectId).then(items => {
      if (active) setRuns(items);
    }).catch(error => {
      if (active) setError(errorMessage(error, 'Could not load pipeline runs.'));
    });
    return () => { active = false; };
  }, [projectId, refresh]);

  return (
    <Stack spacing={2}>
      <Button variant="outlined" sx={{ alignSelf: 'flex-start' }} onClick={() => {
        setError('');
        setRuns(null);
        setRefresh(value => value + 1);
      }}>Refresh runs</Button>
      {error && <Alert severity="error">{error}</Alert>}
      {runs === null && !error && <CircularProgress size={24} aria-label="Loading pipeline runs" />}
      {runs?.length === 0 && <Typography color="text.secondary">No pipeline runs yet.</Typography>}
      {runs?.map(run => (
        <Accordion key={run.id} expanded={expandedId === run.id} onChange={(_, open) => setExpandedId(open ? run.id : '')}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }} sx={{ width: '100%', pr: 1 }}>
              <Typography fontWeight={600} sx={{ flex: 1 }}>{run.name}</Typography>
              <Typography variant="body2" color="text.secondary">{dateLabel(run.startedAt)}</Typography>
              <Chip size="small" label={run.status} color={run.status === 'FAILED' ? 'error' : run.status === 'SUCCEEDED' ? 'success' : 'default'} />
            </Stack>
          </AccordionSummary>
          {expandedId === run.id && (
            <AccordionDetails>
              <Stack spacing={1.5}>
                {run.failureMessage && <Alert severity="error">{run.failureMessage}</Alert>}
                {run.sourceCheckpointId && <Typography variant="body2">Source checkpoint · {run.sourceCheckpointId}</Typography>}
                {run.contentHash && <Typography component="code" variant="caption" sx={{ overflowWrap: 'anywhere' }}>{run.contentHash}</Typography>}
                {run.results.length === 0 && <Typography variant="body2">No step results recorded yet.</Typography>}
                {run.results.map(step => (
                  <Paper variant="outlined" key={step.stepId} sx={{ p: 1.5 }}>
                    <Typography variant="subtitle2">{step.stepId} · {step.kind} · {step.status}</Typography>
                    {step.error && <Typography color="error" variant="body2">{step.error}</Typography>}
                    {step.output && (
                      <details>
                        <summary>Step output</summary>
                        <Box component="pre" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 320, overflow: 'auto' }}>
                          {JSON.stringify(step.output, null, 2)}
                        </Box>
                      </details>
                    )}
                  </Paper>
                ))}
              </Stack>
            </AccordionDetails>
          )}
        </Accordion>
      ))}
    </Stack>
  );
}

export function ProjectHistoryPage() {
  const { project, can } = useProject();
  const [params] = useSearchParams();
  const checkpointId = params.get('checkpoint') || '';
  const [tab, setTab] = useState<'checkpoints' | 'runs'>('checkpoints');

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography component="h1" variant="h4" gutterBottom>Project History</Typography>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} aria-label="Project history" sx={{ mb: 2 }}>
        <Tab value="checkpoints" label="Checkpoints" id="checkpoints-tab" aria-controls="checkpoints-panel" />
        <Tab value="runs" label="Pipeline runs" id="runs-tab" aria-controls="runs-panel" />
      </Tabs>
      <Box role="tabpanel" id={`${tab}-panel`} aria-labelledby={`${tab}-tab`}>
        {tab === 'checkpoints'
          ? <Checkpoints key={`${project.id}:${checkpointId}`} projectId={project.id} canCreate={can('checkpoint.create')} initialCheckpointId={checkpointId} />
          : <PipelineRuns key={project.id} projectId={project.id} />}
      </Box>
    </Container>
  );
}
