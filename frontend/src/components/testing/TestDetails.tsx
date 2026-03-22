import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Divider,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Card,
  CardContent,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Button
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import { TestCase, TestValue } from '../../services/testing';
import { metamodelService } from '../../services/metamodel';

// Extended interfaces for additional optional properties we want to display
interface ExtendedTestCase extends TestCase {
  attributeType?: string;
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  targetReferenceType?: string;
  minCardinality?: number | string;
  maxCardinality?: number | string;
  isContainment?: boolean;
  constraintExpression?: string;
  originalInput?: any;
  expectedOutput?: any;
  actualOutput?: any;
  required?: boolean;
}

interface ExtendedTestValue extends TestValue {
  objectDetails?: any;
  expectedReason?: string;
  inputValue?: any;
  outputValue?: any;
}

const TestDetails: React.FC = () => {
  const [testCase, setTestCase] = useState<ExtendedTestCase | null>(null);

  // Generate a detailed failure analysis with fix suggestions
  const getDetailedFailureAnalysis = (testCase: ExtendedTestCase): { analysis: string, suggestion: string } => {
    if (testCase.status !== 'failed') {
      return { analysis: '', suggestion: '' };
    }

    // Get failed test values
    const failedValues = testCase.testValues.filter(v => 
      v.result !== undefined && v.result !== v.expected
    );
    
    let analysis = '';
    let suggestion = '';
    
    switch (testCase.type) {
      case 'attribute':
        analysis = `${failedValues.length} attribute value(s) failed validation. This suggests that the validation logic for the '${testCase.targetProperty}' attribute of '${testCase.targetMetaClassName}' doesn't match expectations.`;
        
        // Check for specific patterns in failures
        const validButFailed = failedValues.filter(v => v.expected === true && v.result === false);
        const invalidButPassed = failedValues.filter(v => v.expected === false && v.result === true);
        
        if (validButFailed.length > 0) {
          suggestion = `Values expected to be valid are being rejected. Check if type constraints are too restrictive or if there are additional constraints being applied to this attribute.`;
        } else if (invalidButPassed.length > 0) {
          suggestion = `Values expected to be invalid are being accepted. Verify if validation rules are correctly implemented for this attribute.`;
        }
        break;
      
      case 'reference':
        analysis = `${failedValues.length} reference test(s) failed. The '${testCase.targetProperty}' reference of '${testCase.targetMetaClassName}' is not being validated as expected.`;
        
        if (failedValues.some(v => v.expected === true && v.result === false)) {
          suggestion = `Valid references are being rejected. Check cardinality constraints and make sure the target type is correct.`;
        } else {
          suggestion = `Invalid references are being accepted. Verify reference constraints, especially regarding nullability and target types.`;
        }
        break;
      
      case 'constraint':
        const constraintType = testCase.constraintType === 'ocl' ? 'OCL' : 'JavaScript';
        analysis = `${failedValues.length} value(s) failed the ${constraintType} constraint validation. The constraint behavior doesn't match the expected results.`;
        
        if (testCase.constraintType === 'ocl') {
          suggestion = `Review the OCL expression logic. Ensure the constraint correctly expresses the intended rule. Compare expected and actual results to identify logical issues.`;
        } else {
          suggestion = `Check the JavaScript constraint implementation. Verify that the logic correctly validates the intended business rule. Look for edge cases that might not be handled properly.`;
        }
        
        // Special case for Customer age constraint
        if (testCase.name.includes('CustomerAge')) {
          suggestion += ` For age constraints, verify that string values like "18" are being properly compared as numbers.`;
        }
        break;
      
      default:
        analysis = `${failedValues.length} test value(s) failed validation.`;
        suggestion = `Review the test expectations and the actual validation logic to identify the discrepancy.`;
    }
    
    return { analysis, suggestion };
  };

  useEffect(() => {
    // Get test case data from URL
    const urlParams = new URLSearchParams(window.location.search);
    const encodedData = urlParams.get('data');
    
    if (encodedData) {
      try {
        // Decode base64 data from URL (no localStorage)
        const decodedString = decodeURIComponent(atob(encodedData));
        const decodedData = JSON.parse(decodedString) as ExtendedTestCase;
        setTestCase(decodedData);
      } catch (error) {
        console.error('Error parsing test case data from URL:', error);
      }
    } else {
      console.error('No test case data found in URL');
    }
  }, []);

  if (!testCase) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" color="error">
          No test case data available
        </Typography>
      </Box>
    );
  }

  const renderStatusChip = (status: string) => {
    switch (status) {
      case 'passed':
        return <Chip icon={<CheckCircleIcon />} label="Passed" color="success" />;
      case 'failed':
        return <Chip icon={<ErrorIcon />} label="Failed" color="error" />;
      default:
        return <Chip icon={<WarningIcon />} label={status} color="default" />;
    }
  };

  const renderTypeChip = (type: string) => {
    switch (type) {
      case 'attribute':
        return <Chip label="Attribute" color="info" />;
      case 'reference':
        return <Chip label="Reference" color="secondary" />;
      case 'constraint':
        return <Chip label="Constraint" color="warning" />;
      default:
        return <Chip label={type} color="default" />;
    }
  };

  // Add a type guard for reference_attribute type
  function isReferenceAttributeType(type: string): boolean {
    return type === 'reference_attribute';
  }

  // Helper to render validation rules based on test type
  const renderValidationRules = () => {
    switch (testCase.type) {
      case 'attribute':
        return (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Validation Rules:</Typography>
            <Box component="ul" sx={{ pl: 2 }}>
              <Box component="li">
                <Typography variant="body2">
                  Type: {testCase.attributeType || 'String'}
                </Typography>
              </Box>
              {testCase.minValue !== undefined && (
                <Box component="li">
                  <Typography variant="body2">
                    Min Value: {testCase.minValue}
                  </Typography>
                </Box>
              )}
              {testCase.maxValue !== undefined && (
                <Box component="li">
                  <Typography variant="body2">
                    Max Value: {testCase.maxValue}
                  </Typography>
                </Box>
              )}
              {testCase.minLength !== undefined && (
                <Box component="li">
                  <Typography variant="body2">
                    Min Length: {testCase.minLength}
                  </Typography>
                </Box>
              )}
              {testCase.maxLength !== undefined && (
                <Box component="li">
                  <Typography variant="body2">
                    Max Length: {testCase.maxLength}
                  </Typography>
                </Box>
              )}
              {testCase.pattern && (
                <Box component="li">
                  <Typography variant="body2">
                    Pattern: {testCase.pattern}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        );
      case 'reference':
        return (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Reference Rules:</Typography>
            <Box component="ul" sx={{ pl: 2 }}>
              <Box component="li">
                <Typography variant="body2">
                  Target Class: {testCase.targetReferenceType || 'Any class'}
                </Typography>
              </Box>
              <Box component="li">
                <Typography variant="body2">
                  Cardinality: {testCase.minCardinality || '0'}..{testCase.maxCardinality || '*'}
                </Typography>
              </Box>
              <Box component="li">
                <Typography variant="body2">
                  Is Containment: {testCase.isContainment ? 'Yes' : 'No'}
                </Typography>
              </Box>
            </Box>
          </Box>
        );
    }

    // Use if-else instead of case for reference_attribute
    if (isReferenceAttributeType(testCase.type)) {
      return (
        <Box>
          <Typography variant="subtitle2" gutterBottom>Reference Attribute Rules:</Typography>
          <Box component="ul" sx={{ pl: 2 }}>
            <Box component="li">
              <Typography variant="body2">
                Reference: {testCase.targetProperty?.split('.')[0] || 'Unknown'}
              </Typography>
            </Box>
            <Box component="li">
              <Typography variant="body2">
                Attribute: {testCase.targetProperty?.split('.')[1] || 'Unknown'}
              </Typography>
            </Box>
            <Box component="li">
              <Typography variant="body2">
                Type: {testCase.attributeType || 'String'}
              </Typography>
            </Box>
            {testCase.required !== undefined && (
              <Box component="li">
                <Typography variant="body2">
                  Required: {testCase.required ? 'Yes' : 'No'}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      );
    }

    // Move the constraint case after the if-else statement
    if (testCase.type === 'constraint') {
        return (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Constraint Details:</Typography>
            <Box component="ul" sx={{ pl: 2 }}>
              <Box component="li">
                <Typography variant="body2">
                  Constraint Type: {testCase.constraintType === 'ocl' ? 'OCL Expression' : 'JavaScript Function'}
                </Typography>
              </Box>
              <Box component="li">
                <Typography variant="body2">
                  Constraint ID: {testCase.constraintId || 'Unknown'}
                </Typography>
              </Box>
            </Box>
            {testCase.constraintExpression && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>Constraint Expression:</Typography>
                <Paper sx={{ p: 2, bgcolor: 'grey.100', maxHeight: '150px', overflow: 'auto' }}>
                  <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {testCase.constraintExpression}
                  </Typography>
                </Paper>
              </Box>
            )}
          </Box>
        );
    }

    return null;
  };

  // Helper to render a more detailed view of test values
  const renderDetailedTestValues = () => {
    return (
      <Stack spacing={2}>
        {testCase.testValues.map((rawValue, index) => {
          // Cast to extended type for additional properties
          const value = rawValue as ExtendedTestValue;
          
          return (
            <Accordion key={value.id || index}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                aria-controls={`test-value-${index}-content`}
                id={`test-value-${index}-header`}
                sx={{ 
                  bgcolor: value.result === value.expected 
                    ? 'success.light' 
                    : value.result === undefined 
                      ? 'grey.200' 
                      : 'error.light'
                }}
              >
                <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography>
                    {typeof value.value === 'object'
                      ? `Object (${value.description || 'Test value ' + (index + 1)})`
                      : String(value.value)}
                  </Typography>
                  <Box>
                    {value.expected ? (
                      <Chip icon={<CheckCircleIcon />} label="Expected Valid" color="success" size="small" sx={{ mr: 1 }} />
                    ) : (
                      <Chip icon={<ErrorIcon />} label="Expected Invalid" color="error" size="small" sx={{ mr: 1 }} />
                    )}
                    {value.result === undefined ? (
                      <Chip label="Not Tested" size="small" color="default" />
                    ) : value.result === value.expected ? (
                      <Chip icon={<CheckCircleIcon />} label="Pass" color="success" size="small" />
                    ) : (
                      <Chip icon={<WarningIcon />} label="Fail" color="error" size="small" />
                    )}
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  {value.description && (
                    <Box>
                      <Typography variant="subtitle2">Description:</Typography>
                      <Typography variant="body2">{value.description}</Typography>
                    </Box>
                  )}
                  <Box>
                    <Typography variant="subtitle2">Value Details:</Typography>
                    {typeof value.value === 'object' ? (
                      <Paper sx={{ p: 2, bgcolor: 'grey.100' }}>
                        <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify(value.value, null, 2)}
                        </Typography>
                      </Paper>
                    ) : (
                      <Typography variant="body2">
                        {testCase.type === 'attribute' && (
                          <>
                            Type: {typeof value.value}<br />
                            Value: {
                              // Try to detect and parse JSON strings for better display
                              (() => {
                                if (typeof value.value === 'string') {
                                  try {
                                    // Check if the string starts with { or [ which would indicate a JSON string
                                    if ((value.value.trim().startsWith('{') && value.value.trim().endsWith('}')) || 
                                        (value.value.trim().startsWith('[') && value.value.trim().endsWith(']'))) {
                                      const parsedValue = JSON.parse(value.value);
                                      // It's a valid JSON string, render it as a formatted object
                                      return (
                                        <Paper sx={{ p: 2, mt: 1, bgcolor: 'grey.100' }}>
                                          <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                            {JSON.stringify(parsedValue, null, 2)}
                                          </Typography>
                                        </Paper>
                                      );
                                    }
                                  } catch (e) {
                                    // Not valid JSON, just show as string
                                  }
                                }
                                // Default string display
                                return String(value.value);
                              })()
                            }
                          </>
                        )}
                        {testCase.type === 'reference' && (
                          <>
                            Reference to: {String(value.value)}
                            {value.objectDetails && (
                              <Paper sx={{ p: 2, mt: 1, bgcolor: 'grey.100' }}>
                                <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                  {JSON.stringify(value.objectDetails, null, 2)}
                                </Typography>
                              </Paper>
                            )}
                          </>
                        )}
                        {testCase.type === 'constraint' && (
                          <>Value: {
                            // Try to detect and parse JSON strings for better display of constraint values too
                            (() => {
                              if (typeof value.value === 'string') {
                                try {
                                  // Check if the string starts with { or [ which would indicate a JSON string
                                  if ((value.value.trim().startsWith('{') && value.value.trim().endsWith('}')) || 
                                      (value.value.trim().startsWith('[') && value.value.trim().endsWith(']'))) {
                                    const parsedValue = JSON.parse(value.value);
                                    // It's a valid JSON string, render it as a formatted object
                                    return (
                                      <Paper sx={{ p: 2, mt: 1, bgcolor: 'grey.100' }}>
                                        <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                          {JSON.stringify(parsedValue, null, 2)}
                                        </Typography>
                                      </Paper>
                                    );
                                  }
                                } catch (e) {
                                  // Not valid JSON, just show as string
                                }
                              }
                              // Default string display
                              return String(value.value);
                            })()
                          }</>
                        )}
                      </Typography>
                    )}
                  </Box>
                  
                  {/* Input/Output Values */}
                  {(value.inputValue || value.outputValue) && (
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>Test Execution Details:</Typography>
                      {value.inputValue && (
                        <>
                          <Typography variant="body2" fontWeight="bold">Input Value:</Typography>
                          <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.100' }}>
                            <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                              {typeof value.inputValue === 'object' 
                                ? JSON.stringify(value.inputValue, null, 2) 
                                : String(value.inputValue)}
                            </Typography>
                          </Paper>
                        </>
                      )}
                      {value.outputValue && (
                        <>
                          <Typography variant="body2" fontWeight="bold">Output Value:</Typography>
                          <Paper sx={{ p: 2, bgcolor: 'grey.100' }}>
                            <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                              {typeof value.outputValue === 'object' 
                                ? JSON.stringify(value.outputValue, null, 2) 
                                : String(value.outputValue)}
                            </Typography>
                          </Paper>
                        </>
                      )}
                    </Box>
                  )}
                  
                  <Box>
                    <Typography variant="subtitle2">Expected Outcome:</Typography>
                    <Typography variant="body2">
                      This value should be {value.expected ? 'valid' : 'invalid'} according to the {testCase.type} rules.
                      {value.expectedReason && (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="body2">Reason: {value.expectedReason}</Typography>
                        </Box>
                      )}
                    </Typography>
                  </Box>
                  {value.errorMessage && (
                    <Alert severity="error">
                      <Typography variant="subtitle2">Error:</Typography>
                      <Typography variant="body2">{value.errorMessage}</Typography>
                    </Alert>
                  )}
                  {value.result !== undefined && value.result !== value.expected && (
                    <Alert severity="warning">
                      <Typography variant="subtitle2">Validation Error:</Typography>
                      <Typography variant="body2">
                        Expected {value.expected ? 'valid' : 'invalid'} but got {value.result ? 'valid' : 'invalid'}.
                      </Typography>
                    </Alert>
                  )}
                </Stack>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Stack>
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* CSS for the highlight effect */}
      <style>
        {`
          @keyframes highlight {
            0% { background-color: rgba(25, 118, 210, 0.1); }
            50% { background-color: rgba(25, 118, 210, 0.3); }
            100% { background-color: rgba(25, 118, 210, 0.1); }
          }
          .highlight-section {
            animation: highlight 2s ease;
          }
        `}
      </style>
      
      <Typography variant="h4" gutterBottom>
        Test Case Details
      </Typography>
      
      <Stack spacing={3}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {testCase.name}
            </Typography>
            <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
              {renderStatusChip(testCase.status)}
              {renderTypeChip(testCase.type)}
            </Box>
            <Typography variant="body1" paragraph>
              {testCase.description}
            </Typography>
            
            <Divider sx={{ my: 2 }} />
            
            <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2 }}>
              <Box sx={{ width: '50%' }}>
                <Typography variant="subtitle2">Target Class</Typography>
                <Typography variant="body2">{testCase.targetMetaClassName}</Typography>
              </Box>
              <Box sx={{ width: '50%' }}>
                <Typography variant="subtitle2">Target Property</Typography>
                <Typography variant="body2">
                  {testCase.type === 'attribute' || testCase.type === 'reference' 
                    ? testCase.targetProperty 
                    : testCase.type === 'constraint' 
                      ? (testCase.constraintType === 'ocl' ? 'OCL Constraint' : 'JavaScript Constraint')
                      : ''}
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ my: 2 }} />
            
            {renderValidationRules()}
          </CardContent>
        </Card>

        {/* Original Input/Output Values for the Test */}
        {(testCase.originalInput || testCase.expectedOutput || testCase.actualOutput) && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Test Execution Data
              </Typography>
              
              {testCase.originalInput && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Original Input:</Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.100' }}>
                    <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                      {typeof testCase.originalInput === 'object' 
                        ? JSON.stringify(testCase.originalInput, null, 2) 
                        : testCase.originalInput}
                    </Typography>
                  </Paper>
                </Box>
              )}
              
              {testCase.expectedOutput && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Expected Output:</Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.100' }}>
                    <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                      {typeof testCase.expectedOutput === 'object' 
                        ? JSON.stringify(testCase.expectedOutput, null, 2) 
                        : testCase.expectedOutput}
                    </Typography>
                  </Paper>
                </Box>
              )}
              
              {testCase.actualOutput && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>Actual Output:</Typography>
                  <Paper sx={{ p: 2, bgcolor: testCase.status === 'passed' ? 'success.light' : 'error.light' }}>
                    <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                      {typeof testCase.actualOutput === 'object' 
                        ? JSON.stringify(testCase.actualOutput, null, 2) 
                        : testCase.actualOutput}
                    </Typography>
                  </Paper>
                </Box>
              )}
            </CardContent>
          </Card>
        )}

        {testCase.errorMessage && (
          <Card sx={{ bgcolor: 'error.light' }}>
            <CardContent>
              <Typography variant="h6" color="error">
                Error Message
              </Typography>
              <Typography variant="body1">
                {testCase.errorMessage}
              </Typography>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Test Values
            </Typography>
            {renderDetailedTestValues()}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Test Explanation
            </Typography>
            <Typography variant="body1" paragraph>
              {testCase.type === 'attribute' && (
                <>
                  This test validates the <strong>{testCase.targetProperty}</strong> attribute of the <strong>{testCase.targetMetaClassName}</strong> class. 
                  The test checks if the attribute correctly accepts valid values and rejects invalid values based on its type and constraints.
                </>
              )}
              {testCase.type === 'reference' && (
                <>
                  This test validates the <strong>{testCase.targetProperty}</strong> reference of the <strong>{testCase.targetMetaClassName}</strong> class.
                  The test verifies that the reference correctly accepts valid object references and rejects invalid ones based on the reference type,
                  cardinality, and other constraints.
                </>
              )}
              {isReferenceAttributeType(testCase.type) && (
                <>
                  This test validates the <strong>{testCase.targetProperty?.split('.')[1] || 'attribute'}</strong> of the <strong>{testCase.targetProperty?.split('.')[0] || 'reference'}</strong> reference 
                  in the <strong>{testCase.targetMetaClassName}</strong> class. The test checks if the reference attribute correctly accepts valid values 
                  and rejects invalid values.
                </>
              )}
              {testCase.type === 'constraint' && (
                <>
                  This test validates the constraint <strong>{testCase.constraintId || 'unnamed'}</strong> defined for the <strong>{testCase.targetMetaClassName}</strong> class.
                  The test checks if the constraint correctly evaluates different model instances, accepting valid ones and 
                  rejecting invalid ones based on the constraint's logic.
                </>
              )}
            </Typography>
            <Alert severity="info">
              <Typography variant="body2">
                <strong>Test Status</strong>: {testCase.status === 'passed' ? (
                  'All test values were correctly validated according to expectations.'
                ) : testCase.status === 'failed' ? (
                  'One or more test values were not validated as expected. This indicates a problem with the model validation logic.'
                ) : (
                  'This test has not been run yet.'
                )}
              </Typography>
            </Alert>

            {/* Test failure analysis */}
            {testCase.status === 'failed' && (
              <Alert severity="error" sx={{ mt: 2 }}>
                <Typography variant="subtitle2">Failure Analysis:</Typography>
                {(() => {
                  const { analysis, suggestion } = getDetailedFailureAnalysis(testCase);
                  return (
                    <>
                      <Typography variant="body2" paragraph>
                        {analysis}
                      </Typography>
                      <Typography variant="subtitle2">Suggested Fix:</Typography>
                      <Typography variant="body2" paragraph>
                        {suggestion}
                      </Typography>
                    </>
                  );
                })()}
              </Alert>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
};

export default TestDetails;