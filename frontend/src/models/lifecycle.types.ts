import { Metamodel } from './types';

export type ProjectArtifactType =
  | 'epackage'
  | 'metamodel'
  | 'viewpoint'
  | 'model'
  | 'view'
  | 'transformation'
  | 'generator'
  | 'test'
  | 'file';

export interface ProjectArtifactRef {
  type: ProjectArtifactType;
  id: string;
}

export interface ProjectArtifactSnapshot extends ProjectArtifactRef {
  name: string;
  contentHash: string;
  dependencies: ProjectArtifactRef[];
  data: Record<string, any>;
}

export interface ProjectArtifactManifest {
  schemaVersion: 1;
  projectId: string;
  project: { name: string; description?: string };
  artifacts: ProjectArtifactSnapshot[];
  contentHash: string;
}

export interface ProjectCheckpoint {
  id: string;
  projectId: string;
  sequence: number;
  tag?: string;
  message?: string;
  contentHash: string;
  manifest?: ProjectArtifactManifest;
  createdById: string;
  createdAt: string;
}

export interface ProjectCheckpointDiff {
  fromHash: string;
  toHash: string;
  added: ProjectArtifactRef[];
  removed: ProjectArtifactRef[];
  changed: ProjectArtifactRef[];
  unchanged: number;
}

export type MetamodelEvolutionChangeKind =
  | 'class-added'
  | 'class-removed'
  | 'class-renamed'
  | 'attribute-added'
  | 'attribute-removed'
  | 'attribute-renamed'
  | 'attribute-type-changed'
  | 'attribute-cardinality-changed'
  | 'reference-added'
  | 'reference-removed'
  | 'reference-renamed'
  | 'reference-target-changed'
  | 'reference-cardinality-changed';

export interface MetamodelEvolutionChange {
  kind: MetamodelEvolutionChangeKind;
  classId: string;
  featureId?: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  breaking: boolean;
}

export interface MetamodelEvolutionImpact {
  artifact: ProjectArtifactRef;
  reasons: string[];
  affectedElementIds?: string[];
}

export interface MetamodelEvolutionReport {
  metamodelId: string;
  sourceHash: string;
  targetHash: string;
  changes: MetamodelEvolutionChange[];
  impacts: MetamodelEvolutionImpact[];
  blockers: string[];
  warnings: string[];
}

export interface MetamodelMigrationRule {
  kind: 'rename-attribute' | 'remove-attribute' | 'remove-class';
  classId: string;
  fromName?: string;
  toName?: string;
  featureId?: string;
  deleteInstances?: boolean;
}

export interface ApplyMetamodelEvolutionRequest {
  nextMetamodel: Metamodel;
  expectedSourceHash: string;
  rules?: MetamodelMigrationRule[];
  checkpointTag?: string;
  message?: string;
}

export interface MetamodelMigrationResult {
  id: string;
  projectId: string;
  metamodelId: string;
  sourceCheckpointId: string;
  sourceHash: string;
  targetHash: string;
  status: 'APPLIED' | 'FAILED';
  report: MetamodelEvolutionReport;
  migratedModels: Array<{ modelId: string; changedElements: number; deletedElements: number }>;
  createdAt: string;
  appliedAt?: string;
}

export type HeadlessPipelineStep =
  | { id: string; kind: 'validate-model'; modelId: string }
  | { id: string; kind: 'generate'; modelId: string; codegenProjectId: string }
  | { id: string; kind: 'run-tests'; modelId: string }
  | { id: string; kind: 'apply-transformation'; modelId: string; ruleId: string; maxIterations?: number };

export interface HeadlessPipelineDefinition {
  name: string;
  checkpointTag?: string;
  steps: HeadlessPipelineStep[];
}

export interface HeadlessPipelineStepResult {
  stepId: string;
  kind: HeadlessPipelineStep['kind'];
  status: 'SUCCEEDED' | 'FAILED';
  output?: Record<string, any>;
  error?: string;
}

export interface HeadlessPipelineRun {
  id: string;
  projectId: string;
  name: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  definition: HeadlessPipelineDefinition;
  sourceCheckpointId?: string;
  contentHash?: string;
  results: HeadlessPipelineStepResult[];
  failureMessage?: string;
  createdById: string;
  createdAt: string;
  startedAt: string;
  completedAt?: string;
}
