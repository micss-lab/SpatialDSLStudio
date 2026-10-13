import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputLabel,
  List,
  ListItem,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import { v4 as uuidv4 } from 'uuid';
import { Metamodel, SpatialRule, SpatialRuleKind } from '../../models/types';
import { metamodelService } from '../../services/metamodel';
import {
  SPATIAL_RULE_KINDS,
  spatialRuleRequiresDistance,
  spatialRuleUsesDistance,
  validateSpatialRule,
} from '../../services/spatial';

interface SpatialRulesEditorProps {
  metamodel: Metamodel;
  readOnly?: boolean;
  onUpdateMetamodel: (updatedMetamodel: Metamodel) => void;
}

const KIND_LABELS: Record<SpatialRuleKind, string> = {
  noOverlap: 'No overlap',
  minClearance: 'Minimum clearance',
  maxDistance: 'Maximum distance',
  within: 'Within',
  adjacentTo: 'Adjacent to',
};

const DISTANCE_LABELS: Record<SpatialRuleKind, string> = {
  noOverlap: '',
  minClearance: 'Minimum gap (mm)',
  maxDistance: 'Maximum centre distance (mm)',
  within: 'Margin from the target boundary (mm)',
  adjacentTo: 'Maximum gap (mm)',
};

interface RuleDraft {
  name: string;
  kind: SpatialRuleKind;
  sourceClassId: string;
  targetClassId: string;
  distance: string;
  mode: 'plan' | 'volume';
  severity: SpatialRule['severity'];
  message: string;
  enabled: boolean;
}

const emptyDraft = (): RuleDraft => ({
  name: '',
  kind: 'noOverlap',
  sourceClassId: '',
  targetClassId: '',
  distance: '',
  mode: 'volume',
  severity: 'error',
  message: '',
  enabled: true,
});

const draftFromRule = (rule: SpatialRule): RuleDraft => ({
  name: rule.name,
  kind: rule.kind,
  sourceClassId: rule.sourceClassId,
  targetClassId: rule.targetClassId,
  distance: rule.distanceMm === undefined ? '' : String(rule.distanceMm),
  mode: rule.mode || 'volume',
  severity: rule.severity,
  message: rule.message || '',
  enabled: rule.enabled !== false,
});

export const describeSpatialRule = (rule: SpatialRule, metamodel: Metamodel): string => {
  const className = (classId: string) => metamodel.classes.find(cls => cls.id === classId)?.name || classId;
  const source = className(rule.sourceClassId);
  const target = className(rule.targetClassId);
  const distance = rule.distanceMm ?? 0;
  switch (rule.kind) {
    case 'noOverlap':
      return `${source} and ${target} do not overlap`;
    case 'minClearance':
      return `${source} keeps at least ${distance} mm from ${target}`;
    case 'maxDistance':
      return `Each ${source} has a ${target} centre within ${distance} mm`;
    case 'within':
      return `Each ${source} lies inside a ${target}${distance > 0 ? ` (${distance} mm margin)` : ''}`;
    case 'adjacentTo':
      return `Each ${source} is within ${distance} mm of a ${target}`;
    default:
      return rule.kind;
  }
};

const severityIcon = (severity: SpatialRule['severity']) => {
  if (severity === 'error') return <ErrorIcon color="error" fontSize="small" />;
  if (severity === 'warning') return <WarningIcon color="warning" fontSize="small" />;
  return <InfoIcon color="info" fontSize="small" />;
};

/**
 * Metamodel-level editor for declarative spatial rules. Rules are part of
 * the language definition and are evaluated by browser validation and by
 * the headless pipeline.
 */
