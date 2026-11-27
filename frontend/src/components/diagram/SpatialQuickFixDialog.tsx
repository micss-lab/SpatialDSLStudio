import React, { useEffect, useState } from 'react';
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { Position3D, SpatialQuickFixPreview, SpatialQuickFixRequest, ValidationIssue } from '../../models/types';
import { spatialQuickFixService } from '../../services/diagram/spatial-quick-fix.service';

export interface SpatialQuickFixOption {
  id: string;
  name: string;
}

interface Props {
  viewId: string;
  modelId: string;
  issue: ValidationIssue;
  options: SpatialQuickFixOption[];
  onClose: () => void;
  onApplied: () => void;
}

const describe = (position: Position3D) => (
  `X ${position.x.toFixed(2)} mm · Y ${position.y.toFixed(2)} mm · Z ${position.z.toFixed(2)} mm`
);

export function SpatialQuickFixDialog({ viewId, modelId, issue, options, onClose, onApplied }: Props) {
  const { constraintId, elementId } = issue;
  const relatedElementId = issue.relatedElementIds?.[0];
  const [moveElementId, setMoveElementId] = useState(options[0].id);
  const [review, setReview] = useState<{ request: SpatialQuickFixRequest; preview: SpatialQuickFixPreview } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const activeReview = review?.request.moveElementId === moveElementId ? review : null;

  useEffect(() => {
    if (!constraintId || !elementId) return;
    let active = true;
    setReview(null);
    setError('');
    setLoading(true);
    const request = { ruleId: constraintId, elementId, ...(relatedElementId && { relatedElementId }), moveElementId };
    spatialQuickFixService.preview(viewId, modelId, request)
      .then(preview => { if (active) setReview({ request, preview }); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not preview the fix.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [viewId, modelId, constraintId, elementId, relatedElementId, moveElementId, attempt]);

  const apply = async () => {
    if (!activeReview || applying) return;
    setApplying(true);
    setError('');
    try {
      await spatialQuickFixService.apply(viewId, modelId, activeReview.request, activeReview.preview.previewHash);
    } catch (error) {
      setReview(null);
      setError(error instanceof Error ? error.message : 'Could not apply this fix.');
      setApplying(false);
      return;
    }
    onApplied();
    onClose();
  };

  return (
    <Dialog open onClose={applying ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="spatial-quick-fix-title">
      <DialogTitle id="spatial-quick-fix-title">Preview placement fix</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2">{issue.message}</Typography>
          {options.length > 1 ? (
            <TextField select size="small" label="Element to move" value={moveElementId} disabled={applying}
              onChange={event => setMoveElementId(event.target.value)}>
              {options.map(option => <MenuItem key={option.id} value={option.id}>{option.name}</MenuItem>)}
            </TextField>
          ) : <Typography variant="subtitle2">Element to move · {options[0].name}</Typography>}
          {loading && <CircularProgress size={24} aria-label="Checking the proposed placement" />}
          {error && <Alert severity="warning" action={<Button onClick={() => setAttempt(value => value + 1)}>Preview again</Button>}>{error}</Alert>}
          {activeReview && (
            <>
              {activeReview.preview.targetElementName && (
                <Typography variant="subtitle2">Target element · {activeReview.preview.targetElementName}</Typography>
              )}
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
                {[{ label: 'Current position', position: activeReview.preview.before }, {
                  label: 'Proposed position', position: activeReview.preview.after,
                }].map(({ label, position }) => (
                  <Paper variant="outlined" key={label} sx={{ flex: 1, p: 1.25 }}>
                    <Typography variant="subtitle2">{label}</Typography>
                    <Typography variant="body2">{describe(position)}</Typography>
                  </Paper>
                ))}
              </Stack>
              <Alert severity="success">This move clears {activeReview.preview.clearedIssues} spatial {activeReview.preview.clearedIssues === 1 ? 'issue' : 'issues'} and introduces no new spatial issues.</Alert>
              <Typography variant="body2" color="text.secondary">Applying this move updates {activeReview.preview.elementName} in the shared model.</Typography>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={applying}>Cancel</Button>
        <Button variant="contained" onClick={apply} disabled={!activeReview || loading || applying}>
          {applying ? 'Applying…' : 'Apply fix'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
