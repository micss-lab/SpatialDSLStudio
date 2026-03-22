import React, { useState } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  Button, 
  IconButton, 
  Tooltip, 
  Collapse,
  Alert,
  Chip,
  Divider
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ListIcon from '@mui/icons-material/List';
import DownloadIcon from '@mui/icons-material/Download';
import { Diagram } from '../../models/types';
import RuleFileUploader from '../transformation/RuleFileUploader';
import {
  useRuleExecution,
  usePlaybackControls,
  useRuleSelection,
  useElementHighlighting,
} from './shared/hooks';
import {
  RuleSelectionDialog,
  ExecutionControls,
} from './shared/components';

interface RuleVisualizationPanelProps {
  diagram: Diagram;
  onHighlightElements: (elementIds: string[]) => void;
  onResetHighlight: () => void;
}

const RuleVisualizationPanel: React.FC<RuleVisualizationPanelProps> = ({
  diagram,
  onHighlightElements,
  onResetHighlight
}) => {
  // Panel state
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  
  // Use custom hooks for rule execution, playback, selection, and highlighting
  const ruleExecution = useRuleExecution();
  const ruleSelection = useRuleSelection();
  
  const playbackControls = usePlaybackControls({
    currentExecution: ruleExecution.currentExecution,
    executionSteps: ruleExecution.executionSteps,
    currentStepIndex: ruleExecution.currentStepIndex,
    setCurrentStepIndex: ruleExecution.setCurrentStepIndex,
    setStatusMessage: ruleExecution.setStatusMessage,
    setStatusType: ruleExecution.setStatusType,
    executeSelectedConfiguration: () => ruleExecution.executeSelectedConfiguration(diagram),
    applyNextRuleApplication: () => ruleExecution.applyNextRuleApplication(diagram),
    diagram,
  });
  
  useElementHighlighting({
    currentStepIndex: ruleExecution.currentStepIndex,
    executionSteps: ruleExecution.executionSteps,
    diagram,
    onHighlightElements,
    onResetHighlight,
  });
  
  // Handle rule file upload
  const handleRuleUpload = () => {
    ruleSelection.loadRules();
  };
  
  // Handle execution creation
  const handleCreateExecution = () => {
    const executionName = `Execution ${new Date().toISOString()}`;
    ruleExecution.createExecution(ruleSelection.selectedRuleIds, executionName);
    ruleSelection.setIsRuleSelectionOpen(false);
  };
  
  // Handle execute button click
  const handleExecuteClick = () => {
    ruleExecution.executeSelectedConfiguration(diagram);
  };

  return (
    <Paper 
      elevation={3} 
      sx={{ 
        width: 360,
        zIndex: 1000,
        overflow: 'hidden'
      }}
    >
      <Box 
        display="flex" 
        justifyContent="space-between" 
        alignItems="center" 
        sx={{ p: 1, bgcolor: 'primary.main', color: 'white' }}
      >
        <Typography variant="subtitle1">Rule Visualization</Typography>
        <IconButton 
          size="small" 
          onClick={() => setIsExpanded(!isExpanded)}
          sx={{ color: 'white' }}
        >
          {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      
      <Collapse in={isExpanded}>
        <Box sx={{ p: 2 }}>
          {/* Rule upload/selection */}
          <Box mb={2}>
            <Typography variant="subtitle2" gutterBottom>Rule Execution</Typography>
            <Box display="flex" justifyContent="space-between" mb={1}>
              <RuleFileUploader onRulesImported={handleRuleUpload} />
              
              <Tooltip title="Select rules to execute">
                <IconButton onClick={() => ruleSelection.setIsRuleSelectionOpen(true)}>
                  <ListIcon />
                </IconButton>
              </Tooltip>
              
              {ruleExecution.currentExecution && (
                <Tooltip title="Download execution configuration">
                  <IconButton onClick={ruleExecution.downloadExecutionAsJson}>
                    <DownloadIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            
            {ruleSelection.selectedRuleIds.length > 0 && (
              <Box display="flex" flexWrap="wrap" gap={1} mt={1}>
                <Typography variant="body2" gutterBottom>
                  Selected rules:
                </Typography>
                {ruleSelection.selectedRuleIds.map(ruleId => {
                  const rule = ruleSelection.availableRules.find(r => r.id === ruleId);
                  return (
                    <Chip
                      key={ruleId}
                      label={rule?.name || 'Unknown rule'}
                      color="primary"
                      variant="outlined"
                      size="small"
                      onDelete={() => ruleSelection.toggleRuleSelection(ruleId)}
                    />
                  );
                })}
              </Box>
            )}
            
            <Box mt={2} display="flex" justifyContent="center">
              <Button 
                variant="contained" 
                color="primary" 
                size="small"
                onClick={handleExecuteClick}
                disabled={ruleSelection.selectedRuleIds.length === 0 && !ruleExecution.selectedExecutionId}
                startIcon={<PlayArrowIcon />}
              >
                Execute
              </Button>
            </Box>
          </Box>
          
          <Divider sx={{ my: 2 }} />
          
          {/* Playback controls */}
          <ExecutionControls
            currentExecution={ruleExecution.currentExecution}
            isPlaying={playbackControls.isPlaying}
            executionSpeed={playbackControls.executionSpeed}
            onPlay={playbackControls.startPlayback}
            onPause={playbackControls.pausePlayback}
            onNext={playbackControls.advanceToNextStep}
            onReset={() => ruleExecution.resetExecution(onResetHighlight)}
            onSpeedChange={playbackControls.handleSpeedChange}
            currentStepIndex={ruleExecution.currentStepIndex}
            executionSteps={ruleExecution.executionSteps}
          />
          
          {/* Status message */}
          {ruleExecution.statusMessage && (
            <Alert severity={ruleExecution.statusType} sx={{ mt: 1 }}>
              {ruleExecution.statusMessage}
            </Alert>
          )}
        </Box>
      </Collapse>
      
      {/* Rule selection dialog */}
      <RuleSelectionDialog
        open={ruleSelection.isRuleSelectionOpen}
        onClose={() => ruleSelection.setIsRuleSelectionOpen(false)}
        availableRules={ruleSelection.availableRules}
        selectedRuleIds={ruleSelection.selectedRuleIds}
        onToggleRule={ruleSelection.toggleRuleSelection}
        onCreate={handleCreateExecution}
      />
    </Paper>
  );
};

export default RuleVisualizationPanel;
