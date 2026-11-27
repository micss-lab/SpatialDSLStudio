import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { HeadlessPipelineInputs, HeadlessPipelineRun, HeadlessPipelineStep } from '../../models/lifecycle.types';
import { apiClient } from '../../services/core';
import { lifecycleService } from '../../services/lifecycle.service';
import { modelApiSyncService, modelService } from '../../services/model';

export const pipelineStepLabels: Record<HeadlessPipelineStep['kind'], string> = {
  'validate-model': 'Validate model',
  'run-tests': 'Run model tests',
  'generate': 'Generate code',
  'apply-transformation': 'Apply transformation',
};

const changeKind = (
  kind: HeadlessPipelineStep['kind'], { id, modelId }: HeadlessPipelineStep
): HeadlessPipelineStep => {
  if (kind === 'generate') return { id, modelId, kind, codegenProjectId: '' };
  if (kind === 'apply-transformation') return { id, modelId, kind, ruleId: '' };
  return { id, modelId, kind };
};

const compatibleGenerators = (inputs: HeadlessPipelineInputs, modelId: string) => {
  const model = inputs.models.find(item => item.id === modelId);
  return model ? inputs.generators.filter(generator => (
    !generator.targetMetamodelId || generator.targetMetamodelId === model.conformsToId
  )) : [];
};

interface PipelineRunDialogProps {
  projectId: string;
  onClose: () => void;
  onComplete: (run: HeadlessPipelineRun, refreshFailed: boolean) => void;
}

