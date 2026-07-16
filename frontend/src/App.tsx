import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Typography,
  Button,
  Container,
  Box,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  CssBaseline,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  SelectChangeEvent,
  Snackbar,
  Alert,
  CircularProgress
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import CodeIcon from '@mui/icons-material/Code';
import SchemaIcon from '@mui/icons-material/Schema';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import DeleteIcon from '@mui/icons-material/Delete';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import BugReportIcon from '@mui/icons-material/BugReport';
import ShareIcon from '@mui/icons-material/Share';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ViewModuleIcon from '@mui/icons-material/ViewModule';

import MetamodelManager from './components/metamodel/MetamodelManager';
import { ViewpointManager } from './components/viewpoints';
import ModelManager from './components/model/ModelManager';
import DiagramEditor from './components/diagram/DiagramEditor';
import Diagram3DEditor from './components/diagram/Diagram3DEditor';
import CodeGenerator from './components/codegeneration/CodeGenerator';
import TransformationDashboard from './components/transformation/TransformationDashboard';
import ModelBasedTestingDashboard from './components/testing/ModelBasedTestingDashboard';
import TestDetails from './components/testing/TestDetails';
import LoginPage from './components/auth/LoginPage';
import ForgotPasswordPage from './components/auth/ForgotPasswordPage';
import ResetPasswordPage from './components/auth/ResetPasswordPage';
import RoleRequestDialog from './components/auth/RoleRequestDialog';
import { AdminPanel } from './components/admin';
import { ShareDialog, CreatedBy } from './components/common';
import { Sidebar } from './components/layout';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { OwnerFilterProvider, useOwnerFilterMatcher } from './contexts/OwnerFilterContext';
import { metamodelService } from './services/metamodel';
import { diagramService } from './services/diagram';
import { modelService } from './services/model';
import { viewpointService } from './services/viewpoint.service';
import { getParentGroupColor, getParentGroupSurfaceColor, groupByParent } from './services/common/grouping.service';
import { jsService } from './services/constraint';
import { Metamodel, Diagram, Model, Constraint, Viewpoint, RepresentationDescription } from './models/types';

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
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <OwnerFilterProvider>
          <AuthenticatedApp />
        </OwnerFilterProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

// The main app content that requires authentication
const AuthenticatedApp: React.FC = () => {
  const { isAuthenticated, isLoading, user, logout, isAdmin } = useAuth();
  const [roleRequestDialogOpen, setRoleRequestDialogOpen] = useState(false);
  
  // Apply template styles to body
  useEffect(() => {
    document.body.classList.add('template-theme');
    return () => {
      document.body.classList.remove('template-theme');
    };
  }, []);

  // Initialize services - only runs when authenticated
  React.useEffect(() => {
    if (!isAuthenticated) return;
    
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
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    
    console.log("App.tsx: Running emergency constraint type cleanup");
    
    // Safety check to run on every app load - use metamodelService instead of localStorage
    const runConstraintCleanup = async () => {
      try {
        // Load metamodels from API via service
        const metamodels = metamodelService.getAllMetamodels();
        let fixesApplied = 0;
        
        // Look for constraints with type issues
        for (const metamodel of metamodels) {
          let metamodelModified = false;
          
          // Process metaclass constraints
          for (const cls of metamodel.classes || []) {
            if (cls.constraints) {
              for (const c of cls.constraints) {
                const constraint = c as any; // Cast to any to allow type mutation
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
                  metamodelModified = true;
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
                  metamodelModified = true;
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
                  metamodelModified = true;
                  console.log(`Fixed OCL constraint "${constraint.name}" incorrectly marked as JavaScript`);
                }
              }
            }
          }
          
          // Process global constraints 
          if (metamodel.constraints) {
            for (const c of metamodel.constraints) {
              const constraint = c as any; // Cast to any to allow type mutation
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
                metamodelModified = true;
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
                metamodelModified = true;
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
                metamodelModified = true;
                console.log(`Fixed global OCL constraint "${constraint.name}" incorrectly marked as JavaScript`);
              }
            }
          }
          
          // Save fixes via API if any changes were made
          if (metamodelModified) {
            metamodelService.updateMetamodel(metamodel.id, metamodel);
          }
        }
        
        if (fixesApplied > 0) {
          console.log(`App.tsx: Fixed ${fixesApplied} constraint type issues in runtime cleanup`);
        } else {
          console.log("App.tsx: No constraint type issues found");
        }
      } catch (error) {
        console.error("App.tsx: Error in constraint cleanup", error);
      }
    };
    
    runConstraintCleanup();
  }, [isAuthenticated]);

  // Run constraint type migration on app startup
  useEffect(() => {
    if (!isAuthenticated) return;
    
    console.log("App.tsx: Running constraint type verification");
    
    // This is a safety check that runs on every app load to ensure constraints have proper types
    // Use metamodelService instead of localStorage
    const runTypeVerification = async () => {
      try {
        // Load metamodels from API via service
        const metamodels = metamodelService.getAllMetamodels();
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
              // eslint-disable-next-line no-loop-func
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
            // eslint-disable-next-line no-loop-func
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
            // Save only if changes were made - uses API
            metamodelService.updateMetamodel(metamodel.id, metamodel);
          }
        }
        
        if (fixesApplied > 0) {
          console.log(`Fixed ${fixesApplied} constraint types during startup verification`);
        }
      } catch (error) {
        console.error('Error during constraint type verification:', error);
      }
    };
    
    runTypeVerification();
  }, [isAuthenticated]);
  
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

  // Show loading spinner while checking auth status
  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'linear-gradient(135deg, #3641f5 0%, #465fff 50%, #2a31d8 100%)',
        }}
      >
        <CircularProgress sx={{ color: 'white' }} size={48} />
      </Box>
    );
  }

  // Show login/forgot/reset pages if not authenticated
  if (!isAuthenticated) {
    return (
      <Router>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </Router>
    );
  }

  return (
      <Router>
        <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
          <Sidebar
            user={user}
            isAdmin={isAdmin}
            onLogout={logout}
            onRoleRequest={() => setRoleRequestDialogOpen(true)}
          />

          <Box sx={{ flexGrow: 1, overflow: 'auto', minWidth: 0 }}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/metamodels" element={<MetamodelEditorPage />} />
              <Route path="/viewpoints" element={<ViewpointsPage />} />
              <Route path="/representations" element={<RepresentationsPage />} />
              <Route path="/metamodels/:metamodelId/viewpoints" element={<ViewpointManager />} />
              <Route path="/metamodels/:id" element={<MetamodelEditorPage />} />
              <Route path="/models" element={<ModelsPage />} />
              <Route path="/models/:id" element={<ModelEditorPage />} />
              <Route path="/models/:id/code" element={<ModelCodeGenerationPage />} />
              <Route path="/diagrams" element={<DiagramsPage />} />
              <Route path="/diagrams/:id" element={<DiagramEditorPage />} />
              <Route path="/diagrams/:id/code" element={<LegacyViewCodeGenerationRedirect />} />
              <Route path="/views" element={<DiagramsPage />} />
              <Route path="/views/:id" element={<DiagramEditorPage />} />
              <Route path="/views/:id/code" element={<LegacyViewCodeGenerationRedirect />} />
              <Route path="/code-generation" element={<StandaloneCodeGenerationPage />} />
              <Route path="/transformations" element={<TransformationDashboard />} />
              <Route path="/testing" element={<ModelBasedTestingDashboard />} />
              <Route path="/testing/:metamodelId" element={<ModelBasedTestingDashboard />} />
              <Route path="/test-details" element={<TestDetails />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/about" element={<AboutPage />} />
            </Routes>
          </Box>
        </Box>

        <RoleRequestDialog
          open={roleRequestDialogOpen}
          onClose={() => setRoleRequestDialogOpen(false)}
        />
      </Router>
  );
};

