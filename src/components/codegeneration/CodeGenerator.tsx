import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
  Tabs,
  Tab,
  SelectChangeEvent,
  ListItemButton,
  ListSubheader,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  TabScrollButton,
  CircularProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DownloadIcon from '@mui/icons-material/Download';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { CodeGenerationTemplate, CodeGenerationResult, Diagram, Metamodel, CodeGenerationProject, Model } from '../../models/types';
import { codeGenerationService } from '../../services/codegeneration.service';
import { diagramService } from '../../services/diagram.service';
import { metamodelService } from '../../services/metamodel.service';
import { modelService } from '../../services/model.service';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { okaidia } from '@uiw/codemirror-theme-okaidia';

interface CodeGeneratorProps {
  diagramId?: string; // Make diagramId optional
}

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
      id={`code-tabpanel-${index}`}
      {...other}
      style={{ height: 'calc(100% - 48px)', overflow: 'auto' }}
    >
      {value === index && (
        <Box sx={{ p: 2, height: '100%' }}>
          {children}
        </Box>
      )}
    </div>
  );
}

// Custom IDE-like template editor component
const TemplateEditor = ({ 
  value, 
  onChange 
}: { 
  value: string; 
  onChange: (value: string) => void; 
}) => {
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      height: '400px',
      border: '1px solid #494949',
      borderRadius: '4px',
      overflow: 'hidden'
    }}>
      <Box sx={{ 
        backgroundColor: '#333333', 
        color: 'white',
        padding: '4px 8px',
        borderBottom: '1px solid #494949',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <Typography variant="caption">Template Editor</Typography>
        <Typography variant="caption">Handlebars (JS)</Typography>
      </Box>
      
      <CodeMirror
        value={value}
        height="400px"
        extensions={[javascript(), okaidia]}
        onChange={onChange}
        theme="dark"
      />
    </Box>
  );
};

// Interface for project template editing
interface ProjectTemplate {
  id: string;
  name: string;
  language: 'java' | 'python';
  content: string;
  outputPattern: string;
  isNew?: boolean;
}

