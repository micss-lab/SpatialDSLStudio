/**
 * Custom hook for managing code generation projects (CRUD operations)
 */

import { useState, useCallback } from 'react';
import { SelectChangeEvent } from '@mui/material';
import { CodeGenerationProject } from '../../../models/types';
import { codeGenerationService } from '../../../services/codegeneration';
import { ProjectTemplate } from '../types';

/**
 * Hook return type
 */
export interface UseProjectManagementReturn {
  projects: CodeGenerationProject[];
  exampleProjects: CodeGenerationProject[];
  selectedProject: string;
  selectedProjectForEditing: CodeGenerationProject | null;
  projectName: string;
  projectDescription: string;
  projectTarget: string;
  isProjectDialogOpen: boolean;
  setProjects: (projects: CodeGenerationProject[]) => void;
  setExampleProjects: (projects: CodeGenerationProject[]) => void;
  setSelectedProject: (projectId: string) => void;
  setProjectName: (name: string) => void;
  setProjectDescription: (description: string) => void;
  setProjectTarget: (target: string) => void;
  setIsProjectDialogOpen: (open: boolean) => void;
  handleProjectChange: (event: SelectChangeEvent<string>) => void;
  handleCreateProject: (templates: ProjectTemplate[]) => void;
  handleUpdateProject: (templates: ProjectTemplate[]) => void;
  handleImportProject: (file: File) => Promise<void>;
  handleEditProject: (project: CodeGenerationProject) => ProjectTemplate[];
  handleDeleteProject: (projectId: string) => void;
  resetProjectForm: () => ProjectTemplate[];
}

/**
 * useProjectManagement hook manages project CRUD operations
 */
export const useProjectManagement = (): UseProjectManagementReturn => {
  const [projects, setProjects] = useState<CodeGenerationProject[]>([]);
  const [exampleProjects, setExampleProjects] = useState<CodeGenerationProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedProjectForEditing, setSelectedProjectForEditing] = useState<CodeGenerationProject | null>(null);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectTarget, setProjectTarget] = useState('');

  /**
   * Handle project selection change
   */
  const handleProjectChange = useCallback((event: SelectChangeEvent<string>) => {
    setSelectedProject(event.target.value);
  }, []);

  /**
   * Create a new project
   */
  const handleCreateProject = useCallback((templates: ProjectTemplate[]) => {
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
      templates.forEach(template => {
        codeGenerationService.addTemplateToProject(
          newProject.id,
          template.name,
          template.language,
          template.content,
          template.outputPattern
        );
      });
      
      // Update state
      setProjects(prev => [...prev, newProject]);
      
      // Select the new project
      setSelectedProject(newProject.id);
      
      // Close dialog
      setIsProjectDialogOpen(false);
    } catch (error) {
      console.error('Error creating project:', error);
      alert(`Error creating project: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [projectName, projectTarget, projectDescription]);

  /**
   * Update an existing project
   */
  const handleUpdateProject = useCallback((templates: ProjectTemplate[]) => {
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
      templates.forEach(template => {
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
    
    setIsProjectDialogOpen(false);
    setSelectedProjectForEditing(null);
  }, [selectedProjectForEditing, projectName, projectDescription, projectTarget]);

  /**
   * Import a project from a JSON file.
   */
  const handleImportProject = useCallback(async (file: File) => {
    try {
      const rawContent = await file.text();
      const parsedContent = JSON.parse(rawContent);
      const projectPayloads: unknown[] = Array.isArray(parsedContent)
        ? parsedContent
        : Array.isArray(parsedContent.projects)
          ? parsedContent.projects
          : [parsedContent];

      const importedProjects = projectPayloads.map((project: unknown) => codeGenerationService.importProject(project));

      const allProjects = codeGenerationService.getAllProjects();
      setProjects(allProjects.filter(p => !p.isExample));
      setExampleProjects(allProjects.filter(p => p.isExample));

      if (importedProjects.length > 0) {
        setSelectedProject(importedProjects[0].id);
      }
    } catch (error) {
      console.error('Error importing code generation project:', error);
      alert(`Error importing project: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  /**
   * Edit a project (opens dialog with project data)
   * Returns templates to be set in template management hook
   */
  const handleEditProject = useCallback((project: CodeGenerationProject): ProjectTemplate[] => {
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
    
    const finalTemplates = templates.length > 0 ? templates : [{
      id: `new-template-${Date.now()}`,
      name: 'Template 1',
      language: 'java' as const,
      content: '',
      outputPattern: '{{name}}.java',
      isNew: true
    }];
    
    setIsProjectDialogOpen(true);
    return finalTemplates;
  }, []);

  /**
   * Delete a project
   */
  const handleDeleteProject = useCallback((projectId: string) => {
    if (window.confirm('Are you sure you want to delete this project?')) {
      codeGenerationService.deleteProject(projectId);
      
      // Check if it was a user project or example project
      setProjects(prev => {
        const isUserProject = prev.some(p => p.id === projectId);
        if (isUserProject) {
          return prev.filter(p => p.id !== projectId);
        }
        return prev;
      });
      
      setExampleProjects(prev => prev.filter(p => p.id !== projectId));
      
      if (selectedProject === projectId) {
        setSelectedProject('');
      }
    }
  }, [selectedProject]);

  /**
   * Reset the project form to initial state
   * Returns initial templates to be set in template management hook
   */
  const resetProjectForm = useCallback((): ProjectTemplate[] => {
    setProjectName('');
    setProjectDescription('');
    setProjectTarget('');
    setSelectedProjectForEditing(null);
    
    // Return initial template
    return [{
      id: `new-template-${Date.now()}`,
      name: 'Template 1',
      language: 'java' as const,
      content: '',
      outputPattern: '{{name}}.java',
      isNew: true
    }];
  }, []);

  return {
    projects,
    exampleProjects,
    selectedProject,
    selectedProjectForEditing,
    projectName,
    projectDescription,
    projectTarget,
    isProjectDialogOpen,
    setProjects,
    setExampleProjects,
    setSelectedProject,
    setProjectName,
    setProjectDescription,
    setProjectTarget,
    setIsProjectDialogOpen,
    handleProjectChange,
    handleCreateProject,
    handleUpdateProject,
    handleImportProject,
    handleEditProject,
    handleDeleteProject,
    resetProjectForm
  };
};
