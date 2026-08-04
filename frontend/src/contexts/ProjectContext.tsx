import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ProjectCapability, StudioProject } from '../models/project.types';
import { apiClient } from '../services/core';
import { projectService } from '../services/project.service';

export const LAST_PROJECT_KEY = 'spatialdsl.lastProjectId';

interface ProjectContextValue {
  project: StudioProject;
  refreshProject: () => Promise<void>;
  can: (capability: ProjectCapability) => boolean;
  openProject: (projectId: string, section?: string) => void;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

export const ProjectProvider: React.FC<React.PropsWithChildren<{ projectId: string }>> = ({ projectId, children }) => {
  // Set the API boundary before any descendant starts a lazy service load.
  apiClient.setProjectId(projectId);

  const [project, setProject] = useState<StudioProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshProject = useCallback(async () => {
    try {
      setError(null);
      const loaded = await projectService.get(projectId);
      setProject(loaded);
      localStorage.setItem(LAST_PROJECT_KEY, loaded.id);
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load this project');
    }
  }, [projectId]);

  useEffect(() => {
    let active = true;
    projectService.get(projectId)
      .then(async loaded => {
        if (!active) return;
        try {
          // Load editor singletons only after a concrete project has been
          // selected. This also keeps the lightweight context independent of
          // the diagram/3D stack for project-picker and test consumers.
          const { initializeProjectSession } = await import('../services/project-session.service');
          await initializeProjectSession();
        } catch (sessionError) {
          console.warn('Some project services could not be initialized:', sessionError);
        }
        if (!active) return;
        setProject(loaded);
        localStorage.setItem(LAST_PROJECT_KEY, loaded.id);
      })
      .catch(loadError => {
        if (active) setError(loadError?.message || 'Unable to load this project');
      });
    return () => {
      active = false;
      if (apiClient.getProjectId() === projectId) apiClient.setProjectId(null);
    };
  }, [projectId]);

  const value = useMemo<ProjectContextValue | null>(() => project ? ({
    project,
    refreshProject,
    can: capability => (
      project.capabilities.includes(capability)
      && (project.status === 'ACTIVE' || capability === 'project.read')
    ),
    openProject: (nextProjectId, section = '') => {
      localStorage.setItem(LAST_PROJECT_KEY, nextProjectId);
      window.location.assign(`/projects/${nextProjectId}${section ? `/${section.replace(/^\//, '')}` : ''}`);
    },
  }) : null, [project, refreshProject]);

  if (error) {
    return (
      <div role="alert" style={{ padding: 32 }}>
        <h2>Project unavailable</h2>
        <p>{error}</p>
        <a href="/projects">Return to projects</a>
      </div>
    );
  }

  if (!value) {
    return <div aria-label="Loading project" style={{ padding: 32 }}>Loading project…</div>;
  }

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export const useProject = (): ProjectContextValue => {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used inside ProjectProvider');
  return context;
};
