import { ProjectMember, ProjectRole, StudioProject } from '../models/project.types';
import { apiClient } from './core';

const PROJECTS_ENDPOINT = '/projects';

export const projectService = {
  list(includeArchived = false): Promise<StudioProject[]> {
    return apiClient.get<StudioProject[]>(`${PROJECTS_ENDPOINT}?includeArchived=${includeArchived}`);
  },

  get(projectId: string): Promise<StudioProject> {
    return apiClient.get<StudioProject>(`${PROJECTS_ENDPOINT}/${projectId}`);
  },

  create(data: { name: string; description?: string }): Promise<StudioProject> {
    return apiClient.post<StudioProject>(PROJECTS_ENDPOINT, data);
  },

  update(projectId: string, data: { name?: string; description?: string }): Promise<StudioProject> {
    return apiClient.put<StudioProject>(`${PROJECTS_ENDPOINT}/${projectId}`, data);
  },

  archive(projectId: string): Promise<StudioProject> {
    return apiClient.post<StudioProject>(`${PROJECTS_ENDPOINT}/${projectId}/archive`);
  },

  restore(projectId: string): Promise<StudioProject> {
    return apiClient.post<StudioProject>(`${PROJECTS_ENDPOINT}/${projectId}/restore`);
  },

  listMembers(projectId: string): Promise<ProjectMember[]> {
    return apiClient.get<ProjectMember[]>(`${PROJECTS_ENDPOINT}/${projectId}/members`);
  },

  addMember(projectId: string, email: string, role: Exclude<ProjectRole, 'OWNER'>): Promise<ProjectMember> {
    return apiClient.post<ProjectMember>(`${PROJECTS_ENDPOINT}/${projectId}/members`, { email, role });
  },

  updateMember(
    projectId: string,
    userId: string,
    role: Exclude<ProjectRole, 'OWNER'>
  ): Promise<ProjectMember> {
    return apiClient.patch<ProjectMember>(`${PROJECTS_ENDPOINT}/${projectId}/members/${userId}`, { role });
  },

  removeMember(projectId: string, userId: string): Promise<void> {
    return apiClient.delete<void>(`${PROJECTS_ENDPOINT}/${projectId}/members/${userId}`);
  },
};