// Home Page
const HomePage: React.FC = () => {
  return (
    <Container sx={{ mt: 4, pb: 4, height: '100%', overflow: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Welcome to Spatial DSL Studio
      </Typography>
      
      <Typography paragraph>
        This tool allows you to create your own custom modeling language by defining metamodels,
        creating models based on those metamodels, and visualizing model subsets with views.
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
            Design Views
          </Typography>
          <Typography>
            Create visual projections of your models with customizable views.
          </Typography>
          <Button
            component={Link}
            to="/views"
            variant="contained"
            sx={{ mt: 2 }}
          >
            Manage Views
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MetamodelsPage: React.FC = () => {
  const navigate = useNavigate();
  const { canCreate, canDelete } = useAuth();
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

  const handleDeleteMetamodel = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this metamodel?')) {
      try {
        await metamodelService.deleteMetamodel(id);
        setMetamodels(metamodels.filter(m => m.id !== id));
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Failed to delete metamodel');
      }
    }
  };

  return (
    <Container sx={{ mt: 4, pb: 4, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          Metamodels
        </Typography>
        {canCreate && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setIsDialogOpen(true)}
          >
            Create Metamodel
          </Button>
        )}
      </Box>
      
      {metamodels.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="textSecondary" gutterBottom>
            No Metamodels Found
          </Typography>
          <Typography color="textSecondary" paragraph>
            {canCreate ? 'Create your first metamodel to get started.' : 'No metamodels available yet.'}
          </Typography>
          {canCreate && (
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setIsDialogOpen(true)}
            >
              Create Metamodel
            </Button>
          )}
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
                {canDelete && (
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
                )}
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

const ViewpointsPage: React.FC = () => {
  const navigate = useNavigate();
  const [metamodels] = useState<Metamodel[]>(metamodelService.getAllMetamodels());
  const [countsByMetamodelId, setCountsByMetamodelId] = useState<Record<string, { viewpoints: number; representations: number }>>(() => {
    const counts: Record<string, { viewpoints: number; representations: number }> = {};
    metamodelService.getAllMetamodels().forEach(metamodel => {
      const viewpoints = viewpointService.getCachedViewpoints(metamodel.id);
      counts[metamodel.id] = {
        viewpoints: viewpoints.length,
        representations: viewpoints.reduce((total, viewpoint) => total + viewpoint.representationDescriptions.length, 0),
      };
    });
    return counts;
  });
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingCounts(true);

    Promise.all(metamodels.map(async metamodel => {
      try {
        const viewpoints = await viewpointService.loadViewpoints(metamodel.id);
        return {
          metamodelId: metamodel.id,
          viewpoints: viewpoints.length,
          representations: viewpoints.reduce((total, viewpoint) => total + viewpoint.representationDescriptions.length, 0),
        };
      } catch {
        const viewpoints = viewpointService.getCachedViewpoints(metamodel.id);
        return {
          metamodelId: metamodel.id,
          viewpoints: viewpoints.length,
          representations: viewpoints.reduce((total, viewpoint) => total + viewpoint.representationDescriptions.length, 0),
        };
      }
    }))
      .then(results => {
        if (cancelled) return;
        const nextCounts: Record<string, { viewpoints: number; representations: number }> = {};
        results.forEach(result => {
          nextCounts[result.metamodelId] = {
            viewpoints: result.viewpoints,
            representations: result.representations,
          };
        });
        setCountsByMetamodelId(nextCounts);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCounts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [metamodels]);

  return (
    <Container sx={{ mt: 4, pb: 4, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4">Viewpoints</Typography>
          <Typography variant="body2" color="text.secondary">
            Representation descriptions are managed inside each metamodel viewpoint.
          </Typography>
        </Box>
        {isLoadingCounts && <CircularProgress size={24} />}
      </Box>

      <Paper sx={{ overflow: 'hidden' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 1fr) 140px 190px 140px' },
            px: 2,
            py: 1.25,
            bgcolor: 'grey.50',
            borderBottom: '1px solid',
            borderColor: 'divider',
            gap: 1,
          }}
        >
          <Typography variant="subtitle2">Metamodel</Typography>
          <Typography variant="subtitle2">Viewpoints</Typography>
          <Typography variant="subtitle2">Representations</Typography>
          <Typography variant="subtitle2">Action</Typography>
        </Box>

        {metamodels.map(metamodel => {
          const counts = countsByMetamodelId[metamodel.id] || { viewpoints: 0, representations: 0 };
          const groupColor = getParentGroupColor(metamodel.id);
          return (
            <Box
              key={metamodel.id}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 1fr) 140px 190px 140px' },
                alignItems: 'center',
                px: 2,
                py: 1.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
                borderLeft: '4px solid',
                borderLeftColor: groupColor,
                bgcolor: getParentGroupSurfaceColor(metamodel.id),
                gap: 1,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: groupColor, flexShrink: 0 }} />
                  <Typography variant="body1" noWrap>{metamodel.name}</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" noWrap>{metamodel.uri}</Typography>
              </Box>
              <Typography variant="body2">{counts.viewpoints}</Typography>
              <Typography variant="body2">{counts.representations}</Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AccountTreeIcon />}
                onClick={() => navigate(`/metamodels/${metamodel.id}/viewpoints`)}
              >
                Manage
              </Button>
            </Box>
          );
        })}

        {metamodels.length === 0 && (
          <Box sx={{ p: 3 }}>
            <Typography color="text.secondary">No metamodels found.</Typography>
          </Box>
        )}
      </Paper>
    </Container>
  );
};

const getRepresentationKindLabel = (kind: string): string => (
  kind === 'diagram' ? 'Visual view' : kind
);

const RepresentationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [metamodels] = useState<Metamodel[]>(metamodelService.getAllMetamodels());
  const [viewpointsByMetamodelId, setViewpointsByMetamodelId] = useState<Record<string, Viewpoint[]>>(() => {
    const cached: Record<string, Viewpoint[]> = {};
    metamodelService.getAllMetamodels().forEach(metamodel => {
      cached[metamodel.id] = viewpointService.getCachedViewpoints(metamodel.id);
    });
    return cached;
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    Promise.all(metamodels.map(async metamodel => {
      try {
        const viewpoints = await viewpointService.loadViewpoints(metamodel.id);
        return { metamodelId: metamodel.id, viewpoints };
      } catch {
        return {
          metamodelId: metamodel.id,
          viewpoints: viewpointService.getCachedViewpoints(metamodel.id),
        };
      }
    }))
      .then(results => {
        if (cancelled) return;
        const next: Record<string, Viewpoint[]> = {};
        results.forEach(result => {
          next[result.metamodelId] = result.viewpoints;
        });
        setViewpointsByMetamodelId(next);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [metamodels]);

  const groups = metamodels.map(metamodel => ({
    metamodel,
    viewpoints: viewpointsByMetamodelId[metamodel.id] || [],
    color: getParentGroupColor(metamodel.id),
  }));

  const totalRepresentations = groups.reduce(
    (total, group) => total + group.viewpoints.reduce(
      (viewpointTotal, viewpoint) => viewpointTotal + viewpoint.representationDescriptions.length,
      0
    ),
    0
  );

  return (
    <Container sx={{ mt: 4, pb: 4, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <ViewModuleIcon sx={{ fontSize: 36, color: 'primary.main', mr: 1.5 }} />
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4">Representation Descriptions</Typography>
          <Typography variant="body2" color="text.secondary">
            Visual, table, and tree specifications grouped by their owning viewpoint and metamodel.
          </Typography>
        </Box>
        {isLoading && <CircularProgress size={24} />}
      </Box>

      {metamodels.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="textSecondary" gutterBottom>No Metamodels Found</Typography>
          <Typography color="textSecondary" paragraph>
            Create a metamodel before defining representation descriptions.
          </Typography>
          <Button component={Link} to="/metamodels" variant="outlined">Create Metamodel</Button>
        </Paper>
      ) : totalRepresentations === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="textSecondary" gutterBottom>No Representation Descriptions Found</Typography>
          <Typography color="textSecondary" paragraph>
            Representation descriptions are created inside a metamodel viewpoint.
          </Typography>
          <Button component={Link} to="/viewpoints" variant="outlined" startIcon={<AccountTreeIcon />}>
            Open Viewpoints
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {groups.map(group => {
            const representationCount = group.viewpoints.reduce(
              (total, viewpoint) => total + viewpoint.representationDescriptions.length,
              0
            );
            if (representationCount === 0) return null;

            return (
              <Box key={group.metamodel.id}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    mb: 1.5,
                    px: 1.5,
                    py: 1,
                    borderLeft: '4px solid',
                    borderLeftColor: group.color,
                    bgcolor: getParentGroupSurfaceColor(group.metamodel.id),
                    borderRadius: 1,
                  }}
                >
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: group.color, flexShrink: 0 }} />
                  <Typography variant="subtitle2">{group.metamodel.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {representationCount} representation{representationCount === 1 ? '' : 's'}
                  </Typography>
                </Box>

                <Paper sx={{ overflow: 'hidden' }}>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: 'minmax(180px, 1fr) minmax(220px, 1.4fr) 100px 130px 120px 120px' },
                      px: 2,
                      py: 1.25,
                      bgcolor: 'grey.50',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      gap: 1,
                    }}
                  >
                    <Typography variant="subtitle2">Viewpoint</Typography>
                    <Typography variant="subtitle2">Representation</Typography>
                    <Typography variant="subtitle2">Kind</Typography>
                    <Typography variant="subtitle2">Visible</Typography>
                    <Typography variant="subtitle2">Tools</Typography>
                    <Typography variant="subtitle2">Action</Typography>
                  </Box>

                  {group.viewpoints.flatMap(viewpoint => (
                    viewpoint.representationDescriptions.map(description => (
                      <Box
                        key={description.id}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', md: 'minmax(180px, 1fr) minmax(220px, 1.4fr) 100px 130px 120px 120px' },
                          alignItems: 'center',
                          px: 2,
                          py: 1.5,
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                          gap: 1,
                        }}
                      >
                        <Typography variant="body2" noWrap>{viewpoint.name}</Typography>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body1" noWrap>
                            {description.name}{description.isDefault ? ' (Default)' : ''}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {description.description || description.id}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{getRepresentationKindLabel(description.kind)}</Typography>
                        <Typography variant="body2">{description.visibleMetaClassIds.length} classes</Typography>
                        <Typography variant="body2">{description.toolDefinitions?.length || 0} tools</Typography>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<AccountTreeIcon />}
                          onClick={() => navigate(`/metamodels/${group.metamodel.id}/viewpoints`)}
                        >
                          Manage
                        </Button>
                      </Box>
                    ))
                  ))}
                </Paper>
              </Box>
            );
          })}
        </Box>
      )}
    </Container>
  );
};

