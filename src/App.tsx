import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Box,
  Paper,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  CssBaseline,
  Drawer,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  SelectChangeEvent,
  ListItemButton,
  Snackbar,
  Alert,
  ListItemIcon
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import MenuIcon from '@mui/icons-material/Menu';
import CodeIcon from '@mui/icons-material/Code';
import SchemaIcon from '@mui/icons-material/Schema';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import DeleteIcon from '@mui/icons-material/Delete';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import BugReportIcon from '@mui/icons-material/BugReport';

import MetamodelManager from './components/metamodel/MetamodelManager';
import ModelManager from './components/model/ModelManager';
import DiagramEditor from './components/diagram/DiagramEditor';
import Diagram3DEditor from './components/diagram/Diagram3DEditor';
import CodeGenerator from './components/codegeneration/CodeGenerator';
import AIMetamodelGenerator from './components/ai/AIMetamodelGenerator';
import TransformationDashboard from './components/transformation/TransformationDashboard';
import ModelBasedTestingDashboard from './components/testing/ModelBasedTestingDashboard';
import TestDetails from './components/testing/TestDetails';
import { metamodelService } from './services/metamodel.service';
import { diagramService } from './services/diagram.service';
import { modelService } from './services/model.service';
import { jsService } from './services/js.service';
import { Metamodel, Diagram, Model, Constraint } from './models/types';

// Create a theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#3641f5', // brand-600 from template
      light: '#465fff', // brand-500 from template
      dark: '#2a31d8', // brand-700 from template
    },
    secondary: {
      main: '#f04438', // error-500 from template
      light: '#f97066', // error-400 from template
      dark: '#d92d20', // error-600 from template
    },
    background: {
      default: '#f9fafb', // gray-50 from template
      paper: '#ffffff',
    },
    text: {
      primary: '#101828', // gray-900 from template
      secondary: '#475467', // gray-600 from template
    },
    grey: {
      50: '#f9fafb',
      100: '#f2f4f7',
      200: '#e4e7ec',
      300: '#d0d5dd',
      400: '#98a2b3',
      500: '#667085',
      600: '#475467',
      700: '#344054',
      800: '#1d2939',
      900: '#101828',
    },
    success: {
      main: '#12b76a', // success-500 from template
      light: '#32d583', // success-400 from template
      dark: '#039855', // success-600 from template
    },
    warning: {
      main: '#f79009', // warning-500 from template
      light: '#fdb022', // warning-400 from template
      dark: '#dc6803', // warning-600 from template
    },
    error: {
      main: '#f04438', // error-500 from template
      light: '#f97066', // error-400 from template
      dark: '#d92d20', // error-600 from template
    },
  },
  typography: {
    fontFamily: 'Outfit, sans-serif',
    h1: { fontWeight: 600 },
    h2: { fontWeight: 600 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          color: '#101828',
          boxShadow: '0px 1px 3px 0px rgba(16, 24, 40, 0.1), 0px 1px 2px 0px rgba(16, 24, 40, 0.06)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#ffffff',
          borderRight: '1px solid #e4e7ec',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '4px 0',
          '&.Mui-selected': {
            backgroundColor: '#ecf3ff',
            color: '#3641f5',
            '& .MuiListItemIcon-root': {
              color: '#3641f5',
            },
          },
          '&:hover': {
            backgroundColor: '#f2f4f7',
          },
        },
      },
    },
  },
});