export function PipelineRunDialog({ projectId, onClose, onComplete }: PipelineRunDialogProps) {
  const [inputs, setInputs] = useState<HeadlessPipelineInputs | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [steps, setSteps] = useState<HeadlessPipelineStep[]>([
    { id: 'step-1', kind: 'validate-model', modelId: '' },
  ]);
  const nextStep = useRef(2);
  const [confirmed, setConfirmed] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [runError, setRunError] = useState('');

  useEffect(() => {
    let active = true;
    lifecycleService.listPipelineInputs(projectId).then(items => {
      if (active) setInputs(items);
    }).catch(error => {
      if (active) setLoadError(error instanceof Error ? error.message : 'Could not load pipeline inputs.');
    });
    return () => { active = false; };
  }, [projectId, attempt]);

  const hasTransformation = steps.some(step => step.kind === 'apply-transformation');
  const valid = !!name.trim() && !!inputs && (!hasTransformation || confirmed) && steps.every(step => {
    if (!step.modelId) return false;
    if (step.kind === 'generate') {
      return compatibleGenerators(inputs, step.modelId).some(generator => generator.id === step.codegenProjectId);
    }
    if (step.kind === 'apply-transformation') {
      const iterations = step.maxIterations ?? 1;
      return !!step.ruleId && Number.isInteger(iterations) && iterations >= 1 && iterations <= 1000;
    }
    return true;
  });

  const updateStep = (updated: HeadlessPipelineStep) => {
    setSteps(previous => previous.map(step => step.id === updated.id ? updated : step));
    setConfirmed(false);
  };

  const moveStep = (from: number, to: number) => {
    setSteps(previous => {
      const ordered = [...previous];
      const [step] = ordered.splice(from, 1);
      ordered.splice(to, 0, step);
      return ordered;
    });
    setConfirmed(false);
  };

  const runPipeline = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || executing) return;
    setExecuting(true);
    setRunError('');
    let run: HeadlessPipelineRun;
    try {
      const modelIds = Array.from(new Set(steps.map(step => step.modelId)));
      await Promise.all(modelIds.map(id => modelApiSyncService.waitForPendingSave(id)));
      run = await lifecycleService.runPipeline(projectId, {
        name: name.trim(),
        ...(tag.trim() && { checkpointTag: tag.trim() }),
        steps,
      });
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Could not start the pipeline.');
      setExecuting(false);
      return;
    }

    let refreshFailed = false;
    if (apiClient.getProjectId() === projectId) {
      try {
        for (const result of run.results) {
          if (result.kind === 'apply-transformation' && result.status === 'SUCCEEDED' && result.output && result.output.appliedIterations > 0) {
            modelService.useSavedModelContents(result.output.model);
          }
        }
      } catch {
        refreshFailed = true;
      }
    }
    onComplete(run, refreshFailed);
  };

  return (
    <Dialog open fullWidth maxWidth="md" onClose={() => { if (!executing) onClose(); }}
      disableEscapeKeyDown={executing} aria-labelledby="new-pipeline-title">
      <DialogTitle id="new-pipeline-title">New pipeline run</DialogTitle>
      <form onSubmit={runPipeline} style={{ display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        <DialogContent dividers>
          <Stack spacing={2}>
            {loadError && <Alert severity="error" action={<Button onClick={() => {
              setLoadError('');
              setAttempt(value => value + 1);
            }}>Retry</Button>}>{loadError}</Alert>}
            {!inputs && !loadError && <CircularProgress size={24} aria-label="Loading pipeline inputs" />}
            {inputs?.models.length === 0 && <Alert severity="info">Create a model in this project before running a pipeline.</Alert>}
            {!!inputs?.models.length && (
              <>
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                  <TextField label="Pipeline name" value={name} required autoFocus disabled={executing}
                    onChange={event => setName(event.target.value)} fullWidth />
                  <TextField label="Checkpoint tag (optional)" value={tag} disabled={executing}
                    onChange={event => setTag(event.target.value)} fullWidth
                    slotProps={{ htmlInput: { maxLength: 100 } }} />
                </Stack>
                {steps.map((step, index) => {
                  const generators = step.kind === 'generate' ? compatibleGenerators(inputs, step.modelId) : [];
                  return (
                    <Paper key={step.id} component="section" aria-label={`Step ${index + 1}`} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack spacing={1.5}>
                        <Stack direction="row" flexWrap="wrap" alignItems="center" columnGap={0.5}>
                          <Typography component="h3" variant="subtitle2" sx={{ flex: '1 0 auto', mr: 1 }}>Step {index + 1}</Typography>
                          <Button size="small" disabled={executing || index === 0} onClick={() => moveStep(index, index - 1)}>Move up</Button>
                          <Button size="small" disabled={executing || index === steps.length - 1} onClick={() => moveStep(index, index + 1)}>Move down</Button>
                          <Button size="small" disabled={executing || steps.length === 1} onClick={() => {
                            setSteps(previous => previous.filter(item => item.id !== step.id));
                            setConfirmed(false);
                          }}>Remove</Button>
                        </Stack>
                        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
                          <TextField select fullWidth size="small" label="Step type" value={step.kind} disabled={executing}
                            onChange={event => updateStep(changeKind(event.target.value as HeadlessPipelineStep['kind'], step))}>
                            {Object.entries(pipelineStepLabels).map(([kind, label]) => <MenuItem key={kind} value={kind}>{label}</MenuItem>)}
                          </TextField>
                          <TextField select fullWidth size="small" label="Model" value={step.modelId} disabled={executing}
                            onChange={event => updateStep(step.kind === 'generate'
                              ? { ...step, modelId: event.target.value, codegenProjectId: '' }
                              : { ...step, modelId: event.target.value })}>
                            {inputs.models.map(model => <MenuItem key={model.id} value={model.id}>{model.name}</MenuItem>)}
                          </TextField>
                        </Stack>
                        {step.kind === 'generate' && (
                          <TextField select size="small" label="Code generation project" value={step.codegenProjectId}
                            disabled={executing || generators.length === 0}
                            helperText={step.modelId && generators.length === 0 ? 'No compatible code generation projects.' : undefined}
                            onChange={event => updateStep({ ...step, codegenProjectId: event.target.value })}>
                            {generators.map(generator => <MenuItem key={generator.id} value={generator.id}>{generator.name}</MenuItem>)}
                          </TextField>
                        )}
                        {step.kind === 'apply-transformation' && (
                          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
                            <TextField select fullWidth size="small" label="Transformation rule" value={step.ruleId}
                              disabled={executing || inputs.transformationRules.length === 0}
                              helperText={inputs.transformationRules.length === 0 ? 'No enabled transformation rules.' : undefined}
                              onChange={event => updateStep({ ...step, ruleId: event.target.value })}>
                              {inputs.transformationRules.map(rule => <MenuItem key={rule.id} value={rule.id}>{rule.name}</MenuItem>)}
                            </TextField>
                            <TextField type="number" size="small" label="Maximum iterations" value={step.maxIterations ?? ''}
                              placeholder="1" disabled={executing}
                              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1, max: 1000, step: 1 } }}
                              onChange={event => updateStep({
                                ...step, maxIterations: event.target.value ? Number(event.target.value) : undefined,
                              })} />
                          </Stack>
                        )}
                      </Stack>
                    </Paper>
                  );
                })}
                <Button variant="outlined" sx={{ alignSelf: 'flex-start' }} disabled={executing} onClick={() => {
                  const step: HeadlessPipelineStep = { id: `step-${nextStep.current++}`, kind: 'validate-model', modelId: '' };
                  setSteps(previous => [...previous, step]);
                  setConfirmed(false);
                }}>Add step</Button>
                {hasTransformation && (
                  <FormControlLabel control={<Checkbox checked={confirmed} disabled={executing}
                    onChange={event => setConfirmed(event.target.checked)} />}
                    label="I understand that transformation steps save model changes even if a later step fails." />
                )}
              </>
            )}
            {runError && <Alert severity="error">{runError} Check run history before submitting again.</Alert>}
            {executing && <Typography role="status">Running pipeline on the server…</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={executing}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!valid || executing}>{executing ? 'Running…' : 'Run pipeline'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
