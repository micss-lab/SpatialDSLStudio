import { Metamodel, Model } from '../models/types';
import {
  ApplyMetamodelEvolutionRequest,
  HeadlessPipelineDefinition,
  HeadlessPipelineInputs,
  HeadlessPipelineRun,
  MetamodelEvolutionReport,
  MetamodelMigrationResult,
  MetamodelMigrationRule,
  ProjectArtifactManifest,
  ProjectCheckpoint,
  ProjectCheckpointDiff,
  ProjectCheckpointRestorePreview,
  ProjectCheckpointRestoreResult,
} from '../models/lifecycle.types';
import { apiClient } from './core';

const projectEndpoint = (projectId: string): string => `/projects/${projectId}`;

export const lifecycleService = {
  getGraph(projectId: string): Promise<ProjectArtifactManifest> {
    return apiClient.get(`${projectEndpoint(projectId)}/lifecycle/graph`);
  },

  listCheckpoints(projectId: string): Promise<ProjectCheckpoint[]> {
    return apiClient.get(`${projectEndpoint(projectId)}/lifecycle/checkpoints`);
  },

  getCheckpoint(projectId: string, checkpointId: string): Promise<ProjectCheckpoint> {
    return apiClient.get(`${projectEndpoint(projectId)}/lifecycle/checkpoints/${checkpointId}`);
  },

  createCheckpoint(
    projectId: string,
    data: { tag?: string; message?: string }
  ): Promise<ProjectCheckpoint> {
    return apiClient.post(`${projectEndpoint(projectId)}/lifecycle/checkpoints`, data);
  },

  diffCheckpoint(
    projectId: string,
    checkpointId: string,
    againstCheckpointId?: string
  ): Promise<ProjectCheckpointDiff> {
    const query = againstCheckpointId ? `?against=${encodeURIComponent(againstCheckpointId)}` : '';
    return apiClient.get(
      `${projectEndpoint(projectId)}/lifecycle/checkpoints/${checkpointId}/diff${query}`
    );
  },

  restoreCheckpoint(
    projectId: string,
    checkpointId: string,
    confirmContentHash: string
  ): Promise<ProjectArtifactManifest> {
    return apiClient.post(
      `${projectEndpoint(projectId)}/lifecycle/checkpoints/${checkpointId}/restore`,
      { confirmContentHash }
    );
  },

  previewCheckpointRestore(projectId: string, checkpointId: string): Promise<ProjectCheckpointRestorePreview> {
    return apiClient.get(`${projectEndpoint(projectId)}/lifecycle/checkpoints/${checkpointId}/restore-preview`);
  },

  restoreCheckpointWithRecovery(
    projectId: string,
    checkpointId: string,
    confirmContentHash: string,
    expectedCurrentHash: string
  ): Promise<ProjectCheckpointRestoreResult> {
    return apiClient.post(
      `${projectEndpoint(projectId)}/lifecycle/checkpoints/${checkpointId}/restore-with-recovery`,
      { confirmContentHash, expectedCurrentHash }
    );
  },

  listMetamodels(projectId: string): Promise<Metamodel[]> {
    return apiClient.get(`${projectEndpoint(projectId)}/metamodels`);
  },

  getMetamodel(projectId: string, metamodelId: string): Promise<Metamodel> {
    return apiClient.get(`${projectEndpoint(projectId)}/metamodels/${encodeURIComponent(metamodelId)}`);
  },

  listModels(projectId: string): Promise<Model[]> {
    return apiClient.get(`${projectEndpoint(projectId)}/models`);
  },

  previewEvolution(
    projectId: string,
    metamodelId: string,
    nextMetamodel: Metamodel,
    rules: MetamodelMigrationRule[] = []
  ): Promise<MetamodelEvolutionReport> {
    return apiClient.post(
      `${projectEndpoint(projectId)}/metamodels/${metamodelId}/evolution/preview`,
      { nextMetamodel, rules }
    );
  },

  applyEvolution(
    projectId: string,
    metamodelId: string,
    request: ApplyMetamodelEvolutionRequest
  ): Promise<MetamodelMigrationResult> {
    return apiClient.post(
      `${projectEndpoint(projectId)}/metamodels/${metamodelId}/evolution/apply`,
      request
    );
  },

  listMigrations(projectId: string, metamodelId: string): Promise<MetamodelMigrationResult[]> {
    return apiClient.get(
      `${projectEndpoint(projectId)}/metamodels/${metamodelId}/evolution/migrations`
    );
  },

  listPipelineRuns(projectId: string): Promise<HeadlessPipelineRun[]> {
    return apiClient.get(`${projectEndpoint(projectId)}/pipelines/runs`);
  },

  listPipelineInputs(projectId: string): Promise<HeadlessPipelineInputs> {
    return apiClient.get(`${projectEndpoint(projectId)}/pipelines/inputs`);
  },

  getPipelineRun(projectId: string, runId: string): Promise<HeadlessPipelineRun> {
    return apiClient.get(`${projectEndpoint(projectId)}/pipelines/runs/${runId}`);
  },

  runPipeline(
    projectId: string,
    definition: HeadlessPipelineDefinition
  ): Promise<HeadlessPipelineRun> {
    return apiClient.post(`${projectEndpoint(projectId)}/pipelines/runs`, definition);
  },
};
