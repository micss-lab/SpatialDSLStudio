import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Button, 
  Paper, 
  Typography, 
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  TextField,
  List,
  ListItem,
  ListItemText,
  Chip,
  Alert,
  IconButton,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Tabs,
  Tab,
  Card,
  CardContent,
  CardHeader,
  Tooltip
} from '@mui/material';
import Grid from '@mui/material/Grid';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import { Stage, Layer, Rect, Circle, Line, Arrow, Text, Group } from 'react-konva';
import { 
  TransformationRule, 
  TransformationExecution, 
  TransformationStep,
  Model,
  PatternMatch,
  ModelElement
} from '../../models/types';
import { transformationService } from '../../services/transformation.service';
import { modelService } from '../../services/model.service';
import { metamodelService } from '../../services/metamodel.service';
import RuleFileUploader from './RuleFileUploader';

// Augment the TransformationExecution type to include resultModelId
declare module '../../models/types' {
  interface TransformationExecution {
    resultModelId?: string;
  }
  
  interface ModelElement {
    name?: string;
    type?: string;
  }
  
  interface Model {
    connections?: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      type?: string;
    }>;
  }
  
  interface TransformationStep {
    resultElements?: string[];
  }
}

interface TransformationExecutionPanelProps {
  onShowModel?: (modelId: string) => void;
}

