import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  Slider,
  Tooltip,
  Chip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SpeedIcon from '@mui/icons-material/Speed';
import { transformationService } from '../../../../services/transformation';
import { TransformationStep } from '../../../../models/types';

export interface ExecutionControlsProps {
  currentExecution: any | null;
  isPlaying: boolean;
  executionSpeed: number;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onReset: () => void;
  onSpeedChange: (_: Event, newValue: number | number[]) => void;
  currentStepIndex: number;
  executionSteps: TransformationStep[];
}

export const ExecutionControls: React.FC<ExecutionControlsProps> = ({
  currentExecution,
  isPlaying,
  executionSpeed,
  onPlay,
  onPause,
  onNext,
  onReset,
  onSpeedChange,
  currentStepIndex,
  executionSteps,
}) => {
  const getCurrentRuleName = (): string => {
    if (!currentExecution || currentStepIndex < 0 || !executionSteps[currentStepIndex]) {
      return 'No rule applied';
    }

    const step = executionSteps[currentStepIndex];
    const rule = transformationService.getRuleById(step.ruleId);
    return rule ? rule.name : 'Unknown rule';
  };

  const getCurrentStepDescription = (): string => {
    if (!currentExecution || currentStepIndex < 0 || !executionSteps[currentStepIndex]) {
      return '0/0';
    }

    return `${currentStepIndex + 1}/${executionSteps.length}`;
  };

  return (
    <Box mb={2}>
      <Typography variant="subtitle2" gutterBottom>Playback Controls</Typography>

      <Box display="flex" alignItems="center" mb={1}>
        <Tooltip title="Reset">
          <IconButton onClick={onReset} disabled={!currentExecution}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>

        {isPlaying ? (
          <Tooltip title="Pause">
            <IconButton onClick={onPause} color="primary">
              <PauseIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Play">
            <IconButton
              onClick={onPlay}
              color="primary"
              disabled={!currentExecution}
            >
              <PlayArrowIcon />
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title="Next step">
          <IconButton
            onClick={onNext}
            disabled={!currentExecution || currentStepIndex >= executionSteps.length - 1}
          >
            <SkipNextIcon />
          </IconButton>
        </Tooltip>

        <Box sx={{ display: 'flex', alignItems: 'center', ml: 2, width: '50%' }}>
          <SpeedIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />
          <Slider
            min={0.5}
            max={5}
            step={0.5}
            value={executionSpeed}
            onChange={onSpeedChange}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${value}s`}
            disabled={!currentExecution}
            size="small"
          />
        </Box>
      </Box>

      {/* Current progress */}
      {currentExecution && (
        <Box>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Step: {getCurrentStepDescription()}
            </Typography>
            <Chip
              label={getCurrentRuleName()}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Box>
        </Box>
      )}
    </Box>
  );
};
