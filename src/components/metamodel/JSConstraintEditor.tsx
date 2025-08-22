import React, { useState, useEffect } from 'react';
import { 
  Button, 
  TextField, 
  FormControl, 
  FormLabel, 
  RadioGroup, 
  FormControlLabel, 
  Radio,
  Typography,
  Paper,
  Box,
  Divider,
  IconButton,
  Alert,
  MenuItem,
  Select,
  InputLabel,
  FormHelperText,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SaveIcon from '@mui/icons-material/Save';
import InfoIcon from '@mui/icons-material/Info';
import { MetaClass, Metamodel, JSConstraint, Constraint } from '../../models/types';
import { jsService } from '../../services/js.service';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { metamodelService } from '../../services/metamodel.service';

interface JSConstraintEditorProps {
  metamodelId: string;
  metaClass: MetaClass;
  metamodel: Metamodel;
  onUpdateMetamodel: () => void;
  isConstraintHighlighted?: (constraintName: string) => boolean;
  highlightColor?: string;
}

// Simple fallback for CodeMirror
const SimpleEditor = ({ 
  value, 
  height, 
  onChange 
}: { 
  value: string; 
  height: string; 
  onChange: (value: string) => void;
  [key: string]: any;
}) => {
  return (
    <TextField
      multiline
      fullWidth
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{ 
        fontFamily: 'monospace',
        '& .MuiInputBase-root': {
          height: 'auto',
          maxHeight: height,
          fontFamily: 'monospace',
          overflow: 'auto'
        },
        '& .MuiInputBase-input': {
          overflow: 'auto !important',
          maxHeight: height,
          fontFamily: 'monospace',
          lineHeight: 1.5,
          whiteSpace: 'pre',
          overflowWrap: 'normal'
        }
      }}
      variant="outlined"
      minRows={5}
      maxRows={20}
    />
  );
};