const App: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };
  
  // Apply template styles to body
  useEffect(() => {
    document.body.classList.add('template-theme');
    return () => {
      document.body.classList.remove('template-theme');
    };
  }, []);

  // Initialize services
  React.useEffect(() => {
    // Initialize circular dependencies between services
    console.log('App.tsx: Initializing service dependencies');
    
    // First initialize the services directly rather than through imports
    // This is critical for breaking the circular dependency between
    // jsService and modelService
    try {
      modelService.setJSService(jsService);
      jsService.setModelService(modelService);
      console.log('App.tsx: Successfully initialized service dependencies');
      
      // Test that both services have proper references to each other
      if (!jsService.modelService) {
        console.error('App.tsx: jsService does not have a valid modelService reference');
      }
    } catch (error) {
      console.error('App.tsx: Error initializing service dependencies:', error);
    }
    
    // ... existing initialization code ...
  }, []);

  useEffect(() => {
    console.log("App.tsx: Running emergency constraint type cleanup");
    
    // Safety check to run on every app load
    try {
      // Load metamodels
      const metamodelsStorage = localStorage.getItem('obeo_like_tool_metamodels');
      if (metamodelsStorage) {
        const metamodels = JSON.parse(metamodelsStorage);
        let fixesApplied = 0;
        
        // Look for constraints with type issues
        for (const metamodel of metamodels) {
          // Process metaclass constraints
          for (const cls of metamodel.classes || []) {
            if (cls.constraints) {
              for (const constraint of cls.constraints) {
                // Missing type field - detect based on syntax
                if (!('type' in constraint)) {
                  if (constraint.expression && 
                      (constraint.expression.includes('function(') || 
                       constraint.expression.includes('=>') || 
                       constraint.expression.includes('if (') || 
                       constraint.expression.includes('return {'))) {
                    constraint.type = 'javascript';
                  } else {
                    constraint.type = 'ocl';
                  }
                  fixesApplied++;
                  console.log(`Fixed missing type for constraint "${constraint.name}"`);
                }
                
                // Fix JavaScript constraints incorrectly marked as OCL
                if (constraint.type === 'ocl' && 
                    constraint.expression && 
                    (constraint.expression.includes('function(') || 
                     constraint.expression.includes('=>') || 
                     constraint.expression.includes('if (') || 
                     constraint.expression.includes('return {'))) {
                  constraint.type = 'javascript';
                  fixesApplied++;
                  console.log(`Fixed JavaScript constraint "${constraint.name}" incorrectly marked as OCL`);
                }
                
                // Fix OCL constraints incorrectly marked as JavaScript
                if (constraint.type === 'javascript' && 
                    constraint.expression && 
                    !constraint.expression.includes('function') && 
                    !constraint.expression.includes('=>') &&
                    !constraint.expression.includes('if (') &&
                    !constraint.expression.includes('return') &&
                    (constraint.expression.includes('->') || 
                     (constraint.expression.includes('context') && 
                      constraint.expression.includes('inv')))) {
                  constraint.type = 'ocl';
                  fixesApplied++;
                  console.log(`Fixed OCL constraint "${constraint.name}" incorrectly marked as JavaScript`);
                }
              }
            }
          }
          
          // Process global constraints 
          if (metamodel.constraints) {
            for (const constraint of metamodel.constraints) {
              // Missing type field - detect based on syntax
              if (!('type' in constraint)) {
                if (constraint.expression && 
                    (constraint.expression.includes('function(') || 
                     constraint.expression.includes('=>') || 
                     constraint.expression.includes('if (') || 
                     constraint.expression.includes('return {'))) {
                  constraint.type = 'javascript';
                } else {
                  constraint.type = 'ocl';
                }
                fixesApplied++;
                console.log(`Fixed missing type for global constraint "${constraint.name}"`);
              }
              
              // Fix JavaScript constraints incorrectly marked as OCL
              if (constraint.type === 'ocl' && 
                  constraint.expression && 
                  (constraint.expression.includes('function(') || 
                   constraint.expression.includes('=>') || 
                   constraint.expression.includes('if (') || 
                   constraint.expression.includes('return {'))) {
                constraint.type = 'javascript';
                fixesApplied++;
                console.log(`Fixed global JavaScript constraint "${constraint.name}" incorrectly marked as OCL`);
              }
              
              // Fix OCL constraints incorrectly marked as JavaScript
              if (constraint.type === 'javascript' && 
                  constraint.expression && 
                  !constraint.expression.includes('function') && 
                  !constraint.expression.includes('=>') &&
                  !constraint.expression.includes('if (') &&
                  !constraint.expression.includes('return') &&
                  (constraint.expression.includes('->') || 
                   (constraint.expression.includes('context') && 
                    constraint.expression.includes('inv')))) {
                constraint.type = 'ocl';
                fixesApplied++;
                console.log(`Fixed global OCL constraint "${constraint.name}" incorrectly marked as JavaScript`);
              }
            }
          }
        }
        
        if (fixesApplied > 0) {
          console.log(`App.tsx: Fixed ${fixesApplied} constraint type issues in runtime cleanup`);
          localStorage.setItem('obeo_like_tool_metamodels', JSON.stringify(metamodels));
        } else {
          console.log("App.tsx: No constraint type issues found");
        }
      }
    } catch (error) {
      console.error("App.tsx: Error in constraint cleanup", error);
    }
  }, []);

  // Run constraint type migration on app startup
  useEffect(() => {
    console.log("App.tsx: Running constraint type verification");
    
    // This is a safety check that runs on every app load to ensure constraints have proper types
    try {
      // Load metamodels
      const metamodelsStorage = localStorage.getItem('obeo_like_tool_metamodels');
      if (metamodelsStorage) {
        const metamodels = JSON.parse(metamodelsStorage);
        let fixesApplied = 0;
        
        // Process all metamodels
        for (const metamodel of metamodels) {
          let metamodelModified = false;
          
          // Process constraints in all metaclasses
          for (const cls of metamodel.classes) {
            if (cls.constraints && Array.isArray(cls.constraints)) {
              let classModified = false;
              
              // First, deduplicate constraints by ID to prevent double-processing
              const uniqueConstraints = new Map<string, any>();
              cls.constraints.forEach((c: Constraint) => {
                if (!uniqueConstraints.has(c.id)) {
                  uniqueConstraints.set(c.id, c);
                } else {
                  // If duplicate found, keep the correctly typed one
                  const existing = uniqueConstraints.get(c.id);
                  if (c.type === 'javascript' && existing.type !== 'javascript' && isJavaScriptSyntax(c.expression)) {
                    uniqueConstraints.set(c.id, c);
                  } else if (c.type === 'ocl' && existing.type !== 'ocl' && isOCLSyntax(c.expression)) {
                    uniqueConstraints.set(c.id, c);
                  }
                  fixesApplied++;
                  classModified = true;
                }
              });
              
              // Then process each constraint for type correctness
              let newConstraints = Array.from(uniqueConstraints.values());
              
              for (let i = 0; i < newConstraints.length; i++) {
                const c = newConstraints[i];
                
                // Detect JavaScript syntax in constraints
                if (isJavaScriptSyntax(c.expression) && (!c.type || c.type !== 'javascript')) {
                  console.log(`Fixing JS constraint with wrong type: ${c.name}`);
                  c.type = 'javascript';
                  fixesApplied++;
                  classModified = true;
                }
                
                // Detect OCL syntax in constraints
                else if (isOCLSyntax(c.expression) && (!c.type || c.type !== 'ocl')) {
                  console.log(`Fixing OCL constraint with wrong type: ${c.name}`);
                  c.type = 'ocl';
                  fixesApplied++;
                  classModified = true;
                }
                
                // For constraints without type, assign a type based on syntax
                else if (!c.type) {
                  if (isJavaScriptSyntax(c.expression)) {
                    c.type = 'javascript';
                  } else {
                    c.type = 'ocl';
                  }
                  fixesApplied++;
                  classModified = true;
                }
              }
              
              if (classModified) {
                cls.constraints = newConstraints;
                metamodelModified = true;
              }
            }
          }
          
          // Process global constraints in metamodel
          if (metamodel.constraints && Array.isArray(metamodel.constraints)) {
            // Similar processing as for metaclass constraints
            let globalModified = false;
            
            // Deduplicate global constraints
            const uniqueGlobalConstraints = new Map<string, any>();
            metamodel.constraints.forEach((c: Constraint) => {
              if (!uniqueGlobalConstraints.has(c.id)) {
                uniqueGlobalConstraints.set(c.id, c);
              } else {
                fixesApplied++;
                globalModified = true;
              }
            });
            
            let newGlobalConstraints = Array.from(uniqueGlobalConstraints.values());
            
            for (let i = 0; i < newGlobalConstraints.length; i++) {
              const c = newGlobalConstraints[i];
              
              // Apply same type fixes as for metaclass constraints
              if (isJavaScriptSyntax(c.expression) && (!c.type || c.type !== 'javascript')) {
                c.type = 'javascript';
                fixesApplied++;
                globalModified = true;
              } else if (isOCLSyntax(c.expression) && (!c.type || c.type !== 'ocl')) {
                c.type = 'ocl';
                fixesApplied++;
                globalModified = true;
              } else if (!c.type) {
                if (isJavaScriptSyntax(c.expression)) {
                  c.type = 'javascript';
                } else {
                  c.type = 'ocl';
                }
                fixesApplied++;
                globalModified = true;
              }
            }
            
            if (globalModified) {
              metamodel.constraints = newGlobalConstraints;
              metamodelModified = true;
            }
          }
          
          if (metamodelModified) {
            // Save only if changes were made
            metamodelService.updateMetamodel(metamodel.id, metamodel);
          }
        }
        
        if (fixesApplied > 0) {
          console.log(`Fixed ${fixesApplied} constraint types during startup verification`);
        }
      }
    } catch (error) {
      console.error('Error during constraint type verification:', error);
    }
  }, []);
  
  // Helper functions for detecting constraint syntax
  function isJavaScriptSyntax(expression: string): boolean {
    if (!expression) return false;
    
    const jsPatterns = [
      'function(', 'function (', '=>', '&&', '||', 
      'var ', 'let ', 'const ', 'return ', 'if(', 'if (', 
      'for(', 'for (', 'while(', 'while (', 'new ', 'this.',
      '{', '}', ';', '=='
    ];
    
    return jsPatterns.some(pattern => expression.includes(pattern));
  }
  
  function isOCLSyntax(expression: string): boolean {
    if (!expression) return false;
    
    const oclPatterns = [
      'context ', ' inv ', '->select', '->collect', '->forAll', 
      '->exists', '->isEmpty', '->notEmpty', '->size', '->includes',
      '->excludes', '->including', '->excluding', '->first', '->last'
    ];
    
    return oclPatterns.some(pattern => expression.includes(pattern));
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <AppBar position="static">
            <Toolbar>
              <IconButton
                edge="start"
                color="inherit"
                aria-label="menu"
                onClick={toggleDrawer}
                sx={{ mr: 2 }}
              >
                <MenuIcon />
              </IconButton>
              <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                Modeling Tool v1.0
              </Typography>
              <Button color="inherit" component={Link} to="/">
                Home
              </Button>
              <Button color="inherit" component={Link} to="/metamodels">
                Metamodels
              </Button>
              <Button color="inherit" component={Link} to="/models">
                Models
              </Button>
              <Button color="inherit" component={Link} to="/diagrams">
                Diagrams
              </Button>
              <Button color="inherit" component={Link} to="/code-generation">
                Code Generation
              </Button>
              <Button color="inherit" component={Link} to="/ai-generator">
                AI Generator
              </Button>
              <Button color="inherit" component={Link} to="/transformations">
                Transformations
              </Button>
              <Button color="inherit" component={Link} to="/testing">
                Testing
              </Button>
            </Toolbar>
          </AppBar>

          <Drawer
            anchor="left"
            open={drawerOpen}
            onClose={toggleDrawer}
          >
            <Box
              sx={{ width: 250 }}
              role="presentation"
              onClick={toggleDrawer}
            >
              <List>
                <ListItem disablePadding>
                  <ListItemButton component={Link} to="/">
                    <ListItemText primary="Home" />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton component={Link} to="/metamodels">
                    <SchemaIcon sx={{ mr: 2 }} />
                    <ListItemText primary="Metamodels" />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton component={Link} to="/models">
                    <ModelTrainingIcon sx={{ mr: 2 }} />
                    <ListItemText primary="Models" />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton component={Link} to="/diagrams">
                    <DesignServicesIcon sx={{ mr: 2 }} />
                    <ListItemText primary="Diagrams" />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton component={Link} to="/code-generation">
                    <CodeIcon sx={{ mr: 2 }} />
                    <ListItemText primary="Code Generation" />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton component={Link} to="/ai-generator">
                    <SmartToyIcon sx={{ mr: 2 }} />
                    <ListItemText primary="AI Generator" />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton component={Link} to="/transformations">
                    <ListItemIcon>
                      <AutorenewIcon />
                    </ListItemIcon>
                    <ListItemText primary="Transformations" />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton component={Link} to="/testing">
                    <ListItemIcon>
                      <BugReportIcon />
                    </ListItemIcon>
                    <ListItemText primary="Metamodel-Based Testing" />
                  </ListItemButton>
                </ListItem>
                <Divider />
                <ListItem disablePadding>
                  <ListItemButton component={Link} to="/about">
                    <ListItemText primary="About" />
                  </ListItemButton>
                </ListItem>
              </List>
            </Box>
          </Drawer>

          <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/metamodels" element={<MetamodelsPage />} />
              <Route path="/metamodels/:id" element={<MetamodelEditorPage />} />
              <Route path="/models" element={<ModelsPage />} />
              <Route path="/models/:id" element={<ModelEditorPage />} />
              <Route path="/diagrams" element={<DiagramsPage />} />
              <Route path="/diagrams/:id" element={<DiagramEditorPage />} />
              <Route path="/diagrams/:id/code" element={<CodeGenerationPage />} />
              <Route path="/code-generation" element={<StandaloneCodeGenerationPage />} />
              <Route path="/ai-generator" element={<AIMetamodelGeneratorPage />} />
              <Route path="/transformations" element={<TransformationDashboard />} />
              <Route path="/testing" element={<ModelBasedTestingDashboard />} />
              <Route path="/testing/:metamodelId" element={<ModelBasedTestingDashboard />} />
              <Route path="/test-details" element={<TestDetails />} />
              <Route path="/about" element={<AboutPage />} />
            </Routes>
          </Box>
        </Box>
      </Router>
    </ThemeProvider>
  );
};

