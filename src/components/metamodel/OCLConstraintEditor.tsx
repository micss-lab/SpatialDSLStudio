import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Chip,
  Paper,
  Alert,
  Divider,
  Tooltip,
  SelectChangeEvent
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import { Metamodel, MetaClass, OCLConstraint } from '../../models/types';
import { oclService } from '../../services/ocl.service';

interface OCLConstraintEditorProps {
  metamodel: Metamodel;
  selectedClass: MetaClass | null;
  onMetamodelChange: () => void;
  isConstraintHighlighted?: (constraintName: string) => boolean;
  highlightColor?: string;
}

const OCLConstraintEditor: React.FC<OCLConstraintEditorProps> = ({
  metamodel,
  selectedClass,
  onMetamodelChange,
  isConstraintHighlighted,
  highlightColor = '#8aff8a' // Default light green color
}) => {
  // State for the list of constraints
  const [constraints, setConstraints] = useState<OCLConstraint[]>([]);
  
  // State for the constraint dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConstraint, setEditingConstraint] = useState<OCLConstraint | null>(null);
  const [constraintName, setConstraintName] = useState('');
  const [constraintExpression, setConstraintExpression] = useState('');
  const [constraintDescription, setConstraintDescription] = useState('');
  const [constraintSeverity, setConstraintSeverity] = useState<'error' | 'warning' | 'info'>('error');
  const [constraintContext, setConstraintContext] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // OCL examples
  const oclExamples = [
    'inv: self.name.size() > 0',
    'inv: self.children->forAll(c | c.age < self.age)',
    'inv: self.items->isEmpty() implies self.totalPrice = 0'
  ];
  
  // Load constraints when the selected class changes
  useEffect(() => {
    if (selectedClass) {
      const classConstraints = selectedClass.constraints || [];
      // Filter to only use OCL constraints
      const oclConstraints = classConstraints.filter(c => 
        'type' in c && c.type === 'ocl'
      ) as OCLConstraint[];
      setConstraints(oclConstraints);
    } else {
      setConstraints([]);
    }
  }, [selectedClass]);
  
  // Handle opening the dialog for creating a new constraint
  const handleAddConstraint = () => {
    setEditingConstraint(null);
    setConstraintName('');
    setConstraintExpression('');
    setConstraintDescription('');
    setConstraintSeverity('error');
    setConstraintContext(selectedClass ? selectedClass.id : '');
    setValidationError(null);
    setIsDialogOpen(true);
  };
  
  // Handle opening the dialog for editing an existing constraint
  const handleEditConstraint = (constraint: OCLConstraint) => {
    setEditingConstraint(constraint);
    setConstraintName(constraint.name);
    setConstraintExpression(constraint.expression);
    setConstraintDescription(constraint.description || '');
    setConstraintSeverity(constraint.severity);
    setConstraintContext(constraint.contextClassId);
    setValidationError(null);
    setIsDialogOpen(true);
  };
  
  // Handle deleting a constraint
  const handleDeleteConstraint = (constraintId: string) => {
    if (window.confirm('Are you sure you want to delete this constraint?')) {
      if (selectedClass && metamodel) {
        oclService.deleteConstraint(metamodel.id, constraintId);
        onMetamodelChange();
        
        // Update the local state
        setConstraints(prevConstraints => 
          prevConstraints.filter(c => c.id !== constraintId)
        );
      }
    }
  };
  
  // Handle saving a constraint
  const handleSaveConstraint = () => {
    // Validate the form
    if (!constraintName.trim()) {
      setValidationError('Constraint name is required');
      return;
    }
    
    if (!constraintExpression.trim()) {
      setValidationError('OCL expression is required');
      return;
    }
    
    if (!constraintContext) {
      setValidationError('Context class is required');
      return;
    }
    
    // Clear validation error
    setValidationError(null);
    
    if (metamodel) {
      if (editingConstraint) {
        // Update existing constraint
        oclService.updateConstraint(
          metamodel.id,
          editingConstraint.id,
          {
            name: constraintName,
            expression: constraintExpression,
            description: constraintDescription,
            severity: constraintSeverity,
            contextClassId: constraintContext,
            contextClassName: metamodel.classes.find(c => c.id === constraintContext)?.name || ''
          }
        );
      } else {
        // Create new constraint
        oclService.createConstraint(
          metamodel.id,
          constraintContext,
          constraintName,
          constraintExpression,
          constraintDescription,
          constraintSeverity
        );
      }
      
      // Notify parent component
      onMetamodelChange();
      
      // Close the dialog
      setIsDialogOpen(false);
    }
  };
  
  // Handle the context class selection
  const handleContextChange = (event: SelectChangeEvent) => {
    setConstraintContext(event.target.value as string);
  };
  
  // Get the severity icon for a constraint
  const getSeverityIcon = (severity: 'error' | 'warning' | 'info') => {
    switch (severity) {
      case 'error':
        return <ErrorIcon color="error" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      case 'info':
        return <InfoIcon color="info" />;
      default:
        return null;
    }
  };
  
  // Get the validation status icon for a constraint
  const getValidationStatusIcon = (isValid: boolean) => {
    return isValid 
      ? <CheckCircleIcon color="success" /> 
      : <ErrorIcon color="error" />;
  };
  
  // Render the constraint dialog
  const renderConstraintDialog = () => (
    <Dialog 
      open={isDialogOpen} 
      onClose={() => setIsDialogOpen(false)}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        {editingConstraint ? 'Edit Constraint' : 'Add New Constraint'}
      </DialogTitle>
      <DialogContent>
        {validationError && (
          <Alert severity="error" sx={{ mb: 2 }}>{validationError}</Alert>
        )}
        
        <TextField
          autoFocus
          margin="dense"
          label="Constraint Name"
          fullWidth
          value={constraintName}
          onChange={(e) => setConstraintName(e.target.value)}
          sx={{ mb: 2 }}
        />
        
        <FormControl fullWidth margin="dense" sx={{ mb: 2 }}>
          <InputLabel>Context Class</InputLabel>
          <Select
            value={constraintContext}
            onChange={handleContextChange}
            label="Context Class"
          >
            {metamodel.classes.map((cls) => (
              <MenuItem key={cls.id} value={cls.id}>
                {cls.name}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>
            The metaclass this constraint applies to
          </FormHelperText>
        </FormControl>
        
        <FormControl fullWidth margin="dense" sx={{ mb: 2 }}>
          <InputLabel>Severity</InputLabel>
          <Select
            value={constraintSeverity}
            onChange={(e) => setConstraintSeverity(e.target.value as 'error' | 'warning' | 'info')}
            label="Severity"
          >
            <MenuItem value="error">Error</MenuItem>
            <MenuItem value="warning">Warning</MenuItem>
            <MenuItem value="info">Info</MenuItem>
          </Select>
        </FormControl>
        
        <TextField
          margin="dense"
          label="Description"
          fullWidth
          multiline
          rows={2}
          value={constraintDescription}
          onChange={(e) => setConstraintDescription(e.target.value)}
          sx={{ mb: 2 }}
        />
        
        <Typography variant="subtitle1" gutterBottom>
          OCL Expression
        </Typography>
        
        <Paper 
          variant="outlined" 
          sx={{ 
            p: 1, 
            backgroundColor: '#f8f9fa',
            mb: 2
          }}
        >
          <Typography variant="body2" sx={{ mb: 1, fontFamily: 'monospace' }}>
            context {metamodel.classes.find(c => c.id === constraintContext)?.name || 'ClassName'}
          </Typography>
          <TextField
            margin="dense"
            fullWidth
            multiline
            rows={5}
            value={constraintExpression}
            onChange={(e) => setConstraintExpression(e.target.value)}
            placeholder="Enter OCL expression here"
            InputProps={{
              style: { fontFamily: 'monospace' }
            }}
          />
        </Paper>
        
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            OCL Examples:
          </Typography>
          <Box component="ul" sx={{ fontFamily: 'monospace', mt: 1 }}>
            {oclExamples.map((example, index) => (
              <Box component="li" key={index}>
                {example}
              </Box>
            ))}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setIsDialogOpen(false)}>Cancel</Button>
        <Button onClick={handleSaveConstraint} color="primary">
          {editingConstraint ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
  
  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">OCL Constraints</Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleAddConstraint}
          disabled={!selectedClass}
        >
          Add Constraint
        </Button>
      </Box>
      
      {selectedClass ? (
        constraints.length > 0 ? (
          <List>
            {constraints.map((constraint) => (
              <ListItem
                key={constraint.id}
                sx={{ 
                  mb: 1, 
                  border: '1px solid #e0e0e0', 
                  borderRadius: 1,
                  backgroundColor: isConstraintHighlighted && isConstraintHighlighted(constraint.name) 
                    ? highlightColor 
                    : constraint.isValid ? 'white' : '#fff8f8'
                }}
              >
                <Box sx={{ width: '100%' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {getSeverityIcon(constraint.severity)}
                      <Typography variant="subtitle1">
                        {constraint.name}
                      </Typography>
                      <Tooltip title={constraint.isValid ? 'Valid OCL' : 'Invalid OCL'}>
                        <Box>{getValidationStatusIcon(constraint.isValid)}</Box>
                      </Tooltip>
                    </Box>
                    <Box>
                      <IconButton 
                        size="small" 
                        onClick={() => handleEditConstraint(constraint)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton 
                        size="small" 
                        onClick={() => handleDeleteConstraint(constraint.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                  
                  <Box sx={{ mt: 1, mb: 1 }}>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontFamily: 'monospace',
                        backgroundColor: '#f5f5f5',
                        p: 1,
                        borderRadius: 1,
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      context {constraint.contextClassName} {'\n'}
                      {constraint.expression}
                    </Typography>
                  </Box>
                  
                  {constraint.description && (
                    <Typography variant="body2" color="text.secondary">
                      {constraint.description}
                    </Typography>
                  )}
                  
                  {!constraint.isValid && constraint.errorMessage && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                      {constraint.errorMessage}
                    </Alert>
                  )}
                </Box>
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography color="text.secondary">
            No constraints defined for this class. Click "Add Constraint" to create one.
          </Typography>
        )
      ) : (
        <Typography color="text.secondary">
          Select a metaclass to manage its OCL constraints.
        </Typography>
      )}
      
      {renderConstraintDialog()}
    </Box>
  );
};

export default OCLConstraintEditor; 