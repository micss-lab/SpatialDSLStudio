import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  Tooltip,
  Stack,
  Chip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import CodeIcon from '@mui/icons-material/Code';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import FunctionsIcon from '@mui/icons-material/Functions';
import LinkIcon from '@mui/icons-material/Link';
import { 
  Expression, 
  ExpressionType, 
  ExpressionOperator, 
  PatternElement,
  ElementReference
} from '../../models/types';
import { expressionService } from '../../services/expression.service';

interface ExpressionEditorProps {
  expression: Expression | string | null;
  availableElements?: PatternElement[];
  onChange: (expression: Expression | string) => void;
  label?: string;
  allowLiteralOnly?: boolean;
}

const ExpressionEditor: React.FC<ExpressionEditorProps> = ({
  expression,
  availableElements = [],
  onChange,
  label = 'Expression',
  allowLiteralOnly = false
}) => {
  // Internal state for expression
  const [currentExpression, setCurrentExpression] = useState<Expression | string | null>(expression);
  const [showAdvancedDialog, setShowAdvancedDialog] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [expressionType, setExpressionType] = useState<'simple' | 'advanced'>('simple');
  const [expressionPreview, setExpressionPreview] = useState('');
  
  // Keep track of the available elements for reference expressions
  const [elementOptions, setElementOptions] = useState<PatternElement[]>([]);
  
  useEffect(() => {
    setCurrentExpression(expression);
    
    // If it's an Expression object, convert to string for display
    if (typeof expression === 'object' && expression !== null && 'type' in expression) {
      const exprString = expressionService.expressionToString(expression);
      setTextInput(exprString);
      setExpressionPreview(exprString);
      setExpressionType('advanced');
    } else if (typeof expression === 'string') {
      setTextInput(expression);
      setExpressionPreview(expression);
      setExpressionType('simple');
    }
  }, [expression]);
  
  useEffect(() => {
    setElementOptions(availableElements || []);
  }, [availableElements]);
  
  // Helper to check if the expression is simple or advanced
  const isAdvancedExpression = (expr: any): boolean => {
    if (typeof expr === 'object' && expr !== null && 'type' in expr) {
      return true;
    }
    
    if (typeof expr === 'string') {
      // Check if it contains any advanced features like references
      return expr.includes('{') && expr.includes('}') || 
             expr.match(/(increment|decrement|multiply|divide|equals|greater than|less than|AND|OR)/i) !== null;
    }
    
    return false;
  };
  
  // Handle updating the expression
  const handleExpressionChange = (newExpr: Expression | string) => {
    setCurrentExpression(newExpr);
    onChange(newExpr);
    
    // Update the text input and preview
    if (typeof newExpr === 'object' && newExpr !== null && 'type' in newExpr) {
      const exprString = expressionService.expressionToString(newExpr);
      setTextInput(exprString);
      setExpressionPreview(exprString);
    } else if (typeof newExpr === 'string') {
      setTextInput(newExpr);
      setExpressionPreview(newExpr);
    }
  };
  
  // Handle parsing an expression from text input
  const handleParseExpression = () => {
    const parsedExpr = expressionService.parseExpression(textInput, { availableElements });
    
    if (parsedExpr) {
      handleExpressionChange(parsedExpr);
    } else {
      // If parsing fails, just use the text as a literal
      handleExpressionChange(textInput);
    }
    
    setShowAdvancedDialog(false);
  };
  
  const handleOpenAdvancedEditor = () => {
    // First try to parse the current expression if it's a string
    if (typeof currentExpression === 'string' && isAdvancedExpression(currentExpression)) {
      const parsedExpr = expressionService.parseExpression(currentExpression, { availableElements });
      if (parsedExpr) {
        setCurrentExpression(parsedExpr);
        const exprString = expressionService.expressionToString(parsedExpr);
        setTextInput(exprString);
      } else {
        setTextInput(currentExpression);
      }
    } else if (typeof currentExpression === 'object' && currentExpression !== null && 'type' in currentExpression) {
      const exprString = expressionService.expressionToString(currentExpression);
      setTextInput(exprString);
    } else {
      setTextInput(currentExpression as string || '');
    }
    
    setShowAdvancedDialog(true);
  };
  
  // Render the advanced expression editor dialog
  const renderAdvancedDialog = () => {
    return (
      <Dialog 
        open={showAdvancedDialog} 
        onClose={() => setShowAdvancedDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Expression Editor
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ p: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Enter your expression using any of the following syntax:
            </Typography>
            
            <Box sx={{ mb: 2, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="body2" component="div">
                <strong>Element References:</strong> Use <code>{'{element.attribute}'}</code> syntax<br/>
                <strong>Operations:</strong> increment, decrement, multiply, divide<br/>
                <strong>Comparisons:</strong> equals, not equals, greater than, less than<br/>
                <strong>Logical:</strong> AND, OR<br/>
                <strong>Nesting:</strong> Use parentheses for complex expressions
              </Typography>
            </Box>
            
            <TextField
              fullWidth
              multiline
              rows={3}
              variant="outlined"
              label="Expression"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              sx={{ mb: 2 }}
            />
            
            <Typography variant="subtitle2" gutterBottom>
              Examples:
            </Typography>
            
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
              <Chip 
                label="Place.tokens decrement {arc.weight}" 
                onClick={() => setTextInput("Place.tokens decrement {arc.weight}")}
                color="primary"
                variant="outlined"
              />
              <Chip 
                label="Car.price multiply 0.9" 
                onClick={() => setTextInput("Car.price multiply 0.9")}
                color="primary"
                variant="outlined"
              />
              <Chip 
                label="Product.inStock greater than 5" 
                onClick={() => setTextInput("Product.inStock greater than 5")}
                color="primary"
                variant="outlined"
              />
              <Chip 
                label="Place.tokens decrement (Place.tokens multiply 0.1)" 
                onClick={() => setTextInput("Place.tokens decrement (Place.tokens multiply 0.1)")}
                color="primary"
                variant="outlined"
              />
            </Stack>
            
            <Typography variant="subtitle2" gutterBottom>
              Available Elements:
            </Typography>
            
            <Box sx={{ mb: 2, p: 1, backgroundColor: '#f5f5f5', borderRadius: 1, maxHeight: 200, overflow: 'auto' }}>
              {elementOptions.length > 0 ? (
                elementOptions.map((element) => (
                  <Box key={element.id} sx={{ mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {element.name} ({element.type.split('-').pop()})
                    </Typography>
                    
                    {element.attributes && Object.keys(element.attributes).length > 0 && (
                      <Box sx={{ pl: 2 }}>
                        {Object.entries(element.attributes).map(([key, value]) => {
                          // Skip attribute values that are expressions
                          if (typeof value === 'object' && value !== null && 'type' in value) {
                            return null;
                          }
                          
                          // Skip keys that contain a dash (attribute IDs)
                          if (key.includes('-')) {
                            return null;
                          }
                          
                          return (
                            <Tooltip 
                              key={key} 
                              title={`Click to insert ${element.name}.${key}`}
                              placement="top"
                            >
                              <Chip
                                size="small"
                                label={`${key}: ${String(value).substring(0, 15)}${String(value).length > 15 ? '...' : ''}`}
                                onClick={() => setTextInput(textInput + `{${element.name}.${key}}`)}
                                sx={{ m: 0.5 }}
                              />
                            </Tooltip>
                          );
                        })}
                      </Box>
                    )}
                  </Box>
                ))
              ) : (
                <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                  No elements available
                </Typography>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAdvancedDialog(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color="primary"
            onClick={handleParseExpression}
          >
            Apply Expression
          </Button>
        </DialogActions>
      </Dialog>
    );
  };
  
  // For simple mode, just show a text field with an option to switch to advanced mode
  if (expressionType === 'simple' && !isAdvancedExpression(currentExpression)) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1 }}>
        <TextField
          fullWidth
          label={label}
          value={typeof currentExpression === 'string' ? currentExpression : ''}
          onChange={(e) => handleExpressionChange(e.target.value)}
          size="small"
          sx={{ mr: 1 }}
        />
        {!allowLiteralOnly && (
          <Tooltip title="Advanced Expression Editor">
            <IconButton 
              color="primary"
              onClick={handleOpenAdvancedEditor}
              size="small"
            >
              <FunctionsIcon />
            </IconButton>
          </Tooltip>
        )}
        {renderAdvancedDialog()}
      </Box>
    );
  }
  
  // For advanced mode or an existing advanced expression, show a preview with edit button
  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        <Typography variant="body2" color="textSecondary" sx={{ mr: 1 }}>
          {label}:
        </Typography>
        {expressionType === 'advanced' && (
          <Chip
            icon={<FunctionsIcon />}
            size="small"
            color="primary"
            variant="outlined"
            label="Expression"
            sx={{ mr: 1, fontSize: '0.7rem' }}
          />
        )}
      </Box>
      
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Paper 
          variant="outlined" 
          sx={{ 
            p: 1, 
            flex: 1, 
            backgroundColor: '#f8f8f8',
            cursor: 'pointer',
            '&:hover': {
              backgroundColor: '#f0f0f0'
            }
          }}
          onClick={handleOpenAdvancedEditor}
        >
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
            {expressionPreview || '(Empty Expression)'}
          </Typography>
        </Paper>
        
        <IconButton 
          color="primary"
          onClick={handleOpenAdvancedEditor}
          size="small"
          sx={{ ml: 1 }}
        >
          <CodeIcon />
        </IconButton>
        
        {expressionType === 'advanced' && (
          <IconButton 
            color="error"
            onClick={() => {
              handleExpressionChange('');
              setExpressionType('simple');
            }}
            size="small"
          >
            <DeleteIcon />
          </IconButton>
        )}
      </Box>
      
      {renderAdvancedDialog()}
    </Box>
  );
};

export default ExpressionEditor; 