// Home Page
const HomePage: React.FC = () => {
  return (
    <Container sx={{ mt: 4, pb: 4, height: '100%', overflow: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Welcome to Modeling Tool v1.0
      </Typography>
      
      <Typography paragraph>
        This tool allows you to create your own custom modeling language by defining metamodels,
        creating models based on those metamodels, and visualizing models with diagrams.
      </Typography>
      
      <Box sx={{ display: 'flex', gap: 2, mt: 4, flexWrap: 'wrap' }}>
        <Paper sx={{ p: 3, flexGrow: 1, minWidth: '270px' }}>
          <SchemaIcon sx={{ fontSize: 40, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Define Metamodels
          </Typography>
          <Typography>
            Create your own custom modeling language by defining metaclasses, attributes, and relationships.
          </Typography>
          <Button
            component={Link}
            to="/metamodels"
            variant="contained"
            sx={{ mt: 2 }}
          >
            Manage Metamodels
          </Button>
        </Paper>
        
        <Paper sx={{ p: 3, flexGrow: 1, minWidth: '270px' }}>
          <ModelTrainingIcon sx={{ fontSize: 40, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Create Models
          </Typography>
          <Typography>
            Instantiate your metamodels to create concrete models for your specific domain.
          </Typography>
          <Button
            component={Link}
            to="/models"
            variant="contained"
            sx={{ mt: 2 }}
          >
            Manage Models
          </Button>
        </Paper>
        
        <Paper sx={{ p: 3, flexGrow: 1, minWidth: '270px' }}>
          <DesignServicesIcon sx={{ fontSize: 40, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Design Diagrams
          </Typography>
          <Typography>
            Create visual representations of your models with customizable diagrams.
          </Typography>
          <Button
            component={Link}
            to="/diagrams"
            variant="contained"
            sx={{ mt: 2 }}
          >
            Manage Diagrams
          </Button>
        </Paper>
        
        <Paper sx={{ p: 3, flexGrow: 1, minWidth: '270px' }}>
          <CodeIcon sx={{ fontSize: 40, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Generate Code
          </Typography>
          <Typography>
            Transform your models into code using customizable templates.
          </Typography>
          <Button
            component={Link}
            to="/code-generation"
            variant="contained"
            sx={{ mt: 2 }}
          >
            Code Generation
          </Button>
        </Paper>
        
        <Paper sx={{ p: 3, flexGrow: 1, minWidth: '270px' }}>
          <SmartToyIcon sx={{ fontSize: 40, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            AI Metamodel Generator
          </Typography>
          <Typography>
            Use AI to automatically generate metamodels from domain descriptions.
          </Typography>
          <Button
            component={Link}
            to="/ai-generator"
            variant="contained"
            sx={{ mt: 2 }}
          >
            Generate with AI
          </Button>
        </Paper>
        
        <Paper sx={{ p: 3, flexGrow: 1, minWidth: '270px' }}>
          <BugReportIcon sx={{ fontSize: 40, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Metamodel-Based Testing
          </Typography>
          <Typography>
            Validate your metamodels by generating and running tests.
          </Typography>
          <Button
            component={Link}
            to="/testing"
            variant="contained"
            sx={{ mt: 2 }}
          >
            Test Metamodels
          </Button>
        </Paper>
      </Box>
    </Container>
  );
};

// Metamodels Page
const MetamodelsPage: React.FC = () => {
  const navigate = useNavigate();
  const [metamodels, setMetamodels] = useState<Metamodel[]>(metamodelService.getAllMetamodels());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newMetamodelName, setNewMetamodelName] = useState('');

  const handleCreateMetamodel = () => {
    if (newMetamodelName.trim()) {
      const newMetamodel = metamodelService.createMetamodel(newMetamodelName);
      setMetamodels([...metamodels, newMetamodel]);
      setNewMetamodelName('');
      setIsDialogOpen(false);
    }
  };

  const handleDeleteMetamodel = (id: string) => {
    if (window.confirm('Are you sure you want to delete this metamodel?')) {
      metamodelService.deleteMetamodel(id);
      setMetamodels(metamodels.filter(m => m.id !== id));
    }
  };

  return (
    <Container sx={{ mt: 4, pb: 4, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          Metamodels
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setIsDialogOpen(true)}
        >
          Create Metamodel
        </Button>
      </Box>
      
      {metamodels.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="textSecondary" gutterBottom>
            No Metamodels Found
          </Typography>
          <Typography color="textSecondary" paragraph>
            Create your first metamodel to get started.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setIsDialogOpen(true)}
          >
            Create Metamodel
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 3 }}>
          {metamodels.map(metamodel => (
            <Paper
              key={metamodel.id}
              sx={{
                p: 3,
                cursor: 'pointer',
                '&:hover': { boxShadow: 6 }
              }}
              onClick={() => navigate(`/metamodels/${metamodel.id}`)}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Typography variant="h6" gutterBottom>
                  {metamodel.name}
                </Typography>
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteMetamodel(metamodel.id);
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
              <Typography color="textSecondary" gutterBottom>
                {metamodel.classes.length} Classes
              </Typography>
              <Button
                variant="outlined"
                size="small"
                sx={{ mt: 1 }}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/metamodels/${metamodel.id}`);
                }}
              >
                Edit
              </Button>
            </Paper>
          ))}
        </Box>
      )}
      
      <Dialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)}>
        <DialogTitle>Create New Metamodel</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Metamodel Name"
            fullWidth
            value={newMetamodelName}
            onChange={(e) => setNewMetamodelName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateMetamodel} color="primary">
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

// Metamodel Editor Page
const MetamodelEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  
  if (!id) {
    return <Typography>Invalid metamodel ID</Typography>;
  }
  
  return <MetamodelManager />;
};

// Models Page
const ModelsPage: React.FC = () => {
  return <ModelManager />;
};

// Model Editor Page
const ModelEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  
  if (!id) {
    return <Typography>Invalid model ID</Typography>;
  }
  
  return <ModelManager />;
};

// Diagrams Page
const DiagramsPage: React.FC = () => {
  const navigate = useNavigate();
  const [diagrams, setDiagrams] = useState<Diagram[]>(diagramService.getAllDiagrams());
  const [models, setModels] = useState<Model[]>(modelService.getAllModels());
  const [metamodels, setMetamodels] = useState<Metamodel[]>(metamodelService.getAllMetamodels());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newDiagramName, setNewDiagramName] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateDiagram = () => {
    if (newDiagramName.trim() && selectedModelId) {
      const newDiagram = diagramService.createDiagram(newDiagramName, selectedModelId);
      setDiagrams([...diagrams, newDiagram]);
      setNewDiagramName('');
      setSelectedModelId('');
      setIsDialogOpen(false);
    }
  };

  const handleDeleteDiagram = (id: string) => {
    if (window.confirm('Are you sure you want to delete this diagram?')) {
      diagramService.deleteDiagram(id);
      setDiagrams(diagrams.filter(d => d.id !== id));
    }
  };

  const handleModelChange = (event: SelectChangeEvent) => {
    setSelectedModelId(event.target.value);
  };

  const handleImportDiagram = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = e.target?.result as string;
        const importedDiagram = diagramService.importDiagramFromJSON(jsonData);
        
        if (importedDiagram) {
          setDiagrams(diagramService.getAllDiagrams());
          setSnackbarMessage('Diagram imported successfully');
          setSnackbarSeverity('success');
        } else {
          setSnackbarMessage('Failed to import diagram. Check if the referenced model exists.');
          setSnackbarSeverity('error');
        }
      } catch (error) {
        setSnackbarMessage('Error importing diagram: Invalid file format');
        setSnackbarSeverity('error');
      }
      setSnackbarOpen(true);
    };
    
    reader.readAsText(file);
    
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExportDiagram = (id: string, name: string) => {
    const jsonData = diagramService.exportDiagramToJSON(id);
    if (!jsonData) {
      setSnackbarMessage('Failed to export diagram');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }
    
    // Create file and download it
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}_diagram.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setSnackbarMessage('Diagram exported successfully');
    setSnackbarSeverity('success');
    setSnackbarOpen(true);
  };

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
  };

  return (
    <Container sx={{ mt: 4, pb: 4, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          Diagrams
        </Typography>
        <Button
          variant="contained"
          color="secondary"
          startIcon={<FileUploadIcon />}
          onClick={handleImportDiagram}
          sx={{ mr: 2 }}
          disabled={models.length === 0}
        >
          Import Diagram
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".json"
          style={{ display: 'none' }}
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setIsDialogOpen(true)}
          disabled={models.length === 0}
        >
          Create Diagram
        </Button>
      </Box>
      
      {models.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="textSecondary" gutterBottom>
            No Models Available
          </Typography>
          <Typography color="textSecondary" paragraph>
            You need to create a model before creating diagrams.
          </Typography>
          <Button
            variant="outlined"
            component={Link}
            to="/models"
          >
            Create Model
          </Button>
        </Paper>
      ) : diagrams.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="textSecondary" gutterBottom>
            No Diagrams Found
          </Typography>
          <Typography color="textSecondary" paragraph>
            Create your first diagram to get started.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setIsDialogOpen(true)}
          >
            Create Diagram
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 3 }}>
          {diagrams.map(diagram => {
            const model = models.find((m: Model) => m.id === diagram.modelId);
            const metamodel = model ? metamodels.find((m: Metamodel) => m.id === model.conformsTo) : undefined;
            return (
              <Paper
                key={diagram.id}
                sx={{
                  p: 3,
                  cursor: 'pointer',
                  '&:hover': { boxShadow: 6 }
                }}
                onClick={() => navigate(`/diagrams/${diagram.id}`)}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Typography variant="h6" gutterBottom>
                    {diagram.name}
                  </Typography>
                  <Box>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportDiagram(diagram.id, diagram.name);
                      }}
                      sx={{ mr: 1 }}
                    >
                      <FileDownloadIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDiagram(diagram.id);
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </Box>
                <Typography color="textSecondary" gutterBottom>
                  Model: {model?.name || 'Unknown'} 
                </Typography>
                <Typography color="textSecondary" gutterBottom>
                  Metamodel: {metamodel?.name || 'Unknown'}
                </Typography>
                <Typography color="textSecondary" gutterBottom>
                  {diagram.elements.length} Elements
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/diagrams/${diagram.id}`);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<CodeIcon />}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/diagrams/${diagram.id}/code`);
                    }}
                  >
                    Generate Code
                  </Button>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}
      
      <Dialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)}>
        <DialogTitle>Create New Diagram</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Diagram Name"
            fullWidth
            value={newDiagramName}
            onChange={(e) => setNewDiagramName(e.target.value)}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth>
            <InputLabel id="model-select-label">Model</InputLabel>
            <Select
              labelId="model-select-label"
              value={selectedModelId}
              label="Model"
              onChange={handleModelChange}
            >
              {models.map((model: Model) => (
                <MenuItem key={model.id} value={model.id}>
                  {model.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateDiagram} color="primary">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbarOpen} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

// Diagram Editor Page
const DiagramEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [mode, setMode] = useState<'2D' | '3D'>('2D');
  
  if (!id) {
    return <Typography>Invalid diagram ID</Typography>;
  }
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
        <Button 
          variant={mode === '2D' ? 'contained' : 'outlined'} 
          onClick={() => setMode('2D')}
          sx={{ mr: 1 }}
        >
          2D Mode
        </Button>
        <Button 
          variant={mode === '3D' ? 'contained' : 'outlined'} 
          onClick={() => setMode('3D')}
          sx={{ ml: 1 }}
        >
          3D Mode
        </Button>
      </Box>
      
      <Box sx={{ flexGrow: 1 }}>
        {mode === '2D' ? (
          <DiagramEditor diagramId={id} />
        ) : (
          <div style={{ height: '100%', width: '100%', position: 'relative' }} className="diagram3d-container">
            <React.Suspense fallback={<Typography>Loading 3D editor...</Typography>}>
              <Diagram3DEditor diagramId={id} />
            </React.Suspense>
          </div>
        )}
      </Box>
    </Box>
  );
};

// Code Generation Page
const CodeGenerationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  
  if (!id) {
    return <Typography>Invalid diagram ID</Typography>;
  }
  
  return <CodeGenerator diagramId={id} />;
};

// Standalone Code Generation Page
const StandaloneCodeGenerationPage: React.FC = () => {
  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <CodeGenerator />
    </Box>
  );
};

// AI Generator Page
const AIMetamodelGeneratorPage: React.FC = () => {
  return <AIMetamodelGenerator />;
};

// About Page
const AboutPage: React.FC = () => {
  return (
    <Container sx={{ mt: 4, pb: 4, height: '100%', overflow: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        About Modeling Tool v1.0
      </Typography>
      
      <Typography paragraph>
        This tool is a web-based modeling tool, allowing users to:
      </Typography>
      
      <Box component="ul" sx={{ pl: 4 }}>
        <Box component="li">
          <Typography>
            Define custom metamodels with classes, attributes, and relationships
          </Typography>
        </Box>
        <Box component="li">
          <Typography>
            Create diagrams based on those metamodels
          </Typography>
        </Box>
        <Box component="li">
          <Typography>
            Generate code using Handlebars templates
          </Typography>
        </Box>
        <Box component="li">
          <Typography fontWeight="bold">
            View and manipulate diagrams in 3D space
          </Typography>
        </Box>
      </Box>
      
      <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
        3D Diagram Editor
      </Typography>
      
      <Typography paragraph>
        The 3D diagram editor allows you to visualize and manipulate model elements in a three-dimensional space:
      </Typography>
      
      <Box component="ul" sx={{ pl: 4 }}>
        <Box component="li">
          <Typography>
            Toggle between 2D and 3D views using the buttons at the top of the diagram editor
          </Typography>
        </Box>
        <Box component="li">
          <Typography>
            Drag elements from the palette and place them in the 3D environment
          </Typography>
        </Box>
        <Box component="li">
          <Typography>
            Select elements to view and edit their X, Y, and Rz (rotation) properties
          </Typography>
        </Box>
        <Box component="li">
          <Typography>
            Use the Move/Rotate buttons to change transform mode
          </Typography>
        </Box>
      </Box>
      
      <Typography paragraph>
        Technologies used:
      </Typography>
      
      <Box component="ul" sx={{ pl: 4 }}>
        <Box component="li">
          <Typography>React with TypeScript</Typography>
        </Box>
        <Box component="li">
          <Typography>Material-UI for the user interface</Typography>
        </Box>
        <Box component="li">
          <Typography>Konva.js for the 2D diagram editor</Typography>
        </Box>
        <Box component="li">
          <Typography>Three.js / React Three Fiber for the 3D diagram editor</Typography>
        </Box>
        <Box component="li">
          <Typography>Handlebars for code generation templates</Typography>
        </Box>
      </Box>
    </Container>
  );
};

// Model-Based Testing Page
const ModelBasedTestingPage: React.FC = () => {
  return <ModelBasedTestingDashboard />;
};

export default App;
