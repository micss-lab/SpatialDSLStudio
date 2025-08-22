import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, 
  Button, 
  Grid, 
  Paper, 
  Typography, 
  Tabs, 
  Tab, 
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import CodeIcon from '@mui/icons-material/Code';
import { Stage, Layer, Rect, Circle, Line, Arrow, Text, Group, Label, Tag } from 'react-konva';
import 'konva/lib/shapes/Path';
import { 
  TransformationRule, 
  TransformationPattern, 
  PatternElement, 
  Metamodel, 
  MetaClass,
  MetaReference,
  Expression
} from '../../models/types';
import { transformationService } from '../../services/transformation.service';
import { metamodelService } from '../../services/metamodel.service';
import RuleDownloadButton from './RuleDownloadButton';
import ExpressionEditor from './ExpressionEditor';
import { expressionService } from '../../services/expression.service';

interface TransformationRuleEditorProps {
  selectedRuleId?: string;
  onRuleSelect?: (ruleId: string) => void;
}

const TransformationRuleEditor: React.FC<TransformationRuleEditorProps> = ({
  selectedRuleId,
  onRuleSelect
}) => {
  // State for rule management
  const [rules, setRules] = useState<TransformationRule[]>([]);
  const [selectedRule, setSelectedRule] = useState<TransformationRule | null>(null);
  const [ruleName, setRuleName] = useState<string>('');
  const [ruleDescription, setRuleDescription] = useState<string>('');
  const [rulePriority, setRulePriority] = useState<number>(0);
  
  // State for patterns
  const [patterns, setPatterns] = useState<TransformationPattern[]>([]);
  const [selectedLhsId, setSelectedLhsId] = useState<string>('');
  const [selectedRhsId, setSelectedRhsId] = useState<string>('');
  const [selectedNacIds, setSelectedNacIds] = useState<string[]>([]);
  
  // State for pattern editing
  const [activeTab, setActiveTab] = useState<number>(0);
  const [currentPattern, setCurrentPattern] = useState<TransformationPattern | null>(null);
  const [patternName, setPatternName] = useState<string>('');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  
  // Reference drawing state
  const [isDrawingReference, setIsDrawingReference] = useState<boolean>(false);
  const [referenceStartElement, setReferenceStartElement] = useState<PatternElement | null>(null);
  const [selectedReferenceId, setSelectedReferenceId] = useState<string>('');
  const [availableReferences, setAvailableReferences] = useState<MetaReference[]>([]);
  const [isReferenceDialogOpen, setIsReferenceDialogOpen] = useState<boolean>(false);
  const [referenceTarget, setReferenceTarget] = useState<string>('');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  // Metamodel information
  const [metamodels, setMetamodels] = useState<Metamodel[]>([]);
  const [selectedMetamodelId, setSelectedMetamodelId] = useState<string>('');
  const [selectedMetamodel, setSelectedMetamodel] = useState<Metamodel | null>(null);
  
  // Canvas properties
  const [stageWidth, setStageWidth] = useState<number>(800);
  const [stageHeight, setStageHeight] = useState<number>(400);
  
  // Create a ref for the canvas container
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  
  // State for dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMetaclassId, setSelectedMetaclassId] = useState<string>('');
  
  // Add temp reference points state
  const [tempReferencePoints, setTempReferencePoints] = useState<Array<{x: number, y: number}> | null>(null);
  
  // Add isAddingElement state variable near the other state variables
  const [isAddingElement, setIsAddingElement] = useState<boolean>(false);
  
  // Global expression editor state
  const [isGlobalExpressionEditorOpen, setIsGlobalExpressionEditorOpen] = useState<boolean>(false);
  const [globalExpression, setGlobalExpression] = useState<Expression | string>('');
  const [patternType, setPatternType] = useState<'LHS' | 'RHS' | 'NAC'>('LHS');
  
  // Modify the addReference function to include reference attributes
  const [referenceAttributes, setReferenceAttributes] = useState<Record<string, any>>({});
  
  // Add state for tracking selected reference
  const [selectedReferenceInfo, setSelectedReferenceInfo] = useState<{
    sourceId: string;
    refName: string;
    targetId: string;
  } | null>(null);
  
  // Add state for reference attributes dialog
  const [isReferenceAttributesDialogOpen, setIsReferenceAttributesDialogOpen] = useState(false);
  
  // Render global expression editor dialog
  const renderGlobalExpressionEditorDialog = () => {
    return (
      <Dialog
        open={isGlobalExpressionEditorOpen}
        onClose={() => setIsGlobalExpressionEditorOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ borderBottom: '1px solid #e0e0e0', pb: 1 }}>
          Global Expression Editor - {currentPattern?.type || ''} Pattern
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body2" color="text.secondary" paragraph>
            Create and edit expressions that apply to the entire {currentPattern?.type || ''} pattern.
            These expressions can be used for pattern-wide constraints or calculations.
          </Typography>
          
          <ExpressionEditor
            expression={globalExpression}
            availableElements={currentPattern?.elements || []}
            onChange={(newExpression) => {
              setGlobalExpression(newExpression);
              
              // Save the expression to the pattern
              if (currentPattern) {
                const updatedPattern = {
                  ...currentPattern,
                  globalExpression: newExpression
                };
                
                // Update the pattern in the transformation service
                transformationService.updatePattern(currentPattern.id, updatedPattern);
                
                // Update current pattern state
                setCurrentPattern(updatedPattern);
              }
            }}
            label={`${currentPattern?.type || ''} Pattern Expression`}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #f0f0f0' }}>
          <Button
            onClick={() => setIsGlobalExpressionEditorOpen(false)}
            variant="outlined"
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  };
  
  // Helper function to find element at position
  const findElementAtPosition = (x: number, y: number): PatternElement | null => {
    if (!currentPattern) return null;
    
    // Check each element to see if position is inside it
    for (const element of currentPattern.elements) {
      const position = element.position || { x: 0, y: 0 };
      const sourceWidth = 170; // Default width for pattern elements
      
      // Calculate height based on element type and attributes
      const metaclass = getMetaclassById(element.type);
      const attributesCount = metaclass?.attributes?.length || 0;
      const headerHeight = 30;
      const attributeHeight = 20;
      let height = headerHeight + (attributesCount * attributeHeight);
      
      // Ensure minimum height
      height = Math.max(height, 60);
      
      // Add some padding to make selection easier (wider hit area)
      const padding = 5;
      
      if (
        x >= (position.x - padding) && 
        x <= (position.x + sourceWidth + padding) && 
        y >= (position.y - padding) && 
        y <= (position.y + height + padding)
      ) {
        return element;
      }
    }
    
    return null;
  };
  
  // First, update the renderAddReferenceDialog function to better match the DiagramEditor style and fix selection issues
  const renderAddReferenceDialog = () => {
    return (
      <Dialog 
        open={isReferenceDialogOpen} 
        onClose={() => cancelReferenceDrawing()}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Select Reference Type</DialogTitle>
        <DialogContent>
          <Typography variant="body2" paragraph>
            Select which reference type to use:
          </Typography>
          <List sx={{ 
            border: '1px solid #e0e0e0', 
            borderRadius: 1,
            maxHeight: '300px',
            overflow: 'auto'
          }}>
            {availableReferences.map((reference) => (
              <ListItem 
                key={reference.id}
                component="div"
                sx={{ 
                  cursor: 'pointer', 
                  backgroundColor: selectedReferenceId === reference.id 
                    ? 'rgba(25, 118, 210, 0.12)' 
                    : 'transparent',
                  '&:hover': { 
                    backgroundColor: selectedReferenceId === reference.id 
                      ? 'rgba(25, 118, 210, 0.2)' 
                      : 'rgba(0, 0, 0, 0.04)' 
                  },
                  borderBottom: '1px solid #f0f0f0'
                }}
                onClick={() => {
                  // Select the reference when clicked but don't close the dialog yet
                  setSelectedReferenceId(reference.id);
                }}
              >
                <ListItemText
                  primary={
                    <Typography variant="subtitle1" fontWeight={selectedReferenceId === reference.id ? 'bold' : 'normal'}>
                      {reference.name}
                      {reference.isInherited && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          (inherited)
                        </Typography>
                      )}
                    </Typography>
                  }
                  secondary={
                    <Box>
                      <Typography variant="body2">
                        Target: {selectedMetamodel?.classes.find(c => c.id === reference.target)?.name || 'Unknown'}
                        {reference.allowSelfReference && ' (Allows self-reference)'}
                      </Typography>
                      {reference.isInherited && (
                        <Typography variant="caption" color="text.secondary">
                          Inherited from {selectedMetamodel?.classes.find(c => c.id === reference.inheritedFrom)?.name || 'superclass'}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button 
            onClick={() => cancelReferenceDrawing()}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button 
            onClick={() => {
              if (selectedReferenceId) {
                addReference(selectedReferenceId);
              }
            }} 
            disabled={!selectedReferenceId}
            color="primary"
            variant="contained"
            startIcon={<i className="fas fa-link" />}
          >
            Create Reference
          </Button>
        </DialogActions>
      </Dialog>
    );
  };
  
  // Add effect to reset state when drawing reference is canceled
  useEffect(() => {
    if (!isDrawingReference) {
      setReferenceStartElement(null);
      setReferenceTarget('');
      setTempReferencePoints(null);
      
      // Only reset these if we're not in a dialog
      if (!isReferenceDialogOpen && !isReferenceAttributesDialogOpen) {
        setSelectedReferenceId('');
        setReferenceAttributes({});
      }
    }
  }, [isDrawingReference, isReferenceDialogOpen, isReferenceAttributesDialogOpen]);
  
  // Handler functions for rule editing
  const handleRuleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedRule) return;
    setRuleName(e.target.value);
    
    // Immediately save the rule name change
    transformationService.updateRule(selectedRule.id, { 
      name: e.target.value 
    });
    
    // Update the rules list to reflect changes
    setRules(transformationService.getAllRules());
  };
  
  const handleRuleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedRule) return;
    setRuleDescription(e.target.value);
    
    // Immediately save the description change
    transformationService.updateRule(selectedRule.id, { 
      description: e.target.value 
    });
  };
  
  const handleRulePriorityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedRule) return;
    const newPriority = Number(e.target.value) || 0;
    setRulePriority(newPriority);
    
    // Immediately save the priority change
    transformationService.updateRule(selectedRule.id, { 
      priority: newPriority 
    });
    
    // Update the rules list to reflect changes
    setRules(transformationService.getAllRules());
  };
  
  // Reset pattern function
  const resetPattern = () => {
    if (!currentPattern) return;
    // Reset the pattern to its original state by reloading it from the service
    const refreshedPattern = transformationService.getPatternById(currentPattern.id);
    if (refreshedPattern) {
      setCurrentPattern(refreshedPattern);
      setPatternName(refreshedPattern.name);
      
      // Reset reference drawing state
      setIsDrawingReference(false);
      setReferenceStartElement(null);
      setReferenceTarget('');
      setSelectedReferenceId('');
      setTempReferencePoints(null);
    }
  };
  
  // Load data on component mount
  useEffect(() => {
    const allRules = transformationService.getAllRules();
    setRules(allRules);
    
    const allPatterns = transformationService.getAllPatterns();
    setPatterns(allPatterns);
    
    const allMetamodels = metamodelService.getAllMetamodels();
    setMetamodels(allMetamodels);
    
    if (allMetamodels.length > 0) {
      setSelectedMetamodelId(allMetamodels[0].id);
      setSelectedMetamodel(allMetamodels[0]);
    }
    
    // If a rule ID is provided, select it
    if (selectedRuleId) {
      const rule = allRules.find(r => r.id === selectedRuleId);
      if (rule) {
        selectRule(rule);
      }
    }
    
    // Set up resize handler - Removed in favor of ResizeObserver
    // No longer needed as we're using ResizeObserver for responsive canvas
  }, [selectedRuleId]);
  
  // Helper function to robustly update a pattern element
  const updatePatternElement = (patternId: string, elementId: string, updatedElement: Partial<PatternElement>) => {
    if (!patternId || !elementId) {
      console.error("Cannot update element: missing pattern ID or element ID");
      return false;
    }
    
    console.log(`Updating element ${elementId} in pattern ${patternId}`, updatedElement);
    
    // First, get the current pattern and element
    const pattern = transformationService.getPatternById(patternId);
    if (!pattern) {
      console.error(`Pattern not found: ${patternId}`);
      return false;
    }
    
    const existingElement = pattern.elements.find(e => e.id === elementId);
    if (!existingElement) {
      console.error(`Element not found: ${elementId} in pattern ${patternId}`);
      return false;
    }
    
    // Merge the updated properties with the existing element
    const mergedElement = {
      ...existingElement,
      ...updatedElement
    };
    
    // Update the element in the pattern
    const success = transformationService.updatePatternElement(
      patternId,
      elementId,
      mergedElement
    );
    
    if (success) {
      // If this is the current pattern, update it directly in the state
      if (currentPattern && currentPattern.id === patternId) {
        setCurrentPattern({
          ...currentPattern,
          elements: currentPattern.elements.map(el => 
            el.id === elementId ? mergedElement : el
          )
        });
        
        // Also update the patterns array
        setPatterns(prevPatterns => 
          prevPatterns.map(p => {
            if (p.id === patternId) {
              return {
                ...p,
                elements: p.elements.map(el => 
                  el.id === elementId ? mergedElement : el
                )
              };
            }
            return p;
          })
        );
      }
      
      console.log(`Successfully updated element ${elementId} in pattern ${patternId}`);
      return true;
    } else {
      console.error(`Failed to update element ${elementId} in pattern ${patternId}`);
      return false;
    }
  };
  
  // Helper function to save the current pattern before switching tabs
  const saveCurrentPattern = () => {
    if (!currentPattern) return;
    
    console.log("Saving current pattern before tab switch:", currentPattern.id);
    
    // Save the pattern to the transformation service
    transformationService.updatePattern(currentPattern.id, {
      ...currentPattern, 
      // Make sure we use the latest pattern name
      name: patternName
    });
    
    // Update the patterns array with the latest version of the current pattern
    setPatterns(prevPatterns => 
      prevPatterns.map(p => p.id === currentPattern.id ? currentPattern : p)
    );
  };
  
  // Track first render to avoid unnecessary saves
  const isInitialRender = useRef(true);
  
  // Update current pattern when tab changes
  useEffect(() => {
    if (!selectedRule) return;
    
    // Don't save on the initial render
    if (isInitialRender.current) {
      isInitialRender.current = false;
    }
    
    if (activeTab === 0 && selectedLhsId) {
      const lhsPattern = patterns.find(p => p.id === selectedLhsId);
      if (lhsPattern) {
        setCurrentPattern(lhsPattern);
        setPatternName(lhsPattern.name);
      } else if (patterns.length > 0) {
        // If the selected LHS pattern doesn't exist, create a new one
        const newPattern = transformationService.createPattern(`${ruleName || 'New'}_LHS`, 'LHS');
        setPatterns([...patterns, newPattern]);
        setSelectedLhsId(newPattern.id);
        setCurrentPattern(newPattern);
        setPatternName(newPattern.name);
        
        // Update the rule
        if (selectedRule) {
          transformationService.updateRule(selectedRule.id, { lhs: newPattern.id });
        }
      }
    } else if (activeTab === 1 && selectedRhsId) {
      const rhsPattern = patterns.find(p => p.id === selectedRhsId);
      if (rhsPattern) {
        setCurrentPattern(rhsPattern);
        setPatternName(rhsPattern.name);
      } else if (patterns.length > 0) {
        // If the selected RHS pattern doesn't exist, create a new one
        const newPattern = transformationService.createPattern(`${ruleName || 'New'}_RHS`, 'RHS');
        setPatterns([...patterns, newPattern]);
        setSelectedRhsId(newPattern.id);
        setCurrentPattern(newPattern);
        setPatternName(newPattern.name);
        
        // Update the rule
        if (selectedRule) {
          transformationService.updateRule(selectedRule.id, { rhs: newPattern.id });
        }
      }
    } else if (activeTab === 2) {
      if (selectedNacIds.length > 0) {
        const nacPattern = patterns.find(p => p.id === selectedNacIds[0]);
        if (nacPattern) {
          setCurrentPattern(nacPattern);
          setPatternName(nacPattern.name);
        } else {
          // Filter out invalid NAC IDs
          const validNacIds = selectedNacIds.filter(id => patterns.some(p => p.id === id));
          setSelectedNacIds(validNacIds);
          
          if (validNacIds.length > 0) {
            const nacPattern = patterns.find(p => p.id === validNacIds[0]);
            if (nacPattern) {
              setCurrentPattern(nacPattern);
              setPatternName(nacPattern.name);
            }
          } else {
            // Create a new NAC pattern if none exists
            const newPattern = transformationService.createPattern(`${ruleName || 'New'}_NAC`, 'NAC');
            setPatterns([...patterns, newPattern]);
            setSelectedNacIds([newPattern.id]);
            setCurrentPattern(newPattern);
            setPatternName(newPattern.name);
            
            // Update the rule
            if (selectedRule) {
              transformationService.updateRule(selectedRule.id, { nacs: [newPattern.id] });
            }
          }
        }
      } else {
        // No NAC selected, but tab is on NAC - create a new one
        const newPattern = transformationService.createPattern(`${ruleName || 'New'}_NAC`, 'NAC');
        setPatterns([...patterns, newPattern]);
        setSelectedNacIds([newPattern.id]);
        setCurrentPattern(newPattern);
        setPatternName(newPattern.name);
        
        // Update the rule
        if (selectedRule) {
          transformationService.updateRule(selectedRule.id, { nacs: [newPattern.id] });
        }
      }
    }
  }, [activeTab, selectedLhsId, selectedRhsId, selectedNacIds, patterns, selectedRule]);
  
  // Handle rule selection
  const selectRule = (rule: TransformationRule) => {
    setSelectedRule(rule);
    setRuleName(rule.name);
    setRuleDescription(rule.description || '');
    setRulePriority(rule.priority);
    
    // Validate pattern IDs before setting them
    const lhsExists = patterns.some(p => p.id === rule.lhs);
    const rhsExists = patterns.some(p => p.id === rule.rhs);
    const validNacs = rule.nacs.filter(id => patterns.some(p => p.id === id));
    
    setSelectedLhsId(lhsExists ? rule.lhs : '');
    setSelectedRhsId(rhsExists ? rule.rhs : '');
    setSelectedNacIds(validNacs);
    
    // If selected patterns don't exist, update the rule
    if (!lhsExists || !rhsExists || validNacs.length !== rule.nacs.length) {
      const updates: Partial<TransformationRule> = {};
      if (!lhsExists) updates.lhs = '';
      if (!rhsExists) updates.rhs = '';
      if (validNacs.length !== rule.nacs.length) updates.nacs = validNacs;
      
      if (Object.keys(updates).length > 0) {
        transformationService.updateRule(rule.id, updates);
        // Refresh rules after update
        setRules(transformationService.getAllRules());
      }
    }
    
    // Find the active pattern based on the selected tab
    let activePatternId = '';
    if (activeTab === 0) {
      activePatternId = lhsExists ? rule.lhs : '';
    } else if (activeTab === 1) {
      activePatternId = rhsExists ? rule.rhs : '';
    } else if (activeTab === 2 && validNacs.length > 0) {
      activePatternId = validNacs[0];
    }
    
    // Set the current pattern if it exists
    if (activePatternId) {
      const activePattern = patterns.find(p => p.id === activePatternId);
      if (activePattern) {
        setCurrentPattern(activePattern);
        setPatternName(activePattern.name);
      }
    }
    
    if (onRuleSelect) {
      onRuleSelect(rule.id);
    }
  };
  
  // Create a new rule
  const createNewRule = () => {
    const newRuleName = 'New Rule';
    
    // Create default LHS and RHS patterns
    const lhsPattern = transformationService.createPattern(`${newRuleName}_LHS`, 'LHS');
    const rhsPattern = transformationService.createPattern(`${newRuleName}_RHS`, 'RHS');
    
    // Create the rule
    const newRule = transformationService.createRule(
      newRuleName,
      lhsPattern.id,
      rhsPattern.id,
      [],
      rulePriority
    );
    
    // Update state
    setRules([...rules, newRule]);
    setPatterns([...patterns, lhsPattern, rhsPattern]);
    setRuleName(newRuleName);
    setSelectedRule(newRule);
    setSelectedLhsId(lhsPattern.id);
    setSelectedRhsId(rhsPattern.id);
    setSelectedNacIds([]);
    setCurrentPattern(lhsPattern);
    setPatternName(lhsPattern.name);
    setActiveTab(0);
  };
  
  // Save current rule
  const saveRule = () => {
    if (!selectedRule) return;
    
    console.log("===== SAVE RULE DEBUGGING =====");
    console.log("Rule before save:", selectedRule);
    
    // Log LHS pattern if it exists
    if (selectedLhsId) {
      const lhsPattern = transformationService.getPatternById(selectedLhsId);
      console.log("LHS Pattern:", lhsPattern);
      if (lhsPattern) {
        console.log("LHS elements:", lhsPattern.elements);
        // Log details of each element
        lhsPattern.elements.forEach((element, index) => {
          console.log(`LHS Element ${index + 1}:`, {
            id: element.id,
            name: element.name,
            type: element.type,
            attributes: element.attributes
          });
        });
      }
    }
    
    // Log RHS pattern if it exists
    if (selectedRhsId) {
      const rhsPattern = transformationService.getPatternById(selectedRhsId);
      console.log("RHS Pattern:", rhsPattern);
      if (rhsPattern) {
        console.log("RHS elements:", rhsPattern.elements);
        // Log details of each element
        rhsPattern.elements.forEach((element, index) => {
          console.log(`RHS Element ${index + 1}:`, {
            id: element.id,
            name: element.name,
            type: element.type,
            attributes: element.attributes
          });
        });
      }
    }
    
    const updatedRule: Partial<TransformationRule> = {
      name: ruleName,
      description: ruleDescription,
      priority: rulePriority,
      lhs: selectedLhsId,
      rhs: selectedRhsId,
      nacs: selectedNacIds
    };
    
    console.log("Updated rule to save:", updatedRule);
    
    transformationService.updateRule(selectedRule.id, updatedRule);
    console.log("Rule saved successfully");
    
    // Update the rules list
    const updatedRules = transformationService.getAllRules();
    setRules(updatedRules);
    
    // Update the selected rule
    const updatedSelectedRule = updatedRules.find(r => r.id === selectedRule.id);
    if (updatedSelectedRule) {
      setSelectedRule(updatedSelectedRule);
      console.log("Selected rule updated:", updatedSelectedRule);
    }
    
    console.log("===== END SAVE RULE DEBUGGING =====");
  };
  
  // Delete current rule
  const deleteRule = () => {
    if (!selectedRule) return;
    
    // Confirm deletion
    if (window.confirm(`Are you sure you want to delete rule "${selectedRule.name}"?`)) {
      transformationService.deleteRule(selectedRule.id);
      
      // Update the rules list
      setRules(transformationService.getAllRules());
      setSelectedRule(null);
      setRuleName('');
      setRuleDescription('');
      setRulePriority(0);
      setSelectedLhsId('');
      setSelectedRhsId('');
      setSelectedNacIds([]);
    }
  };
  
  // Create a new pattern
  const createNewPattern = (type: 'LHS' | 'RHS' | 'NAC') => {
    const name = `${ruleName || 'New'}_${type}`;
    const newPattern = transformationService.createPattern(name, type);
    
    // Update patterns state
    setPatterns([...patterns, newPattern]);
    
    // Set as selected pattern for the appropriate type
    if (type === 'LHS') {
      setSelectedLhsId(newPattern.id);
    } else if (type === 'RHS') {
      setSelectedRhsId(newPattern.id);
    } else if (type === 'NAC') {
      setSelectedNacIds([...selectedNacIds, newPattern.id]);
    }
    
    // Update the rule
    if (selectedRule) {
      const updates: Partial<TransformationRule> = {};
      
      if (type === 'LHS') {
        updates.lhs = newPattern.id;
      } else if (type === 'RHS') {
        updates.rhs = newPattern.id;
      } else if (type === 'NAC') {
        updates.nacs = [...selectedNacIds, newPattern.id];
      }
      
      transformationService.updateRule(selectedRule.id, updates);
      setRules(transformationService.getAllRules());
    }
    
    // Set as current pattern
    setCurrentPattern(newPattern);
    setPatternName(newPattern.name);
  };
  
  // Save current pattern
  const savePattern = () => {
    if (!currentPattern) return;
    
    transformationService.updatePattern(currentPattern.id, {
      name: patternName
    });
    
    // Update patterns state
    setPatterns(transformationService.getAllPatterns());
  };
  
  // Add new element to pattern
  const addPatternElement = () => {
    if (!currentPattern || !selectedMetamodel) {
      console.error("Cannot add element: no current pattern or metamodel selected");
      return;
    }

    // Get available metaclasses from the metamodel
    const metaclasses = selectedMetamodel.classes.filter(c => !c.abstract) || [];
    
    if (metaclasses.length === 0) {
      alert('No metaclasses available in the selected metamodel.');
      return;
    }
    
    // Set the first metaclass as default selection
    setSelectedMetaclassId(metaclasses[0].id);
    
    // Show dialog to select metaclass
    setDialogOpen(true);
  };
  
  // Delete pattern element
  const deletePatternElement = (elementId: string) => {
    if (!currentPattern) {
      console.error("Cannot delete element: no current pattern selected");
      return;
    }
    
    const result = transformationService.deletePatternElement(currentPattern.id, elementId);
    
    if (!result) {
      console.error(`Failed to delete element ${elementId} from pattern ${currentPattern.id}`);
      return;
    }
    
    // Update the current pattern directly
    setCurrentPattern({
      ...currentPattern,
      elements: currentPattern.elements.filter(e => e.id !== elementId)
    });
    
    // Clear selected element if it was the one deleted
    if (selectedElementId === elementId) {
      setSelectedElementId(null);
    }
  };
  
  // Get metaclass by ID
  const getMetaclassById = (classId: string): MetaClass | undefined => {
    if (!selectedMetamodel) return undefined;
    return selectedMetamodel.classes.find(c => c.id === classId);
  };

  // Get all attributes including inherited ones
  const getAllAttributes = (classId: string): any[] => {
    if (!selectedMetamodel) return [];
    
    const collectAttributes = (currentClassId: string, visited = new Set<string>()): any[] => {
      // Prevent infinite recursion
      if (visited.has(currentClassId)) return [];
      visited.add(currentClassId);
      
      const currentClass = selectedMetamodel.classes.find(c => c.id === currentClassId);
      if (!currentClass) return [];
      
      // Start with this class's own attributes
      let allAttributes = [...(currentClass.attributes || [])];
      
      // Add attributes from supertypes
      if (currentClass.superTypes && currentClass.superTypes.length > 0) {
        for (const superTypeId of currentClass.superTypes) {
          const inheritedAttributes = collectAttributes(superTypeId, visited);
          // Add inherited attributes, avoiding duplicates by name
          for (const inheritedAttr of inheritedAttributes) {
            const existingAttr = allAttributes.find(attr => attr.name === inheritedAttr.name);
            if (!existingAttr) {
              // Mark as inherited for visual distinction
              allAttributes.push({
                ...inheritedAttr,
                isInherited: true,
                inheritedFrom: superTypeId
              });
            }
          }
        }
      }
      
      return allAttributes;
    };
    
    return collectAttributes(classId);
  };

  // Get all references including inherited ones
  const getAllReferences = (classId: string): any[] => {
    if (!selectedMetamodel) return [];
    
    const collectReferences = (currentClassId: string, visited = new Set<string>()): any[] => {
      // Prevent infinite recursion
      if (visited.has(currentClassId)) return [];
      visited.add(currentClassId);
      
      const currentClass = selectedMetamodel.classes.find(c => c.id === currentClassId);
      if (!currentClass) return [];
      
      // Start with this class's own references
      let allReferences = [...(currentClass.references || [])];
      
      // Add references from supertypes
      if (currentClass.superTypes && currentClass.superTypes.length > 0) {
        for (const superTypeId of currentClass.superTypes) {
          const inheritedReferences = collectReferences(superTypeId, visited);
          // Add inherited references, avoiding duplicates by name
          for (const inheritedRef of inheritedReferences) {
            const existingRef = allReferences.find(ref => ref.name === inheritedRef.name);
            if (!existingRef) {
              // Mark as inherited for visual distinction
              allReferences.push({
                ...inheritedRef,
                isInherited: true,
                inheritedFrom: superTypeId
              });
            }
          }
        }
      }
      
      return allReferences;
    };
    
    return collectReferences(classId);
  };
  
  // Get color scheme for pattern elements based on pattern type
  const getPatternColors = (patternType: 'LHS' | 'RHS' | 'NAC', isSelected: boolean) => {
    switch(patternType) {
                  case 'LHS':
                    return {
                      header: isSelected ? '#e3f2fd' : '#f5f5f5',
                      headerText: '#0d47a1',
                      border: isSelected ? '#1976d2' : '#bbdefb'
                    };
                  case 'RHS':
                    return {
                      header: isSelected ? '#e8f5e9' : '#f5f5f5',
                      headerText: '#1b5e20',
                      border: isSelected ? '#2e7d32' : '#a5d6a7'
                    };
                  case 'NAC':
                    return {
                      header: isSelected ? '#ffebee' : '#f5f5f5',
                      headerText: '#b71c1c',
                      border: isSelected ? '#c62828' : '#ef9a9a'
                    };
                  default:
                    return {
                      header: isSelected ? '#e3f2fd' : '#f5f5f5',
                      headerText: '#0d47a1',
                      border: isSelected ? '#1976d2' : '#bbdefb'
                    };
                }
  };
  
  // Update renderTempReference to support bend points
  const renderTempReference = () => {
    if (!isDrawingReference || !selectedElementId || !currentPattern) return null;
    
    // Get the source element
    const sourceElement = currentPattern.elements.find(e => e.id === selectedElementId);
    if (!sourceElement) return null;
    
    // Get source element position and dimensions
    const sourcePos = sourceElement.position || { x: 0, y: 0 };
    const sourceWidth = 170; // Default width
    const sourceHeight = 60; // Default height
    
    // Calculate source center
    const sourceX = sourcePos.x + sourceWidth / 2;
    const sourceY = sourcePos.y + sourceHeight / 2;
    
    // Create points array starting with the source element
    let points = [sourceX, sourceY];
    
    // Add any temporary bend points
    if (tempReferencePoints && tempReferencePoints.length > 0) {
      tempReferencePoints.forEach(point => {
        // Use the exact coordinates of the bend point
        points.push(point.x, point.y);
      });
    }
    
    // Get current mouse position, using fallback if not available
    // Don't add any transformations here - the mouse coordinates are already in the right space
    const mouseX = mousePos.x || sourceX + 100;
    const mouseY = mousePos.y || sourceY;
    
    // Add current mouse position to the points array
    points.push(mouseX, mouseY);
    
    // Validate points to prevent drawing errors
    for (let i = 0; i < points.length; i++) {
      if (isNaN(points[i])) {
        console.error('Invalid point coordinate at index', i, 'points:', points);
        return null;
      }
    }
    
    // Create a visual representation of the temporary reference
    return (
      <Group>
        {/* Main arrow line */}
        <Arrow
          points={points}
          stroke="#2196f3"
          fill="#2196f3"
          dash={[5, 5]}
          strokeWidth={2}
          pointerLength={8}
          pointerWidth={8}
          lineCap="round"
          lineJoin="round"
        />
        
        {/* Visualize bend points */}
        {tempReferencePoints && tempReferencePoints.length > 0 && 
          tempReferencePoints.map((point, index) => (
            <Circle
              key={`bend-point-${index}`}
              x={point.x}
              y={point.y}
              radius={6}
              fill="#2196f3"
              stroke="#ffffff"
              strokeWidth={2}
            />
          ))
        }
        
        {/* User guidance text */}
        <Text
          x={mouseX + 10}
          y={mouseY - 20}
          text={!referenceTarget ? "Click to add bend point" : "Release to connect"}
          fontSize={12}
          fontFamily="Arial"
          fill="#2196f3"
          padding={4}
          background="#ffffff"
        />
      </Group>
    );
  };
  
  // Dialog for selecting metaclass
  const renderMetaclassSelectionDialog = () => {
    return (
      <Dialog 
        open={dialogOpen} 
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ borderBottom: '1px solid #e0e0e0', pb: 1 }}>
          Select Element Type
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body2" color="text.secondary" paragraph>
            Choose the type of element to add to the pattern:
          </Typography>
          <FormControl fullWidth variant="outlined">
            <InputLabel>Element Type</InputLabel>
            <Select
              value={selectedMetaclassId}
              label="Element Type"
              onChange={(e) => setSelectedMetaclassId(e.target.value as string)}
              size="small"
            >
                                {selectedMetamodel?.classes.filter(c => !c.abstract).map((metaclass) => {
                    const inheritedAttributeCount = getAllAttributes(metaclass.id).filter(attr => attr.isInherited).length;
                    const directAttributeCount = getAllAttributes(metaclass.id).filter(attr => !attr.isInherited).length;
                    const inheritedReferenceCount = getAllReferences(metaclass.id).filter(ref => ref.isInherited).length;
                    const directReferenceCount = getAllReferences(metaclass.id).filter(ref => !ref.isInherited).length;
                    
                    return (
                      <MenuItem key={metaclass.id} value={metaclass.id}>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {metaclass.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {directAttributeCount} attribute{directAttributeCount !== 1 ? 's' : ''}
                            {inheritedAttributeCount > 0 && ` (+${inheritedAttributeCount} inherited)`}
                            {(directReferenceCount > 0 || inheritedReferenceCount > 0) && (
                              <>
                                {', '}
                                {directReferenceCount} reference{directReferenceCount !== 1 ? 's' : ''}
                                {inheritedReferenceCount > 0 && ` (+${inheritedReferenceCount} inherited)`}
                              </>
                            )}
                          </Typography>
                        </Box>
                      </MenuItem>
                    );
                  })}
            </Select>
          </FormControl>
          
          {selectedMetaclassId && (
            <Box sx={{ mt: 3, p: 2, border: '1px solid #e0e0e0', borderRadius: 1, bgcolor: '#f8f8f8' }}>
              <Typography variant="subtitle2" gutterBottom>
                Selected Type Properties
              </Typography>
              {(() => {
                const metaclass = selectedMetamodel?.classes.find(c => c.id === selectedMetaclassId);
                if (!metaclass) return null;
                
                return (
                  <>
                    <Typography variant="body2" paragraph>
                      <strong>Type:</strong> {metaclass.name}
                    </Typography>
                    
                    {metaclass.attributes && metaclass.attributes.length > 0 && (
                      <>
                        <Typography variant="body2" gutterBottom>
                          <strong>Attributes:</strong> {metaclass.attributes.map(a => a.name).join(', ')}
                        </Typography>
                      </>
                    )}
                    
                    {metaclass.references && metaclass.references.length > 0 && (
                      <Typography variant="body2">
                        <strong>Available References:</strong> {metaclass.references.map(r => r.name).join(', ')}
                      </Typography>
                    )}
                  </>
                );
              })()}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #f0f0f0' }}>
          <Button 
            onClick={() => setDialogOpen(false)}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button 
            onClick={() => {
              if (!currentPattern || !selectedMetaclassId) {
                console.error("Cannot create element: missing pattern or metaclass");
                return;
              }
              
              // Create a default name
              const metaclass = selectedMetamodel?.classes.find(c => c.id === selectedMetaclassId);
              const defaultName = `${metaclass?.name || 'Element'}_${Date.now().toString().slice(-4)}`;
              
              console.log("==== ADDING PATTERN ELEMENT ====");
              console.log("Current Pattern:", currentPattern);
              console.log("Selected Metaclass:", metaclass);
              
              // Debug attribute creation
              if (metaclass && metaclass.attributes) {
                console.log("Metaclass attributes:", metaclass.attributes);
                console.log("These are the attribute NAMES used in models:");
                metaclass.attributes.forEach(attr => {
                  console.log(`- ${attr.name}  (value will be stored in models as style.${attr.name})`);
                });
                
                console.log("These are the attribute IDs used in patterns:");
                metaclass.attributes.forEach(attr => {
                  console.log(`- ${attr.id}  (corresponds to the '${attr.name}' attribute)`);
                });
                
                console.log("IMPORTANT: Each attribute needs to be stored by both ID and name to ensure proper matching");
              }
              
              // Calculate a default position for the new element
              const elementCount = currentPattern.elements.length;
              const defaultPosition = {
                x: 100 + (elementCount % 3) * 200,
                y: 100 + Math.floor(elementCount / 3) * 120
              };
              
              // Add the element to the pattern with a position
              const newElement = transformationService.addPatternElement(
                currentPattern.id,
                defaultName,
                selectedMetaclassId
              );
              
              if (!newElement) {
                console.error("Failed to create new element in pattern:", currentPattern.id);
                alert("Failed to create new element. Please try again.");
              } else {
                console.log("Successfully created element:", newElement);
                
                // Add position to the element
                transformationService.updatePatternElement(
                  currentPattern.id,
                  newElement.id,
                  { position: defaultPosition }
                );
                
                // Reload the pattern to ensure we have the latest data
                const updatedPattern = transformationService.getPatternById(currentPattern.id);
                if (updatedPattern) {
                  setCurrentPattern(updatedPattern);
                }
              }
              
              // Close dialog
              setDialogOpen(false);
            }}
            color="primary"
            variant="contained"
            startIcon={<AddIcon />}
            disabled={!selectedMetaclassId}
          >
            Add Element
          </Button>
        </DialogActions>
      </Dialog>
    );
  };
  
  // Add a function to render the reference attributes dialog
  const renderReferenceAttributesDialog = () => {
    // Check if the selected reference has attributes
    if (!selectedReferenceId || !currentPattern) return null;
    
    // Get the reference definition from the metamodel
    if (!selectedElementId) return null;
    const sourceElement = currentPattern.elements.find(e => e.id === selectedElementId);
    if (!sourceElement) return null;
    
    const sourceMetaclass = getMetaclassById(sourceElement.type);
    if (!sourceMetaclass) return null;
    
    // Find the reference using the same logic as in addReference
    let reference = sourceMetaclass.references.find(r => r.id === selectedReferenceId);
    
    if (!reference && availableReferences.length > 0) {
      reference = availableReferences.find(r => r.id === selectedReferenceId);
    }
    
    if (!reference || !reference.attributes || reference.attributes.length === 0) return null;
    
    return (
      <Dialog 
        open={isReferenceAttributesDialogOpen}
        onClose={() => setIsReferenceAttributesDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ borderBottom: '1px solid #e0e0e0', pb: 1 }}>
          {reference.name} Reference Attributes
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body2" color="text.secondary" paragraph>
            Configure additional properties for this reference:
          </Typography>
          
          {reference.attributes.map(attr => (
            <TextField
              key={attr.id}
              fullWidth
              label={attr.name}
              value={referenceAttributes[attr.name] || ''}
              onChange={(e) => {
                setReferenceAttributes(prev => ({
                  ...prev,
                  [attr.name]: e.target.value
                }));
              }}
              margin="normal"
              size="small"
              variant="outlined"
            />
          ))}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #f0f0f0' }}>
          <Button 
            onClick={() => {
              setIsReferenceAttributesDialogOpen(false);
              setReferenceAttributes({});
            }}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button 
            onClick={() => {
              // Continue with reference creation including attributes
              addReferenceWithAttributes(selectedReferenceId, referenceAttributes);
              setIsReferenceAttributesDialogOpen(false);
            }}
            color="primary"
            variant="contained"
          >
            Apply Attributes
          </Button>
        </DialogActions>
      </Dialog>
    );
  };
  
  // Handle mouse movement for reference drawing
  const handleMouseMove = (e: any) => {
    // Get the stage and pointer position
    const stage = e.target.getStage();
    if (!stage) return;
    
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;
    
    // Always store the mouse position for any interaction that needs it
    setMousePos({
      x: pointerPos.x,
      y: pointerPos.y
    });
    
    // Log if we're drawing a reference
    if (isDrawingReference) {
      console.log('Updated mouse position for reference drawing:', pointerPos);
    }
  };

  // Start drawing a reference from the selected element
  const startDrawingReference = () => {
    if (!selectedElementId || !currentPattern) return;
    
    // Find the element by ID
    const element = currentPattern.elements.find(el => el.id === selectedElementId);
    if (!element) {
      console.error('Element not found:', selectedElementId);
      return;
    }
    
    // Get the metaclass for this element
    const metaclass = getMetaclassById(element.type);
    if (!metaclass) {
      console.error('Metaclass not found for element type:', element.type);
      return;
    }
    
    // Store available references for later (including inherited ones)
    const refs = getAllReferences(element.type);
    setAvailableReferences(refs);
    
    if (refs.length === 0) {
      alert('This element type has no available references to draw.');
      return;
    }
    
    console.log('Starting reference drawing from element:', element.name, '(ID:', element.id, ')');
    
    // Reset any temporary bend points from previous reference creation
    setTempReferencePoints(null);
    
    // Clear the reference target
    setReferenceTarget('');
    
    // Set the reference start element
    setReferenceStartElement(element);
    
    // Enable drawing mode
    setIsDrawingReference(true);
  };
  
  // Handle stage click for adding pattern elements and references
  const handleStageClick = (e: any) => {
    // Get the stage and pointer position
    const stage = e.target.getStage();
    if (!stage) return;
    
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;
    
    const { x, y } = pointerPos;
    
    console.log('Stage click detected at:', { x, y }, 'Target:', e.target.name());
    
    // Drawing a reference
    if (isDrawingReference && selectedElementId && currentPattern) {
      console.log('In reference drawing mode, checking for elements at', {x, y});
      console.log('Currently selected element ID (source):', selectedElementId);
      
      // Find the element at the clicked position
      const targetElement = findElementAtPosition(x, y);
      
      // If we clicked on an element, treat it as the target for the reference
      if (targetElement) {
        console.log('Found target element:', targetElement.name, '(ID:', targetElement.id, ')');
        
        // Don't allow self-references unless explicitly allowed
        const sourceElement = currentPattern.elements.find(e => e.id === selectedElementId);
        if (!sourceElement) {
          console.error('Source element not found:', selectedElementId);
          return;
        }
        
        // Get the source element's metaclass
        const sourceMetaclass = getMetaclassById(sourceElement.type);
        if (!sourceMetaclass) {
          console.error('Source metaclass not found for element type:', sourceElement.type);
          return;
        }
        
        // Get the target element's metaclass
        const targetMetaclass = getMetaclassById(targetElement.type);
        if (!targetMetaclass) {
          console.error('Target metaclass not found for element type:', targetElement.type);
          return;
        }
        
        // Check if this is a self-reference
        const isSelfReference = targetElement.id === selectedElementId;
        
        console.log('Is self-reference?', isSelfReference);
        console.log('Source metaclass:', sourceMetaclass.name);
        console.log('Target metaclass:', targetMetaclass.name);
        
        if (isSelfReference) {
          // Filter to references that specifically allow self-references
          const selfReferences = availableReferences.filter(ref => 
            ref.target === sourceMetaclass.id && ref.allowSelfReference === true
          );
          
          setAvailableReferences(selfReferences);
        } else {
          // This is not a self-reference, it's a reference to a different element
          // Filter references based on the target metaclass type, and also include compatible references
          
          console.log('Available references before filtering:', availableReferences.map(ref => ({
            id: ref.id,
            name: ref.name,
            target: ref.target,
            targetName: selectedMetamodel?.classes.find(c => c.id === ref.target)?.name
          })));
          
          // Check if target is compatible with any of the available references
          const compatibleReferences = availableReferences.filter(ref => {
            // Direct match
            if (ref.target === targetMetaclass.id) return true;
            
            // Check if target is a subtype of the reference's target type
            return isSubtypeOf(targetMetaclass.id, ref.target);
          });
          
          console.log('Compatible references after filtering:', compatibleReferences.map(ref => ref.name));
          
          setAvailableReferences(compatibleReferences);
        }
        
        // Store the target element ID
        setReferenceTarget(targetElement.id);
        
        // If there are no compatible references, show an error
        if (availableReferences.length === 0) {
          alert(`No compatible references found from ${sourceMetaclass.name} to ${targetMetaclass.name}`);
          cancelReferenceDrawing();
          return;
        }
        
        // Show the reference selection dialog
        setIsReferenceDialogOpen(true);
      } else {
        // If we clicked on empty space, add a bend point
        console.log('Adding bend point at', {x, y});
        
        // Add to the existing bend points or create a new array
        setTempReferencePoints(prev => {
          if (prev) {
            return [...prev, { x, y }];
          }
          return [{ x, y }];
        });
      }
    }
  };
  
  // Helper function to check if a type is a subtype of another
  const isSubtypeOf = (typeId: string, potentialSuperTypeId: string): boolean => {
    if (!selectedMetamodel) return false;
    if (typeId === potentialSuperTypeId) return true;
    
    const metaclass = selectedMetamodel.classes.find(c => c.id === typeId);
    if (!metaclass) return false;
    
    // Check direct supertypes
    if (metaclass.superTypes && metaclass.superTypes.includes(potentialSuperTypeId)) {
      return true;
    }
    
    // Check indirect supertypes recursively
    if (metaclass.superTypes) {
      for (const superTypeId of metaclass.superTypes) {
        if (isSubtypeOf(superTypeId, potentialSuperTypeId)) {
          return true;
        }
      }
    }
    
    return false;
  };
  
  // Cancel reference drawing
  const cancelReferenceDrawing = () => {
    setIsDrawingReference(false);
    setReferenceStartElement(null);
    setReferenceTarget('');
    setSelectedReferenceId('');
    setTempReferencePoints(null);
    setIsReferenceDialogOpen(false);
  };
  
  // Add reference between elements
  const addReference = (referenceId: string) => {
    if (!currentPattern || !selectedElementId || !referenceTarget) {
      console.error('Missing required data for reference creation:', {
        selectedElementId,
        referenceTarget,
        currentPattern: currentPattern?.id
      });
      return;
    }
    
    // Get the source element
    const sourceElement = currentPattern.elements.find(e => e.id === selectedElementId);
    if (!sourceElement) {
      console.error('Source element not found:', selectedElementId);
      return;
    }
    
    // Get the reference definition
    const sourceMetaclass = getMetaclassById(sourceElement.type);
    if (!sourceMetaclass) {
      console.error('Source metaclass not found for element type:', sourceElement.type);
      return;
    }
    
    // Find the reference by ID
    let reference = sourceMetaclass.references.find(r => r.id === referenceId);
    
    // If not found in the metaclass, check the available references list
    // (This can happen with inherited references)
    if (!reference && availableReferences.length > 0) {
      reference = availableReferences.find(r => r.id === referenceId);
    }
    
    if (!reference) {
      console.error('Reference not found:', referenceId);
      return;
    }
    
    console.log('Adding reference:', reference.name, 'from', sourceElement.name, 'to element with ID', referenceTarget);
    
    // Check if the reference has attributes
    if (reference.attributes && reference.attributes.length > 0) {
      // Show dialog to collect reference attributes
      setSelectedReferenceId(referenceId);
      setIsReferenceAttributesDialogOpen(true);
      return;
    }
    
    // Otherwise, add the reference directly
    addReferenceWithAttributes(referenceId, {});
  };
  
  // Add reference with attributes
  const addReferenceWithAttributes = (referenceId: string, attributes: Record<string, any> = {}) => {
    if (!currentPattern || !selectedElementId || !referenceTarget) {
      console.error('Missing required data for reference creation:', {
        selectedElementId,
        referenceTarget,
        currentPattern: currentPattern?.id
      });
      return;
    }
    
    // Get the source element
    const sourceElement = currentPattern.elements.find(e => e.id === selectedElementId);
    if (!sourceElement) {
      console.error('Source element not found:', selectedElementId);
      return;
    }
    
    // Create references object if it doesn't exist
    const references = sourceElement.references || {};
    
    // Get the reference definition
    const sourceMetaclass = getMetaclassById(sourceElement.type);
    if (!sourceMetaclass) {
      console.error('Source metaclass not found for element type:', sourceElement.type);
      return;
    }
    
    // Find the reference by ID
    let reference = sourceMetaclass.references.find(r => r.id === referenceId);
    
    // If not found in the metaclass, check the available references list
    if (!reference && availableReferences.length > 0) {
      reference = availableReferences.find(r => r.id === referenceId);
    }
    
    if (!reference) {
      console.error('Reference not found:', referenceId);
      return;
    }
    
    // Handle multivalued references
    const isMultiValued = reference.isMultiValued || 
                         (reference.cardinality && reference.cardinality.upperBound === '*') ||
                         (reference.cardinality && typeof reference.cardinality.upperBound === 'number' && reference.cardinality.upperBound > 1);
                         
    if (isMultiValued) {
      // Create array if it doesn't exist
      if (!references[referenceId] || !Array.isArray(references[referenceId])) {
        references[referenceId] = [];
      }
      
      // Add the target to the array if it's not already there
      const refArray = references[referenceId] as string[];
      if (refArray && !refArray.includes(referenceTarget)) {
        refArray.push(referenceTarget);
      }
    } else {
      // Single-valued reference
      references[referenceId] = referenceTarget;
    }
    
    // Store bend points if any
    if (tempReferencePoints && tempReferencePoints.length > 0) {
      // Use a specific key for bend points that includes the target ID
      // This allows multiple references of the same type to different targets
      const bendPointsKey = `${referenceId}_${referenceTarget}_bendPoints`;
      references[bendPointsKey] = JSON.stringify(tempReferencePoints);
    }
    
    // Store reference attributes if any
    if (Object.keys(attributes).length > 0) {
      const attributesKey = `${referenceId}_attributes`;
      references[attributesKey] = JSON.stringify(attributes);
    }
    
    // Update the element
    const success = transformationService.updatePatternElement(
      currentPattern.id,
      selectedElementId,
      { references }
    );
    
    if (success) {
      console.log('Reference added successfully');
      
      // Update the current pattern directly
      setCurrentPattern({
        ...currentPattern,
        elements: currentPattern.elements.map(el => 
          el.id === selectedElementId ? { ...el, references } : el
        )
      });
    } else {
      console.error('Failed to add reference');
    }
    
    // Reset state
    cancelReferenceDrawing();
  };
  
  // Render the main content based on the selected tab
  const renderPatternEditorContent = () => {
    if (!selectedRule) {
      return (
        <Box sx={{ 
          p: 4, 
          textAlign: 'center', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: '50vh',
          color: 'text.secondary',
          backgroundColor: '#fafafa',
          border: '1px solid #e0e0e0',
          borderRadius: 1
        }}>
          <Typography variant="h6" gutterBottom>
            No Transformation Rule Selected
          </Typography>
          <Typography variant="body1" paragraph sx={{ maxWidth: 500 }}>
            Select a rule from the list or create a new one to start editing patterns.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={createNewRule}
            disabled={!selectedMetamodel}
          >
            Create New Rule
          </Button>
        </Box>
      );
    }
    
    // Rule properties section at the top
    const rulePropertiesSection = (
      <Box sx={{ mb: 3, pb: 2, borderBottom: '1px solid #e0e0e0' }}>
        <Typography variant="h6" gutterBottom>Rule Properties</Typography>
        
        <TextField
          label="Rule Name"
          fullWidth
          value={ruleName}
          onChange={handleRuleNameChange}
          disabled={!selectedRule}
          size="small"
          variant="outlined"
          sx={{ mb: 2 }}
        />
        
        <TextField
          label="Priority"
          type="number"
          fullWidth
          value={rulePriority}
          onChange={handleRulePriorityChange}
          disabled={!selectedRule}
          size="small"
          variant="outlined"
          sx={{ mb: 2 }}
        />
        
        <TextField
          label="Description"
          fullWidth
          multiline
          rows={2}
          value={ruleDescription}
          onChange={handleRuleDescriptionChange}
          disabled={!selectedRule}
          variant="outlined"
          size="small"
          sx={{ mb: 2 }}
        />
        
        {/* Save and delete buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button 
            variant="contained" 
            color="primary" 
            startIcon={<SaveIcon />}
            onClick={saveRule}
            disabled={!selectedRule}
            size="small"
          >
            Save Rule
          </Button>
          
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={deleteRule}
            size="small"
          >
            Delete Rule
          </Button>
        </Box>
      </Box>
    );

    const patternType = activeTab === 0 ? 'LHS' : activeTab === 1 ? 'RHS' : 'NAC';
    const patternId = activeTab === 0 ? selectedLhsId : 
                     activeTab === 1 ? selectedRhsId : 
                     selectedNacIds.length > 0 ? selectedNacIds[0] : '';
    
    // Pattern properties section
    const patternPropertiesSection = currentPattern ? (
      <Box sx={{ mb: 3, pb: 2, borderBottom: '1px solid #e0e0e0' }}>
        <Typography variant="h6" gutterBottom>Pattern Properties</Typography>
        
        <TextField
          label={`${patternType} Pattern Name`}
          value={patternName}
          fullWidth
          variant="outlined"
          size="small"
          onChange={(e) => {
            const newName = e.target.value;
            setPatternName(newName);
            
            if (currentPattern) {
              // Update the pattern name in the service
              transformationService.updatePattern(
                currentPattern.id,
                { name: newName }
              );
              
              // Update the current pattern directly
              setCurrentPattern({
                ...currentPattern,
                name: newName
              });
              
              // Refresh patterns list
              setPatterns(prev => 
                prev.map(p => p.id === currentPattern.id ? {...p, name: newName} : p)
              );
            }
          }}
          sx={{ mb: 2 }}
        />
        
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Tooltip title="Reset Pattern">
            <IconButton color="primary" onClick={resetPattern} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    ) : null;
    
    // Element properties section
    const elementPropertiesSection = (
      <Box>
        <Typography variant="h6" gutterBottom>Element Properties</Typography>
        
        {selectedElementId ? (
          <Box>
            {(() => {
              const element = currentPattern?.elements.find(e => e.id === selectedElementId);
              if (!element) return <Typography>No element selected</Typography>;
              
              const metaclass = getMetaclassById(element.type);
              
              return (
                <>
                  <Box sx={{ 
                    p: 2, 
                    mb: 2, 
                    backgroundColor: '#f8f8f8', 
                    border: '1px solid #e0e0e0',
                    borderRadius: 1
                  }}>
                    <Typography variant="subtitle1" gutterBottom color="primary">
                      Element Details
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      <strong>Type:</strong> {metaclass?.name || 'Unknown'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      <strong>ID:</strong> {element.id.substring(0, 8)}...
                    </Typography>
                  </Box>
                  
                  <TextField
                    fullWidth
                    label="Element Name"
                    value={element.name}
                    margin="normal"
                    size="small"
                    variant="outlined"
                    onChange={(e) => {
                      if (!currentPattern) return;
                      
                      // Use our robust update function
                      updatePatternElement(
                        currentPattern.id,
                        element.id,
                        { name: e.target.value }
                      );
                    }}
                  />
                  
                  <FormControl fullWidth margin="normal" size="small">
                    <InputLabel>Type</InputLabel>
                    <Select
                      value={element.type || ''}
                      label="Type"
                      onChange={(e) => {
                        if (!currentPattern) return;
                        
                        const typeId = e.target.value as string;
                        
                        // Use our robust update function
                        updatePatternElement(
                          currentPattern.id,
                          element.id,
                          { type: typeId }
                        );
                      }}
                    >
                      {selectedMetamodel?.classes.map((metaclass) => (
                        <MenuItem key={metaclass.id} value={metaclass.id}>
                          {metaclass.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  
                  <Box sx={{ mt: 2, mb: 2 }}>
                    <Button
                      variant="outlined"
                      color="primary"
                      size="small"
                      onClick={startDrawingReference}
                      disabled={isDrawingReference}
                      fullWidth
                    >
                      Add Reference
                    </Button>
                  </Box>
                  
                  {(() => {
                    const allAttributes = getAllAttributes(element.type);
                    
                    if (allAttributes.length === 0) return null;
                    
                    return (
                      <Box sx={{ mt: 3 }}>
                        <Typography variant="subtitle2" gutterBottom color="primary">
                          Attributes
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        
                        {allAttributes.map(attr => {
                        const attributeValue = element.attributes?.[attr.id] || '';
                        const isExpression = typeof attributeValue === 'object' && attributeValue !== null && 'type' in attributeValue;
                        
                        return (
                          <Box key={attr.id} sx={{ mb: 2 }}>
                            <ExpressionEditor
                              expression={attributeValue}
                              label={attr.isInherited ? `${attr.name} (inherited)` : attr.name}
                              availableElements={currentPattern?.elements || []}
                              onChange={(newExpr) => {
                                if (!currentPattern) return;
                                
                                const newAttributes: Record<string, string | Expression> = {
                                  ...(element.attributes || {}),
                                  [attr.id]: newExpr
                                };
                                
                                // Also store the attribute by name for better matching
                                if (attr.name) {
                                  newAttributes[attr.name] = newExpr;
                                }
                                
                                // Use our robust update function
                                updatePatternElement(
                                  currentPattern.id,
                                  element.id,
                                  { attributes: newAttributes }
                                );
                              }}
                            />
                            {attr.isInherited && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                Inherited from {selectedMetamodel?.classes.find(c => c.id === attr.inheritedFrom)?.name || 'superclass'}
                              </Typography>
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                    );
                  })()}

                  {/* Display existing references */}
                  {element.references && Object.keys(element.references).filter(key => 
                    !key.endsWith('_bendPoints') && !key.endsWith('_attributes')
                  ).length > 0 && (
                    <Box sx={{ mt: 3 }}>
                      <Typography variant="subtitle2" gutterBottom color="primary">
                        References
                      </Typography>
                      <Divider sx={{ mb: 2 }} />
                      
                      <List sx={{ 
                        border: '1px solid #e0e0e0', 
                        borderRadius: 1,
                        mb: 2,
                        p: 0
                      }}>
                        {Object.entries(element.references).map(([refName, refValue]) => {
                          // Skip special properties
                          if (refName.endsWith('_bendPoints') || refName.endsWith('_attributes')) {
                            return null;
                          }
                          if (!refValue) return null;
                          
                          // Helper to get target element name
                          const getTargetName = (targetId: string) => {
                            const targetElement = currentPattern?.elements.find(e => e.id === targetId);
                            return targetElement ? targetElement.name : 'Unknown';
                          };
                          
                          // Get reference metadata if possible
                          const sourceMetaclass = getMetaclassById(element.type);
                          const reference = sourceMetaclass?.references.find(r => r.id === refName);
                          
                          // Check for attributes
                          const attributesKey = `${refName}_attributes`;
                          const storedAttributes = element.references[attributesKey];
                          const hasAttributes = storedAttributes !== undefined;
                          
                          if (Array.isArray(refValue)) {
                            return (
                              <ListItem 
                                key={refName}
                                sx={{ 
                                  borderBottom: '1px solid #f0f0f0',
                                  backgroundColor: hasAttributes ? 'rgba(33, 150, 243, 0.05)' : 'transparent'
                                }}
                              >
                                <ListItemText
                                  primary={
                                    <Typography variant="body2" fontWeight={hasAttributes ? 'bold' : 'normal'}>
                                      {reference?.name || refName}
                                      {hasAttributes && ' *'}
                                    </Typography>
                                  }
                                  secondary={
                                    <>
                                      <Typography variant="caption" display="block">
                                        Targets: {refValue.map(getTargetName).join(', ')}
                                      </Typography>
                                      {hasAttributes && (
                                        <Typography variant="caption" color="primary">
                                          Has custom attributes
                                        </Typography>
                                      )}
                                    </>
                                  }
                                />
                              </ListItem>
                            );
                          } else {
                            return (
                              <ListItem 
                                key={refName}
                                sx={{ 
                                  borderBottom: '1px solid #f0f0f0',
                                  backgroundColor: hasAttributes ? 'rgba(33, 150, 243, 0.05)' : 'transparent'
                                }}
                              >
                                <ListItemText
                                  primary={
                                    <Typography variant="body2" fontWeight={hasAttributes ? 'bold' : 'normal'}>
                                      {reference?.name || refName}
                                      {hasAttributes && ' *'}
                                    </Typography>
                                  }
                                  secondary={
                                    <>
                                      <Typography variant="caption" display="block">
                                        Target: {getTargetName(refValue)}
                                      </Typography>
                                      {hasAttributes && (
                                        <Typography variant="caption" color="primary">
                                          Has custom attributes
                                        </Typography>
                                      )}
                                    </>
                                  }
                                />
                              </ListItem>
                            );
                          }
                        })}
                      </List>
                    </Box>
                  )}
                  
                  <Box sx={{ mt: 3 }}>
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={() => deletePatternElement(element.id)}
                      fullWidth
                    >
                      Delete Element
                    </Button>
                  </Box>
                </>
              );
            })()}
          </Box>
        ) : (
          <Box sx={{ 
            p: 4, 
            textAlign: 'center', 
            border: '1px dashed #e0e0e0', 
            borderRadius: 1,
            color: 'text.secondary'
          }}>
            <Typography variant="body2" paragraph>
              Select an element to edit its properties
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddIcon />}
              onClick={addPatternElement}
            >
              Add New Element
            </Button>
          </Box>
        )}
      </Box>
    );
    
    return (
      <Box sx={{ height: '100%', overflow: 'auto' }}>
        {/* Rule Properties */}
        {rulePropertiesSection}
        
        {/* Pattern Properties */}
        {patternPropertiesSection}
        
        {/* Element Properties */}
        {elementPropertiesSection}
      </Box>
    );
  };

  // Effect for loading current pattern data when activeTab or selectedRule changes
  useEffect(() => {
    if (!selectedRule) return;
    
    let pattern: TransformationPattern | undefined;
    switch (activeTab) {
      case 0: // LHS
        pattern = transformationService.getPatternById(selectedRule.lhs);
        setPatternType('LHS');
        break;
      case 1: // RHS
        pattern = transformationService.getPatternById(selectedRule.rhs);
        setPatternType('RHS');
        break;
      case 2: // NAC
        if (selectedRule.nacs && selectedRule.nacs.length > 0) {
          pattern = transformationService.getPatternById(selectedRule.nacs[0]);
        }
        setPatternType('NAC');
        break;
    }
    
    if (pattern) {
      setCurrentPattern(pattern);
      setPatternName(pattern.name);
      
      // Set the global expression from the current pattern
      if (pattern.globalExpression) {
        setGlobalExpression(pattern.globalExpression);
      } else {
        setGlobalExpression('');
      }
      
      // Reset state to avoid inconsistency
      setSelectedElementId('');
      setIsDrawingReference(false);
      setReferenceStartElement(null);
    } else {
      setCurrentPattern(null);
    }
  }, [activeTab, selectedRule]);
  
  // Update the pattern visualization to render selectable references
  const renderPatternVisualization = () => {
    if (!currentPattern || currentPattern.elements.length === 0) {
      return (
        <Box sx={{ 
          width: '100%', 
          height: '100%', 
          border: '1px solid #e0e0e0',
          borderRadius: 1,
          backgroundColor: '#fafafa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column'
        }}>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            No elements in this pattern
          </Typography>
          <Button
            variant="outlined"
            color="primary"
            size="small"
            startIcon={<AddIcon />}
            onClick={addPatternElement}
          >
            Add Element
          </Button>
        </Box>
      );
    }
    
    return (
      <Box sx={{ height: '100%', width: '100%', border: '1px solid #e0e0e0', borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
        <Stage 
          width={stageWidth} 
          height={stageHeight}
          onClick={handleStageClick}
          onMouseMove={handleMouseMove}
        >
          <Layer>
            {/* Background grid for visual reference */}
            <Rect
              width={stageWidth}
              height={stageHeight}
              fill="#fafafa"
              name="background"
            />
            {Array.from({ length: Math.ceil(stageWidth/50) }).map((_, i) => (
              <React.Fragment key={`grid-h-${i}`}>
                <Line
                  points={[0, i * 50, stageWidth, i * 50]}
                  stroke="#f0f0f0"
                  strokeWidth={1}
                />
                <Line
                  points={[i * 50, 0, i * 50, stageHeight]}
                  stroke="#f0f0f0"
                  strokeWidth={1}
                />
              </React.Fragment>
            ))}
            
            {/* Render pattern elements FIRST (background layer) */}
            {currentPattern.elements.map((element, index) => {
              // Use saved position or calculate default position
              const pos = element.position || { 
                x: 100 + (index % 3) * 200, 
                y: 100 + Math.floor(index / 3) * 120 
              };
              
              // Check if this element is selected
              const isSelected = selectedElementId === element.id;
              
              // Get the metaclass for this element
              const metaclass = getMetaclassById(element.type);
              
              // Calculate height based on number of attributes (including inherited)
              const headerHeight = 30;
              const attributeHeight = 20;
              let attributeCount = getAllAttributes(element.type).length;
              // Add space for existing references for better visualization
              const referenceCount = Object.keys(element.references || {}).filter(
                k => !k.endsWith('_bendPoints') && !k.endsWith('_attributes')
              ).length;
              
              const width = 170;
              let height = headerHeight + 5 + (attributeCount * attributeHeight);
              
              // Ensure minimum height
              height = Math.max(height, 60);
              
              // Get colors based on element type and selection state
              const colors = getPatternColors(currentPattern.type, isSelected);
              
              return (
                <Group
                  key={element.id}
                  x={pos.x}
                  y={pos.y}
                  draggable
                  onClick={() => {
                    setSelectedElementId(element.id);
                    // Clear any selected reference when an element is selected
                    setSelectedReferenceInfo(null);
                  }}
                  onDragStart={() => setSelectedElementId(element.id)}
                  onDragEnd={(e) => {
                    if (!currentPattern) return;
                    
                    const updatedElement = {
                      ...element,
                      position: { x: e.target.x(), y: e.target.y() }
                    };
                    
                    const success = transformationService.updatePatternElement(
                      currentPattern.id,
                      element.id,
                      updatedElement
                    );
                    
                    if (success) {
                      // Update the currentPattern directly
                      setCurrentPattern({
                        ...currentPattern,
                        elements: currentPattern.elements.map(el => 
                          el.id === element.id ? { ...el, position: { x: e.target.x(), y: e.target.y() } } : el
                        )
                      });
                    }
                  }}
                >
                  {/* Element background */}
                  <Rect
                    width={width}
                    height={height}
                    fill="#fff"
                    stroke={colors.border}
                    strokeWidth={isSelected ? 2 : 1}
                    cornerRadius={4}
                    shadowColor="rgba(0,0,0,0.2)"
                    shadowBlur={isSelected ? 10 : 5}
                    shadowOffsetX={2}
                    shadowOffsetY={2}
                    shadowOpacity={0.5}
                    name="element-background"
                  />
                  
                  {/* Element header */}
                  <Rect
                    width={width}
                    height={headerHeight}
                    fill={colors.header}
                    stroke={colors.border}
                    strokeWidth={isSelected ? 2 : 1}
                    cornerRadius={[4, 4, 0, 0]}
                    name="element-header"
                  />
                  
                  {/* Element name */}
                  <Text
                    x={10}
                    y={10}
                    text={element.name}
                    fontSize={14}
                    fontStyle="bold"
                    fill={colors.headerText}
                    width={width - 20}
                    ellipsis={true}
                  />
                  
                  {/* Metaclass type */}
                  <Text
                    x={10}
                    y={headerHeight + 5}
                    text={metaclass?.name || 'Unknown Type'}
                    fontSize={12}
                    fontStyle="italic"
                    fill="#666"
                    width={width - 20}
                    ellipsis={true}
                  />
                </Group>
              );
            })}
          </Layer>
          
          {/* Create a SEPARATE layer for references and arrows to ensure they render on top */}
          <Layer>
            {/* Render references between elements */}
            {currentPattern.elements.map(sourceElement => {
              if (!sourceElement.references) return null;
              
              // Get source element position and dimensions
              const sourcePos = sourceElement.position || { x: 0, y: 0 };
              const sourceWidth = 170; // Default width
              const sourceHeight = 60; // Default height
              
              // Calculate source center
              const sourceX = sourcePos.x + sourceWidth / 2;
              const sourceY = sourcePos.y + sourceHeight / 2;
              
              // Process each reference
              return Object.entries(sourceElement.references).map(([refName, refValue]) => {
                // Skip special properties and null values
                if (refName.endsWith('_bendPoints') || refName.endsWith('_attributes') || !refValue) {
                  return null;
                }
                
                // Handle both single and multi-valued references
                const targetIds = Array.isArray(refValue) ? refValue : [refValue];
                
                // Render each target connection
                return targetIds.map(targetId => {
                  // Find target element
                  const targetElement = currentPattern.elements.find(el => el.id === targetId);
                  if (!targetElement) return null;
                  
                  // Get target element position and dimensions
                  const targetPos = targetElement.position || { x: 0, y: 0 };
                  const targetWidth = 170; // Default width
                  const targetHeight = 60; // Default height
                  
                  // Calculate target center
                  const targetX = targetPos.x + targetWidth / 2;
                  const targetY = targetPos.y + targetHeight / 2;
                  
                  // Create points array for the arrow
                  let points = [sourceX, sourceY];
                  
                  // Check for bend points
                  const bendPointsKey = `${refName}_${targetId}_bendPoints`;
                  const storedBendPoints = sourceElement.references[bendPointsKey];
                  
                  if (storedBendPoints) {
                    try {
                      // Parse bend points if stored as string
                      const bendPoints = typeof storedBendPoints === 'string' 
                        ? JSON.parse(storedBendPoints) 
                        : storedBendPoints;
                      
                      // Add bend points to the path
                      if (Array.isArray(bendPoints)) {
                        bendPoints.forEach(point => {
                          points.push(point.x, point.y);
                        });
                      }
                    } catch (e) {
                      console.error('Failed to parse bend points:', e);
                    }
                  }
                  
                  // Add target position
                  points.push(targetX, targetY);
                  
                  // Get reference metadata if possible
                  const sourceMetaclass = getMetaclassById(sourceElement.type);
                  const reference = sourceMetaclass?.references.find(r => r.id === refName);
                  
                  // Determine if this reference is selected
                  const isSelected = selectedReferenceInfo && 
                                    selectedReferenceInfo.sourceId === sourceElement.id &&
                                    selectedReferenceInfo.refName === refName &&
                                    selectedReferenceInfo.targetId === targetId;
                  
                  return (
                    <Group 
                      key={`ref-${sourceElement.id}-${refName}-${targetId}`}
                      onClick={() => {
                        setSelectedReferenceInfo({
                          sourceId: sourceElement.id,
                          refName: refName,
                          targetId: targetId
                        });
                        // Clear selected element when a reference is selected
                        setSelectedElementId(null);
                      }}
                    >
                      {/* Main arrow */}
                      <Arrow
                        points={points}
                        stroke={isSelected ? "#1976d2" : "#666"}
                        fill={isSelected ? "#1976d2" : "#666"}
                        strokeWidth={isSelected ? 2 : 1}
                        pointerLength={8}
                        pointerWidth={8}
                        lineCap="round"
                        lineJoin="round"
                      />
                      
                      {/* Visualize bend points if any */}
                      {storedBendPoints && (() => {
                        try {
                          const bendPoints = typeof storedBendPoints === 'string' 
                            ? JSON.parse(storedBendPoints) 
                            : storedBendPoints;
                          
                          if (Array.isArray(bendPoints)) {
                            return bendPoints.map((point, index) => (
                              <Circle
                                key={`bend-point-${index}`}
                                x={point.x}
                                y={point.y}
                                radius={4}
                                fill={isSelected ? "#1976d2" : "#666"}
                                stroke="#ffffff"
                                strokeWidth={1}
                              />
                            ));
                          }
                        } catch (e) {
                          console.error('Failed to render bend points:', e);
                        }
                        return null;
                      })()}
                      
                      {/* Reference name label */}
                      {(() => {
                        // Calculate midpoint for label
                        let midX, midY;
                        
                        if (points.length === 4) {
                          // Simple straight line
                          midX = (points[0] + points[2]) / 2;
                          midY = (points[1] + points[3]) / 2;
                        } else if (points.length > 4) {
                          // Line with bend points - use first bend point
                          const midIndex = Math.floor(points.length / 4) * 2;
                          midX = points[midIndex];
                          midY = points[midIndex + 1];
                        }
                        
                        return (
                          <Label x={midX} y={midY}>
                            <Tag
                              fill={isSelected ? "#e3f2fd" : "#f5f5f5"}
                              stroke={isSelected ? "#1976d2" : "#ccc"}
                              cornerRadius={2}
                              shadowColor="rgba(0,0,0,0.2)"
                              shadowBlur={3}
                              shadowOffsetX={1}
                              shadowOffsetY={1}
                            />
                            <Text
                              text={reference?.name || refName}
                              fontSize={10}
                              padding={2}
                              fill={isSelected ? "#1976d2" : "#666"}
                            />
                          </Label>
                        );
                      })()}
                    </Group>
                  );
                });
              });
            })}
            
            {/* Render the temp reference line if drawing a reference */}
            {renderTempReference()}
          </Layer>
        </Stage>
        
        {/* Add a visual indicator when in reference drawing mode */}
        {isDrawingReference && (
          <Box
            sx={{
              position: 'absolute',
              top: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              p: 2,
              bgcolor: 'info.main',
              color: 'white',
              borderRadius: 1,
              boxShadow: 3,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            <Typography variant="body2">
              Drawing reference - Click on empty space to add bend points, or click on a target element to complete
            </Typography>
          </Box>
        )}
      </Box>
    );
  };
  
  // Handle tab change with saving current pattern
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    // First save the current pattern
    saveCurrentPattern();
    
    // Then switch tabs
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ 
      flexGrow: 1, 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh',
      overflow: 'hidden'
    }}>
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        p: 2,
        borderBottom: '1px solid #e0e0e0'
      }}>
        <Typography variant="h4">
          Transformation Rule Editor
        </Typography>
      
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <FormControl sx={{ width: 240, mr: 2 }} size="small">
            <InputLabel>Metamodel</InputLabel>
            <Select
              value={selectedMetamodelId}
              label="Metamodel"
              onChange={(e) => {
                const metamodelId = e.target.value as string;
                setSelectedMetamodelId(metamodelId);
                const metamodel = metamodels.find(m => m.id === metamodelId);
                setSelectedMetamodel(metamodel || null);
              }}
            >
              {metamodels.map((metamodel) => (
                <MenuItem key={metamodel.id} value={metamodel.id}>
                  {metamodel.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={createNewRule}
            disabled={!selectedMetamodel}
          >
            New Rule
          </Button>
        </Box>
      </Box>
      
      <Grid container sx={{ flexGrow: 1, overflow: 'hidden' }}>
        {/* Left Panel - Rules List */}
        <Grid size={{ xs: 12, md: 2 }} sx={{ height: '100%', borderRight: '1px solid #e0e0e0', overflow: 'hidden' }}>
          <Paper sx={{ 
            height: '100%', 
            boxShadow: 'none',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 0
          }}>
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              p: 2,
              borderBottom: '1px solid #e0e0e0'
            }}>
              <Typography variant="h6">
                Rules
              </Typography>
              <RuleDownloadButton 
                variant="outlined" 
                size="small"
                label="Download All" 
                tooltip="Download all rules as JSON"
              />
            </Box>
            
            <Box sx={{ 
              flex: 1, 
              overflow: 'auto', 
              p: 2, 
              pt: 1, 
              backgroundColor: rules.length === 0 ? '#fafafa' : 'transparent'
            }}>
              {rules.length === 0 ? (
                <Box sx={{ 
                  textAlign: 'center', 
                  py: 3, 
                  color: 'text.secondary',
                  border: '1px dashed #e0e0e0',
                  borderRadius: 1,
                  p: 2
                }}>
                  <Typography variant="body2" paragraph>
                    No rules created yet
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={createNewRule}
                    disabled={!selectedMetamodel}
                  >
                    Create Rule
                  </Button>
                </Box>
              ) : (
                <List sx={{ p: 0 }}>
                  {rules.map(rule => (
                    <ListItem 
                      key={rule.id} 
                      sx={{ 
                        p: 0,
                        mb: 1
                      }}
                    >
                      <Paper 
                        sx={{ 
                          p: 1.5, 
                          width: '100%',
                          cursor: 'pointer',
                          backgroundColor: selectedRule?.id === rule.id ? '#f0f7ff' : 'white',
                          border: selectedRule?.id === rule.id ? '1px solid #90caf9' : '1px solid #e0e0e0',
                          borderRadius: 1,
                          '&:hover': {
                            backgroundColor: selectedRule?.id === rule.id ? '#e3f2fd' : '#f5f5f5'
                          },
                          transition: 'all 0.2s ease',
                        }}
                        onClick={() => selectRule(rule)}
                        elevation={selectedRule?.id === rule.id ? 2 : 0}
                      >
                        <Box sx={{ 
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start'
                        }}>
                          <Box>
                            <Typography 
                              variant="subtitle1" 
                              sx={{ 
                                fontWeight: selectedRule?.id === rule.id ? 'bold' : 'normal',
                                color: selectedRule?.id === rule.id ? 'primary.main' : 'text.primary'
                              }}
                            >
                              {rule.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              Priority: {rule.priority}
                            </Typography>
                            {rule.description && (
                              <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary', fontSize: '0.8rem' }}>
                                {rule.description.length > 60 
                                  ? rule.description.substring(0, 60) + '...' 
                                  : rule.description
                                }
                              </Typography>
                            )}
                          </Box>
                          <RuleDownloadButton 
                            ruleId={rule.id}
                            variant="text"
                            size="small"
                            tooltip={`Download "${rule.name}" as JSON`}
                            label=""
                            onClick={(e) => e.stopPropagation()}
                          />
                        </Box>
                      </Paper>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Center Panel - Visual Editor */}
        <Grid size={{ xs: 12, md: 7 }} sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Paper sx={{ boxShadow: 'none', borderRadius: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
            {selectedRule ? (
              <>
                <Tabs 
                  value={activeTab} 
                  onChange={handleTabChange}
                  aria-label="pattern editor tabs"
                  sx={{ 
                    borderBottom: '1px solid #e0e0e0',
                    px: 2,
                    backgroundColor: '#fafafa'
                  }}
                >
                  <Tab 
                    label="Left-Hand Side (LHS)" 
                    sx={{ 
                      fontWeight: activeTab === 0 ? 'bold' : 'normal',
                      color: activeTab === 0 ? '#1976d2' : 'text.secondary'
                    }}
                  />
                  <Tab 
                    label="Right-Hand Side (RHS)" 
                    sx={{ 
                      fontWeight: activeTab === 1 ? 'bold' : 'normal',
                      color: activeTab === 1 ? '#2e7d32' : 'text.secondary'
                    }}
                  />
                  <Tab 
                    label="Negative Application Conditions (NAC)" 
                    sx={{ 
                      fontWeight: activeTab === 2 ? 'bold' : 'normal',
                      color: activeTab === 2 ? '#c62828' : 'text.secondary'
                    }}
                  />
                </Tabs>
                
                <Box sx={{ p: 2, flexGrow: 1 }} ref={canvasContainerRef}>
                  <Paper sx={{ p: 2, height: '100%', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      mb: 2,
                      pb: 1,
                      borderBottom: '1px solid #f0f0f0'
                    }}>
                      <Typography variant="h6">
                        Visual Pattern Editor
                      </Typography>
                      <Box>
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={addPatternElement}
                          disabled={!currentPattern}
                          sx={{ mr: 1 }}
                        >
                          Add Element
                        </Button>
                        <Button
                          variant="contained"
                          color="secondary"
                          size="small"
                          startIcon={<CodeIcon />}
                          onClick={() => {
                            // Load the current global expression from the pattern
                            if (currentPattern && currentPattern.globalExpression) {
                              setGlobalExpression(currentPattern.globalExpression);
                            } else {
                              setGlobalExpression('');
                            }
                            setIsGlobalExpressionEditorOpen(true);
                          }}
                          disabled={!currentPattern}
                          sx={{ mr: 1 }}
                        >
                          Expression Editor
                        </Button>
                        <Button
                          variant={isDrawingReference ? "outlined" : "text"}
                          color={isDrawingReference ? "error" : "inherit"}
                          size="small"
                          onClick={() => {
                            if (isDrawingReference) {
                              cancelReferenceDrawing();
                            }
                          }}
                          disabled={!isDrawingReference}
                        >
                          {isDrawingReference ? "Cancel Drawing" : ""}
                        </Button>
                      </Box>
                    </Box>
                    <Box sx={{ flexGrow: 1, position: 'relative' }}>
                      {renderPatternVisualization()}
                    </Box>
                  </Paper>
                </Box>
              </>
            ) : (
              <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <Typography variant="h6" gutterBottom>
                  No Rule Selected
                </Typography>
                <Typography variant="body1" paragraph>
                  Select a rule from the list or create a new one to start editing.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={createNewRule}
                  disabled={!selectedMetamodel}
                >
                  Create New Rule
                </Button>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Right Panel - Properties */}
        <Grid size={{ xs: 12, md: 3 }} sx={{ height: '100%', borderLeft: '1px solid #e0e0e0', overflow: 'auto' }}>
          <Paper sx={{ boxShadow: 'none', borderRadius: 0, p: 2, height: '100%' }}>
            {selectedRule ? renderPatternEditorContent() : (
              <Box sx={{ 
                p: 4, 
                textAlign: 'center',
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
                color: 'text.secondary'
              }}>
                <Typography variant="h6" gutterBottom>
                  No Rule Selected
                </Typography>
                <Typography variant="body1" paragraph>
                  Select a rule to view and edit its properties.
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
      
      {renderMetaclassSelectionDialog()}
      {renderAddReferenceDialog()}
      {renderReferenceAttributesDialog()}
      {renderGlobalExpressionEditorDialog()}
    </Box>
  );
};

export default TransformationRuleEditor; 