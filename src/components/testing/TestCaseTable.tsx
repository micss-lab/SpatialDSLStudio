import React, { useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Collapse,
  IconButton,
  Chip,
  Typography,
  Divider,
  Button,
  Tooltip
} from '@mui/material';
import {
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  HourglassEmpty as HourglassEmptyIcon,
  PlayArrow as PlayArrowIcon,
  BugReport as BugReportIcon,
  SmartToy as SmartToyIcon
} from '@mui/icons-material';
import { TestCase, TestValue } from '../../services/testGeneration.service';

// Add type guard to check if a test case is of reference_attribute type
function isReferenceAttributeType(type: string): boolean {
  return type === 'reference_attribute';
}

interface TestCaseRowProps {
  testCase: TestCase;
}

const TestCaseRow: React.FC<TestCaseRowProps> = ({ testCase }) => {
  const [open, setOpen] = useState(false);

  // Generate concise explanation and fix suggestion for failed tests
  const getFailureExplanation = (testCase: TestCase): string => {
    if (testCase.status !== 'failed') return '';

    // Count how many test values failed
    const failedValues = testCase.testValues.filter(v => 
      v.result !== undefined && v.result !== v.expected
    );
    const failedCount = failedValues.length;
    
    // Generate appropriate explanation based on test type
    switch (testCase.type) {
      case 'attribute':
        return `${failedCount} value(s) failed validation. Check if '${testCase.targetProperty}' type or constraints are correctly defined.`;
      
      case 'reference':
        return `${failedCount} reference(s) failed validation. Verify cardinality and target type requirements for '${testCase.targetProperty}'.`;
      
      case 'constraint':
        if (testCase.constraintType === 'ocl') {
          return `OCL constraint failed for ${failedCount} value(s). Review OCL expression logic or expected results.`;
        } else {
          return `JavaScript constraint failed for ${failedCount} value(s). Check the constraint implementation.`;
        }
      
      default:
        return `${failedCount} test value(s) failed validation. Check details for more information.`;
    }
  };

  // Render a status chip based on the test case status
  const renderStatusChip = (status: string) => {
    switch (status) {
      case 'passed':
        return <Chip icon={<CheckCircleIcon />} label="Passed" color="success" size="small" />;
      case 'failed':
        return <Chip icon={<ErrorIcon />} label="Failed" color="error" size="small" />;
      case 'running':
        return <Chip icon={<PlayArrowIcon />} label="Running" color="primary" size="small" />;
      default:
        return <Chip icon={<HourglassEmptyIcon />} label="Pending" color="default" size="small" />;
    }
  };

  // Render a badge for test case type
  const renderTypeChip = (type: string) => {
    switch (type) {
      case 'attribute':
        return <Chip label="Attribute" size="small" color="info" />;
      case 'reference':
        return <Chip label="Reference" size="small" color="secondary" />;
      case 'reference_attribute':
        return <Chip label="Ref Attribute" size="small" color="success" />;
      case 'constraint':
        return <Chip label="Constraint" size="small" color="warning" />;
      default:
        return <Chip label={type} size="small" color="default" />;
    }
  };

  const handleViewDetails = () => {
    // Store test case data in localStorage instead of URL
    const testCaseId = testCase.id;
    localStorage.setItem(`test_details_${testCaseId}`, JSON.stringify({
      id: testCase.id,
      name: testCase.name,
      description: testCase.description,
      type: testCase.type,
      targetMetaClassName: testCase.targetMetaClassName,
      targetProperty: testCase.targetProperty,
      constraintId: testCase.constraintId,
      constraintType: testCase.constraintType,
      testValues: testCase.testValues,
      status: testCase.status,
      errorMessage: testCase.errorMessage,
      // Add AI-related properties
      aiPrompt: testCase.aiPrompt,
      aiResponse: testCase.aiResponse,
      // Add input/output data if available
      originalInput: testCase.originalInput,
      expectedOutput: testCase.expectedOutput,
      actualOutput: testCase.actualOutput
    }));

    // Open in new tab with just the ID reference
    window.open(`/test-details?id=${testCaseId}`, '_blank');
  };
  
  const handleViewAIResponse = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row expansion
    
    // Store test case data in localStorage instead of URL
    const testCaseId = testCase.id;
    localStorage.setItem(`test_details_${testCaseId}`, JSON.stringify({
      id: testCase.id,
      name: testCase.name,
      description: testCase.description,
      type: testCase.type,
      targetMetaClassName: testCase.targetMetaClassName,
      targetProperty: testCase.targetProperty,
      constraintId: testCase.constraintId,
      constraintType: testCase.constraintType,
      testValues: testCase.testValues,
      status: testCase.status,
      errorMessage: testCase.errorMessage,
      // Add AI-related properties
      aiPrompt: testCase.aiPrompt,
      aiResponse: testCase.aiResponse,
      // Add input/output data if available
      originalInput: testCase.originalInput,
      expectedOutput: testCase.expectedOutput,
      actualOutput: testCase.actualOutput
    }));

    // Open in new tab with just the ID reference and showAiResponse flag
    window.open(`/test-details?id=${testCaseId}&showAiResponse=true`, '_blank');
  };

  return (
    <>
      <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
        <TableCell>
          <IconButton
            aria-label="expand row"
            size="small"
            onClick={() => setOpen(!open)}
          >
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell component="th" scope="row">
          {testCase.name}
        </TableCell>
        <TableCell>{testCase.targetMetaClassName}</TableCell>
        <TableCell>
          {renderTypeChip(testCase.type)}
        </TableCell>
        <TableCell>
          {testCase.type === 'attribute' ? testCase.targetProperty : 
           testCase.type === 'reference' ? testCase.targetProperty :
           isReferenceAttributeType(testCase.type) ? testCase.targetProperty :
           testCase.type === 'constraint' ? (testCase.constraintType === 'ocl' ? 'OCL Constraint' : 'JavaScript Constraint') : ''}
        </TableCell>
        <TableCell align="center">
          {renderStatusChip(testCase.status)}
          {testCase.status === 'failed' && (
            <Button
              size="small"
              startIcon={<BugReportIcon />}
              onClick={handleViewDetails}
              sx={{ ml: 1 }}
            >
              Details
            </Button>
          )}
          {testCase.aiResponse && (
            <Tooltip title="View AI response that generated this test">
              <Button
                size="small"
                startIcon={<SmartToyIcon />}
                onClick={handleViewAIResponse}
                sx={{ ml: 1 }}
              >
                AI
              </Button>
            </Tooltip>
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 1 }}>
              <Typography variant="subtitle2" gutterBottom component="div">
                Description
              </Typography>
              <Typography variant="body2" gutterBottom>
                {testCase.description}
              </Typography>
              
              {testCase.errorMessage && (
                <Box sx={{ mt: 1, mb: 1 }}>
                  <Typography variant="subtitle2" color="error">
                    Error: {testCase.errorMessage}
                  </Typography>
                </Box>
              )}
              
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="subtitle2" gutterBottom component="div">
                Test Values
              </Typography>
              <Table size="small" aria-label="test values">
                <TableHead>
                  <TableRow>
                    <TableCell>Value</TableCell>
                    <TableCell>Expected</TableCell>
                    <TableCell>Result</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {testCase.testValues.map((value, index) => (
                    <TableRow key={value.id || index}>
                      <TableCell component="th" scope="row">
                        {(() => {
                          // For object values
                          if (typeof value.value === 'object') {
                            if (value.value === null) {
                              return <i>null</i>;
                            }
                            
                            // Handle array objects
                            if (Array.isArray(value.value)) {
                              return (
                                <Tooltip title={JSON.stringify(value.value, null, 2)}>
                                  <span>
                                    {value.description || 'Array'} ({value.value.length} items)
                                  </span>
                                </Tooltip>
                              );
                            }
                            
                            // Handle reference objects with type and description
                            if ('type' in value.value && 'description' in value.value) {
                              return (
                                <Tooltip title={JSON.stringify(value.value, null, 2)}>
                                  <span>
                                    {value.value.type} {value.value.description ? `(${value.value.description})` : ''}
                                  </span>
                                </Tooltip>
                              );
                            }
                            
                            // Generic object
                            return (
                              <Tooltip title={JSON.stringify(value.value, null, 2)}>
                                <span>
                                  {value.description || 'Object'} ({Object.keys(value.value).length} props)
                                </span>
                              </Tooltip>
                            );
                          }
                          
                          // For string values
                          if (typeof value.value === 'string') {
                            try {
                              // Check if the string is a JSON
                              if ((value.value.trim().startsWith('{') && value.value.trim().endsWith('}')) || 
                                  (value.value.trim().startsWith('[') && value.value.trim().endsWith(']'))) {
                                
                                const parsedObj = JSON.parse(value.value);
                                
                                // Handle parsed arrays
                                if (Array.isArray(parsedObj)) {
                                  return (
                                    <Tooltip title={JSON.stringify(parsedObj, null, 2)}>
                                      <span>
                                        {value.description || 'Array'} ({parsedObj.length} items)
                                      </span>
                                    </Tooltip>
                                  );
                                }
                                
                                // Handle age constraint object specifically
                                if ('age' in parsedObj) {
                                  return (
                                    <Tooltip title={JSON.stringify(parsedObj, null, 2)}>
                                      <span>
                                        Age: {parsedObj.age}
                                      </span>
                                    </Tooltip>
                                  );
                                }
                                
                                // Handle reference objects with type and description
                                if ('type' in parsedObj && 'description' in parsedObj) {
                                  return (
                                    <Tooltip title={JSON.stringify(parsedObj, null, 2)}>
                                      <span>
                                        {parsedObj.type} {parsedObj.description ? `(${parsedObj.description})` : ''}
                                      </span>
                                    </Tooltip>
                                  );
                                }
                                
                                // Generic parsed object
                                return (
                                  <Tooltip title={JSON.stringify(parsedObj, null, 2)}>
                                    <span>
                                      {value.description || 'Object'} ({Object.keys(parsedObj).length} props)
                                    </span>
                                  </Tooltip>
                                );
                              }
                            } catch (e) {
                              // Not valid JSON, continue to default
                            }
                          }
                          
                          // Default string or other primitive display
                          return String(value.value);
                        })()}
                      </TableCell>
                      <TableCell>
                        {value.expected ? (
                          <Chip icon={<CheckCircleIcon />} label="Valid" color="success" size="small" />
                        ) : (
                          <Chip icon={<ErrorIcon />} label="Invalid" color="error" size="small" />
                        )}
                      </TableCell>
                      <TableCell>
                        {value.result === undefined ? (
                          <Chip label="Not Run" size="small" color="default" />
                        ) : value.result === value.expected ? (
                          <Chip icon={<CheckCircleIcon />} label="Pass" color="success" size="small" />
                        ) : (
                          <Chip icon={<WarningIcon />} label="Fail" color="error" size="small" />
                        )}
                        {value.errorMessage && (
                          <Typography variant="caption" color="error" display="block">
                            {value.errorMessage}
                          </Typography>
                        )}
                        {value.result !== undefined && value.result !== value.expected && (
                          <Tooltip title="Why this test failed">
                            <Typography variant="caption" color="error" display="block">
                              Expected {value.expected ? 'valid' : 'invalid'} but was {value.result ? 'valid' : 'invalid'}
                            </Typography>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {testCase.status === 'failed' && (
                <Box sx={{ mt: 2, p: 1, bgcolor: 'error.light', borderRadius: 1 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Failure Analysis:
                  </Typography>
                  <Typography variant="body2">
                    {getFailureExplanation(testCase)}
                  </Typography>
                </Box>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

interface TestCaseTableProps {
  testCases: TestCase[];
}

const TestCaseTable: React.FC<TestCaseTableProps> = ({ testCases }) => {
  return (
    <TableContainer component={Paper}>
      <Table aria-label="test cases table">
        <TableHead>
          <TableRow>
            <TableCell />
            <TableCell>Test Case</TableCell>
            <TableCell>Target Class</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Target Property</TableCell>
            <TableCell align="center">Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {testCases.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} align="center">
                <Typography variant="body2" color="textSecondary">
                  No test cases available. Generate test cases first.
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            testCases.map((testCase) => (
              <TestCaseRow key={testCase.id} testCase={testCase} />
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default TestCaseTable; 