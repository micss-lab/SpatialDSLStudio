import { mockReset } from 'jest-mock-extended';
import { prismaMock } from '../helpers/prisma.mock';
import { contentHash, stableStringify } from '../../services/lifecycle/canonical';
import { projectCheckpointService } from '../../services/lifecycle/project-checkpoint.service';

const projectId = 'project-uuid-1';
const userId = 'user-uuid-1';

const mockEmptyCollections = (): void => {
  prismaMock.ePackage.findMany.mockResolvedValue([]);
  prismaMock.metamodel.findMany.mockResolvedValue([]);
  prismaMock.viewpoint.findMany.mockResolvedValue([]);
  prismaMock.model.findMany.mockResolvedValue([]);
  prismaMock.diagram.findMany.mockResolvedValue([]);
  prismaMock.transformationRule.findMany.mockResolvedValue([]);
  prismaMock.codeGenerationProject.findMany.mockResolvedValue([]);
  prismaMock.testCase.findMany.mockResolvedValue([]);
  prismaMock.storedFile.findMany.mockResolvedValue([]);
};

beforeEach(() => {
  mockReset(prismaMock);
  prismaMock.studioProject.findUnique.mockResolvedValue({
    id: projectId,
    name: 'Warehouse',
    description: 'Versioned workspace',
  } as any);
  mockEmptyCollections();
});

describe('canonical lifecycle hashing', () => {
  it('is stable across object key order and normalizes negative zero', () => {
    const left = { beta: [2, { z: -0, a: true }], alpha: 'x' };
    const right = { alpha: 'x', beta: [2, { a: true, z: 0 }] };

    expect(stableStringify(left)).toBe(stableStringify(right));
    expect(contentHash(left)).toBe(contentHash(right));
    expect(contentHash(left)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

describe('ProjectCheckpointService', () => {
  it('builds a deterministic dependency-closed artifact graph', async () => {
    prismaMock.ePackage.findMany.mockResolvedValue([{
      id: 'package-1', name: 'Ecore', nsURI: 'urn:ecore', nsPrefix: 'ecore',
      classes: [], userId, projectId,
    }] as any);
    prismaMock.metamodel.findMany.mockResolvedValue([{
      id: 'metamodel-1', name: 'Warehouse DSL', description: null,
      uri: 'urn:warehouse', prefix: 'wh', eClass: null, classes: [], enums: [],
      constraints: [], conformsToId: 'package-1', userId, projectId,
    }] as any);
    prismaMock.model.findMany.mockResolvedValue([{
      id: 'model-1', name: 'Warehouse A', description: null,
      metamodelId: 'metamodel-1', conformsToId: 'metamodel-1',
      elements: [], connections: [], userId, projectId,
    }] as any);
    prismaMock.viewpoint.findMany.mockResolvedValue([{
      id: 'viewpoint-1', name: 'Operations', description: null,
      metamodelId: 'metamodel-1', representationDescriptions: [],
      sharedConcreteSyntax: {}, isDefault: true, userId, projectId,
    }] as any);
    prismaMock.diagram.findMany.mockResolvedValue([{
      id: 'view-1', name: 'Floor plan', description: null, modelId: 'model-1',
      elements: [], viewpointId: 'viewpoint-1', representationDescriptionId: null,
      includedElementIds: [], schemaVersion: 2, migrationWarnings: [],
      gridSettings: { sizeX: 100, sizeY: 100 }, userId, projectId,
    }] as any);

    const first = await projectCheckpointService.buildManifest(projectId);
    const second = await projectCheckpointService.buildManifest(projectId);

    expect(second.contentHash).toBe(first.contentHash);
    expect(first.artifacts.map(item => `${item.type}:${item.id}`)).toEqual([
      'epackage:package-1',
      'metamodel:metamodel-1',
      'viewpoint:viewpoint-1',
      'model:model-1',
      'view:view-1',
    ]);
    expect(first.artifacts.find(item => item.id === 'view-1')?.dependencies).toEqual([
      { type: 'model', id: 'model-1' },
      { type: 'viewpoint', id: 'viewpoint-1' },
    ]);
  });

  it('rejects a semantic dependency outside the project graph', async () => {
    prismaMock.metamodel.findMany.mockResolvedValue([{
      id: 'metamodel-1', name: 'Broken', uri: 'urn:broken', prefix: 'broken',
      classes: [], enums: [], constraints: [], conformsToId: 'other-package',
      userId, projectId,
    }] as any);

    await expect(projectCheckpointService.buildManifest(projectId))
      .rejects.toThrow('references epackage:other-package outside this project');
  });

  it('creates a sequential immutable checkpoint and can diff it', async () => {
    prismaMock.projectCheckpoint.findFirst.mockResolvedValue({ sequence: 3 } as any);
    (prismaMock.projectCheckpoint.create as any).mockImplementation(async ({ data }: any) => ({
      id: 'checkpoint-4',
      ...data,
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
    }));

    const created = await projectCheckpointService.create(projectId, userId, {
      tag: 'phase-11',
      message: 'Lifecycle checkpoint',
    });

    expect(created.sequence).toBe(4);
    expect(created.manifest?.contentHash).toBe(created.contentHash);
    expect(prismaMock.projectCheckpoint.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId,
        sequence: 4,
        tag: 'phase-11',
        createdById: userId,
      }),
    });

    const changed = {
      ...created.manifest!,
      contentHash: 'sha256:changed',
      artifacts: [{
        type: 'model' as const,
        id: 'model-2',
        name: 'New model',
        dependencies: [],
        data: { name: 'New model' },
        contentHash: 'sha256:model',
      }],
    };
    expect(projectCheckpointService.diffManifests(created.manifest!, changed)).toEqual({
      fromHash: created.contentHash,
      toHash: 'sha256:changed',
      added: [{ type: 'model', id: 'model-2' }],
      removed: [],
      changed: [],
      unchanged: 0,
    });
  });

  it('restores a verified checkpoint and confirms the graph root hash', async () => {
    const manifest = await projectCheckpointService.buildManifest(projectId);
    prismaMock.projectCheckpoint.findFirst.mockResolvedValue({
      id: 'checkpoint-1',
      projectId,
      sequence: 1,
      tag: 'baseline',
      message: null,
      manifest,
      contentHash: manifest.contentHash,
      createdById: userId,
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
    } as any);
    (prismaMock.$transaction as any).mockImplementation(async (operation: Function) => operation(prismaMock));

    const restored = await projectCheckpointService.restore(
      projectId,
      'checkpoint-1',
      manifest.contentHash
    );

    expect(restored.contentHash).toBe(manifest.contentHash);
    expect(prismaMock.studioProject.update).toHaveBeenCalledWith({
      where: { id: projectId },
      data: { name: 'Warehouse', description: 'Versioned workspace' },
    });
  });
});
