import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Diagram, ValidationIssue } from '../../models/types';
import { SPATIAL_RULE_KINDS } from '../../services/spatial';
import { SpatialQuickFixDialog, SpatialQuickFixOption } from './SpatialQuickFixDialog';

interface ViewValidationPanelProps {
  issues: ValidationIssue[];
  onRefresh: () => void;
  onSelectIssue: (issue: ValidationIssue) => void;
  quickFix?: { diagram: Diagram; onApplied: () => void };
}

const severityColor = (severity: ValidationIssue['severity']): 'error' | 'warning' | 'info' => severity;
const spatialRuleLocations = new Set(SPATIAL_RULE_KINDS.map(kind => `spatialRules.${kind}`));

const ViewValidationPanel: React.FC<ViewValidationPanelProps> = ({
  issues,
  onRefresh,
  onSelectIssue,
  quickFix,
}) => {
  const [severity, setSeverity] = useState<ValidationIssue['severity'] | 'all'>('all');
  const [fix, setFix] = useState<{ viewId: string; issue: ValidationIssue; options: SpatialQuickFixOption[] } | null>(null);
  const visibleIssues = severity === 'all' ? issues : issues.filter(issue => issue.severity === severity);
  const diagram = quickFix?.diagram;
  const visibleNodes = useMemo(() => new Map(diagram?.elements.filter(element => element.type === 'node').map(element => {
    const id = String(element.style?.linkedModelElementId || element.style?.modelElementRefId || element.id);
    return [id, String(element.style?.name || id)] as const;
  })), [diagram]);

  const fixOptions = (issue: ValidationIssue): SpatialQuickFixOption[] => {
    if (!issue.constraintId || !issue.elementId || !issue.location || !spatialRuleLocations.has(issue.location)) return [];
    const pair = issue.location === 'spatialRules.noOverlap' || issue.location === 'spatialRules.minClearance';
    if (pair && issue.relatedElementIds?.length !== 1) return [];
    const ids = pair ? [issue.elementId, issue.relatedElementIds![0]] : [issue.elementId];
    return ids.flatMap(id => {
      const name = visibleNodes.get(id);
      return name ? [{ id, name }] : [];
    });
  };

  return (
    <Paper
      variant="outlined"
      role="region"
      aria-label="View validation"
      data-testid="view-validation-panel"
      sx={{ width: 340, maxWidth: 'calc(100vw - 32px)', overflow: 'hidden' }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1.25, py: 0.75 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle2">Validation</Typography>
          <Chip
            size="small"
            label={issues.length === 1 ? '1 issue' : `${issues.length} issues`}
            color={issues.some(issue => issue.severity === 'error') ? 'error' : issues.length > 0 ? 'warning' : 'default'}
          />
        </Stack>
        <Select
          size="small"
          value={severity}
          onChange={event => setSeverity(event.target.value as typeof severity)}
          inputProps={{ 'aria-label': 'Filter validation issues by severity' }}
          sx={{ ml: 'auto', fontSize: '0.8rem', '& .MuiSelect-select': { py: 0.5 } }}
        >
          <MenuItem value="all">All severities</MenuItem>
          <MenuItem value="error">Errors</MenuItem>
          <MenuItem value="warning">Warnings</MenuItem>
          <MenuItem value="info">Info</MenuItem>
        </Select>
        <Tooltip title="Validate view">
          <IconButton size="small" aria-label="Validate view" onClick={onRefresh}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Box sx={{ borderTop: 1, borderColor: 'divider', maxHeight: 190, overflowY: 'auto' }}>
        {visibleIssues.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1.25, py: 1 }}>
            {issues.length === 0 ? 'No validation issues in this view.' : 'No issues match this severity.'}
          </Typography>
        ) : visibleIssues.map((issue, index) => {
          const options = fixOptions(issue);
          return (
            <Stack key={`${issue.elementId || 'view'}-${issue.constraintId || index}-${index}`} direction="row" alignItems="center"
              sx={{ borderBottom: index < visibleIssues.length - 1 ? 1 : 0, borderColor: 'divider' }}>
              <Box
                component="button"
                type="button"
                data-testid={`validation-issue-${index}`}
                onClick={() => onSelectIssue(issue)}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  border: 0,
                  background: 'transparent',
                  color: 'inherit',
                  textAlign: 'left',
                  px: 1.25,
                  py: 1,
                  cursor: issue.elementId ? 'pointer' : 'default',
                  '&:hover': { backgroundColor: 'action.hover' },
                }}
              >
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Chip size="small" label={issue.severity} color={severityColor(issue.severity)} />
                  <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    <Typography variant="body2">{issue.message}</Typography>
                    {(issue.location || issue.constraintId) && (
                      <Typography variant="caption" color="text.secondary">
                        {[issue.location, issue.constraintId].filter(Boolean).join(' · ')}
                      </Typography>
                    )}
                  </Box>
                </Stack>
              </Box>
              {diagram && options.length > 0 && (
                <Button size="small" sx={{ mr: 0.75, flexShrink: 0 }} aria-label={`Preview fix for ${issue.message}`}
                  onClick={() => setFix({ viewId: diagram.id, issue, options })}>Preview fix</Button>
              )}
            </Stack>
          );
        })}
      </Box>
      {quickFix && fix && fix.viewId === diagram?.id && (
        <SpatialQuickFixDialog viewId={quickFix.diagram.id} modelId={quickFix.diagram.modelId} issue={fix.issue}
          options={fix.options} onClose={() => setFix(null)} onApplied={quickFix.onApplied} />
      )}
    </Paper>
  );
};

export default ViewValidationPanel;
