/**
 * Custom hook for managing template tabs within a project dialog
 */

import { useState, useCallback } from 'react';
import { ProjectTemplate } from '../types';

/**
 * Hook return type
 */
export interface UseTemplateManagementReturn {
  projectTemplates: ProjectTemplate[];
  activeTemplateTab: number;
  setActiveTemplateTab: (index: number) => void;
  addTemplateTab: () => void;
  removeTemplateTab: (index: number) => void;
  updateTemplateTab: (index: number, updates: Partial<ProjectTemplate>) => void;
  setProjectTemplates: (templates: ProjectTemplate[]) => void;
  resetTemplates: () => void;
}

/**
 * useTemplateManagement hook manages template tabs within a project dialog
 * Handles adding, removing, and updating templates
 */
export const useTemplateManagement = (): UseTemplateManagementReturn => {
  const [projectTemplates, setProjectTemplates] = useState<ProjectTemplate[]>([{
    id: `new-template-${Date.now()}`,
    name: 'Template 1',
    language: 'java',
    content: '',
    outputPattern: '{{name}}.java',
    isNew: true
  }]);
  const [activeTemplateTab, setActiveTemplateTab] = useState(0);

  /**
   * Add a new template tab
   */
  const addTemplateTab = useCallback(() => {
    const newTemplate: ProjectTemplate = {
      id: `new-template-${Date.now()}`,
      name: `Template ${projectTemplates.length + 1}`,
      language: 'java',
      content: '',
      outputPattern: '{{name}}.java',
      isNew: true
    };
    
    setProjectTemplates(prev => [...prev, newTemplate]);
    setActiveTemplateTab(projectTemplates.length);
  }, [projectTemplates.length]);

  /**
   * Remove a template tab by index
   */
  const removeTemplateTab = useCallback((index: number) => {
    if (projectTemplates.length === 1) {
      return; // Don't remove the last template
    }
    
    setProjectTemplates(prev => {
      const newTemplates = [...prev];
      newTemplates.splice(index, 1);
      return newTemplates;
    });
    
    // Adjust active tab if necessary
    setActiveTemplateTab(prev => {
      const newLength = projectTemplates.length - 1;
      if (prev >= newLength) {
        return newLength - 1;
      } else if (prev === index) {
        return Math.max(0, index - 1);
      }
      return prev;
    });
  }, [projectTemplates.length]);

  /**
   * Update a template at a specific index
   */
  const updateTemplateTab = useCallback((index: number, updates: Partial<ProjectTemplate>) => {
    setProjectTemplates(prevTemplates => {
      const newTemplates = [...prevTemplates];
      newTemplates[index] = { ...newTemplates[index], ...updates };
      return newTemplates;
    });
  }, []);

  /**
   * Reset templates to initial state
   */
  const resetTemplates = useCallback(() => {
    setProjectTemplates([{
      id: `new-template-${Date.now()}`,
      name: 'Template 1',
      language: 'java',
      content: '',
      outputPattern: '{{name}}.java',
      isNew: true
    }]);
    setActiveTemplateTab(0);
  }, []);

  return {
    projectTemplates,
    activeTemplateTab,
    setActiveTemplateTab,
    addTemplateTab,
    removeTemplateTab,
    updateTemplateTab,
    setProjectTemplates,
    resetTemplates
  };
};
