import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  Button, 
  IconButton, 
  Tooltip, 
  Slider, 
  Collapse,
  Alert,
  Chip,
  Divider,
  FormControl,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import RefreshIcon from '@mui/icons-material/Refresh';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SpeedIcon from '@mui/icons-material/Speed';
import ListIcon from '@mui/icons-material/List';
import { 
  TransformationRule, 
  TransformationExecution, 
  TransformationStep,
  Diagram,
  DiagramElement 
} from '../../models/types';
import { transformationService } from '../../services/transformation.service';
import RuleFileUploader from '../transformation/RuleFileUploader';

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
  
  // Rule execution state
  const [executions, setExecutions] = useState<TransformationExecution[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [currentExecution, setCurrentExecution] = useState<TransformationExecution | null>(null);
  const [executionSteps, setExecutionSteps] = useState<TransformationStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [executionSpeed, setExecutionSpeed] = useState<number>(1.5); // seconds per step
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusType, setStatusType] = useState<'info' | 'success' | 'warning' | 'error'>('info');
  
  // Rule selection state
  const [availableRules, setAvailableRules] = useState<TransformationRule[]>([]);
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [isRuleSelectionOpen, setIsRuleSelectionOpen] = useState<boolean>(false);
  
  // Timer reference for auto-playback
  const playbackTimerRef = useRef<number | null>(null);
  
  // Load available executions on mount
  useEffect(() => {
    loadRules();
  }, []);
  
  // Clear timer on unmount and reset highlighting
  useEffect(() => {
    return () => {
      if (playbackTimerRef.current) {
        window.clearTimeout(playbackTimerRef.current);
      }
      // Ensure we reset highlighting when component unmounts
      onResetHighlight();
    };
  }, [onResetHighlight]);
  
  // Watch for execution changes
  useEffect(() => {
    if (selectedExecutionId) {
      const execution = transformationService.getExecutionById(selectedExecutionId);
      if (execution) {
        setCurrentExecution(execution);
        setExecutionSteps(execution.stepResults || []);
      }
    }
  }, [selectedExecutionId]);
  
  // Watch current step to highlight elements
  useEffect(() => {
    // Reset highlights first to prevent lingering highlights
    onResetHighlight();
    
    // Only proceed if we have a valid step
    if (currentStepIndex >= 0 && executionSteps && executionSteps.length > currentStepIndex) {
      const step = executionSteps[currentStepIndex];
      
      // Prepare highlights for current step
      if (step) {
        highlightElementsForStep(step);
      }
    }
  }, [currentStepIndex, executionSteps, diagram, onResetHighlight]);
  
  // Playback timer management
  useEffect(() => {
    if (isPlaying) {
      // Schedule next step
      playbackTimerRef.current = window.setTimeout(() => {
        if (currentStepIndex >= executionSteps.length - 1) {
          // Try to apply a new rule if at the end of existing steps
          applyNextRuleApplication();
        } else {
          // Otherwise just advance to the next recorded step
          advanceToNextStep();
        }
      }, executionSpeed * 1000);
    } else {
      // Clear existing timer
      if (playbackTimerRef.current) {
        window.clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    }
    
    return () => {
      if (playbackTimerRef.current) {
        window.clearTimeout(playbackTimerRef.current);
      }
    };
  }, [isPlaying, currentStepIndex, executionSpeed, executionSteps.length]);
  
  // Load all rules and executions from storage
  const loadRules = () => {
    const allRules = transformationService.getAllRules();
    setAvailableRules(allRules);
    
    // Clear previous selections when rules are loaded
    setSelectedRuleIds([]);
    
    // Reset current execution
    setCurrentExecution(null);
    setExecutionSteps([]);
    setCurrentStepIndex(-1);
    
    // Show a message if no rules are available
    if (allRules.length === 0) {
      setStatusMessage('No transformation rules available. Import rules to start.');
      setStatusType('info');
    } else {
      setStatusMessage(`${allRules.length} rules available. Select rules to execute.`);
      setStatusType('info');
    }
  };
  
  // Create a new rule execution from selected rules
  const createExecution = () => {
    if (!diagram || selectedRuleIds.length === 0) {
      setStatusMessage('No rules selected. Please select at least one rule to execute.');
      setStatusType('warning');
      return;
    }
    
    // Create a new execution configuration
    const executionName = `Diagram_Execution_${new Date().toISOString().slice(0, 10)}`;
    const execution = transformationService.createTransformationExecution(
      executionName,
      selectedRuleIds,
      diagram.modelId,
      undefined, // No target model ID for in-place transformations
      true, // In-place transformation
      100, // Default max iterations
      'sequential' // Default strategy
    );
    
    setSelectedExecutionId(execution.id);
    setCurrentExecution(execution);
    setStatusMessage(`Created execution with ${selectedRuleIds.length} rules. Ready to execute.`);
    setStatusType('success');
    
    // Close the rule selection dialog
    setIsRuleSelectionOpen(false);
  };
  
  const handleRuleUpload = () => {
    // Reset current selections
    setSelectedExecutionId(null);
    setCurrentExecution(null);
    setExecutionSteps([]);
    setCurrentStepIndex(-1);
    
    // Load the new rules
    loadRules();
    
    setStatusMessage('Rules imported. Select rules to execute on the diagram.');
    setStatusType('success');
    
    // Open the rule selection dialog
    setIsRuleSelectionOpen(true);
  };
  
  // Toggle selection of a rule
  const toggleRuleSelection = (ruleId: string) => {
    setSelectedRuleIds(prev => {
      if (prev.includes(ruleId)) {
        return prev.filter(id => id !== ruleId);
      } else {
        return [...prev, ruleId];
      }
    });
  };
  
  // Execute the selected configuration on the diagram
  const executeSelectedConfiguration = () => {
    if (!selectedExecutionId || !diagram) {
      // If no execution is selected but we have selected rules, create a new execution
      if (selectedRuleIds.length > 0) {
        createExecution();
        // We need to return and let the useEffect trigger the execution after the execution is created
        return;
      } else {
        // Open rule selection dialog if no rules are selected
        setIsRuleSelectionOpen(true);
        return;
      }
    }
    
    console.log(`Executing configuration ${selectedExecutionId} on diagram ${diagram.id}`);
    setStatusMessage('Executing transformation...');
    setStatusType('info');
    
    // Modified to apply rules just once rather than repeatedly
    setTimeout(() => {
      try {
        // First clear existing step results to ensure fresh execution
        transformationService.updateExecution(selectedExecutionId, { 
          stepResults: [], 
          status: 'in_progress' 
        });
        
        // Get the execution
        const execution = transformationService.getExecutionById(selectedExecutionId);
        if (!execution) {
          setStatusMessage('Execution not found');
          setStatusType('error');
          return;
        }
        
        // Get the model ID from the diagram
        const modelId = diagram.modelId;
        
        // Instead of using executeDiagramTransformation which applies rules repeatedly,
        // we'll manually apply each rule just once
        const ruleIds = execution.ruleIds;
        const stepResults: TransformationStep[] = [];
        let anyRuleApplied = false;
        
        // Process one rule at a time
        for (const ruleId of ruleIds) {
          console.log(`Applying rule ${ruleId} to diagram ${diagram.id} (one time only)`);
          
          // Get rule to check if it's enabled
          const rule = transformationService.getRuleById(ruleId);
          if (!rule || !rule.enabled) {
            console.log(`Rule ${ruleId} is disabled or not found - skipping`);
            continue;
          }
          
          // Find pattern matches for this rule
          const matches = transformationService.findPatternMatches(rule.lhs, modelId);
          console.log(`Found ${matches.length} matches for rule ${rule.name}`);
          
          if (matches.length > 0) {
            // Apply the rule once to the first match only
            const result = transformationService.applyRuleTodiagram(ruleId, diagram.id, matches[0]);
            
            if (result.success && result.step) {
              // Add this step
              stepResults.push(result.step);
              anyRuleApplied = true;
              console.log(`Successfully applied rule ${rule.name} once`);
            }
          }
        }
        
        // Update execution with steps
        transformationService.updateExecution(selectedExecutionId, {
          stepResults: stepResults,
          status: 'completed',
          resultModelId: modelId
        });
        
        // Update the UI
        const updatedExecution = transformationService.getExecutionById(selectedExecutionId);
        if (updatedExecution) {
          setCurrentExecution(updatedExecution);
          setExecutionSteps(stepResults);
          
          if (stepResults.length > 0) {
            setCurrentStepIndex(0);
            setStatusMessage(`Applied ${stepResults.length} rule(s). Use Play to continue applying rules.`);
            setStatusType('success');
          } else {
            setStatusMessage('No rules could be applied to this diagram.');
            setStatusType('warning');
          }
        }
      } catch (error) {
        setStatusMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
        setStatusType('error');
        console.error('Error during transformation execution:', error);
      }
    }, 100); // Small timeout to allow UI to update first
  };
  
  // Apply the next available rule application
  const applyNextRuleApplication = () => {
    if (!selectedExecutionId || !diagram || !currentExecution) {
      return false;
    }
    
    const modelId = diagram.modelId;
    let appliedAny = false;
    
    // Try to apply each rule in order
    for (const ruleId of currentExecution.ruleIds) {
      // Get rule to check if it's enabled
      const rule = transformationService.getRuleById(ruleId);
      if (!rule || !rule.enabled) continue;
      
      // Find pattern matches
      const matches = transformationService.findPatternMatches(rule.lhs, modelId);
      if (matches.length === 0) continue;
      
      // Apply the rule once to the first match
      const result = transformationService.applyRuleTodiagram(ruleId, diagram.id, matches[0]);
      
      if (result.success && result.step) {
        // New step to add
        const newSteps = [...executionSteps, result.step];
        
        // Update the execution
        transformationService.updateExecution(selectedExecutionId, {
          stepResults: newSteps,
          status: 'in_progress'
        });
        
        // Update local state
        setExecutionSteps(newSteps);
        setCurrentStepIndex(newSteps.length - 1);
        
        // Mark that we applied a rule
        appliedAny = true;
        setStatusMessage(`Applied rule: ${rule.name}`);
        
        // Only apply one rule per call
        break;
      }
    }
    
    if (!appliedAny) {
      setIsPlaying(false);
      setStatusMessage('No more rules can be applied.');
      setStatusType('info');
    }
    
    return appliedAny;
  };
  
  const startPlayback = () => {
    if (!currentExecution) return;
    
    // If no steps have been executed yet, run the transformation first
    if (!executionSteps || executionSteps.length === 0) {
      executeSelectedConfiguration();
      return;
    }
    
    // If at the end of current steps, try to apply more rules
    if (currentStepIndex >= executionSteps.length - 1) {
      // Try to apply more rules
      const couldApplyMore = applyNextRuleApplication();
      
      // If we couldn't apply more, just restart playback from the beginning
      if (!couldApplyMore && executionSteps.length > 0) {
        setCurrentStepIndex(0);
      }
    } else {
      // Otherwise just proceed with normal playback of existing steps
      setCurrentStepIndex(currentStepIndex + 1);
    }
    
    setIsPlaying(true);
    setStatusMessage(`Playing transformation rules with ${executionSpeed}s interval`);
    setStatusType('info');
  };
  
  const pausePlayback = () => {
    setIsPlaying(false);
    setStatusMessage('Playback paused');
    setStatusType('info');
  };
  
  const advanceToNextStep = () => {
    if (!currentExecution || !executionSteps) {
      setIsPlaying(false);
      return;
    }
    
    // Check if we're at the end of recorded steps
    if (currentStepIndex >= executionSteps.length - 1) {
      // Try to apply more rules
      const couldApplyMore = applyNextRuleApplication();
      
      if (!couldApplyMore) {
        setIsPlaying(false);
        setStatusMessage('Transformation execution complete - no more rules can be applied');
        setStatusType('success');
      }
      return;
    }
    
    // Not at the end, so advance to the next step
    setCurrentStepIndex(prevIndex => prevIndex + 1);
    
    // Update status with current rule name
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < executionSteps.length) {
      const nextStep = executionSteps[nextIndex];
      const rule = transformationService.getRuleById(nextStep.ruleId);
      if (rule) {
        setStatusMessage(`Showing rule: ${rule.name}`);
      }
    }
  };
  
  const resetExecution = () => {
    setCurrentStepIndex(-1);
    setIsPlaying(false);
    setStatusMessage('Execution reset');
    setStatusType('info');
    onResetHighlight();
  };
  
  const downloadExecutionAsJson = () => {
    if (!currentExecution) return;
    
    const filename = `${currentExecution.name.replace(/\s+/g, '_')}.json`;
    const result = transformationService.downloadExecutionAsJsonFile(currentExecution.id, filename);
    
    if (result) {
      setStatusMessage('Execution downloaded successfully');
      setStatusType('success');
    } else {
      setStatusMessage('Failed to download execution');
      setStatusType('error');
    }
  };
  
  const highlightElementsForStep = (step: TransformationStep) => {
    if (!step || !diagram) {
      console.log('Cannot highlight step: missing step or diagram');
      return;
    }
    
    console.log('Highlighting elements for step:', {
      ruleId: step.ruleId,
      appliedElements: (step.appliedElements || []).length,
      resultElements: (step.resultElements || []).length,
      diagramElements: (step.diagramElements || []).length
    });
    
    // Find diagram elements that correspond to the model elements affected by this step
    const elementIdsToHighlight: string[] = [];
    
    // First, directly use diagram elements from the step if available
    // These should have been properly populated by executeDiagramTransformation
    if (step.diagramElements && step.diagramElements.length > 0) {
      console.log(`Found ${step.diagramElements.length} diagram elements to highlight`);
      
      // Verify these elements exist in the current diagram
      step.diagramElements.forEach(diagramElementId => {
        const element = diagram.elements.find(e => e.id === diagramElementId);
        if (element) {
          elementIdsToHighlight.push(diagramElementId);
        }
      });
      
      if (elementIdsToHighlight.length > 0) {
        console.log(`Highlighting ${elementIdsToHighlight.length} diagram elements`);
        onHighlightElements(elementIdsToHighlight);
        return;
      } else {
        console.log(`None of the ${step.diagramElements.length} diagram elements exist in this diagram`);
      }
    }
    
    // If no valid diagram elements found, try to map from model elements
    console.log('Attempting to map model elements to diagram elements');
    
    // Helper function to find diagram elements for a model element
    const findDiagramElementsForModelElement = (modelElementId: string): string[] => {
      // First try direct mapping by modelElementId
      let matchingElements = diagram.elements.filter(element => 
        element.modelElementId === modelElementId
      );
      
      if (matchingElements.length === 0) {
        // Try by linkedModelElementId in style
        matchingElements = diagram.elements.filter(element => 
          element.style?.linkedModelElementId === modelElementId
        );
      }
      
      if (matchingElements.length === 0) {
        // Try by linkModelID if available (another common pattern)
        matchingElements = diagram.elements.filter(element => 
          element.style?.linkModelID === modelElementId
        );
      }
      
      return matchingElements.map(e => e.id);
    };
    
    // Get diagram elements from applied elements (LHS)
    if (step.appliedElements && step.appliedElements.length > 0) {
      console.log(`Mapping ${step.appliedElements.length} applied model elements to diagram elements`);
      
      step.appliedElements.forEach(modelElementId => {
        const diagramElementIds = findDiagramElementsForModelElement(modelElementId);
        diagramElementIds.forEach(id => {
          if (!elementIdsToHighlight.includes(id)) {
            elementIdsToHighlight.push(id);
          }
        });
      });
    }
    
    // Get diagram elements from result elements (RHS)
    if (step.resultElements && step.resultElements.length > 0) {
      console.log(`Mapping ${step.resultElements.length} result model elements to diagram elements`);
      
      step.resultElements.forEach(modelElementId => {
        const diagramElementIds = findDiagramElementsForModelElement(modelElementId);
        diagramElementIds.forEach(id => {
          if (!elementIdsToHighlight.includes(id)) {
            elementIdsToHighlight.push(id);
          }
        });
      });
    }
    
    // Highlight the elements or reset if none found
    if (elementIdsToHighlight.length > 0) {
      console.log(`Highlighting ${elementIdsToHighlight.length} mapped diagram elements`);
      onHighlightElements(elementIdsToHighlight);
    } else {
      console.log('No diagram elements to highlight found');
      onResetHighlight();
    }
  };
  
  const handleSpeedChange = (_: Event, newValue: number | number[]) => {
    setExecutionSpeed(newValue as number);
  };
  
  // Get the current rule name
  const getCurrentRuleName = (): string => {
    if (!currentExecution || currentStepIndex < 0 || !executionSteps[currentStepIndex]) {
      return 'No rule applied';
    }
    
    const step = executionSteps[currentStepIndex];
    const rule = transformationService.getRuleById(step.ruleId);
    return rule ? rule.name : 'Unknown rule';
  };
  
  // Get the current step description
  const getCurrentStepDescription = (): string => {
    if (!currentExecution || currentStepIndex < 0 || !executionSteps[currentStepIndex]) {
      return '0/0';
    }
    
    return `${currentStepIndex + 1}/${executionSteps.length}`;
  };
  
  // Render dialog for rule selection
  const renderRuleSelectionDialog = () => {
    return (
      <Dialog 
        open={isRuleSelectionOpen} 
        onClose={() => setIsRuleSelectionOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Select Rules to Execute on Diagram</DialogTitle>
        <DialogContent>
          {availableRules.length === 0 ? (
            <Alert severity="info" sx={{ mt: 1 }}>
              No rules available. Import rules first using the upload button.
            </Alert>
          ) : (
            <FormControl component="fieldset" sx={{ width: '100%' }}>
              <FormGroup>
                {availableRules.map(rule => (
                  <FormControlLabel
                    key={rule.id}
                    control={
                      <Checkbox 
                        checked={selectedRuleIds.includes(rule.id)} 
                        onChange={() => toggleRuleSelection(rule.id)}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body1">{rule.name}</Typography>
                        {rule.description && (
                          <Typography variant="caption" color="text.secondary">
                            {rule.description}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                ))}
              </FormGroup>
            </FormControl>
          )}
          
          {availableRules.length > 0 && selectedRuleIds.length === 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Select at least one rule to execute.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsRuleSelectionOpen(false)}>Cancel</Button>
          <Button 
            onClick={createExecution} 
            variant="contained" 
            color="primary"
            disabled={selectedRuleIds.length === 0}
          >
            Create Execution
          </Button>
        </DialogActions>
      </Dialog>
    );
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
                <IconButton onClick={() => setIsRuleSelectionOpen(true)}>
                  <ListIcon />
                </IconButton>
              </Tooltip>
              
              {currentExecution && (
                <Tooltip title="Download execution configuration">
                  <IconButton onClick={downloadExecutionAsJson}>
                    <DownloadIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            
            {selectedRuleIds.length > 0 && (
              <Box display="flex" flexWrap="wrap" gap={1} mt={1}>
                <Typography variant="body2" gutterBottom>
                  Selected rules:
                </Typography>
                {selectedRuleIds.map(ruleId => {
                  const rule = availableRules.find(r => r.id === ruleId);
                  return (
                    <Chip
                      key={ruleId}
                      label={rule?.name || 'Unknown rule'}
                      color="primary"
                      variant="outlined"
                      size="small"
                      onDelete={() => toggleRuleSelection(ruleId)}
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
                onClick={executeSelectedConfiguration}
                disabled={selectedRuleIds.length === 0 && !selectedExecutionId}
                startIcon={<PlayArrowIcon />}
              >
                Execute
              </Button>
            </Box>
          </Box>
          
          <Divider sx={{ my: 2 }} />
          
          {/* Playback controls */}
          <Box mb={2}>
            <Typography variant="subtitle2" gutterBottom>Playback Controls</Typography>
            
            <Box display="flex" alignItems="center" mb={1}>
              <Tooltip title="Reset">
                <IconButton onClick={resetExecution} disabled={!currentExecution}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              
              {isPlaying ? (
                <Tooltip title="Pause">
                  <IconButton onClick={pausePlayback} color="primary">
                    <PauseIcon />
                  </IconButton>
                </Tooltip>
              ) : (
                <Tooltip title="Play">
                  <IconButton 
                    onClick={startPlayback} 
                    color="primary"
                    disabled={!currentExecution}
                  >
                    <PlayArrowIcon />
                  </IconButton>
                </Tooltip>
              )}
              
              <Tooltip title="Next step">
                <IconButton 
                  onClick={advanceToNextStep}
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
                  onChange={handleSpeedChange}
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
          
          {/* Status message */}
          {statusMessage && (
            <Alert severity={statusType} sx={{ mt: 1 }}>
              {statusMessage}
            </Alert>
          )}
        </Box>
      </Collapse>
      
      {/* Rule selection dialog */}
      {renderRuleSelectionDialog()}
    </Paper>
  );
};

export default RuleVisualizationPanel; 