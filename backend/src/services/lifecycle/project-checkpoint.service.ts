import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../middleware';
import {
  ProjectArtifactManifest,
  ProjectArtifactRef,
  ProjectArtifactSnapshot,
  ProjectArtifactType,
  ProjectCheckpoint,
  ProjectCheckpointDiff,
} from '../../../../shared/types';
import { contentHash } from './canonical';

const ARTIFACT_ORDER: ProjectArtifactType[] = [
  'epackage',
  'metamodel',
  'viewpoint',
  'model',
  'view',
  'transformation',
  'generator',
  'test',
  'file',
];

const artifactKey = (value: ProjectArtifactRef): string => `${value.type}:${value.id}`;
const nullableJson = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull => (
  value === null || value === undefined ? Prisma.JsonNull : value as Prisma.InputJsonValue
);

const sortRefs = (values: ProjectArtifactRef[]): ProjectArtifactRef[] => (
  [...values].sort((left, right) => artifactKey(left).localeCompare(artifactKey(right)))
);

const fileReferences = (value: unknown, knownFileIds: Set<string>): ProjectArtifactRef[] => {
  const found = new Set<string>();
  const visit = (candidate: unknown, key?: string): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(item => visit(item, key));
      return;
    }
    if (!candidate || typeof candidate !== 'object') {
      if (
        typeof candidate === 'string'
        && key?.toLowerCase().endsWith('fileid')
        && knownFileIds.has(candidate)
      ) {
        found.add(candidate);
      }
      return;
    }
    Object.entries(candidate as Record<string, unknown>).forEach(([childKey, child]) => (
      visit(child, childKey)
    ));
  };
  visit(value);
  return [...found].sort().map(id => ({ type: 'file', id }));
};

const checkpointFromRow = (row: any, includeManifest = false): ProjectCheckpoint => ({
  id: row.id,
  projectId: row.projectId,
  sequence: row.sequence,
  tag: row.tag || undefined,
  message: row.message || undefined,
  contentHash: row.contentHash,
  ...(includeManifest && { manifest: row.manifest as ProjectArtifactManifest }),
  createdById: row.createdById,
  createdAt: row.createdAt.toISOString(),
});

type SnapshotInput = Omit<ProjectArtifactSnapshot, 'contentHash'>;

