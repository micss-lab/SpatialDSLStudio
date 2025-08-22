import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Container, 
  Paper, 
  Grid, 
  Button, 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  FormGroup, 
  FormControlLabel, 
  Checkbox, 
  TextField,
  Tabs,
  Tab,
  CircularProgress,
  Snackbar,
  Alert,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  IconButton
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReplayIcon from '@mui/icons-material/Replay';
import BugReportIcon from '@mui/icons-material/BugReport';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DeleteIcon from '@mui/icons-material/Delete';

import { useParams, useNavigate } from 'react-router-dom';
import { modelService } from '../../services/model.service';
import { metamodelService } from '../../services/metamodel.service';
import { testGenerationService, TestCase, TestGenerationOptions } from '../../services/testGeneration.service';
import { testRunnerService } from '../../services/testRunner.service';
import { testCoverageService, CoverageReport } from '../../services/testCoverage.service';
import TestCaseTable from './TestCaseTable';
import TestCoverageReport from './TestCoverageReport';
import { Model, Metamodel } from '../../models/types';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`mbt-tabpanel-${index}`}
      aria-labelledby={`mbt-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const ModelBasedTestingDashboard: React.FC = () => {
  const { metamodelId } = useParams<{ metamodelId: string }>();
  const navigate = useNavigate();
  const [metamodels, setMetamodels] = useState<Metamodel[]>([]);
  const [metamodel, setMetamodel] = useState<Metamodel | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [allTestCases, setAllTestCases] = useState<{ [metamodelId: string]: TestCase[] }>({});
  const [currentTab, setCurrentTab] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [coverageReport, setCoverageReport] = useState<CoverageReport | null>(null);
  const [alert, setAlert] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({
    open: false,
    message: '',
    severity: 'info'
  });

  // Test generation options
  const [options, setOptions] = useState<TestGenerationOptions>({
    includeAttributeTests: true,
    includeReferenceTests: true,
    includeConstraintTests: true,
    testCasesPerAttribute: 3,
    testCasesPerReference: 2,
    testCasesPerConstraint: 3
  });

  useEffect(() => {
    // Load all metamodels
    const allMetamodels = metamodelService.getAllMetamodels();
    setMetamodels(allMetamodels);
    
    // Load all test cases for all metamodels
    const testCasesMap: { [metamodelId: string]: TestCase[] } = {};
    allMetamodels.forEach(metamodel => {
      const metamodelTestCases = testGenerationService.getTestCasesForMetamodel(metamodel.id);
      testCasesMap[metamodel.id] = metamodelTestCases;
    });
    setAllTestCases(testCasesMap);
    
    // If metamodelId is provided, select that metamodel
    if (metamodelId) {
      const metamodelData = metamodelService.getMetamodelById(metamodelId);
      if (metamodelData) {
        handleSelectMetamodel(metamodelData);
      }
    }
  }, [metamodelId]);

  const handleSelectMetamodel = (selectedMetamodel: Metamodel) => {
    setMetamodel(selectedMetamodel);
    
    // Load existing test cases
    const existingTestCases = testGenerationService.getTestCasesForMetamodel(selectedMetamodel.id);
    setTestCases(existingTestCases);
    
    // Generate coverage report if tests exist
    if (existingTestCases.length > 0) {
      try {
        const report = testCoverageService.generateCoverageReportFromMetamodel(selectedMetamodel, existingTestCases);
        setCoverageReport(report);
      } catch (error) {
        console.error('Error generating coverage report:', error);
        setCoverageReport(null);
      }
    } else {
      setCoverageReport(null);
    }
  };

  const handleDeleteTestCases = (metamodelId: string) => {
    if (window.confirm('Are you sure you want to delete all test cases for this metamodel?')) {
      testGenerationService.deleteTestCasesForMetamodel(metamodelId);
      
      // Update local state
      setAllTestCases(prev => {
        const newState = { ...prev };
        newState[metamodelId] = [];
        return newState;
      });
      
      // If currently selected metamodel, update the testCases state too
      if (metamodel && metamodel.id === metamodelId) {
        setTestCases([]);
        setCoverageReport(null);
      }
      
      setAlert({
        open: true,
        message: 'Test cases deleted successfully',
        severity: 'success'
      });
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const handleGenerateTests = async () => {
    if (!metamodel) return;
    
    setIsGenerating(true);
    try {
      const generatedTests = await testGenerationService.generateTestCasesForMetamodel(metamodel.id, options);
      setTestCases(generatedTests);
      
      // Update allTestCases state
      setAllTestCases(prev => ({
        ...prev,
        [metamodel.id]: generatedTests
      }));
      
      // Switch to test cases tab
      setCurrentTab(1);
      
      // Generate coverage report
      const report = testCoverageService.generateCoverageReportFromMetamodel(metamodel, generatedTests);
      setCoverageReport(report);
      
      setAlert({
        open: true,
        message: `Generated ${generatedTests.length} test cases`,
        severity: 'success'
      });
    } catch (error: any) {
      setAlert({
        open: true,
        message: `Error generating test cases: ${error.message || 'Unknown error'}`,
        severity: 'error'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRunTests = async () => {
    if (!metamodel || testCases.length === 0) return;
    
    setIsRunning(true);
    try {
      const results = await testRunnerService.runTestsForMetamodel(metamodel.id, testCases);
      setTestCases([...results]); // Make a copy to trigger re-render
      
      // Update allTestCases state
      setAllTestCases(prev => ({
        ...prev,
        [metamodel.id]: results
      }));
      
      // Count passed and failed tests
      const passed = results.filter((test: TestCase) => test.status === 'passed').length;
      const failed = results.filter((test: TestCase) => test.status === 'failed').length;
      
      setAlert({
        open: true,
        message: `Test execution complete: ${passed} passed, ${failed} failed`,
        severity: failed > 0 ? 'warning' : 'success'
      });
      
      // Update coverage report
      const report = testCoverageService.generateCoverageReportFromMetamodel(metamodel, results);
      setCoverageReport(report);
    } catch (error: any) {
      setAlert({
        open: true,
        message: `Error running tests: ${error.message || 'Unknown error'}`,
        severity: 'error'
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunAllMetamodelTests = async () => {
    if (metamodels.length === 0) return;
    
    setIsRunning(true);
    let totalPassed = 0;
    let totalFailed = 0;
    
    try {
      // Run tests for each metamodel that has tests
      for (const currentMetamodel of metamodels) {
        const metamodelTests = allTestCases[currentMetamodel.id] || [];
        if (metamodelTests.length > 0) {
          const results = await testRunnerService.runTestsForMetamodel(currentMetamodel.id, metamodelTests);
          
          // Update allTestCases state
          setAllTestCases(prev => ({
            ...prev,
            [currentMetamodel.id]: results
          }));
          
          // Update current metamodel's test cases if it's the selected metamodel
          if (metamodel && metamodel.id === currentMetamodel.id) {
            setTestCases(results);
            const report = testCoverageService.generateCoverageReportFromMetamodel(currentMetamodel, results);
            setCoverageReport(report);
          }
          
          // Count results
          const passed = results.filter((test: TestCase) => test.status === 'passed').length;
          const failed = results.filter((test: TestCase) => test.status === 'failed').length;
          totalPassed += passed;
          totalFailed += failed;
        }
      }
      
      setAlert({
        open: true,
        message: `All tests complete: ${totalPassed} passed, ${totalFailed} failed`,
        severity: totalFailed > 0 ? 'warning' : 'success'
      });
    } catch (error: any) {
      setAlert({
        open: true,
        message: `Error running tests: ${error.message || 'Unknown error'}`,
        severity: 'error'
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleCloseAlert = () => {
    setAlert({
      ...alert,
      open: false
    });
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Metamodel-Based Testing
        </Typography>
        
        <Box sx={{ display: 'flex', mt: 2 }}>
          {/* Model Selection Panel */}
          <Paper
            elevation={3}
            sx={{
              width: '280px',
              p: 2,
              mr: 3,
              height: 'calc(100vh - 200px)',
              overflow: 'auto'
            }}
          >
            <Typography variant="h6" gutterBottom>
              Metamodels
            </Typography>
            
            {metamodels.length === 0 ? (
              <Typography variant="body2" color="textSecondary">
                No metamodels available. Please create a metamodel first.
              </Typography>
            ) : (
              <List>
                {metamodels.map((m) => {
                  const hasTests = allTestCases[m.id]?.length > 0;
                  const testCount = allTestCases[m.id]?.length || 0;
                  
                  return (
                    <ListItem
                      key={m.id}
                      disablePadding
                      secondaryAction={
                        hasTests ? (
                          <IconButton 
                            edge="end" 
                            onClick={() => handleDeleteTestCases(m.id)}
                            size="small"
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                        ) : null
                      }
                    >
                      <ListItemButton
                        selected={metamodel?.id === m.id}
                        onClick={() => handleSelectMetamodel(m)}
                      >
                        <ListItemText 
                          primary={m.name} 
                          secondary={hasTests ? `${testCount} test case${testCount === 1 ? '' : 's'}` : 'No tests'}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            )}
            
            <Divider sx={{ my: 2 }} />
            
            <Button
              variant="outlined"
              color="primary"
              fullWidth
              onClick={handleRunAllMetamodelTests}
              startIcon={isRunning ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
              disabled={isRunning || !Object.values(allTestCases).some(tests => tests.length > 0)}
            >
              {isRunning ? 'Running...' : 'Run All Metamodel Tests'}
            </Button>
          </Paper>
          
          {/* Main Testing Panel */}
          <Box sx={{ flexGrow: 1 }}>
            {metamodel ? (
              <>
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Metamodel: {metamodel.name}
                  </Typography>
                </Box>
                
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                  <Tabs value={currentTab} onChange={handleTabChange} aria-label="MBT tabs">
                    <Tab label="Generate Tests" id="mbt-tab-0" aria-controls="mbt-tabpanel-0" />
                    <Tab 
                      label={`Test Cases (${testCases.length})`} 
                      id="mbt-tab-1" 
                      aria-controls="mbt-tabpanel-1" 
                      disabled={testCases.length === 0}
                    />
                    <Tab 
                      label="Coverage Analysis" 
                      id="mbt-tab-2" 
                      aria-controls="mbt-tabpanel-2" 
                      disabled={!coverageReport}
                    />
                  </Tabs>
                </Box>
                
                <TabPanel value={currentTab} index={0}>
                  <Paper elevation={2} sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      Test Generation
                    </Typography>
                    
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                      <Button
                        variant="contained"
                        color="primary"
                        startIcon={isGenerating ? <CircularProgress size={20} color="inherit" /> : <BugReportIcon />}
                        onClick={handleGenerateTests}
                        disabled={isGenerating || !metamodel}
                        sx={{ mr: 2 }}
                      >
                        {isGenerating ? 'Generating...' : 'Generate Comprehensive Test Suite'}
                      </Button>
                      
                      {testCases.length > 0 && (
                        <Button
                          variant="contained"
                          color="secondary"
                          startIcon={isRunning ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                          onClick={handleRunTests}
                          disabled={isRunning || !metamodel}
                        >
                          {isRunning ? 'Running...' : 'Run Tests'}
                        </Button>
                      )}
                    </Box>
                    
                    <Typography variant="body2" color="textSecondary" sx={{ mt: 3, textAlign: 'center' }}>
                      The test generator will create a comprehensive test suite including:
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
                      <List dense>
                        <ListItem>
                          <ListItemText primary="• Attribute tests (boundary values, type validation)" />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="• Reference tests (cardinality, type compatibility)" />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="• Constraint tests (OCL and JavaScript constraints)" />
                        </ListItem>
                      </List>
                    </Box>
                  </Paper>
                </TabPanel>
                
                <TabPanel value={currentTab} index={1}>
                  <Paper elevation={2} sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6">
                        Test Cases
                      </Typography>
                      <Button
                        variant="contained"
                        color="secondary"
                        startIcon={isRunning ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                        onClick={handleRunTests}
                        disabled={isRunning || testCases.length === 0}
                      >
                        {isRunning ? 'Running...' : 'Run All Tests'}
                      </Button>
                    </Box>
                    
                    <TestCaseTable testCases={testCases} />
                  </Paper>
                </TabPanel>
                
                <TabPanel value={currentTab} index={2}>
                  {coverageReport && (
                    <Paper elevation={2} sx={{ p: 3 }}>
                      <Typography variant="h6" gutterBottom>
                        Test Coverage Report
                      </Typography>
                      
                      <TestCoverageReport report={coverageReport} />
                    </Paper>
                  )}
                </TabPanel>
              </>
            ) : (
              <Paper sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h6" gutterBottom>
                  Select a Metamodel
                </Typography>
                <Typography variant="body1">
                  Please select a metamodel from the list to generate and run tests.
                </Typography>
              </Paper>
            )}
          </Box>
        </Box>
      </Box>
      
      <Snackbar open={alert.open} autoHideDuration={6000} onClose={handleCloseAlert}>
        <Alert onClose={handleCloseAlert} severity={alert.severity}>
          {alert.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default ModelBasedTestingDashboard; 