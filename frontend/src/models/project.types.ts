export type ProjectRole = 'OWNER' | 'DSL_DESIGNER' | 'MODELER' | 'VIEWER';
export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

export type ProjectCapability =
  | 'project.read'
  | 'project.settings.update'
  | 'project.members.manage'
  | 'project.archive'
  | 'metamodel.create'
  | 'metamodel.update'
  | 'metamodel.delete'
  | 'viewpoint.create'
  | 'viewpoint.update'
  | 'viewpoint.delete'
  | 'model.create'
  | 'model.update'
  | 'model.delete'
  | 'view.create'
  | 'view.update'
  | 'view.delete'
  | 'transformation.author'
  | 'transformation.execute'
  | 'codegen.author'
  | 'codegen.execute'
  | 'test.author'
  | 'test.execute'
  | 'checkpoint.create'
  | 'checkpoint.restore'
  | 'metamodel.evolve'
  | 'pipeline.execute';

export interface ProjectArtifactCounts {
  metamodels: number;
  viewpoints: number;
  models: number;
  views: number;
  transformations: number;
  generatorConfigurations: number;
  tests: number;
  files: number;
}

export interface StudioProject {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  ownerId: string;
  ownerEmail: string;
  role: ProjectRole;
  isPlatformAdmin: boolean;
  capabilities: ProjectCapability[];
  memberCount: number;
  artifactCounts?: ProjectArtifactCounts;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  id: string;
  userId: string;
  email: string;
  role: ProjectRole;
  createdAt: string;
}
