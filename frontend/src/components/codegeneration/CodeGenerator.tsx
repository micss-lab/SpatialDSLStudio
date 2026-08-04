import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, TextField, Select, MenuItem, FormControl, InputLabel, Button, Dialog, DialogTitle, DialogContent, DialogActions, Divider, IconButton, Tabs, Tab, CircularProgress } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { CodeGenerationTemplate, CodeGenerationResult, Metamodel, CodeGenerationProject, Model } from '../../models/types';
import { codeGenerationService } from '../../services/codegeneration';
import { metamodelService } from '../../services/metamodel';
import { modelService } from '../../services/model';
import { apiClient } from '../../services/core';
import { ShareDialog } from '../common';
import { useProject } from '../../contexts/ProjectContext';
import { CodeGeneratorProps } from './types';
import { downloadFile, downloadAllFilesAsZip } from './utils/fileDownload';
import { TabPanel } from './components/TabPanel';
import { TemplateEditor } from './components/TemplateEditor';
import { ProjectSelector } from './components/ProjectSelector';
import { ProjectsTab } from './components/ProjectsTab';
import { ExampleTemplatesTab } from './components/ExampleTemplatesTab';
import { GeneratedFilesTab } from './components/GeneratedFilesTab';
import { useProjectManagement } from './hooks/useProjectManagement';
import { useTemplateManagement } from './hooks/useTemplateManagement';