const TransformationExecutionPanel: React.FC<TransformationExecutionPanelProps> = ({
  onShowModel
}) => {
  // State for execution configuration
  const [executionName, setExecutionName] = useState<string>('');
  const [sourceModelId, setSourceModelId] = useState<string>('');
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [executionStrategy, setExecutionStrategy] = useState<'sequential' | 'priority' | 'interactive'>('sequential');
  const [maxIterations, setMaxIterations] = useState<number>(100);
  const [inPlace, setInPlace] = useState<boolean>(true);
  
  // State for execution status
  const [currentExecution, setCurrentExecution] = useState<TransformationExecution | null>(null);
  const [executionStatus, setExecutionStatus] = useState<string>('');
  const [executionSteps, setExecutionSteps] = useState<TransformationStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  
  // State for result visualization
  const [tabValue, setTabValue] = useState<number>(0);
  const [sourceModel, setSourceModel] = useState<Model | null>(null);
  const [resultModel, setResultModel] = useState<Model | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [visualizationWidth, setVisualizationWidth] = useState<number>(800);
  const [visualizationHeight, setVisualizationHeight] = useState<number>(400);
  
  // Available data
  const [rules, setRules] = useState<TransformationRule[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [executions, setExecutions] = useState<TransformationExecution[]>([]);
  
  // Load initial data
  useEffect(() => {
    loadData();
    
    // Set up resize handler for visualization
    const handleResize = () => {
      const width = Math.min(window.innerWidth - 100, 800);
      const height = Math.min(window.innerHeight - 300, 400);
      setVisualizationWidth(width);
      setVisualizationHeight(height);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // Update source model whenever sourceModelId changes
  useEffect(() => {
    if (sourceModelId) {
      const model = modelService.getModelById(sourceModelId);
      if (model) {
        setSourceModel(model);
      }
    }
  }, [sourceModelId]);
  
  const loadData = () => {
    const allRules = transformationService.getAllRules();
    setRules(allRules);
    
    const allModels = modelService.getAllModels();
    setModels(allModels);
    
    if (allModels.length > 0 && !sourceModelId) {
      setSourceModelId(allModels[0].id);
    }
    
    const allExecutions = transformationService.getAllExecutions();
    setExecutions(allExecutions);
  };
  
  // Create a new execution
  const createExecution = () => {
    if (!sourceModelId || selectedRuleIds.length === 0) {
      setExecutionStatus('Please select a source model and at least one rule.');
      return;
    }
    
    const name = executionName || `Transformation_${new Date().toISOString().slice(0, 10)}`;
    
    const execution = transformationService.createTransformationExecution(
      name,
      selectedRuleIds,
      sourceModelId,
      undefined, // Target model ID (undefined for now)
      inPlace,
      maxIterations,
      executionStrategy
    );
    
    setCurrentExecution(execution);
    setExecutions([...executions, execution]);
    setExecutionStatus(`Execution "${name}" created successfully.`);
    setExecutionSteps([]);
    setCurrentStepIndex(-1);
    setTabValue(0); // Switch to configuration tab
  };
  
  // Execute the transformation
  const executeTransformation = () => {
    if (!currentExecution) return;
    
    // Update execution status to Executing
    setExecutionStatus('Executing...');
    console.log('Starting transformation execution:', currentExecution.id);
    
    // Get diagram ID from URL or context
    const urlParams = new URLSearchParams(window.location.search);
    const diagramId = urlParams.get('diagramId');
    
    console.log(`Checking for diagram ID in context: ${diagramId}`);
    
    // Execute transformation in a timeout to allow UI to update
    setTimeout(() => {
      try {
        let success = false;
        
        // If we have a diagram ID, use the diagram transformation
        if (diagramId) {
          console.log(`Executing diagram transformation with diagram ID: ${diagramId}`);
          // Use executeDiagramTransformation which will apply changes to the diagram
          success = transformationService.executeDiagramTransformation(currentExecution.id, diagramId);
        } else {
          // Otherwise use the regular model transformation
          console.log('No diagram ID found - using regular model transformation');
          success = transformationService.executeTransformation(currentExecution.id);
        }
        
        if (success) {
          // Get the updated execution
          const updatedExecution = transformationService.getExecutionById(currentExecution.id);
          
          // Update state with null check
          if (updatedExecution) {
            setCurrentExecution(updatedExecution);
            
            console.log('Transformation execution completed:', {
              executionId: updatedExecution.id,
              status: updatedExecution.status,
              steps: updatedExecution.stepResults?.length || 0,
              diagramId: diagramId
            });
            
            if (updatedExecution.stepResults) {
              setExecutionSteps(updatedExecution.stepResults);
              // Set current step to the first step
              setCurrentStepIndex(updatedExecution.stepResults.length > 0 ? 0 : -1);
              
              // Log the steps to see what elements were affected
              console.log('Transformation steps:', updatedExecution.stepResults.map(step => ({
                ruleId: step.ruleId,
                appliedElements: step.appliedElements,
                resultElements: step.resultElements,
                diagramElements: step.diagramElements
              })));
            }
            
            // If there's a result model, load it
            if (updatedExecution.resultModelId) {
              const resultModel = modelService.getModelById(updatedExecution.resultModelId);
              if (resultModel) {
                setResultModel(resultModel);
                console.log('Result model:', resultModel.id, 'with', resultModel.elements.length, 'elements');
              }
            }
            
            setExecutionStatus('Transformation executed successfully.');
            setTabValue(1); // Switch to results tab
            
            // If showing the model is enabled, update the view
            if (onShowModel && updatedExecution.resultModelId) {
              onShowModel(updatedExecution.resultModelId);
            }
          }
        } else {
          setExecutionStatus('Transformation execution failed.');
          console.error('Transformation execution failed - check that rules match diagram elements');
        }
      } catch (error) {
        setExecutionStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
        console.error('Transformation execution error:', error);
      }
    }, 100);
  };

// Download the current execution configuration as JSON
  const downloadExecutionAsJson = () => {
    if (!currentExecution) return;
    
    const filename = `${currentExecution.name.replace(/\s+/g, '_')}.json`;
    const success = transformationService.downloadExecutionAsJsonFile(currentExecution.id, filename);
    
    if (success) {
      setExecutionStatus(`Execution configuration downloaded as ${filename}`);
    } else {
      setExecutionStatus('Failed to download execution configuration');
    }
  };
  
  // Handle rule file import
  const handleRuleImport = () => {
    // Refresh the rules list after import
    const allRules = transformationService.getAllRules();
    setRules(allRules);
    
    // Also refresh executions in case they were imported
    const allExecutions = transformationService.getAllExecutions();
    setExecutions(allExecutions);
    
    setExecutionStatus('Rules imported successfully');
  };
  
  // Execute next step (for interactive mode)
  const executeNextStep = () => {
    if (!currentExecution || currentExecution.strategy !== 'interactive') {
      return;
    }
    
    console.log('Executing next step in interactive mode');
    
    // Get the current model ID
    const modelId = currentExecution.sourceModelId;
    
    // Find the next rule to apply
    const nextRuleId = currentExecution.ruleIds.find(ruleId => {
      const rule = rules.find(r => r.id === ruleId);
      return rule && rule.enabled;
    });
    
    if (!nextRuleId) {
      console.log('No more rules to apply');
      setExecutionStatus('No more rules to apply.');
      return;
    }
    
    const ruleName = getRuleName(nextRuleId);
    console.log('Attempting to apply rule:', ruleName);
    
    // Apply the rule
    const result = transformationService.applyRule(nextRuleId, modelId);
    
    console.log('Rule application result:', {
      ruleId: nextRuleId,
      ruleName,
      success: result.success,
      matchedElements: result.step?.appliedElements || [],
      createdElements: result.step?.resultElements || []
    });
    
    if (result.success && result.step) {
      // Add the step to the execution
      const updatedSteps = [...(currentExecution.stepResults || []), result.step];
      
      // Update the execution
      transformationService.updateExecution(currentExecution.id, {
        stepResults: updatedSteps,
        resultModelId: result.resultModelId
      });
      
      // Update the current execution
      const updatedExecution = transformationService.getExecutionById(currentExecution.id);
      
      if (updatedExecution) {
        setCurrentExecution(updatedExecution);
        setExecutionSteps(updatedExecution.stepResults || []);
        // Fix for possible undefined error
        const stepsLength = updatedExecution.stepResults?.length || 0;
        setCurrentStepIndex(stepsLength > 0 ? stepsLength - 1 : -1);
        
        // Get the updated result model
        if (result.resultModelId) {
          const resultModel = modelService.getModelById(result.resultModelId);
          if (resultModel) {
            setResultModel(resultModel);
            console.log('Result model updated:', resultModel.id, 'with', resultModel.elements.length, 'elements');
          }
        }
        
        setExecutionStatus(`Step executed. Rule "${ruleName}" applied successfully.`);
        setTabValue(1); // Switch to results tab
        
        // If showing the model is enabled, update the view
        if (onShowModel) {
          onShowModel(result.resultModelId);
        }
      }
    } else {
      console.log(`Rule "${ruleName}" could not be applied. No pattern match found.`);
      setExecutionStatus(`Rule "${ruleName}" could not be applied.`);
    }
  };
  
  // Reset execution
  const resetExecution = () => {
    setCurrentExecution(null);
    setExecutionSteps([]);
    setCurrentStepIndex(-1);
    setExecutionStatus('');
    setResultModel(null);
    setTabValue(0); // Switch back to configuration tab
  };
  
  const getRuleName = (ruleId: string): string => {
    const rule = rules.find(r => r.id === ruleId);
    return rule ? rule.name : ruleId;
  };
  
  const getModelName = (modelId: string): string => {
    const model = models.find(m => m.id === modelId);
    return model ? model.name : modelId;
  };
  
  // Render the execution steps in a stepper
  const renderExecutionSteps = () => {
    if (!executionSteps || executionSteps.length === 0) {
      return (
        <Box p={2}>
          <Alert severity="info">
            No transformation steps executed yet. Run the transformation to see results here.
          </Alert>
        </Box>
      );
    }
    
    return (
      <Stepper activeStep={currentStepIndex} orientation="vertical">
        {executionSteps.map((step, index) => {
          const ruleName = getRuleName(step.ruleId);
          const isActive = index === currentStepIndex;
          
          return (
            <Step key={index} completed={index < currentStepIndex}>
              <StepLabel
                onClick={() => setCurrentStepIndex(index)}
                StepIconComponent={() => (
                  <CheckCircleOutlineIcon 
                    color={isActive ? "primary" : "action"} 
                  />
                )}
              >
                <Typography 
                  variant="subtitle2"
                  color={isActive ? "primary" : "textPrimary"}
                >
                  Step {index + 1}: Rule "{ruleName}"
                </Typography>
              </StepLabel>
              <StepContent>
                <Box p={1}>
                  <Typography variant="body2" gutterBottom>
                    <strong>Applied Elements:</strong>
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                    {step.appliedElements?.map(elementId => (
                      <Chip 
                        key={elementId} 
                        label={elementId.substring(0, 8)} 
                        size="small" 
                        variant="outlined"
                        onClick={() => setSelectedElementId(elementId)}
                      />
                    ))}
                  </Box>
                  
                  <Typography variant="body2" gutterBottom>
                    <strong>Modified/Created Elements:</strong>
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {step.resultElements?.map(elementId => (
                      <Chip 
                        key={elementId} 
                        label={elementId.substring(0, 8)} 
                        size="small"
                        color="primary"
                        variant="outlined"
                        onClick={() => setSelectedElementId(elementId)}
                      />
                    ))}
                  </Box>
                </Box>
              </StepContent>
            </Step>
          );
        })}
      </Stepper>
    );
  };
  
  // Render configuration tab
  const renderConfigurationTab = () => (
    <Box p={2}>
      <Grid container spacing={2}>
        <Grid sx={{ gridColumn: 'span 12' }}>
          <TextField
            label="Execution Name"
            fullWidth
            value={executionName}
            onChange={(e) => setExecutionName(e.target.value)}
            placeholder="Enter a name for this transformation execution"
            variant="outlined"
            margin="normal"
          />
        </Grid>
        
        <Grid sx={{ gridColumn: 'span 12' }}>
          <FormControl fullWidth variant="outlined" margin="normal">
            <InputLabel>Source Model</InputLabel>
            <Select
              value={sourceModelId}
              onChange={(e) => setSourceModelId(e.target.value as string)}
              label="Source Model"
            >
              {models.map(model => (
                <MenuItem key={model.id} value={model.id}>
                  {model.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        
        <Grid sx={{ gridColumn: 'span 12' }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <FormControl fullWidth variant="outlined">
              <InputLabel>Add Rule</InputLabel>
              <Select
                value=""
                label="Add Rule"
                onChange={(e) => {
                  const ruleId = e.target.value as string;
                  if (ruleId) {
                    // Add the selected rule to the list
                    setSelectedRuleIds([...selectedRuleIds, ruleId]);
                    // Reset the select after adding
                    e.target.value = "";
                  }
                }}
                displayEmpty
              >
                {rules.map(rule => (
                  <MenuItem key={rule.id} value={rule.id}>
                    {rule.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button 
              variant="outlined" 
              onClick={() => {
                if (rules.length > 0) {
                  // Add the first rule by default
                  setSelectedRuleIds([...selectedRuleIds, rules[0].id]);
                }
              }}
              sx={{ mt: 1 }}
            >
              Add Rule
            </Button>
          </Box>
          
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Selected Rules:
            </Typography>
            
            {selectedRuleIds.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No rules selected. Please add at least one rule.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {selectedRuleIds.map((ruleId, index) => (
                  <Chip
                    key={`${ruleId}-${index}`}
                    label={getRuleName(ruleId)}
                    onDelete={() => {
                      // Remove this specific rule instance from the list
                      const newSelectedRules = [...selectedRuleIds];
                      newSelectedRules.splice(index, 1);
                      setSelectedRuleIds(newSelectedRules);
                    }}
                  />
                ))}
              </Box>
            )}
          </Paper>
        </Grid>
        
        <Grid sx={{ gridColumn: 'span 12' }}>
          <FormControl fullWidth variant="outlined" margin="normal">
            <InputLabel>Execution Strategy</InputLabel>
            <Select
              value={executionStrategy}
              onChange={(e) => setExecutionStrategy(e.target.value as 'sequential' | 'priority' | 'interactive')}
              label="Execution Strategy"
            >
              <MenuItem value="sequential">Sequential</MenuItem>
              <MenuItem value="priority">Priority-based</MenuItem>
              <MenuItem value="interactive">Interactive (Step-by-step)</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        
        <Grid sx={{ gridColumn: 'span 12' }}>
          <FormControl fullWidth variant="outlined" margin="normal">
            <TextField
              label="Max Iterations"
              type="number"
              value={maxIterations}
              onChange={(e) => setMaxIterations(parseInt(e.target.value) || 1)}
              InputProps={{ inputProps: { min: 1, max: 1000 } }}
            />
          </FormControl>
        </Grid>
        
        <Grid sx={{ gridColumn: 'span 12' }}>
          <FormControl fullWidth variant="outlined" margin="normal">
            <InputLabel>Transformation Mode</InputLabel>
            <Select
              value={inPlace ? "in-place" : "out-of-place"}
              onChange={(e) => setInPlace(e.target.value === "in-place")}
              label="Transformation Mode"
            >
              <MenuItem value="in-place">In-place (modify source model)</MenuItem>
              <MenuItem value="out-of-place">Out-of-place (create new model)</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        
        <Grid sx={{ gridColumn: 'span 12' }}>
          <Box display="flex" gap={2}>
            <RuleFileUploader onRulesImported={handleRuleImport} />

            <Button
              variant="contained"
              color="primary"
              onClick={createExecution}
              disabled={!sourceModelId || selectedRuleIds.length === 0}
            >
              Create Execution
            </Button>
          </Box>
        </Grid>
        
        {currentExecution && (
          <Grid sx={{ gridColumn: 'span 12' }}>
            <Card>
              <CardHeader
                title={currentExecution.name}
                subheader={`Model: ${getModelName(currentExecution.sourceModelId)}`}
                action={
                  <Box>
                    <Tooltip title="Download execution configuration">
                      <IconButton onClick={downloadExecutionAsJson}>
                        <DownloadIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                }
              />
              <CardContent>
                <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
                  <Chip 
                    label={`Strategy: ${currentExecution.strategy}`}
                    variant="outlined" 
                    size="small"
                  />
                  <Chip 
                    label={`Max Iterations: ${currentExecution.maxIterations}`}
                    variant="outlined" 
                    size="small"
                  />
                  <Chip 
                    label={inPlace ? "In-place" : "Out-of-place"}
                    variant="outlined" 
                    size="small"
                    color={inPlace ? "primary" : "secondary"}
                  />
                </Box>
                
                <Box display="flex" gap={1}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={executeTransformation}
                    startIcon={<PlayArrowIcon />}
                    disabled={currentExecution.status === 'in_progress'}
                  >
                    Execute
                  </Button>
                  
                  {currentExecution.strategy === 'interactive' && (
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={executeNextStep}
                      startIcon={<SkipNextIcon />}
                      disabled={currentExecution.status === 'in_progress'}
                    >
                      Next Step
                    </Button>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}
        
        {executionStatus && (
          <Grid sx={{ gridColumn: 'span 12' }}>
            <Alert severity="info">{executionStatus}</Alert>
          </Grid>
        )}
      </Grid>
    </Box>
  );
  
  // Render a simple visualization of the model
  const renderModelVisualization = (model: Model | null, title: string) => {
    if (!model) {
      return (
        <Box sx={{ 
          width: '100%', 
          height: 300, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          border: '1px dashed #ccc',
          borderRadius: 1
        }}>
          <Typography variant="body2" color="text.secondary">
            No model available
          </Typography>
        </Box>
      );
    }

    // Get the metamodel to access element types
    const metamodel = metamodelService.getMetamodelById(model.conformsTo);
    
    return (
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardHeader 
          title={title}
          subheader={`${model.elements.length} elements`}
          action={
            <IconButton onClick={() => onShowModel && onShowModel(model.id)}>
              <VisibilityIcon />
            </IconButton>
          }
        />
        <CardContent>
          <Stage width={visualizationWidth / 2 - 40} height={300}>
            <Layer>
              {/* Draw a grid in the background */}
              {Array.from({ length: 20 }).map((_, i) => (
                <React.Fragment key={`grid-${i}`}>
                  <Line
                    points={[0, i * 30, visualizationWidth / 2 - 40, i * 30]}
                    stroke="#f0f0f0"
                    strokeWidth={1}
                  />
                  <Line
                    points={[i * 30, 0, i * 30, 300]}
                    stroke="#f0f0f0"
                    strokeWidth={1}
                  />
                </React.Fragment>
              ))}
              
              {/* Draw connections between elements */}
              {model.connections && model.connections.map((connection, index) => {
                const sourceElement = model.elements.find(e => e.id === connection.sourceId);
                const targetElement = model.elements.find(e => e.id === connection.targetId);
                
                if (!sourceElement || !targetElement) return null;
                
                // Get positions from element style or calculate default
                const sourcePos = sourceElement.style.position || {
                  x: 50 + (index % 5) * 100,
                  y: 50 + Math.floor(index / 5) * 80
                };
                
                const targetPos = targetElement.style.position || {
                  x: 50 + ((index + 2) % 5) * 100,
                  y: 50 + Math.floor((index + 2) / 5) * 80
                };
                
                return (
                  <Arrow
                    key={`conn-${index}`}
                    points={[
                      sourcePos.x + 100, // right side of source
                      sourcePos.y + 20, // middle of source
                      targetPos.x, // left side of target
                      targetPos.y + 20 // middle of target
                    ]}
                    stroke="#555"
                    strokeWidth={1}
                    pointerLength={5}
                    pointerWidth={5}
                  />
                );
              })}
              
              {/* Draw the model elements */}
              {model.elements.map((element, index) => {
                // Get position from element style or calculate default
                const pos = element.style.position || {
                  x: 50 + (index % 4) * 150,
                  y: 50 + Math.floor(index / 4) * 100
                };
                
                // Get the metamodel class
                const metaClass = metamodel?.classes.find(c => c.id === element.modelElementId);
                
                // Calculate element dimensions
                const width = 120;
                const headerHeight = 30;
                const attributeHeight = 20;
                
                // Calculate attributes to display (only show first few to fit)
                const attributes = Object.entries(element.style)
                  .filter(([key]) => key !== 'position')
                  .slice(0, 3); // Show only the first 3 attributes to avoid overflow
                
                const height = headerHeight + (attributes.length * attributeHeight);
                
                return (
                  <Group key={element.id} x={pos.x} y={pos.y}>
                    {/* Element background */}
                    <Rect
                      width={width}
                      height={height}
                      fill="#fff"
                      stroke="#ccc"
                      strokeWidth={1}
                      cornerRadius={4}
                      shadowColor="rgba(0,0,0,0.2)"
                      shadowBlur={5}
                      shadowOffsetX={2}
                      shadowOffsetY={2}
                      shadowOpacity={0.5}
                    />
                    
                    {/* Element header */}
                    <Rect
                      width={width}
                      height={headerHeight}
                      fill="#f5f5f5"
                      stroke="#ccc"
                      strokeWidth={1}
                      cornerRadius={[4, 4, 0, 0]}
                    />
                    
                    {/* Element name/type */}
                    <Text
                      x={10}
                      y={10}
                      text={metaClass?.name || 'Element'}
                      fontSize={14}
                      fontFamily="Arial"
                      fontStyle="bold"
                      fill="#333"
                      width={width - 20}
                      ellipsis
                    />
                    
                    {/* Element properties */}
                    {attributes.map(([key, value], attrIndex) => (
                      <Group key={`${element.id}-${key}`} y={headerHeight + (attrIndex * attributeHeight)}>
                        <Rect
                          width={width}
                          height={attributeHeight}
                          fill={attrIndex % 2 === 0 ? "#fafafa" : "#f0f0f0"}
                        />
                        <Text
                          x={5}
                          y={5}
                          text={`${key.substring(0, 6)}:`}
                          fontSize={10}
                          fontFamily="Arial"
                          fill="#555"
                          width={(width / 2) - 10}
                          ellipsis
                        />
                        <Text
                          x={(width / 2) + 5}
                          y={5}
                          text={value?.toString().substring(0, 10) || ''}
                          fontSize={10}
                          fontFamily="Arial"
                          fill="#333"
                          width={(width / 2) - 10}
                          ellipsis
                        />
                      </Group>
                    ))}
                  </Group>
                );
              })}
            </Layer>
          </Stage>
        </CardContent>
      </Card>
    );
  };
  
  // Render comparison view of source and result models
  const renderModelComparison = () => {
    // If current execution and result model exists
    if (!currentExecution || !currentExecution.resultModelId) {
      return (
        <Alert severity="info" sx={{ mt: 2 }}>
          No transformation results available. Execute a transformation to see results.
        </Alert>
      );
    }
    
    return (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <CompareArrowsIcon color="primary" sx={{ fontSize: 40 }} />
        </Box>
        
        <Grid container spacing={2}>
          <Grid sx={{ gridColumn: { xs: 'span 12', md: 'span 6' } }}>
            {renderModelVisualization(sourceModel, 'Source Model')}
          </Grid>
          <Grid sx={{ gridColumn: { xs: 'span 12', md: 'span 6' } }}>
            {renderModelVisualization(resultModel, 'Result Model')}
          </Grid>
        </Grid>
        
        {/* Detailed view of changes */}
        {currentExecution && currentStepIndex >= 0 && executionSteps[currentStepIndex] && (
          <Box sx={{ mt: 3 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Changes Applied
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <Grid container spacing={2}>
                <Grid sx={{ gridColumn: 'span 12' }}>
                  <Typography variant="subtitle1" gutterBottom>
                    Rule: {getRuleName(executionSteps[currentStepIndex].ruleId)}
                  </Typography>
                  
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                    <Chip 
                      icon={<CheckCircleOutlineIcon />} 
                      label={`Applied to ${executionSteps[currentStepIndex].appliedElements.length} elements`} 
                      color="primary" 
                      variant="outlined" 
                    />
                    {executionSteps[currentStepIndex].resultElements && 
                     Array.isArray(executionSteps[currentStepIndex].resultElements) && 
                     executionSteps[currentStepIndex].resultElements!.length > 0 && (
                      <Chip 
                        icon={<CompareArrowsIcon />} 
                        label={`Modified/created ${executionSteps[currentStepIndex].resultElements!.length} elements`} 
                        color="secondary" 
                        variant="outlined" 
                      />
                    )}
                  </Box>
                  
                  <Grid container spacing={2}>
                    <Grid sx={{ gridColumn: { xs: 'span 12', md: 'span 6' } }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Elements matched in pattern:
                      </Typography>
                      <Paper variant="outlined" sx={{ p: 1, maxHeight: 300, overflow: 'auto' }}>
                        <List dense>
                          {executionSteps[currentStepIndex].appliedElements.map((elementId, index) => {
                            const element = sourceModel?.elements.find(e => e.id === elementId);
                            if (!element) return null;
                            
                            // Get the metaclass for this element
                            const metaclass = element.modelElementId 
                              ? metamodelService.getMetamodelById(sourceModel?.conformsTo || '')
                                  ?.classes.find(c => c.id === element.modelElementId)
                              : undefined;
                            
                            const nameValue = element.style?.name || '';
                            const idValue = element.id.substring(0, 8);
                            
                            return (
                              <ListItem key={elementId} divider>
                                <ListItemText 
                                  primary={
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                      <Typography variant="body2" fontWeight="bold">
                                        {nameValue || `Element ${index + 1}`}
                                      </Typography>
                                      <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                                        ({idValue})
                                      </Typography>
                                    </Box>
                                  } 
                                  secondary={`Type: ${metaclass?.name || element?.modelElementId || 'Unknown'}`}
                                />
                              </ListItem>
                            );
                          })}
                        </List>
                      </Paper>
                    </Grid>
                    
                    {executionSteps[currentStepIndex]?.resultElements && 
                     Array.isArray(executionSteps[currentStepIndex]?.resultElements) && 
                     executionSteps[currentStepIndex]?.resultElements!.length > 0 && (
                      <Grid sx={{ gridColumn: { xs: 'span 12', md: 'span 6' } }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          Elements modified/created:
                        </Typography>
                        <Paper variant="outlined" sx={{ p: 1, maxHeight: 300, overflow: 'auto' }}>
                          <List dense>
                            {executionSteps[currentStepIndex]?.resultElements!.map((elementId, index) => {
                              const element = resultModel?.elements.find(e => e.id === elementId);
                              if (!element) return null;
                              
                              // Get the metaclass for this element
                              const metaclass = element.modelElementId 
                                ? metamodelService.getMetamodelById(resultModel?.conformsTo || '')
                                    ?.classes.find(c => c.id === element.modelElementId)
                                : undefined;
                                
                              const nameValue = element.style?.name || '';
                              const idValue = element.id.substring(0, 8);
                              
                              return (
                                <ListItem key={`result-${elementId}`} divider>
                                  <ListItemText 
                                    primary={
                                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Typography variant="body2" fontWeight="bold">
                                          {nameValue || `Element ${index + 1}`}
                                        </Typography>
                                        <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                                          ({idValue})
                                        </Typography>
                                      </Box>
                                    }
                                    secondary={`Type: ${metaclass?.name || element?.modelElementId || 'Unknown'}`}
                                  />
                                </ListItem>
                              );
                            })}
                          </List>
                        </Paper>
                      </Grid>
                    )}
                  </Grid>
                </Grid>
              </Grid>
            </Paper>
          </Box>
        )}
      </Box>
    );
  };
  
  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Transformation Execution
      </Typography>
      
      <Tabs 
        value={tabValue} 
        onChange={(_, newValue) => setTabValue(newValue)}
        sx={{ mb: 2 }}
      >
        <Tab label="Configuration" />
        <Tab 
          label="Results" 
          disabled={!currentExecution || !resultModel}
        />
      </Tabs>
      
      {tabValue === 0 ? (
        renderConfigurationTab()
      ) : (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Transformation Results
          </Typography>
          <Divider sx={{ mb: 2 }} />
          
          {renderModelComparison()}
        </Paper>
      )}
    </Box>
  );
};

export default TransformationExecutionPanel; 