const JSConstraintEditor: React.FC<JSConstraintEditorProps> = ({ 
  metamodelId,
  metaClass,
  metamodel,
  onUpdateMetamodel,
  isConstraintHighlighted,
  highlightColor = '#8aff8a' // Default light green color
}) => {
  // Get JS constraints for this class
  const constraints = React.useMemo(() => {
    const allConstraints = metaClass.constraints || [];
    return allConstraints.filter(c => 'type' in c && c.type === 'javascript') as JSConstraint[];
  }, [metaClass]);

  // State for the new constraint form
  const [newConstraintName, setNewConstraintName] = useState<string>('');
  const [newConstraintExpression, setNewConstraintExpression] = useState<string>('');
  const [newConstraintDescription, setNewConstraintDescription] = useState<string>('');
  const [newConstraintSeverity, setNewConstraintSeverity] = useState<'error' | 'warning' | 'info'>('error');
  const [syntaxError, setSyntaxError] = useState<string | null>(null);
  const [showExamples, setShowExamples] = useState<boolean>(false);

  // Function to handle creating a new constraint
  const handleCreateConstraint = () => {
    if (!newConstraintName.trim()) {
      setSyntaxError('Constraint name is required');
      return;
    }

    if (!newConstraintExpression.trim()) {
      setSyntaxError('Constraint expression is required');
      return;
    }

    // Check if this might be OCL syntax accidentally
    if (newConstraintExpression.includes('context') && 
        newConstraintExpression.includes('inv') && 
        newConstraintExpression.includes('->')) {
      setSyntaxError('This looks like OCL syntax. Use the OCL constraints tab instead.');
      return;
    }

    // Validate the expression syntax
    const validationResult = jsService.validateJSSyntax(newConstraintExpression);
    if (!validationResult.valid) {
      setSyntaxError(validationResult.issues[0]?.message || 'Invalid JavaScript syntax');
      return;
    }

    // SPECIAL DIRECT METHOD: Create and add constraint directly to avoid any issues
    // Get the metamodel directly 
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error(`Metamodel with id ${metamodelId} not found`);
      return;
    }

    // Find the metaclass
    const contextClass = metamodel.classes.find(c => c.id === metaClass.id);
    if (!contextClass) {
      console.error(`MetaClass with id ${metaClass.id} not found`);
      return;
    }

    // Create the JSConstraint object
    const newConstraint: JSConstraint = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      name: newConstraintName,
      contextClassName: metaClass.name,
      contextClassId: metaClass.id,
      expression: newConstraintExpression,
      description: newConstraintDescription,
      isValid: true,
      type: 'javascript', // EXPLICITLY set type to 'javascript'
      severity: newConstraintSeverity as 'error' | 'warning' | 'info',
    };

    // ADDITIONAL SAFETY CHECK: Look for any constraint with the same name in ANY OTHER CONSTRAINT COLLECTION
    const allMetamodelConstraints = metamodel.constraints || [];
    const hasOclDuplicate = allMetamodelConstraints.some((c: Constraint) => 
      c.name === newConstraint.name && ('type' in c) && c.type === 'ocl'
    );

    // Check all metaclasses for duplicates in OCL constraints
    let hasDuplicateInOtherClasses = false;
    for (const cls of metamodel.classes) {
      if (cls.constraints) {
        const hasDuplicate = cls.constraints.some((c: Constraint) => 
          c.name === newConstraint.name && 
          ('type' in c) && c.type === 'ocl' && 
          c.contextClassId === newConstraint.contextClassId
        );
        if (hasDuplicate) {
          hasDuplicateInOtherClasses = true;
          break;
        }
      }
    }

    if (hasOclDuplicate || hasDuplicateInOtherClasses) {
      setSyntaxError(`A constraint with name "${newConstraintName}" already exists in OCL constraints. Please use a different name.`);
      return;
    }

    // Check if the constraint already exists to avoid duplicates
    if (contextClass.constraints) {
      const existingConstraintIndex = contextClass.constraints.findIndex(c => 
        c.name === newConstraint.name && c.contextClassId === newConstraint.contextClassId
      );
      
      if (existingConstraintIndex !== -1) {
        // Check if this is an OCL constraint
        const existingConstraint = contextClass.constraints[existingConstraintIndex];
        if ('type' in existingConstraint && existingConstraint.type === 'ocl') {
          setSyntaxError(`A constraint with name "${newConstraintName}" already exists as an OCL constraint. Please use a different name.`);
          return;
        }
        
        // Replace the existing constraint
        contextClass.constraints[existingConstraintIndex] = newConstraint;
      } else {
        // Add a new constraint
        contextClass.constraints.push(newConstraint);
      }
    } else {
      // Initialize constraints array and add the new constraint
      contextClass.constraints = [newConstraint];
    }
    
    // Double check the type field is set correctly (defensive programming)
    if (contextClass.constraints) {
      contextClass.constraints.forEach((c: Constraint) => {
        if (c.id === newConstraint.id && ('type' in c) && c.type !== 'javascript') {
          console.warn('Fixed incorrect type on JS constraint');
          (c as any).type = 'javascript';
        }
      });
    }

    // Save the updated metamodel
    metamodelService.updateMetamodel(metamodelId, metamodel);

    // Clear the form
    setNewConstraintName('');
    setNewConstraintExpression('');
    setNewConstraintDescription('');
    setSyntaxError(null);

    // Notify parent component of the update
    onUpdateMetamodel();
  };

  // Function to handle deleting a constraint
  const handleDeleteConstraint = (constraintId: string) => {
    // SPECIAL DIRECT METHOD: Delete constraint directly
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error(`Metamodel with id ${metamodelId} not found`);
      return;
    }

    // Find the metaclass
    const contextClass = metamodel.classes.find(c => c.id === metaClass.id);
    if (!contextClass) {
      console.error(`MetaClass with id ${metaClass.id} not found`);
      return;
    }

    // Remove the constraint
    if (contextClass.constraints) {
      contextClass.constraints = contextClass.constraints.filter(c => c.id !== constraintId);
      
      // Save the updated metamodel
      metamodelService.updateMetamodel(metamodelId, metamodel);
      
      // Notify parent component of the update
      onUpdateMetamodel();
    }
  };

  // Function to handle updating a constraint
  const handleUpdateConstraint = (constraint: JSConstraint, expression: string) => {
    // SPECIAL DIRECT METHOD: Update constraint directly
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error(`Metamodel with id ${metamodelId} not found`);
      return;
    }

    // Find the metaclass
    const contextClass = metamodel.classes.find(c => c.id === metaClass.id);
    if (!contextClass || !contextClass.constraints) {
      console.error(`MetaClass with id ${metaClass.id} not found or has no constraints`);
      return;
    }

    // Find the constraint
    const constraintToUpdate = contextClass.constraints.find(c => c.id === constraint.id);
    if (!constraintToUpdate) {
      console.error(`Constraint with id ${constraint.id} not found`);
      return;
    }

    // Validate the expression syntax
    const validationResult = jsService.validateJSSyntax(expression);
    
    // Update the constraint
    Object.assign(constraintToUpdate, {
      expression,
      isValid: validationResult.valid,
      errorMessage: validationResult.valid ? undefined : 
        validationResult.issues[0]?.message || 'Invalid constraint syntax',
      type: 'javascript' // Ensure type remains 'javascript'
    });
    
    // Save the updated metamodel
    metamodelService.updateMetamodel(metamodelId, metamodel);

    // Notify parent component of the update
    onUpdateMetamodel();
  };

  // Function to generate type hints for the current metaclass
  const generateTypeHints = (): string => {
    let hints = `// Type hints for ${metaClass.name}:\n`;
    hints += `self: {\n`;
    
    // Add attributes
    metaClass.attributes.forEach(attr => {
      let type = 'any';
      switch (attr.type) {
        case 'string': type = 'string'; break;
        case 'number': type = 'number'; break;
        case 'boolean': type = 'boolean'; break;
        default: type = 'any';
      }
      hints += `  ${attr.name}: ${type};\n`;
    });
    
    // Add references
    metaClass.references.forEach(ref => {
      const targetClass = metamodel.classes.find(c => c.id === ref.target);
      if (targetClass) {
        if (ref.cardinality.upperBound === '*' || ref.cardinality.upperBound > 1) {
          hints += `  ${ref.name}: ${targetClass.name}[];\n`;
        } else {
          hints += `  ${ref.name}: ${targetClass.name} | null;\n`;
        }
      }
    });
    
    hints += `}\n\n`;
    
    // Add hint for collection operations
    hints += `// Collection operations available on arrays:\n`;
    hints += `// arr.size               - Number of elements\n`;
    hints += `// arr.isEmpty            - True if empty\n`;
    hints += `// arr.notEmpty           - True if not empty\n`;
    hints += `// arr.includes(item)     - True if contains item\n`;
    hints += `// arr.exists(fn)         - True if any element satisfies fn\n`;
    hints += `// arr.forAll(fn)         - True if all elements satisfy fn\n`;
    hints += `// arr.one(fn)            - True if exactly one element satisfies fn\n`;
    
    return hints;
  };

  // Example constraints
  const exampleConstraints = [
    {
      name: "Basic property check",
      code: "// Check if a property meets a condition\nself.name.length > 0"
    },
    {
      name: "Numeric property check",
      code: "// Check if a numeric property is greater than zero\nif (self.beverages === 0) {\n  return {\n    valid: false,\n    message: \"Must have at least one beverage\"\n  };\n}\nreturn true;"
    },
    {
      name: "If-then-else logic",
      code: "// If-then-else condition\nif (self.creditHours > 3) {\n  return self.enrolledStudents.size >= 2;\n} else {\n  return true;\n}"
    },
    {
      name: "Return object with message",
      code: "// Return object with validation result and message\nif (self.items.length === 0) {\n  return {\n    valid: false,\n    message: \"Must have at least one item\"\n  };\n}\nreturn true;"
    },
    {
      name: "Working with collections",
      code: "// Check properties of collections\nself.items.notEmpty && self.items.forAll(item => item.price > 0)"
    },
    {
      name: "Using utility functions",
      code: "// Use helper functions from utils\nutils.isString(self.name) && !utils.isEmpty(self.description)"
    }
  ];

  return (
    <Paper elevation={0} sx={{ p: 2, width: '100%' }}>
      <Typography variant="h6" gutterBottom>
        JavaScript Constraints for {metaClass.name}
        <Chip 
          label="JS" 
          size="small" 
          color="primary" 
          sx={{ ml: 1, bgcolor: '#f0db4f', color: '#323330', fontWeight: 'bold' }}
        />
      </Typography>

      <Divider sx={{ my: 2 }} />

      {/* Existing constraints */}
      {constraints.length > 0 ? (
        <>
          <Typography variant="subtitle1" gutterBottom>
            Existing Constraints
          </Typography>
          {constraints.map((constraint) => (
            <Paper 
              key={constraint.id} 
              elevation={1} 
              sx={{ 
                p: 2, 
                my: 2, 
                border: constraint.isValid ? 'none' : '1px solid #f44336',
                backgroundColor: isConstraintHighlighted && isConstraintHighlighted(constraint.name)
                  ? highlightColor
                  : 'inherit'
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex' }}>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="subtitle1">
                      {constraint.name}
                      <Tooltip title={constraint.severity}>
                        <Box component="span" sx={{ 
                          ml: 1, 
                          width: 10, 
                          height: 10, 
                          borderRadius: '50%', 
                          display: 'inline-block',
                          bgcolor: constraint.severity === 'error' ? 'error.main' :
                                  constraint.severity === 'warning' ? 'warning.main' : 
                                  'info.main'
                        }} />
                      </Tooltip>
                    </Typography>
                    
                    {constraint.description && (
                      <Typography variant="body2" color="textSecondary">
                        {constraint.description}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <IconButton 
                      color="error" 
                      onClick={() => handleDeleteConstraint(constraint.id)}
                      size="small"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </Box>
                <Box>
                  <SimpleEditor
                    value={constraint.expression}
                    height="100px"
                    onChange={(value: string) => handleUpdateConstraint(constraint, value)}
                  />
                </Box>
                
                {!constraint.isValid && (
                  <Box>
                    <Alert severity="error">
                      {constraint.errorMessage || 'Invalid constraint syntax'}
                    </Alert>
                  </Box>
                )}
              </Box>
            </Paper>
          ))}
          <Divider sx={{ my: 2 }} />
        </>
      ) : (
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          No JavaScript constraints defined for this class yet.
        </Typography>
      )}

      {/* New constraint form */}
      <Typography variant="subtitle1" gutterBottom>
        Add New JavaScript Constraint
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ flex: 2 }}>
            <TextField
              label="Constraint Name"
              fullWidth
              value={newConstraintName}
              onChange={(e) => setNewConstraintName(e.target.value)}
              margin="normal"
              variant="outlined"
              size="small"
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <FormControl fullWidth margin="normal" size="small">
              <InputLabel>Severity</InputLabel>
              <Select
                value={newConstraintSeverity}
                onChange={(e) => setNewConstraintSeverity(e.target.value as 'error' | 'warning' | 'info')}
                label="Severity"
              >
                <MenuItem value="error">Error</MenuItem>
                <MenuItem value="warning">Warning</MenuItem>
                <MenuItem value="info">Info</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>
        <Box>
          <TextField
            label="Description (optional)"
            fullWidth
            value={newConstraintDescription}
            onChange={(e) => setNewConstraintDescription(e.target.value)}
            margin="normal"
            variant="outlined"
            size="small"
          />
        </Box>
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Constraint Expression
            <Tooltip title="Click to view JavaScript constraint examples">
              <IconButton size="small" onClick={() => setShowExamples(!showExamples)}>
                <InfoIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Typography>
          
          <Alert severity="info" sx={{ mb: 2 }}>
            JavaScript constraints can be written in several formats:
            <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
              <li>As a simple expression: <code>self.name.length &gt; 0</code></li>
              <li>As a function with return statements: <code>if (condition) {`{`} return true; {`}`} else {`{`} return false; {`}`}</code></li>
              <li>With a detailed error message: <code>return {`{ valid: false, message: "Error description" }`}</code></li>
            </ul>
          </Alert>
          
          <SimpleEditor
            value={newConstraintExpression}
            height="150px"
            onChange={(value: string) => {
              setNewConstraintExpression(value);
              setSyntaxError(null);
            }}
          />
          
          {syntaxError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {syntaxError}
            </Alert>
          )}
        </Box>
        
        {showExamples && (
          <Box>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Type Hints</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <SyntaxHighlighter language="javascript" style={docco}>
                  {generateTypeHints()}
                </SyntaxHighlighter>
              </AccordionDetails>
            </Accordion>
            
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Example Constraints</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {exampleConstraints.map((example, index) => (
                    <Box key={index}>
                      <Typography variant="subtitle2">{example.name}</Typography>
                      <SyntaxHighlighter language="javascript" style={docco}>
                        {example.code}
                      </SyntaxHighlighter>
                      <Button 
                        size="small" 
                        variant="outlined"
                        onClick={() => setNewConstraintExpression(example.code)}
                      >
                        Use This Example
                      </Button>
                      {index < exampleConstraints.length - 1 && <Divider sx={{ my: 1 }} />}
                    </Box>
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          </Box>
        )}
        
        <Box>
          <Button 
            variant="contained" 
            color="primary"
            startIcon={<SaveIcon />}
            onClick={handleCreateConstraint}
            disabled={!newConstraintName || !newConstraintExpression}
          >
            Create Constraint
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};

export default JSConstraintEditor; 