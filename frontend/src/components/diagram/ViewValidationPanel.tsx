import React from 'react';
import {
  Box,
  Chip,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { ValidationIssue } from '../../models/types';

interface ViewValidationPanelProps {
  issues: ValidationIssue[];
  onRefresh: () => void;
  onSelectIssue: (issue: ValidationIssue) => void;
}

const severityColor = (severity: ValidationIssue['severity']): 'error' | 'warning' | 'info' => severity;

const ViewValidationPanel: React.FC<ViewValidationPanelProps> = ({
  issues,
  onRefresh,
  onSelectIssue,
}) => (
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
      <Tooltip title="Validate view">
        <IconButton size="small" aria-label="Validate view" onClick={onRefresh}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
    <Box sx={{ borderTop: 1, borderColor: 'divider', maxHeight: 190, overflowY: 'auto' }}>
      {issues.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1.25, py: 1 }}>
          No validation issues in this view.
        </Typography>
      ) : issues.map((issue, index) => (
        <Box
          component="button"
          type="button"
          key={`${issue.elementId || 'view'}-${issue.constraintId || index}-${index}`}
          data-testid={`validation-issue-${index}`}
          onClick={() => onSelectIssue(issue)}
          sx={{
            display: 'block',
            width: '100%',
            border: 0,
            borderBottom: index < issues.length - 1 ? 1 : 0,
            borderColor: 'divider',
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
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2">{issue.message}</Typography>
              {(issue.location || issue.constraintId) && (
                <Typography variant="caption" color="text.secondary">
                  {[issue.location, issue.constraintId].filter(Boolean).join(' · ')}
                </Typography>
              )}
            </Box>
          </Stack>
        </Box>
      ))}
    </Box>
  </Paper>
);

export default ViewValidationPanel;