const CodeGenerator: React.FC<CodeGeneratorProps> = ({ modelId }) => {
  const { can } = useProject();
  const canCreate = can('codegen.author');
  const canDelete = can('codegen.author');
  const canGenerate = can('codegen.execute');
  const canShare = false;
  
  // Use custom hooks for state management
  const projectManagement = useProjectManagement();
  const templateManagement = useTemplateManagement();
  
  // Local state
  const [loading, setLoading] = useState<boolean>(true);
  const [routeModel, setRouteModel] = useState<Model | null>(null);
  const [metamodels, setMetamodels] = useState<Metamodel[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [exampleTemplates, setExampleTemplates] = useState<CodeGenerationTemplate[]>([]);
  const [generatedCode, setGeneratedCode] = useState<CodeGenerationResult[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedProjectForSharing, setSelectedProjectForSharing] = useState<CodeGenerationProject | null>(null);
  
  useEffect(() => {
    // Load data
    const loadData = async () => {
      setLoading(true);
      
      try {
        // Load all metamodels
        const allMetamodels = metamodelService.getAllMetamodels();
        setMetamodels(allMetamodels);
        
        // Load all models
        const allModels = modelService.getAllModels();
        setModels(allModels);
        
        const modelFromRoute = modelId ? modelService.getModelById(modelId) || null : null;
        setRouteModel(modelFromRoute);
        
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
        if (allProjects.length === 0 && !apiClient.getProjectId()) {
          codeGenerationService.loadExampleProjects();
        }
        
        // Get updated projects
        const updatedProjects = codeGenerationService.getAllProjects();
        const exampleProjs = updatedProjects.filter(p => p.isExample);
        const userProjs = updatedProjects.filter(p => !p.isExample);
        
        projectManagement.setExampleProjects(exampleProjs);
        projectManagement.setProjects(userProjs);
        
        const allProjectOptions = [...userProjs, ...exampleProjs];
        const compatibleProject = modelFromRoute
          ? allProjectOptions.find(p => p.targetMetamodelId === modelFromRoute.conformsTo)
          : undefined;

        if (compatibleProject) {
          projectManagement.setSelectedProject(compatibleProject.id);
        } else if (userProjs.length > 0) {
          projectManagement.setSelectedProject(userProjs[0].id);
        } else if (exampleProjs.length > 0) {
          projectManagement.setSelectedProject(exampleProjs[0].id);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  const handleGenerateCode = () => {
    if (!canGenerate) {
      alert('Your project role does not allow code generation');
      return;
    }
    if (!projectManagement.selectedProject) {
      alert('Please select a generator configuration first');
      return;
    }
    
    try {
      // Get the selected project
      const project = [...projectManagement.projects, ...projectManagement.exampleProjects].find(p => p.id === projectManagement.selectedProject);
      if (!project) {
        throw new Error('Selected generator configuration not found');
      }
      
      // Find models that conform to the project's target metamodel
      const relatedModels = modelService.getModelsByMetamodelId(project.targetMetamodelId);
      if (relatedModels.length === 0) {
        throw new Error(`No models found for metamodel: ${project.targetMetamodelId}`);
      }
      
      // Smart model selection: prioritize the route model if available, or analyze template for model references
      let selectedModel = relatedModels[0]; // Default to first model
      
      if (modelId) {
        const requestedModel = routeModel || modelService.getModelById(modelId);
        if (!requestedModel) {
          throw new Error(`Model with ID ${modelId} not found`);
        }
        if (!relatedModels.some(m => m.id === requestedModel.id)) {
          throw new Error(`Selected generator configuration does not target the model's metamodel: ${requestedModel.conformsTo}`);
        }
        selectedModel = requestedModel;
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
      
      // Code-gen always runs against the model (abstract syntax), not a view.
      // Views are read-projections of the model and may be partial subsets, so
      // running code-gen against a view would yield non-deterministic output
      // depending on which view happened to be found first.
      const results = codeGenerationService.generateProjectCodeFromModel(
        selectedModel.id,
        projectManagement.selectedProject
      );

      setGeneratedCode(results);
      setSelectedFileIndex(results.length > 0 ? 0 : null);
      setActiveTab(2); // Switch to Generated Files tab
    } catch (error) {
      console.error('Error generating code:', error);
      alert(`Error generating code: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Wrapper functions to coordinate hooks
  const handleEditProjectWrapper = (project: CodeGenerationProject) => {
    const templates = projectManagement.handleEditProject(project);
    templateManagement.setProjectTemplates(templates);
    templateManagement.setActiveTemplateTab(0);
  };

  const handleCreateProjectWrapper = () => {
    projectManagement.handleCreateProject(templateManagement.projectTemplates);
  };

  const handleUpdateProjectWrapper = () => {
    projectManagement.handleUpdateProject(templateManagement.projectTemplates);
  };

  const resetProjectFormWrapper = () => {
    const templates = projectManagement.resetProjectForm();
    templateManagement.setProjectTemplates(templates);
    templateManagement.setActiveTemplateTab(0);
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
        <ProjectSelector
          selectedProject={projectManagement.selectedProject}
          projects={projectManagement.projects}
          exampleProjects={projectManagement.exampleProjects}
          metamodels={metamodels}
          onProjectChange={projectManagement.handleProjectChange}
          onNewProject={() => {
            resetProjectFormWrapper();
            projectManagement.setIsProjectDialogOpen(true);
          }}
          onGenerate={handleGenerateCode}
          canCreate={canCreate}
          canGenerate={canGenerate}
        />
      </Paper>
      
      <Paper sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab label="Configurations" />
            <Tab label="Example Templates" />
            <Tab label="Generated Files" />
          </Tabs>
        </Box>
        
        <TabPanel value={activeTab} index={0}>
          <ProjectsTab
            projects={projectManagement.projects}
            onEdit={handleEditProjectWrapper}
            onDelete={projectManagement.handleDeleteProject}
            onShare={(project) => {
              setSelectedProjectForSharing(project);
              setShareDialogOpen(true);
            }}
            onNewProject={() => {
              resetProjectFormWrapper();
              const templates = projectManagement.resetProjectForm();
              templateManagement.setProjectTemplates(templates);
              templateManagement.setActiveTemplateTab(0);
              projectManagement.setIsProjectDialogOpen(true);
            }}
            onImportProject={projectManagement.handleImportProject}
            canCreate={canCreate}
            canDelete={canDelete}
            canShare={canShare}
          />
        </TabPanel>
        
        <TabPanel value={activeTab} index={1}>
          <ExampleTemplatesTab
            templates={exampleTemplates}
            onUseTemplate={(template) => {
              // Create a new project with this example template
              resetProjectFormWrapper();
              templateManagement.setProjectTemplates([{
                id: `new-template-${Date.now()}`,
                name: template.name,
                language: template.language,
                content: template.templateContent,
                outputPattern: template.outputPattern,
                isNew: true
              }]);
              templateManagement.setActiveTemplateTab(0);
              projectManagement.setIsProjectDialogOpen(true);
            }}
            canCreate={canCreate}
          />
        </TabPanel>
        
        <TabPanel value={activeTab} index={2}>
          <GeneratedFilesTab
            files={generatedCode}
            selectedIndex={selectedFileIndex}
            onSelectFile={setSelectedFileIndex}
            onDownloadFile={downloadFile}
            onDownloadAll={downloadAllFilesAsZip}
          />
        </TabPanel>
      </Paper>
      
      {/* Project Dialog */}
      <Dialog
        open={projectManagement.isProjectDialogOpen}
        onClose={() => {
          projectManagement.setIsProjectDialogOpen(false);
          resetProjectFormWrapper();
        }}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          {projectManagement.selectedProjectForEditing ? 'Edit Generator Configuration' : 'Create Generator Configuration'}
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
              <Box sx={{ flex: 3 }}>
                <TextField
                  label="Configuration Name"
                  fullWidth
                  value={projectManagement.projectName}
                  onChange={(e) => projectManagement.setProjectName(e.target.value)}
                />
              </Box>
              
              <Box sx={{ flex: 1 }}>
                <FormControl fullWidth>
                  <InputLabel id="project-target-select-label">Target Metamodel</InputLabel>
                  <Select
                    labelId="project-target-select-label"
                    value={projectManagement.projectTarget}
                    label="Target Metamodel"
                    onChange={(e) => projectManagement.setProjectTarget(e.target.value)}
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
                label="Configuration Description"
                fullWidth
                multiline
                rows={2}
                value={projectManagement.projectDescription}
                onChange={(e) => projectManagement.setProjectDescription(e.target.value)}
              />
            </Box>
            
            <Divider sx={{ my: 1 }} />
            
            <Typography variant="h6" gutterBottom>
              Templates
            </Typography>
            
            <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex' }}>
              <Tabs 
                value={templateManagement.activeTemplateTab} 
                onChange={(e, newValue) => templateManagement.setActiveTemplateTab(newValue)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ flex: 1 }}
              >
                {templateManagement.projectTemplates.map((template, index) => (
                  <Tab 
                    key={template.id} 
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {template.name}
                        {templateManagement.projectTemplates.length > 1 && (
                          <IconButton 
                            size="small" 
                            onClick={(e) => {
                              e.stopPropagation();
                              templateManagement.removeTemplateTab(index);
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
                onClick={templateManagement.addTemplateTab}
                sx={{ ml: 1 }}
              >
                Add Template
              </Button>
            </Box>
            
            {templateManagement.projectTemplates.map((template, index) => (
              <Box
                key={template.id}
                sx={{ 
                  display: templateManagement.activeTemplateTab === index ? 'flex' : 'none',
                  flexDirection: 'column',
                  gap: 2
                }}
              >
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Template Name"
                    fullWidth
                    value={template.name}
                    onChange={(e) => templateManagement.updateTemplateTab(index, { name: e.target.value })}
                  />
                  
                  <FormControl sx={{ minWidth: 150 }}>
                    <InputLabel>Language</InputLabel>
                    <Select
                      value={template.language}
                      label="Language"
                      onChange={(e) => templateManagement.updateTemplateTab(index, { language: e.target.value as 'java' | 'python' | 'json' | 'xml' | 'plaintext' })}
                    >
                      <MenuItem value="java">Java</MenuItem>
                      <MenuItem value="python">Python</MenuItem>
                      <MenuItem value="json">JSON</MenuItem>
                      <MenuItem value="xml">XML</MenuItem>
                      <MenuItem value="plaintext">Plain Text</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
                
                <TextField
                  label="Output Filename Pattern"
                  fullWidth
                  value={template.outputPattern}
                  onChange={(e) => templateManagement.updateTemplateTab(index, { outputPattern: e.target.value })}
                  helperText="Use Handlebars syntax, e.g. {{name}}.java"
                />
                
                <Typography variant="subtitle2" gutterBottom>
                  Template Content
                </Typography>
                
                <TemplateEditor
                  value={template.content}
                  onChange={(value) => templateManagement.updateTemplateTab(index, { content: value })}
                  metamodels={metamodels}
                  models={models}
                  diagram={null}
                  targetMetamodelId={projectManagement.projectTarget}
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
              projectManagement.setIsProjectDialogOpen(false);
              resetProjectFormWrapper();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={projectManagement.selectedProjectForEditing ? handleUpdateProjectWrapper : handleCreateProjectWrapper}
            color="primary"
            variant="contained"
          >
            {projectManagement.selectedProjectForEditing ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Share Dialog */}
      {selectedProjectForSharing && (
        <ShareDialog
          open={shareDialogOpen}
          onClose={() => {
            setShareDialogOpen(false);
            setSelectedProjectForSharing(null);
          }}
          resourceType="CODEGEN_PROJECT"
          resourceId={selectedProjectForSharing.id}
          resourceName={selectedProjectForSharing.name}
        />
      )}
    </Box>
  );
};

export default CodeGenerator;