const HelpPage: React.FC = () => {
  const concepts = [
    {
      term: 'Metamodel',
      scope: 'Abstract syntax',
      meaning: 'Defines the language concepts: metaclasses, attributes, references, inheritance, and constraints. Create this in Metamodels.',
      action: 'Manage Metamodels',
      path: '/metamodels',
    },
    {
      term: 'Viewpoint',
      scope: 'Workbench perspective',
      meaning: 'Groups representation descriptions for one metamodel around a user role or task, such as operations, diagnostics, or analysis.',
      action: 'Manage Viewpoints',
      path: '/viewpoints',
    },
    {
      term: 'Representation Description',
      scope: 'Concrete syntax',
      meaning: 'Defines one visual/table/tree specification: visible metaclasses, creatable metaclasses, mappings, tools, and canonical notation for that representation.',
      action: 'Browse Representations',
      path: '/representations',
    },
    {
      term: 'Model',
      scope: 'Language instance',
      meaning: 'Stores instances of metaclasses and their attribute/reference values. This is the semantic data that views project.',
      action: 'Manage Models',
      path: '/models',
    },
    {
      term: 'View',
      scope: 'Saved projection',
      meaning: 'A concrete saved view over a model, using a selected viewpoint and representation description. Layout and membership live here.',
      action: 'Manage Views',
      path: '/views',
    },
  ];

  const workflow = [
    { label: 'Define', text: 'Create abstract syntax in Metamodels: classes, attributes, references, inheritance, and constraints.' },
    { label: 'Design', text: 'Use Viewpoints as the language workbench surface for role-specific perspectives.' },
    { label: 'Specify', text: 'Create concrete syntax in representation descriptions: visible classes, mappings, notation, and tools.' },
    { label: 'Instantiate', text: 'Create models that conform to the metamodel.' },
    { label: 'Project', text: 'Create views from a model, viewpoint, and representation description.' },
    { label: 'Edit', text: 'Edit semantic data in models and view-specific layout/membership in views.' },
    { label: 'Exchange', text: 'Use Ecore/XMI for abstract syntax and model data, and Sirius .odesign for the supported viewpoint/representation subset.' },
  ];

  return (
    <Container sx={{ mt: 4, pb: 4, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <HelpOutlineIcon sx={{ fontSize: 36, color: 'primary.main', mr: 1.5 }} />
        <Box>
          <Typography variant="h4">Help</Typography>
          <Typography variant="body2" color="text.secondary">
            Modeling concepts and workflow reference.
          </Typography>
        </Box>
      </Box>

      <Paper sx={{ mb: 3, overflow: 'hidden' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '180px 190px minmax(300px, 1fr) 180px' },
            px: 2,
            py: 1.25,
            bgcolor: 'grey.50',
            borderBottom: '1px solid',
            borderColor: 'divider',
            gap: 1.5,
          }}
        >
          <Typography variant="subtitle2">Concept</Typography>
          <Typography variant="subtitle2">Scope</Typography>
          <Typography variant="subtitle2">Meaning</Typography>
          <Typography variant="subtitle2">Where</Typography>
        </Box>

        {concepts.map(concept => (
          <Box
            key={concept.term}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '180px 190px minmax(300px, 1fr) 180px' },
              alignItems: 'center',
              px: 2,
              py: 1.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
              gap: 1.5,
            }}
          >
            <Typography variant="subtitle1">{concept.term}</Typography>
            <Typography variant="body2" color="text.secondary">{concept.scope}</Typography>
            <Typography variant="body2">{concept.meaning}</Typography>
            <Button component={Link} to={concept.path} variant="outlined" size="small">
              {concept.action}
            </Button>
          </Box>
        ))}
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Workflow</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
          {workflow.map((step, index) => (
            <Box key={step.label} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
              <Typography variant="caption" color="text.secondary">Step {index + 1}</Typography>
              <Typography variant="subtitle1">{step.label}</Typography>
              <Typography variant="body2">{step.text}</Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Notation</Typography>
        <Typography variant="body2" color="text.secondary">
          Define class and reference notation on representation descriptions. Metaclass and reference notation in the metamodel are retained as fallback values for existing assets and import compatibility; representation notation wins when a view is rendered or exported.
        </Typography>
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Descriptions</Typography>
        <Typography variant="body2" color="text.secondary">
          Use descriptions to explain the intent of metamodels, viewpoints, representation descriptions, models, and views. These descriptions are resource documentation; domain attributes still belong in the metamodel and model data.
        </Typography>
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Language Designer / Workbench</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          <Box>
            <Typography variant="subtitle2">Abstract Syntax</Typography>
            <Typography variant="body2" color="text.secondary">
              Create it in Metamodels. This is the language structure: metaclasses, attributes, references, inheritance, and constraints.
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2">Concrete Syntax</Typography>
            <Typography variant="body2" color="text.secondary">
              Create it in representation descriptions. This is the notation, mapping, palette tools, visible classes, and edge styling for a viewpoint.
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2">Workbench</Typography>
            <Typography variant="body2" color="text.secondary">
              The workbench is the user-facing combination of viewpoints, representations, models, and views that lets users create and inspect domain models.
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>SpatialDSL and Sirius Terms</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <Box>
            <Typography variant="subtitle2">SpatialDSL</Typography>
            <Typography variant="body2" color="text.secondary">
              Viewpoints and representation descriptions are stored as SpatialDSL records. Views are saved app resources backed by model membership and presentation data.
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2">Sirius Desktop</Typography>
            <Typography variant="body2" color="text.secondary">
              `.odesign` maps to the supported viewpoint specification subset. `.aird` session and diagram resources are detected but remain deferred.
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

// Views Page
const DiagramsPage: React.FC = () => {
  const navigate = useNavigate();
  const { canCreate, canDelete, canShare } = useAuth();
  const matchesOwner = useOwnerFilterMatcher();
  const [diagrams, setDiagrams] = useState<Diagram[]>(diagramService.getAllDiagrams());
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [models, setModels] = useState<Model[]>(modelService.getAllModels());
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [metamodels, setMetamodels] = useState<Metamodel[]>(metamodelService.getAllMetamodels());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newDiagramName, setNewDiagramName] = useState('');
  const [newDiagramDescription, setNewDiagramDescription] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [availableViewpoints, setAvailableViewpoints] = useState<Viewpoint[]>([]);
  const [selectedViewpointId, setSelectedViewpointId] = useState('');
  const [selectedRepresentationDescriptionId, setSelectedRepresentationDescriptionId] = useState('');
  const [isLoadingViewpoints, setIsLoadingViewpoints] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Share dialog state
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedDiagramForSharing, setSelectedDiagramForSharing] = useState<Diagram | null>(null);

  const getModelMetamodelId = useCallback((modelId: string): string | undefined => {
    const model = models.find((candidate: Model) => candidate.id === modelId);
    return model?.conformsTo || model?.metamodelId;
  }, [models]);

  const getDiagramViewpointContext = useCallback((
    diagram: Diagram,
    metamodelId?: string
  ): { viewpoint?: Viewpoint; representationDescription?: RepresentationDescription } => {
    const explicit = viewpointService.resolveRepresentationDescription(diagram);
    if (explicit.viewpoint || explicit.representationDescription) {
      return explicit;
    }

    return viewpointService.resolveDefaultForMetamodel(metamodelId);
  }, []);

  const getMetamodelName = useCallback((metamodelId: string): string => {
    return metamodels.find((candidate: Metamodel) => candidate.id === metamodelId)?.name || 'Unknown metamodel';
  }, [metamodels]);

  const groupedDiagrams = useMemo(() => (
    groupByParent(
      diagrams.filter(matchesOwner),
      (diagram: Diagram) => {
        const model = models.find((candidate: Model) => candidate.id === diagram.modelId);
        return model?.conformsTo || model?.metamodelId;
      },
      (parentId: string) => getMetamodelName(parentId)
    )
  ), [diagrams, models, getMetamodelName, matchesOwner]);

  const selectedViewpoint = useMemo(
    () => availableViewpoints.find(viewpoint => viewpoint.id === selectedViewpointId),
    [availableViewpoints, selectedViewpointId]
  );
  const selectableRepresentationDescriptions = useMemo(
    () => (selectedViewpoint?.representationDescriptions || []).filter(description => description.kind === 'diagram'),
    [selectedViewpoint]
  );

  const resetCreateDialog = () => {
    setNewDiagramName('');
    setNewDiagramDescription('');
    setSelectedModelId('');
    setAvailableViewpoints([]);
    setSelectedViewpointId('');
    setSelectedRepresentationDescriptionId('');
    setIsLoadingViewpoints(false);
  };

  useEffect(() => {
    if (!isDialogOpen || !selectedModelId) {
      setAvailableViewpoints([]);
      setSelectedViewpointId('');
      setSelectedRepresentationDescriptionId('');
      return;
    }

    const metamodelId = getModelMetamodelId(selectedModelId);
    if (!metamodelId) {
      setAvailableViewpoints([]);
      setSelectedViewpointId('');
      setSelectedRepresentationDescriptionId('');
      return;
    }

    let cancelled = false;
    setIsLoadingViewpoints(true);

    const selectDefaults = (viewpoints: Viewpoint[]) => {
      if (cancelled) return;
      setAvailableViewpoints(viewpoints);

      const defaultViewpoint = viewpoints.find(viewpoint => viewpoint.isDefault) || viewpoints[0];
      const defaultRepresentation = defaultViewpoint?.representationDescriptions.find(
        description => description.isDefault && description.kind === 'diagram'
      ) || defaultViewpoint?.representationDescriptions.find(description => description.kind === 'diagram');

      setSelectedViewpointId(defaultViewpoint?.id || '');
      setSelectedRepresentationDescriptionId(defaultRepresentation?.id || '');
    };

    const cached = viewpointService.getCachedViewpoints(metamodelId);
    if (cached.length > 0) {
      selectDefaults(cached);
    }

    viewpointService.loadViewpoints(metamodelId)
      .then(selectDefaults)
      .catch(() => {
        if (cached.length === 0) {
          selectDefaults([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingViewpoints(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isDialogOpen, selectedModelId, getModelMetamodelId]);

  useEffect(() => {
    if (!selectedViewpoint) {
      setSelectedRepresentationDescriptionId('');
      return;
    }

    const selectedStillValid = selectableRepresentationDescriptions.some(
      description => description.id === selectedRepresentationDescriptionId
    );
    if (selectedStillValid) return;

    const defaultRepresentation = selectableRepresentationDescriptions.find(description => description.isDefault)
      || selectableRepresentationDescriptions[0];
    setSelectedRepresentationDescriptionId(defaultRepresentation?.id || '');
  }, [selectedViewpoint, selectableRepresentationDescriptions, selectedRepresentationDescriptionId]);

  const handleCreateDiagram = () => {
    if (newDiagramName.trim() && selectedModelId) {
      const newDiagram = diagramService.createDiagram(newDiagramName, selectedModelId, {
        description: newDiagramDescription.trim(),
        ...(selectedViewpointId ? { viewpointId: selectedViewpointId } : {}),
        ...(selectedRepresentationDescriptionId ? { representationDescriptionId: selectedRepresentationDescriptionId } : {}),
      });
      setDiagrams([...diagrams, newDiagram]);
      resetCreateDialog();
      setIsDialogOpen(false);
    }
  };

  const handleDeleteDiagram = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this view?')) {
      return;
    }

    try {
      await diagramService.deleteDiagram(id);
      setDiagrams(diagrams.filter(d => d.id !== id));
    } catch (error) {
      setSnackbarMessage(error instanceof Error ? error.message : 'Failed to delete view');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const handleModelChange = (event: SelectChangeEvent) => {
    setSelectedModelId(event.target.value);
  };

  const handleViewpointChange = (event: SelectChangeEvent) => {
    setSelectedViewpointId(event.target.value);
  };

  const handleRepresentationDescriptionChange = (event: SelectChangeEvent) => {
    setSelectedRepresentationDescriptionId(event.target.value);
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
          setSnackbarMessage('View imported successfully');
          setSnackbarSeverity('success');
        } else {
          setSnackbarMessage('Failed to import view. Check if the referenced model exists.');
          setSnackbarSeverity('error');
        }
      } catch (error) {
        setSnackbarMessage('Error importing view: Invalid file format');
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
      setSnackbarMessage('Failed to export view');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }
    
    // Create file and download it
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}_view.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setSnackbarMessage('View exported successfully');
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
          Views
        </Typography>
        {canCreate && (
          <>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<FileUploadIcon />}
              onClick={handleImportDiagram}
              sx={{ mr: 2 }}
              disabled={models.length === 0}
            >
              Import View
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
              Create View
            </Button>
          </>
        )}
      </Box>
      
      {models.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="textSecondary" gutterBottom>
            No Models Available
          </Typography>
          <Typography color="textSecondary" paragraph>
            You need to create a model before creating views.
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
            No Views Found
          </Typography>
          <Typography color="textSecondary" paragraph>
            {canCreate ? 'Create your first view to get started.' : 'No views available yet.'}
          </Typography>
          {canCreate && (
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setIsDialogOpen(true)}
            >
              Create View
            </Button>
          )}
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {groupedDiagrams.map(group => (
            <Box key={group.parentId}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  mb: 1.5,
                  px: 1.5,
                  py: 1,
                  borderLeft: '4px solid',
                  borderLeftColor: group.color,
                  bgcolor: getParentGroupSurfaceColor(group.parentId),
                  borderRadius: 1,
                }}
              >
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: group.color, flexShrink: 0 }} />
                <Typography variant="subtitle2">{group.parentName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {group.items.length} view{group.items.length === 1 ? '' : 's'}
                </Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 3 }}>
                {group.items.map(diagram => {
                  const model = models.find((m: Model) => m.id === diagram.modelId);
                  const metamodel = model ? metamodels.find((m: Metamodel) => m.id === (model.conformsTo || model.metamodelId)) : undefined;
                  const { viewpoint, representationDescription } = getDiagramViewpointContext(diagram, metamodel?.id);
                  return (
                    <Paper
                      key={diagram.id}
                      sx={{
                        p: 3,
                        cursor: 'pointer',
                        borderLeft: '4px solid',
                        borderLeftColor: group.color,
                        '&:hover': { boxShadow: 6 }
                      }}
                      onClick={() => navigate(`/views/${diagram.id}`)}
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
                          {canShare && (
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDiagramForSharing(diagram);
                                setShareDialogOpen(true);
                              }}
                              sx={{ mr: 1 }}
                            >
                              <ShareIcon />
                            </IconButton>
                          )}
                          {canDelete && (
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
                          )}
                        </Box>
                      </Box>
                      <Typography color="textSecondary" gutterBottom>
                        {diagram.description || 'No description'}
                      </Typography>
                      <CreatedBy isOwner={diagram.isOwner} ownerEmail={diagram.ownerEmail} variant="body2" />
                      <Typography color="textSecondary" gutterBottom>
                        Model: {model?.name || 'Unknown'}
                      </Typography>
                      <Typography color="textSecondary" gutterBottom>
                        Metamodel: {metamodel?.name || 'Unknown'}
                      </Typography>
                      <Typography color="textSecondary" gutterBottom>
                        Viewpoint: {viewpoint?.name || 'Default'}
                      </Typography>
                      <Typography color="textSecondary" gutterBottom>
                        Representation: {representationDescription?.name || 'Default Visual'}
                      </Typography>
                      <Typography color="textSecondary" gutterBottom>
                        {(diagram.includedElementIds?.length || diagram.elements.filter(element => element.type === 'node').length)} Elements
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/views/${diagram.id}`);
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
                            navigate(`/models/${diagram.modelId}/code`);
                          }}
                        >
                          Generate Code
                        </Button>
                      </Box>
                    </Paper>
                  );
                })}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      
      <Dialog
        open={isDialogOpen}
        onClose={() => {
          resetCreateDialog();
          setIsDialogOpen(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Create New View</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="View Name"
            fullWidth
            value={newDiagramName}
            onChange={(e) => setNewDiagramName(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Description"
            fullWidth
            multiline
            minRows={2}
            value={newDiagramDescription}
            onChange={(e) => setNewDiagramDescription(e.target.value)}
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
          <FormControl fullWidth sx={{ mt: 2 }} disabled={!selectedModelId || isLoadingViewpoints || availableViewpoints.length === 0}>
            <InputLabel id="viewpoint-select-label">Viewpoint</InputLabel>
            <Select
              labelId="viewpoint-select-label"
              value={selectedViewpointId}
              label="Viewpoint"
              onChange={handleViewpointChange}
            >
              {availableViewpoints.map((viewpoint: Viewpoint) => (
                <MenuItem key={viewpoint.id} value={viewpoint.id}>
                  {viewpoint.name}{viewpoint.isDefault ? ' (Default)' : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mt: 2 }} disabled={!selectedViewpointId || selectableRepresentationDescriptions.length === 0}>
            <InputLabel id="representation-select-label">Representation</InputLabel>
            <Select
              labelId="representation-select-label"
              value={selectedRepresentationDescriptionId}
              label="Representation"
              onChange={handleRepresentationDescriptionChange}
            >
              {selectableRepresentationDescriptions.map((description: RepresentationDescription) => (
                <MenuItem key={description.id} value={description.id}>
                  {description.name}{description.isDefault ? ' (Default)' : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {selectedModelId && isLoadingViewpoints && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" color="textSecondary">
                Loading viewpoints...
              </Typography>
            </Box>
          )}
          {selectedModelId && !isLoadingViewpoints && availableViewpoints.length === 0 && (
            <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
              No viewpoint is configured for this metamodel. The backend will use or generate the default visual representation.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              resetCreateDialog();
              setIsDialogOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateDiagram}
            color="primary"
            disabled={!newDiagramName.trim() || !selectedModelId || isLoadingViewpoints}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbarOpen} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>

      {/* Share Dialog */}
      {selectedDiagramForSharing && (
        <ShareDialog
          open={shareDialogOpen}
          onClose={() => {
            setShareDialogOpen(false);
            setSelectedDiagramForSharing(null);
          }}
          resourceType="DIAGRAM"
          resourceId={selectedDiagramForSharing.id}
          resourceName={selectedDiagramForSharing.name}
        />
      )}
    </Container>
  );
};

// Diagram Editor Page
const DiagramEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [mode, setMode] = useState<'2D' | '3D'>('2D');
  const [diagramVersion, setDiagramVersion] = useState(0);
  const diagramId = id || '';

  useEffect(() => {
    if (!diagramId) return;

    const handleViewChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ diagramId?: string }>).detail;
      if (!detail?.diagramId || detail.diagramId === diagramId) {
        setDiagramVersion(version => version + 1);
      }
    };

    window.addEventListener('view:changed', handleViewChanged);
    window.addEventListener('storage', handleViewChanged);
    return () => {
      window.removeEventListener('view:changed', handleViewChanged);
      window.removeEventListener('storage', handleViewChanged);
    };
  }, [diagramId]);

  if (!diagramId) {
    return <Typography>Invalid view ID</Typography>;
  }

  const diagram = diagramService.getDiagramById(diagramId);
  const model = diagram ? modelService.getModelById(diagram.modelId) : undefined;
  const metamodelId = model?.conformsTo || model?.metamodelId;
  const explicitContext = diagram ? viewpointService.resolveRepresentationDescription(diagram) : {};
  const fallbackContext = viewpointService.resolveDefaultForMetamodel(metamodelId);
  const viewpoint = explicitContext.viewpoint || fallbackContext.viewpoint;
  const representationDescription = explicitContext.representationDescription || fallbackContext.representationDescription;
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }} data-diagram-version={diagramVersion}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1, borderBottom: '1px solid #e4e7ec' }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap>
            {diagram?.name || 'View'}
          </Typography>
          <Typography variant="caption" color="textSecondary" noWrap>
            {viewpoint?.name || 'Default'} / {representationDescription?.name || 'Default Visual'}
          </Typography>
        </Box>
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
          <DiagramEditor diagramId={diagramId} />
        ) : (
          <div style={{ height: '100%', width: '100%', position: 'relative' }} className="diagram3d-container">
            <React.Suspense fallback={<Typography>Loading 3D editor...</Typography>}>
              <Diagram3DEditor diagramId={diagramId} />
            </React.Suspense>
          </div>
        )}
      </Box>
    </Box>
  );
};

// Code Generation Page
const ModelCodeGenerationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  
  if (!id) {
    return <Typography>Invalid model ID</Typography>;
  }
  
  return <CodeGenerator modelId={id} />;
};

// Compatibility only: old links resolve the view first, then code generation runs from the model route.
const LegacyViewCodeGenerationRedirect: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const diagram = id ? diagramService.getDiagramById(id) : null;

  if (!diagram) {
    return <Typography>Invalid view ID</Typography>;
  }

  return <Navigate to={`/models/${diagram.modelId}/code`} replace />;
};

// Standalone Code Generation Page
const StandaloneCodeGenerationPage: React.FC = () => {
  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <CodeGenerator />
    </Box>
  );
};

// About Page
const AboutPage: React.FC = () => {
  return (
    <Container sx={{ mt: 4, pb: 4, height: '100%', overflow: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        About Spatial DSL Studio
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
            Create model views based on those metamodels
          </Typography>
        </Box>
        <Box component="li">
          <Typography>
            Generate code using Handlebars templates
          </Typography>
        </Box>
        <Box component="li">
          <Typography fontWeight="bold">
            View and manipulate model projections in 3D space
          </Typography>
        </Box>
      </Box>
      
      <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
        3D View Editor
      </Typography>
      
      <Typography paragraph>
        The 3D view editor allows you to visualize and manipulate model elements in a three-dimensional space:
      </Typography>
      
      <Box component="ul" sx={{ pl: 4 }}>
        <Box component="li">
          <Typography>
            Toggle between 2D and 3D views using the buttons at the top of the view editor
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
          <Typography>Konva.js for the 2D view editor</Typography>
        </Box>
        <Box component="li">
          <Typography>Three.js / React Three Fiber for the 3D view editor</Typography>
        </Box>
        <Box component="li">
          <Typography>Handlebars for code generation templates</Typography>
        </Box>
      </Box>
    </Container>
  );
};

// Model-Based Testing Page
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ModelBasedTestingPage: React.FC = () => {
  return <ModelBasedTestingDashboard />;
};

export default App;