const CodeGenerator: React.FC<CodeGeneratorProps> = ({ diagramId }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [metamodels, setMetamodels] = useState<Metamodel[]>([]);
  const [projects, setProjects] = useState<CodeGenerationProject[]>([]);
  const [exampleProjects, setExampleProjects] = useState<CodeGenerationProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  
  // Example templates state
  const [exampleTemplates, setExampleTemplates] = useState<CodeGenerationTemplate[]>([]);
  
  // Generated code
  const [generatedCode, setGeneratedCode] = useState<CodeGenerationResult[]>([]);
  
  // UI state
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [selectedProjectForEditing, setSelectedProjectForEditing] = useState<CodeGenerationProject | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  
  // Project editing state
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectTarget, setProjectTarget] = useState('');
  
  // Template editing within project
  const [projectTemplates, setProjectTemplates] = useState<ProjectTemplate[]>([]);
  const [activeTemplateTab, setActiveTemplateTab] = useState(0);
  
  useEffect(() => {
    // Load data
    const loadData = async () => {
      setLoading(true);
      
      try {
        // Load all metamodels
        const allMetamodels = metamodelService.getAllMetamodels();
        setMetamodels(allMetamodels);
        
        // If diagramId is provided, load that diagram
        if (diagramId) {
          const diagramData = diagramService.getDiagramById(diagramId);
          setDiagram(diagramData || null);
        }
        
        // Load example templates
        const allTemplates = codeGenerationService.getAllTemplates();
        
        // Check if we need to load example templates
        if (allTemplates.length === 0) {
          codeGenerationService.loadExampleTemplates();
        }
        
        // Get updated templates
        const updatedTemplates = codeGenerationService.getAllTemplates();
        
        // Example templates are the ones with these specific names
        const exampleNames = [
          'Java Class Template', 
          'Python Class Template', 
          'Multi-Server Configuration',
          'Complete Application'
        ];
        
        // Filter to only get example templates
        const examples = updatedTemplates.filter(t => exampleNames.includes(t.name));
        setExampleTemplates(examples);
        
        // Load projects
        const allProjects = codeGenerationService.getAllProjects();
        
        // Check if we need to load example projects
        if (allProjects.length === 0) {
          codeGenerationService.loadExampleProjects();
        }
        
        // Get updated projects
        const updatedProjects = codeGenerationService.getAllProjects();
        const exampleProjs = updatedProjects.filter(p => p.isExample);
        const userProjs = updatedProjects.filter(p => !p.isExample);
        
        setExampleProjects(exampleProjs);
        setProjects(userProjs);
        
        // Select first project if available
        if (userProjs.length > 0) {
          setSelectedProject(userProjs[0].id);
        } else if (exampleProjs.length > 0) {
          setSelectedProject(exampleProjs[0].id);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [diagramId]);
  
  const handleProjectChange = (event: SelectChangeEvent<string>) => {
    setSelectedProject(event.target.value);
  };

  const handleGenerateCode = () => {
    if (!selectedProject) {
      alert('Please select a project first');
      return;
    }
    
    try {
      // Get the selected project
      const project = [...projects, ...exampleProjects].find(p => p.id === selectedProject);
      if (!project) {
        throw new Error('Selected project not found');
      }
      
      // Find models that conform to the project's target metamodel
      const relatedModels = modelService.getModelsByMetamodelId(project.targetMetamodelId);
      if (relatedModels.length === 0) {
        throw new Error(`No models found for metamodel: ${project.targetMetamodelId}`);
      }
      
      // Smart model selection: prioritize diagram's model if available, or analyze template for model references
      let selectedModel = relatedModels[0]; // Default to first model
      
      // If we have a diagramId, use that diagram's model
      if (diagramId) {
        const diagram = diagramService.getDiagramById(diagramId);
        if (diagram) {
          const diagramModel = modelService.getModelById(diagram.modelId);
          if (diagramModel && relatedModels.some(m => m.id === diagramModel.id)) {
            selectedModel = diagramModel;
          }
        }
      } else {
        // For standalone code generation, analyze project templates to find referenced models
        const projectTemplates = project.templates;
        for (const template of projectTemplates) {
          // Look for model references in the template (e.g., ManufacturingModel2, ManufacturingModel)
          for (const model of relatedModels) {
            if (template.templateContent.includes(model.name)) {
              selectedModel = model;
              break;
            }
          }
          if (selectedModel !== relatedModels[0]) break; // Found a specific model reference
        }
      }
      
      // Find the diagram for the selected model if it exists
      const diagrams = diagramService.getAllDiagrams();
      const matchingDiagram = diagrams.find(d => d.modelId === selectedModel.id);
      
      let results: CodeGenerationResult[];
      
      if (matchingDiagram) {
        // Use diagram-based generation if a diagram exists
        results = codeGenerationService.generateProjectCode(
          matchingDiagram.id,
          selectedProject
        );
      } else {
        // Use model-based generation if no diagram exists
        results = codeGenerationService.generateProjectCodeFromModel(
          selectedModel.id,
          selectedProject
        );
      }
      
      setGeneratedCode(results);
      setSelectedFileIndex(results.length > 0 ? 0 : null);
      setActiveTab(2); // Switch to Generated Files tab
    } catch (error) {
      console.error('Error generating code:', error);
      alert(`Error generating code: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const downloadFile = (content: string, filename: string) => {
    const element = document.createElement('a');
    const file = new Blob([content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Template tab management
  const addTemplateTab = () => {
    const newTemplate: ProjectTemplate = {
      id: `new-template-${Date.now()}`,
      name: `Template ${projectTemplates.length + 1}`,
      language: 'java',
      content: '',
      outputPattern: '{{name}}.java',
      isNew: true
    };
    
    setProjectTemplates([...projectTemplates, newTemplate]);
    setActiveTemplateTab(projectTemplates.length);
  };

  const removeTemplateTab = (index: number) => {
    if (projectTemplates.length === 1) {
      return; // Don't remove the last template
    }
    
    const newTemplates = [...projectTemplates];
    newTemplates.splice(index, 1);
    setProjectTemplates(newTemplates);
    
    // Adjust active tab if necessary
    if (activeTemplateTab >= newTemplates.length) {
      setActiveTemplateTab(newTemplates.length - 1);
    } else if (activeTemplateTab === index) {
      setActiveTemplateTab(Math.max(0, index - 1));
    }
  };

  const updateTemplateTab = (index: number, updates: Partial<ProjectTemplate>) => {
    const newTemplates = [...projectTemplates];
    newTemplates[index] = { ...newTemplates[index], ...updates };
    setProjectTemplates(newTemplates);
  };

  const handleCreateProject = () => {
    if (!projectName.trim()) {
      alert('Please enter a project name');
      return;
    }
    
    if (!projectTarget) {
      alert('Please select a target metamodel');
      return;
    }
    
    try {
      // Create the project
      const newProject = codeGenerationService.createProject(
        projectName,
        projectTarget,
        projectDescription
      );
      
      // Add templates to the project
      projectTemplates.forEach(template => {
        codeGenerationService.addTemplateToProject(
          newProject.id,
          template.name,
          template.language,
          template.content,
          template.outputPattern
        );
      });
      
      // Update state
      setProjects([...projects, newProject]);
      
      // Select the new project
      setSelectedProject(newProject.id);
      
      // Close dialog
      setIsProjectDialogOpen(false);
    } catch (error) {
      console.error('Error creating project:', error);
      alert(`Error creating project: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleUpdateProject = () => {
    if (!selectedProjectForEditing || !projectName || !projectTarget) {
      alert('Please provide a project name and target metamodel');
      return;
    }
    
    codeGenerationService.updateProject(
      selectedProjectForEditing.id,
      {
        name: projectName,
        description: projectDescription,
        targetMetamodelId: projectTarget,
        updatedAt: Date.now()
      }
    );
    
    // Update templates in the project
    // First, remove all templates
    const currentProject = codeGenerationService.getProjectById(selectedProjectForEditing.id);
    if (currentProject) {
      // Remove existing templates
      currentProject.templates.forEach(template => {
        codeGenerationService.removeTemplateFromProject(selectedProjectForEditing.id, template.id);
      });
      
      // Add updated templates
      projectTemplates.forEach(template => {
        codeGenerationService.addTemplateToProject(
          selectedProjectForEditing.id,
          template.name,
          template.language,
          template.content,
          template.outputPattern
        );
      });
    }
    
    // Refresh projects
    const allProjects = codeGenerationService.getAllProjects();
    setProjects(allProjects.filter(p => !p.isExample));
    
    resetProjectForm();
    setIsProjectDialogOpen(false);
    setSelectedProjectForEditing(null);
  };

  const handleEditProject = (project: CodeGenerationProject) => {
    setSelectedProjectForEditing(project);
    setProjectName(project.name);
    setProjectDescription(project.description || '');
    setProjectTarget(project.targetMetamodelId);
    
    // Set up template tabs
    const templates: ProjectTemplate[] = project.templates.map(t => ({
      id: t.id,
      name: t.name,
      language: t.language,
      content: t.templateContent,
      outputPattern: t.outputPattern
    }));
    
    setProjectTemplates(templates.length > 0 ? templates : [{
      id: `new-template-${Date.now()}`,
      name: 'Template 1',
      language: 'java',
      content: '',
      outputPattern: '{{name}}.java',
      isNew: true
    }]);
    
    setActiveTemplateTab(0);
    setIsProjectDialogOpen(true);
  };

  const handleDeleteProject = (projectId: string) => {
    if (window.confirm('Are you sure you want to delete this project?')) {
      codeGenerationService.deleteProject(projectId);
      
      // Check if it was a user project or example project
      const isUserProject = projects.some(p => p.id === projectId);
      
      if (isUserProject) {
        setProjects(projects.filter(p => p.id !== projectId));
      } else {
        setExampleProjects(exampleProjects.filter(p => p.id !== projectId));
      }
      
      if (selectedProject === projectId) {
        setSelectedProject('');
      }
    }
  };

  const resetProjectForm = () => {
    setProjectName('');
    setProjectDescription('');
    setProjectTarget('');
    
    // Initialize with one empty template
    setProjectTemplates([{
      id: `new-template-${Date.now()}`,
      name: 'Template 1',
      language: 'java',
      content: '',
      outputPattern: '{{name}}.java',
      isNew: true
    }]);
    setActiveTemplateTab(0);
    setSelectedProjectForEditing(null);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>
          Loading code generation data...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      <Typography variant="h5" gutterBottom>
        Code Generation
      </Typography>
      
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <FormControl sx={{ minWidth: 300 }}>
            <InputLabel id="project-select-label">Project</InputLabel>
            <Select
              labelId="project-select-label"
              value={selectedProject}
              label="Project"
              onChange={handleProjectChange}
            >
              {/* User Projects */}
              {projects.length > 0 && (
                <ListSubheader>Your Projects</ListSubheader>
              )}
              {projects.map((project) => (
                <MenuItem key={project.id} value={project.id}>
                  {project.name} ({metamodels.find(m => m.id === project.targetMetamodelId)?.name || 'Unknown Metamodel'})
                </MenuItem>
              ))}
              
              {/* Example Projects */}
              {exampleProjects.length > 0 && (
                <ListSubheader>Example Projects</ListSubheader>
              )}
              {exampleProjects.map((project) => (
                <MenuItem key={project.id} value={project.id}>
                  {project.name} ({metamodels.find(m => m.id === project.targetMetamodelId)?.name || 'Unknown Metamodel'})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                resetProjectForm();
                setIsProjectDialogOpen(true);
              }}
            >
              New Project
            </Button>
            
            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayArrowIcon />}
              onClick={handleGenerateCode}
              disabled={!selectedProject}
            >
              Generate Code
            </Button>
          </Box>
        </Box>
      </Paper>
      
      <Paper sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab label="Projects" />
            <Tab label="Example Templates" />
            <Tab label="Generated Files" />
          </Tabs>
        </Box>
        
        <TabPanel value={activeTab} index={0}>
          {/* Projects Tab */}
          <Typography variant="h6" gutterBottom>Projects</Typography>
          <List>
            {projects.map(project => (
              <ListItem
                key={project.id}
                secondaryAction={
                  <Box>
                    <IconButton edge="end" onClick={() => handleEditProject(project)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton edge="end" onClick={() => handleDeleteProject(project.id)}>
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemText
                  primary={project.name}
                  secondary={`Templates: ${project.templates.length} | Target Metamodel: ${
                    metamodelService.getMetamodelById(project.targetMetamodelId)?.name || 'Unknown'
                  }`}
                />
              </ListItem>
            ))}
            
            {projects.length === 0 && (
              <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 2 }}>
                No projects defined yet. Create a project to generate code.
              </Typography>
            )}
          </List>
          
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => {
                resetProjectForm();
                // Initialize with one empty template
                setProjectTemplates([{
                  id: `new-template-${Date.now()}`,
                  name: 'Template 1',
                  language: 'java',
                  content: '',
                  outputPattern: '{{name}}.java',
                  isNew: true
                }]);
                setActiveTemplateTab(0);
                setIsProjectDialogOpen(true);
              }}
            >
              New Project
            </Button>
          </Box>
        </TabPanel>
        
        <TabPanel value={activeTab} index={1}>
          {/* Example Templates Tab */}
          <Typography variant="h6" gutterBottom>Example Templates</Typography>
          <List>
            {exampleTemplates.map(template => (
              <ListItem
                key={template.id}
                secondaryAction={
                  <Box>
                    <IconButton edge="end" onClick={() => {
                      // Create a new project with this example template
                      resetProjectForm();
                      setProjectTemplates([{
                        id: `new-template-${Date.now()}`,
                        name: template.name,
                        language: template.language,
                        content: template.templateContent,
                        outputPattern: template.outputPattern,
                        isNew: true
                      }]);
                      setActiveTemplateTab(0);
                      setIsProjectDialogOpen(true);
                    }}>
                      <AddIcon />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemText
                  primary={template.name}
                  secondary={`Language: ${template.language} | Target: ${
                    metamodelService.getMetamodelById(template.targetMetamodelId)?.name || 'Unknown'
                  }`}
                />
              </ListItem>
            ))}
            
            {exampleTemplates.length === 0 && (
              <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 2 }}>
                No example templates available.
              </Typography>
            )}
          </List>
        </TabPanel>
        
        <TabPanel value={activeTab} index={2}>
          {/* Generated Files Tab */}
          {generatedCode.length > 0 ? (
            <Box sx={{ display: 'flex', height: '100%' }}>
              <List sx={{ width: 250, borderRight: '1px solid #eee', overflowY: 'auto' }}>
                {generatedCode.map((file, index) => (
                  <ListItem
                    key={index}
                    disablePadding
                    secondaryAction={
                      <IconButton edge="end" onClick={() => downloadFile(file.content, file.filename)}>
                        <DownloadIcon />
                      </IconButton>
                    }
                  >
                    <ListItemButton
                      selected={selectedFileIndex === index}
                      onClick={() => setSelectedFileIndex(index)}
                    >
                      <ListItemText primary={file.filename} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
              
              <Box sx={{ flexGrow: 1, p: 2, overflowY: 'auto', height: '100%' }}>
                {selectedFileIndex !== null && (
                  <>
                    <Box sx={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      mb: 2,
                      backgroundColor: '#333333',
                      padding: '8px',
                      color: 'white',
                      borderTopLeftRadius: '4px',
                      borderTopRightRadius: '4px'
                    }}>
                      <Typography variant="subtitle1">
                        {generatedCode[selectedFileIndex].filename}
                      </Typography>
                      
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<DownloadIcon />}
                        onClick={() => downloadFile(
                          generatedCode[selectedFileIndex].content,
                          generatedCode[selectedFileIndex].filename
                        )}
                        sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
                      >
                        Download
                      </Button>
                    </Box>
                    
                    <Box sx={{ 
                      height: 'calc(100% - 60px)', 
                      backgroundColor: '#1e1e1e',
                      borderBottomLeftRadius: '4px',
                      borderBottomRightRadius: '4px',
                      overflow: 'auto'
                    }}>
                      <CodeMirror
                        value={generatedCode[selectedFileIndex].content}
                        height="calc(100% - 60px)"
                        extensions={[javascript(), okaidia]}
                        theme="dark"
                      />
                    </Box>
                  </>
                )}
              </Box>
            </Box>
          ) : (
            <Typography variant="body2" color="textSecondary" align="center">
              No files generated yet. Select a project and generate code.
            </Typography>
          )}
        </TabPanel>
      </Paper>
      
      {/* Project Dialog */}
      <Dialog
        open={isProjectDialogOpen}
        onClose={() => {
          setIsProjectDialogOpen(false);
          resetProjectForm();
        }}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          {selectedProjectForEditing ? 'Edit Project' : 'Create New Project'}
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
              <Box sx={{ flex: 3 }}>
                <TextField
                  label="Project Name"
                  fullWidth
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </Box>
              
              <Box sx={{ flex: 1 }}>
                <FormControl fullWidth>
                  <InputLabel id="project-target-select-label">Target Metamodel</InputLabel>
                  <Select
                    labelId="project-target-select-label"
                    value={projectTarget}
                    label="Target Metamodel"
                    onChange={(e) => setProjectTarget(e.target.value)}
                  >
                    {metamodels.map(mm => (
                      <MenuItem key={mm.id} value={mm.id}>{mm.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Box>
            
            <Box>
              <TextField
                label="Project Description"
                fullWidth
                multiline
                rows={2}
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
              />
            </Box>
            
            <Divider sx={{ my: 1 }} />
            
            <Typography variant="h6" gutterBottom>
              Templates
            </Typography>
            
            <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex' }}>
              <Tabs 
                value={activeTemplateTab} 
                onChange={(e, newValue) => setActiveTemplateTab(newValue)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ flex: 1 }}
              >
                {projectTemplates.map((template, index) => (
                  <Tab 
                    key={template.id} 
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {template.name}
                        {projectTemplates.length > 1 && (
                          <IconButton 
                            size="small" 
                            onClick={(e) => {
                              e.stopPropagation();
                              removeTemplateTab(index);
                            }}
                            sx={{ ml: 1 }}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    } 
                  />
                ))}
              </Tabs>
              <Button
                startIcon={<AddIcon />}
                onClick={addTemplateTab}
                sx={{ ml: 1 }}
              >
                Add Template
              </Button>
            </Box>
            
            {projectTemplates.map((template, index) => (
              <Box
                key={template.id}
                sx={{ 
                  display: activeTemplateTab === index ? 'flex' : 'none',
                  flexDirection: 'column',
                  gap: 2
                }}
              >
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Template Name"
                    fullWidth
                    value={template.name}
                    onChange={(e) => updateTemplateTab(index, { name: e.target.value })}
                  />
                  
                  <FormControl sx={{ minWidth: 150 }}>
                    <InputLabel>Language</InputLabel>
                    <Select
                      value={template.language}
                      label="Language"
                      onChange={(e) => updateTemplateTab(index, { language: e.target.value as 'java' | 'python' })}
                    >
                      <MenuItem value="java">Java</MenuItem>
                      <MenuItem value="python">Python</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
                
                <TextField
                  label="Output Filename Pattern"
                  fullWidth
                  value={template.outputPattern}
                  onChange={(e) => updateTemplateTab(index, { outputPattern: e.target.value })}
                  helperText="Use Handlebars syntax, e.g. {{name}}.java"
                />
                
                <Typography variant="subtitle2" gutterBottom>
                  Template Content
                </Typography>
                
                <TemplateEditor
                  value={template.content}
                  onChange={(value) => updateTemplateTab(index, { content: value })}
                />
                
                <Typography variant="caption" color="textSecondary">
                  Available helpers: <span style={{ color: '#569cd6' }}>&#123;&#123;capitalize name&#125;&#125;</span>, <span style={{ color: '#569cd6' }}>&#123;&#123;lowercase name&#125;&#125;</span>, <span style={{ color: '#569cd6' }}>&#123;&#123;camelCase name&#125;&#125;</span>, <span style={{ color: '#569cd6' }}>&#123;&#123;snakeCase name&#125;&#125;</span>
                </Typography>
                
                <Divider sx={{ my: 1 }} />
                
                <Typography variant="subtitle2" gutterBottom>
                  Multi-element Access
                </Typography>
                
                <Typography variant="caption" color="textSecondary" component="div" sx={{ mb: 1 }}>
                  <Box component="ul" sx={{ m: 0, pl: 2 }}>
                    <li>Access elements by name: &#123;&#123;ElementName.property&#125;&#125; (e.g., &#123;&#123;Class_Server1.port&#125;&#125;)</li>
                    <li>Access all elements: &#123;&#123;#each elements&#125;&#125;...&#123;&#123;/each&#125;&#125;</li>
                    <li>Access elements by class: &#123;&#123;#each elementsByClassName.Server&#125;&#125;...&#123;&#123;/each&#125;&#125;</li>
                    <li>Count elements by class: <strong>&#123;&#123;countElements "Robot_Class"&#125;&#125;</strong> (recommended)</li>
                    <li>Alternative count methods: &#123;&#123;countByClassName "Robot_Class"&#125;&#125;, &#123;&#123;elementsByClassName.Robot_Class.length&#125;&#125;</li>
                    <li>Compare values: &#123;&#123;#if (eq metaClassId "Server")&#125;&#125;...&#123;&#123;/if&#125;&#125;</li>
                  </Box>
                </Typography>
                
                <Typography variant="subtitle2" gutterBottom>
                  Metamodel Access
                </Typography>
                
                <Typography variant="caption" color="textSecondary" component="div" sx={{ mb: 1 }}>
                  <Box component="ul" sx={{ m: 0, pl: 2 }}>
                    <li>Access metamodel name: &#123;&#123;metamodel.name&#125;&#125;</li>
                    <li>Access metamodel classes: &#123;&#123;#each metamodel.classes&#125;&#125;...&#123;&#123;/each&#125;&#125;</li>
                    <li>Count metaclasses: &#123;&#123;metamodel.classes.length&#125;&#125;</li>
                  </Box>
                </Typography>
              </Box>
            ))}
          </Box>
        </DialogContent>
        
        <DialogActions>
          <Button
            onClick={() => {
              setIsProjectDialogOpen(false);
              resetProjectForm();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={selectedProjectForEditing ? handleUpdateProject : handleCreateProject}
            color="primary"
            variant="contained"
          >
            {selectedProjectForEditing ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CodeGenerator; 