const SpatialRulesEditor: React.FC<SpatialRulesEditorProps> = ({
  metamodel,
  readOnly = false,
  onUpdateMetamodel,
}) => {
  const rules = metamodel.spatialRules || [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);

  const updateDraft = (changes: Partial<RuleDraft>) => setDraft(current => ({ ...current, ...changes }));

  const openDialog = (rule?: SpatialRule) => {
    setEditingRuleId(rule ? rule.id : null);
    setDraft(rule ? draftFromRule(rule) : emptyDraft());
    setError(null);
    setDialogOpen(true);
  };

  const saveRules = (nextRules: SpatialRule[]): boolean => {
    try {
      const updated = metamodelService.updateMetamodel(metamodel.id, { ...metamodel, spatialRules: nextRules });
      if (updated) onUpdateMetamodel(updated);
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
      return false;
    }
  };

  const handleSave = () => {
    if (!draft.name.trim()) {
      setError('Enter a rule name.');
      return;
    }
    if (!draft.sourceClassId || !draft.targetClassId) {
      setError('Choose both a source class and a target class.');
      return;
    }
    const usesDistance = spatialRuleUsesDistance(draft.kind);
    const distanceText = draft.distance.trim();
    if (usesDistance && distanceText === '' && spatialRuleRequiresDistance(draft.kind)) {
      setError(`${DISTANCE_LABELS[draft.kind]} is required for ${KIND_LABELS[draft.kind]}.`);
      return;
    }
    const distanceMm = usesDistance && distanceText !== '' ? Number(distanceText) : undefined;
    if (distanceMm !== undefined && (!Number.isFinite(distanceMm) || distanceMm < 0)) {
      setError('The distance must be a number of millimetres, zero or greater.');
      return;
    }

    const rule: SpatialRule = {
      id: editingRuleId || uuidv4(),
      name: draft.name.trim(),
      kind: draft.kind,
      sourceClassId: draft.sourceClassId,
      targetClassId: draft.targetClassId,
      ...(distanceMm !== undefined && { distanceMm }),
      mode: draft.mode,
      severity: draft.severity,
      ...(draft.message.trim() && { message: draft.message.trim() }),
      ...(!draft.enabled && { enabled: false }),
    };
    const ruleErrors = validateSpatialRule(rule, metamodel);
    if (ruleErrors.length > 0) {
      setError(ruleErrors[0]);
      return;
    }

    const saved = saveRules(editingRuleId
      ? rules.map(existing => (existing.id === editingRuleId ? rule : existing))
      : [...rules, rule]);
    if (saved) setDialogOpen(false);
  };

  const handleDelete = (ruleId: string) => {
    saveRules(rules.filter(rule => rule.id !== ruleId));
  };

  return (
    <Box sx={{ p: 2 }} data-testid="spatial-rules-editor">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">Spatial Rules</Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => openDialog()}
          disabled={readOnly || metamodel.classes.length === 0}
        >
          Add Rule
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Rules over placed instances, checked with the other constraints when a model or view is validated.
      </Typography>

      {rules.length === 0 ? (
        <Typography color="text.secondary">No spatial rules defined for this metamodel.</Typography>
      ) : (
        <List disablePadding>
          {rules.map(rule => (
            <ListItem
              key={rule.id}
              data-testid={`spatial-rule-${rule.id}`}
              sx={{
                mb: 1,
                border: '1px solid #e0e0e0',
                borderRadius: 1,
                display: 'block',
                opacity: rule.enabled === false ? 0.6 : 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {severityIcon(rule.severity)}
                <Typography variant="subtitle2" sx={{ flexGrow: 1, minWidth: 0 }}>
                  {rule.name}
                </Typography>
                {!readOnly && (
                  <>
                    <IconButton size="small" aria-label={`Edit ${rule.name}`} onClick={() => openDialog(rule)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" aria-label={`Delete ${rule.name}`} onClick={() => handleDelete(rule.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </>
                )}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {describeSpatialRule(rule, metamodel)}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                <Chip size="small" label={KIND_LABELS[rule.kind] || rule.kind} />
                <Chip size="small" variant="outlined" label={rule.mode === 'plan' ? 'Plan view' : 'Volume'} />
                {rule.enabled === false && <Chip size="small" variant="outlined" label="Disabled" />}
              </Box>
            </ListItem>
          ))}
        </List>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingRuleId ? 'Edit Spatial Rule' : 'Add Spatial Rule'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField
            autoFocus
            margin="dense"
            label="Rule name"
            fullWidth
            value={draft.name}
            onChange={event => updateDraft({ name: event.target.value })}
          />
          <FormControl fullWidth margin="dense">
            <InputLabel id="spatial-rule-kind-label">Kind</InputLabel>
            <Select
              labelId="spatial-rule-kind-label"
              label="Kind"
              value={draft.kind}
              onChange={event => updateDraft({ kind: event.target.value as SpatialRuleKind })}
            >
              {SPATIAL_RULE_KINDS.map(kind => (
                <MenuItem key={kind} value={kind}>{KIND_LABELS[kind]}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="dense">
            <InputLabel id="spatial-rule-source-label">Source class</InputLabel>
            <Select
              labelId="spatial-rule-source-label"
              label="Source class"
              value={draft.sourceClassId}
              onChange={event => updateDraft({ sourceClassId: event.target.value })}
            >
              {metamodel.classes.map(cls => (
                <MenuItem key={cls.id} value={cls.id}>{cls.name}</MenuItem>
              ))}
            </Select>
            <FormHelperText>Instances of this class and its subclasses are checked.</FormHelperText>
          </FormControl>
          <FormControl fullWidth margin="dense">
            <InputLabel id="spatial-rule-target-label">Target class</InputLabel>
            <Select
              labelId="spatial-rule-target-label"
              label="Target class"
              value={draft.targetClassId}
              onChange={event => updateDraft({ targetClassId: event.target.value })}
            >
              {metamodel.classes.map(cls => (
                <MenuItem key={cls.id} value={cls.id}>{cls.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {spatialRuleUsesDistance(draft.kind) && (
            <TextField
              margin="dense"
              label={DISTANCE_LABELS[draft.kind]}
              type="number"
              fullWidth
              inputProps={{ min: 0 }}
              value={draft.distance}
              onChange={event => updateDraft({ distance: event.target.value })}
              helperText={draft.kind === 'within' ? 'Optional; defaults to 0.' : undefined}
            />
          )}
          <FormControl fullWidth margin="dense">
            <InputLabel id="spatial-rule-mode-label">Geometry</InputLabel>
            <Select
              labelId="spatial-rule-mode-label"
              label="Geometry"
              value={draft.mode}
              onChange={event => updateDraft({ mode: event.target.value as RuleDraft['mode'] })}
            >
              <MenuItem value="volume">Volume (footprint and elevation)</MenuItem>
              <MenuItem value="plan">Plan view (footprint only)</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth margin="dense">
            <InputLabel id="spatial-rule-severity-label">Severity</InputLabel>
            <Select
              labelId="spatial-rule-severity-label"
              label="Severity"
              value={draft.severity}
              onChange={event => updateDraft({ severity: event.target.value as RuleDraft['severity'] })}
            >
              <MenuItem value="error">Error</MenuItem>
              <MenuItem value="warning">Warning</MenuItem>
              <MenuItem value="info">Info</MenuItem>
            </Select>
          </FormControl>
          <TextField
            margin="dense"
            label="Message (optional)"
            fullWidth
            value={draft.message}
            onChange={event => updateDraft({ message: event.target.value })}
            helperText="Placeholders: {source}, {target}, {distance}, {rule}"
          />
          <FormControlLabel
            control={(
              <Checkbox
                checked={draft.enabled}
                onChange={event => updateDraft({ enabled: event.target.checked })}
              />
            )}
            label="Enabled"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} color="primary" variant="contained">
            {editingRuleId ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SpatialRulesEditor;