class ProjectCheckpointService {
  async buildManifest(projectId: string): Promise<ProjectArtifactManifest> {
    const [
      project,
      ePackages,
      metamodels,
      viewpoints,
      models,
      diagrams,
      transformations,
      generators,
      tests,
      files,
    ] = await Promise.all([
      prisma.studioProject.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, description: true },
      }),
      prisma.ePackage.findMany({ where: { projectId }, orderBy: { id: 'asc' } }),
      prisma.metamodel.findMany({ where: { projectId }, orderBy: { id: 'asc' } }),
      prisma.viewpoint.findMany({ where: { projectId }, orderBy: { id: 'asc' } }),
      prisma.model.findMany({ where: { projectId }, orderBy: { id: 'asc' } }),
      prisma.diagram.findMany({ where: { projectId }, orderBy: { id: 'asc' } }),
      prisma.transformationRule.findMany({ where: { projectId }, orderBy: { id: 'asc' } }),
      prisma.codeGenerationProject.findMany({ where: { projectId }, orderBy: { id: 'asc' } }),
      prisma.testCase.findMany({ where: { projectId }, orderBy: { id: 'asc' } }),
      prisma.storedFile.findMany({ where: { projectId }, orderBy: { id: 'asc' } }),
    ]);

    if (!project) throw new ApiError(404, 'Project not found');

    const rows = {
      ePackages: ePackages || [],
      metamodels: metamodels || [],
      viewpoints: viewpoints || [],
      models: models || [],
      diagrams: diagrams || [],
      transformations: transformations || [],
      generators: generators || [],
      tests: tests || [],
      files: files || [],
    };
    const ids = {
      epackage: new Set(rows.ePackages.map((row: any) => row.id)),
      metamodel: new Set(rows.metamodels.map((row: any) => row.id)),
      viewpoint: new Set(rows.viewpoints.map((row: any) => row.id)),
      model: new Set(rows.models.map((row: any) => row.id)),
      view: new Set(rows.diagrams.map((row: any) => row.id)),
      file: new Set(rows.files.map((row: any) => row.id)),
    };

    const requireDependency = (
      owner: ProjectArtifactRef,
      dependency: ProjectArtifactRef | undefined
    ): ProjectArtifactRef[] => {
      if (!dependency) return [];
      const known = ids[dependency.type as keyof typeof ids];
      if (known && !known.has(dependency.id)) {
        throw new ApiError(
          409,
          `${artifactKey(owner)} references ${artifactKey(dependency)} outside this project`
        );
      }
      return [dependency];
    };

    const inputs: SnapshotInput[] = [];
    const add = (
      type: ProjectArtifactType,
      row: any,
      data: Record<string, any>,
      dependencies: ProjectArtifactRef[] = []
    ): void => {
      const fileDeps = type === 'file' ? [] : fileReferences(data, ids.file);
      const unique = new Map<string, ProjectArtifactRef>();
      [...dependencies, ...fileDeps].forEach(dependency => unique.set(artifactKey(dependency), dependency));
      inputs.push({
        type,
        id: row.id,
        name: row.name || row.filename || row.id,
        data,
        dependencies: sortRefs([...unique.values()]),
      });
    };

    rows.ePackages.forEach((row: any) => add('epackage', row, {
      name: row.name,
      nsURI: row.nsURI,
      nsPrefix: row.nsPrefix,
      classes: row.classes,
      userId: row.userId,
    }));
    rows.metamodels.forEach((row: any) => add('metamodel', row, {
      name: row.name,
      description: row.description,
      uri: row.uri,
      prefix: row.prefix,
      eClass: row.eClass,
      classes: row.classes,
      enums: row.enums,
      constraints: row.constraints,
      conformsToId: row.conformsToId,
      userId: row.userId,
    }, requireDependency(
      { type: 'metamodel', id: row.id },
      row.conformsToId ? { type: 'epackage', id: row.conformsToId } : undefined
    )));
    rows.viewpoints.forEach((row: any) => add('viewpoint', row, {
      name: row.name,
      description: row.description,
      metamodelId: row.metamodelId,
      representationDescriptions: row.representationDescriptions,
      sharedConcreteSyntax: row.sharedConcreteSyntax,
      isDefault: row.isDefault,
      userId: row.userId,
    }, requireDependency(
      { type: 'viewpoint', id: row.id },
      { type: 'metamodel', id: row.metamodelId }
    )));
    rows.models.forEach((row: any) => add('model', row, {
      name: row.name,
      description: row.description,
      metamodelId: row.metamodelId,
      elements: row.elements,
      connections: row.connections,
      conformsToId: row.conformsToId,
      userId: row.userId,
    }, requireDependency(
      { type: 'model', id: row.id },
      { type: 'metamodel', id: row.conformsToId }
    )));
    rows.diagrams.forEach((row: any) => add('view', row, {
      name: row.name,
      description: row.description,
      modelId: row.modelId,
      elements: row.elements,
      viewpointId: row.viewpointId,
      representationDescriptionId: row.representationDescriptionId,
      includedElementIds: row.includedElementIds,
      schemaVersion: row.schemaVersion,
      migrationWarnings: row.migrationWarnings,
      gridSettings: row.gridSettings,
      userId: row.userId,
    }, [
      ...requireDependency({ type: 'view', id: row.id }, { type: 'model', id: row.modelId }),
      ...requireDependency(
        { type: 'view', id: row.id },
        row.viewpointId ? { type: 'viewpoint', id: row.viewpointId } : undefined
      ),
    ]));
    rows.transformations.forEach((row: any) => add('transformation', row, {
      name: row.name,
      description: row.description,
      priority: row.priority,
      enabled: row.enabled,
      lhs: row.lhs,
      rhs: row.rhs,
      nacs: row.nacs,
      conditions: row.conditions,
      diagramId: row.diagramId,
      userId: row.userId,
    }, requireDependency(
      { type: 'transformation', id: row.id },
      row.diagramId ? { type: 'view', id: row.diagramId } : undefined
    )));
    rows.generators.forEach((row: any) => add('generator', row, {
      name: row.name,
      description: row.description,
      isExample: row.isExample,
      targetMetamodelId: row.targetMetamodelId,
      templates: row.templates,
      userId: row.userId,
    }, requireDependency(
      { type: 'generator', id: row.id },
      row.targetMetamodelId ? { type: 'metamodel', id: row.targetMetamodelId } : undefined
    )));
    rows.tests.forEach((row: any) => {
      const target = row.modelId
        ? ids.model.has(row.modelId)
          ? { type: 'model' as const, id: row.modelId }
          : ids.metamodel.has(row.modelId)
            ? { type: 'metamodel' as const, id: row.modelId }
            : undefined
        : undefined;
      add('test', row, {
        name: row.name,
        description: row.description,
        type: row.type,
        targetMetaClassId: row.targetMetaClassId,
        targetMetaClassName: row.targetMetaClassName,
        targetProperty: row.targetProperty,
        status: row.status,
        errorMessage: row.errorMessage,
        constraintId: row.constraintId,
        constraintType: row.constraintType,
        originalInput: row.originalInput,
        expectedOutput: row.expectedOutput,
        actualOutput: row.actualOutput,
        testValues: row.testValues,
        modelId: row.modelId,
        userId: row.userId,
      }, target ? [target] : []);
    });
    rows.files.forEach((row: any) => add('file', row, {
      filename: row.filename,
      mimetype: row.mimetype,
      size: row.size,
      type: row.type,
      dataBase64: Buffer.from(row.data).toString('base64'),
      metadata: row.metadata,
      userId: row.userId,
    }));

    const artifacts = inputs
      .map(input => ({ ...input, contentHash: contentHash(input) }))
      .sort((left, right) => {
        const typeDelta = ARTIFACT_ORDER.indexOf(left.type) - ARTIFACT_ORDER.indexOf(right.type);
        return typeDelta || left.id.localeCompare(right.id);
      });
    const base = {
      schemaVersion: 1 as const,
      projectId,
      project: {
        name: project.name,
        ...(project.description ? { description: project.description } : {}),
      },
      artifacts,
    };
    return { ...base, contentHash: contentHash(base) };
  }

  async create(
    projectId: string,
    createdById: string,
    input: { tag?: string; message?: string } = {}
  ): Promise<ProjectCheckpoint> {
    const manifest = await this.buildManifest(projectId);
    const latest = await prisma.projectCheckpoint.findFirst({
      where: { projectId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    const row = await prisma.projectCheckpoint.create({
      data: {
        projectId,
        sequence: (latest?.sequence || 0) + 1,
        tag: input.tag?.trim() || null,
        message: input.message?.trim() || null,
        manifest: manifest as any,
        contentHash: manifest.contentHash,
        createdById,
      },
    });
    return checkpointFromRow(row, true);
  }

  async list(projectId: string): Promise<ProjectCheckpoint[]> {
    const rows = await prisma.projectCheckpoint.findMany({
      where: { projectId },
      orderBy: { sequence: 'desc' },
    });
    return rows.map(row => checkpointFromRow(row));
  }

  async get(projectId: string, checkpointId: string): Promise<ProjectCheckpoint> {
    const row = await prisma.projectCheckpoint.findFirst({
      where: { id: checkpointId, projectId },
    });
    if (!row) throw new ApiError(404, 'Checkpoint not found');
    return checkpointFromRow(row, true);
  }

  diffManifests(
    from: ProjectArtifactManifest,
    to: ProjectArtifactManifest
  ): ProjectCheckpointDiff {
    const fromArtifacts = new Map(from.artifacts.map(item => [artifactKey(item), item]));
    const toArtifacts = new Map(to.artifacts.map(item => [artifactKey(item), item]));
    const added: ProjectArtifactRef[] = [];
    const removed: ProjectArtifactRef[] = [];
    const changed: ProjectArtifactRef[] = [];
    let unchanged = 0;

    toArtifacts.forEach((artifact, key) => {
      const previous = fromArtifacts.get(key);
      if (!previous) added.push({ type: artifact.type, id: artifact.id });
      else if (previous.contentHash !== artifact.contentHash) {
        changed.push({ type: artifact.type, id: artifact.id });
      } else unchanged += 1;
    });
    fromArtifacts.forEach((artifact, key) => {
      if (!toArtifacts.has(key)) removed.push({ type: artifact.type, id: artifact.id });
    });

    return {
      fromHash: from.contentHash,
      toHash: to.contentHash,
      added: sortRefs(added),
      removed: sortRefs(removed),
      changed: sortRefs(changed),
      unchanged,
    };
  }

  async diff(
    projectId: string,
    checkpointId: string,
    against?: string
  ): Promise<ProjectCheckpointDiff> {
    const from = (await this.get(projectId, checkpointId)).manifest!;
    const to = against && against !== 'current'
      ? (await this.get(projectId, against)).manifest!
      : await this.buildManifest(projectId);
    return this.diffManifests(from, to);
  }

  private verifyManifest(manifest: ProjectArtifactManifest, expectedHash: string): void {
    const artifacts = manifest.artifacts.map(({ contentHash: storedHash, ...input }) => {
      const actualHash = contentHash(input);
      if (actualHash !== storedHash) throw new ApiError(409, `Checkpoint artifact ${artifactKey(input)} failed integrity verification`);
      return { ...input, contentHash: storedHash };
    });
    const { contentHash: _storedRoot, ...base } = manifest;
    const actualRoot = contentHash({ ...base, artifacts });
    if (actualRoot !== expectedHash || manifest.contentHash !== expectedHash) {
      throw new ApiError(409, 'Checkpoint manifest failed integrity verification');
    }
  }

  async restore(
    projectId: string,
    checkpointId: string,
    confirmContentHash: string
  ): Promise<ProjectArtifactManifest> {
    const checkpoint = await this.get(projectId, checkpointId);
    if (confirmContentHash !== checkpoint.contentHash) {
      throw new ApiError(400, 'confirmContentHash must match the checkpoint content hash');
    }
    const manifest = checkpoint.manifest!;
    this.verifyManifest(manifest, checkpoint.contentHash);

    const byType = new Map<ProjectArtifactType, ProjectArtifactSnapshot[]>();
    ARTIFACT_ORDER.forEach(type => byType.set(type, []));
    manifest.artifacts.forEach(artifact => byType.get(artifact.type)?.push(artifact));
    const idsFor = (type: ProjectArtifactType): string[] => (byType.get(type) || []).map(item => item.id);
    const missingFilter = (type: ProjectArtifactType): Record<string, any> => {
      const ids = idsFor(type);
      return ids.length > 0 ? { projectId, id: { notIn: ids } } : { projectId };
    };

    await prisma.$transaction(async tx => {
      await tx.diagram.deleteMany({ where: missingFilter('view') });
      await tx.testCase.deleteMany({ where: missingFilter('test') });
      await tx.transformationRule.deleteMany({ where: missingFilter('transformation') });
      await tx.codeGenerationProject.deleteMany({ where: missingFilter('generator') });
      await tx.viewpoint.deleteMany({ where: missingFilter('viewpoint') });
      await tx.model.deleteMany({ where: missingFilter('model') });
      await tx.metamodel.deleteMany({ where: missingFilter('metamodel') });
      await tx.ePackage.deleteMany({ where: missingFilter('epackage') });
      await tx.storedFile.deleteMany({ where: missingFilter('file') });

      await tx.studioProject.update({
        where: { id: projectId },
        data: {
          name: manifest.project.name,
          description: manifest.project.description || null,
        },
      });

      for (const artifact of byType.get('epackage') || []) {
        const data = artifact.data;
        const write = {
          name: data.name,
          nsURI: data.nsURI,
          nsPrefix: data.nsPrefix,
          classes: data.classes as any,
          userId: data.userId,
          projectId,
        };
        await tx.ePackage.upsert({
          where: { id: artifact.id },
          create: { id: artifact.id, ...write },
          update: write,
        });
      }
      for (const artifact of byType.get('metamodel') || []) {
        const data = artifact.data;
        const write = {
          name: data.name,
          description: data.description || null,
          uri: data.uri,
          prefix: data.prefix,
          eClass: data.eClass || null,
          classes: data.classes as any,
          enums: data.enums as any,
          constraints: data.constraints as any,
          conformsToId: data.conformsToId,
          userId: data.userId,
          projectId,
        };
        await tx.metamodel.upsert({ where: { id: artifact.id }, create: { id: artifact.id, ...write }, update: write });
      }
      for (const artifact of byType.get('viewpoint') || []) {
        const data = artifact.data;
        const write = {
          name: data.name,
          description: data.description || null,
          metamodelId: data.metamodelId,
          representationDescriptions: data.representationDescriptions as any,
          sharedConcreteSyntax: data.sharedConcreteSyntax as any,
          isDefault: data.isDefault,
          userId: data.userId,
          projectId,
        };
        await tx.viewpoint.upsert({ where: { id: artifact.id }, create: { id: artifact.id, ...write }, update: write });
      }
      for (const artifact of byType.get('model') || []) {
        const data = artifact.data;
        const write = {
          name: data.name,
          description: data.description || null,
          metamodelId: data.metamodelId,
          elements: data.elements as any,
          connections: data.connections as any,
          conformsToId: data.conformsToId,
          userId: data.userId,
          projectId,
        };
        await tx.model.upsert({ where: { id: artifact.id }, create: { id: artifact.id, ...write }, update: write });
      }
      for (const artifact of byType.get('view') || []) {
        const data = artifact.data;
        const write = {
          name: data.name,
          description: data.description || null,
          modelId: data.modelId,
          elements: data.elements as any,
          viewpointId: data.viewpointId || null,
          representationDescriptionId: data.representationDescriptionId || null,
          includedElementIds: data.includedElementIds as any,
          schemaVersion: data.schemaVersion,
          migrationWarnings: data.migrationWarnings as any,
          gridSettings: data.gridSettings as any,
          userId: data.userId,
          projectId,
        };
        await tx.diagram.upsert({ where: { id: artifact.id }, create: { id: artifact.id, ...write }, update: write });
      }
      for (const artifact of byType.get('transformation') || []) {
        const data = artifact.data;
        const write = {
          name: data.name,
          description: data.description || null,
          priority: data.priority,
          enabled: data.enabled,
          lhs: data.lhs as any,
          rhs: data.rhs as any,
          nacs: data.nacs as any,
          conditions: data.conditions as any,
          diagramId: data.diagramId || null,
          userId: data.userId,
          projectId,
        };
        await tx.transformationRule.upsert({ where: { id: artifact.id }, create: { id: artifact.id, ...write }, update: write });
      }
      for (const artifact of byType.get('generator') || []) {
        const data = artifact.data;
        const write = {
          name: data.name,
          description: data.description || null,
          isExample: data.isExample,
          targetMetamodelId: data.targetMetamodelId || null,
          templates: data.templates as any,
          userId: data.userId,
          projectId,
        };
        await tx.codeGenerationProject.upsert({ where: { id: artifact.id }, create: { id: artifact.id, ...write }, update: write });
      }
      for (const artifact of byType.get('test') || []) {
        const data = artifact.data;
        const write = {
          name: data.name,
          description: data.description || null,
          type: data.type,
          targetMetaClassId: data.targetMetaClassId,
          targetMetaClassName: data.targetMetaClassName,
          targetProperty: data.targetProperty || null,
          status: data.status,
          errorMessage: data.errorMessage || null,
          constraintId: data.constraintId || null,
          constraintType: data.constraintType || null,
          originalInput: nullableJson(data.originalInput),
          expectedOutput: nullableJson(data.expectedOutput),
          actualOutput: nullableJson(data.actualOutput),
          testValues: data.testValues as any,
          modelId: data.modelId || null,
          userId: data.userId,
          projectId,
        };
        await tx.testCase.upsert({ where: { id: artifact.id }, create: { id: artifact.id, ...write }, update: write });
      }
      for (const artifact of byType.get('file') || []) {
        const data = artifact.data;
        const write = {
          filename: data.filename,
          mimetype: data.mimetype,
          size: data.size,
          type: data.type,
          data: Buffer.from(data.dataBase64, 'base64'),
          metadata: data.metadata as any,
          userId: data.userId,
          projectId,
        };
        await tx.storedFile.upsert({ where: { id: artifact.id }, create: { id: artifact.id, ...write }, update: write });
      }
    });

    const restored = await this.buildManifest(projectId);
    if (restored.contentHash !== checkpoint.contentHash) {
      throw new ApiError(500, 'Checkpoint restore completed but graph integrity verification failed');
    }
    return restored;
  }
}

export const projectCheckpointService = new ProjectCheckpointService();
