import { mockReset } from 'jest-mock-extended';
import { Metamodel } from '../../../../shared/types';
import { prismaMock } from '../helpers/prisma.mock';
import { metamodelEvolutionService } from '../../services/lifecycle/metamodel-evolution.service';
import { projectCheckpointService } from '../../services/lifecycle/project-checkpoint.service';

const projectId = 'project-uuid-1';
const metamodelId = 'metamodel-uuid-1';
const userId = 'user-uuid-1';

const currentMetamodel: Metamodel = {
  id: metamodelId,
  name: 'Warehouse DSL',
  description: 'Warehouse language',
  eClass: '',
  uri: 'urn:warehouse',
  prefix: 'wh',
  conformsTo: 'package-uuid-1',
  classes: [{
    id: 'robot-class',
    name: 'Robot',
    description: '',
    eClass: '',
    abstract: false,
    superTypes: [],
    attributes: [{
      id: 'speed-attribute',
      name: 'speed',
      description: '',
      eClass: '',
      type: 'number',
      required: false,
      many: false,
    }],
    references: [],
  }],
  enums: [],
  constraints: [],
};

const metamodelRow = {
  id: metamodelId,
  projectId,
  name: currentMetamodel.name,
  description: currentMetamodel.description,
  eClass: null,
  uri: currentMetamodel.uri,
  prefix: currentMetamodel.prefix,
  conformsToId: currentMetamodel.conformsTo,
  classes: currentMetamodel.classes,
  enums: [],
  constraints: [],
  userId,
  createdAt: new Date('2026-07-20T00:00:00.000Z'),
  updatedAt: new Date('2026-07-23T00:00:00.000Z'),
};

const modelRow = {
  id: 'model-uuid-1',
  projectId,
  name: 'Warehouse A',
  conformsToId: metamodelId,
  metamodelId,
  elements: [{
    id: 'robot-1',
    modelElementId: 'robot-class',
    style: { speed: 12 },
    references: {},
  }],
  connections: [],
  userId,
  createdAt: new Date('2026-07-20T00:00:00.000Z'),
  updatedAt: new Date('2026-07-23T00:00:00.000Z'),
};

const renamedMetamodel = (): Metamodel => ({
  ...currentMetamodel,
  classes: currentMetamodel.classes.map(metaClass => ({
    ...metaClass,
    attributes: metaClass.attributes.map(attribute => ({
      ...attribute,
      name: 'maximumSpeed',
    })),
  })),
});

const mockContext = (): void => {
  prismaMock.metamodel.findFirst.mockResolvedValue(metamodelRow as any);
  prismaMock.model.findMany.mockResolvedValue([modelRow] as any);
  prismaMock.diagram.findMany.mockResolvedValue([]);
  prismaMock.viewpoint.findMany.mockResolvedValue([]);
  prismaMock.transformationRule.findMany.mockResolvedValue([]);
  prismaMock.codeGenerationProject.findMany.mockResolvedValue([]);
  prismaMock.testCase.findMany.mockResolvedValue([]);
};

beforeEach(() => {
  mockReset(prismaMock);
  jest.restoreAllMocks();
  mockContext();
});

describe('MetamodelEvolutionService', () => {
  it('classifies stable-ID feature renames and type changes as breaking', () => {
    const next = renamedMetamodel();
    next.classes[0].attributes[0].type = 'string';

    expect(metamodelEvolutionService.compare(currentMetamodel, next)).toEqual([
      expect.objectContaining({
        kind: 'attribute-renamed',
        classId: 'robot-class',
        featureId: 'speed-attribute',
        breaking: true,
      }),
      expect.objectContaining({
        kind: 'attribute-type-changed',
        classId: 'robot-class',
        featureId: 'speed-attribute',
        breaking: true,
      }),
    ]);
  });

  it('requires an explicit rename rule when instances contain old attribute values', async () => {
    const withoutRule = await metamodelEvolutionService.preview(
      projectId,
      metamodelId,
      renamedMetamodel()
    );
    expect(withoutRule.blockers).toContain(
      'Attribute speed has instance values; add a rename-attribute rule to maximumSpeed'
    );

    const withRule = await metamodelEvolutionService.preview(
      projectId,
      metamodelId,
      renamedMetamodel(),
      [{
        kind: 'rename-attribute',
        classId: 'robot-class',
        featureId: 'speed-attribute',
        fromName: 'speed',
        toName: 'maximumSpeed',
      }]
    );
    expect(withRule.blockers).toEqual([]);
    expect(withRule.impacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifact: { type: 'model', id: 'model-uuid-1' },
        affectedElementIds: ['robot-1'],
      }),
    ]));
  });

  it('blocks class deletion unless instance deletion is explicitly authorized', async () => {
    const next = { ...currentMetamodel, classes: [] };
    const blocked = await metamodelEvolutionService.preview(projectId, metamodelId, next);
    expect(blocked.blockers).toContain(
      'Class Robot has 1 instance(s); add a remove-class rule with deleteInstances=true'
    );

    const allowed = await metamodelEvolutionService.preview(projectId, metamodelId, next, [{
      kind: 'remove-class',
      classId: 'robot-class',
      deleteInstances: true,
    }]);
    expect(allowed.blockers).toEqual([]);
  });

  it('rejects a stale expected source hash before creating a recovery checkpoint', async () => {
    const checkpointSpy = jest.spyOn(projectCheckpointService, 'create');

    await expect(metamodelEvolutionService.apply(
      projectId,
      metamodelId,
      {
        nextMetamodel: renamedMetamodel(),
        expectedSourceHash: 'sha256:stale',
        rules: [],
      },
      userId
    )).rejects.toThrow('Metamodel changed after the preview');
    expect(checkpointSpy).not.toHaveBeenCalled();
  });

  it('checkpoints and transactionally migrates attribute values', async () => {
    const rules = [{
      kind: 'rename-attribute' as const,
      classId: 'robot-class',
      featureId: 'speed-attribute',
      fromName: 'speed',
      toName: 'maximumSpeed',
    }];
    const preview = await metamodelEvolutionService.preview(
      projectId,
      metamodelId,
      renamedMetamodel(),
      rules
    );
    jest.spyOn(projectCheckpointService, 'create').mockResolvedValue({
      id: 'checkpoint-uuid-1',
      projectId,
      sequence: 1,
      tag: 'before-speed-rename',
      contentHash: 'sha256:checkpoint',
      createdById: userId,
      createdAt: '2026-07-23T12:00:00.000Z',
    });
    (prismaMock.$transaction as any).mockImplementation(async (operation: Function) => operation(prismaMock));
    (prismaMock.metamodelMigration.create as any).mockResolvedValue({
      id: 'migration-uuid-1',
      projectId,
      metamodelId,
      sourceCheckpointId: 'checkpoint-uuid-1',
      sourceHash: preview.sourceHash,
      targetHash: preview.targetHash,
      status: 'APPLIED',
      changeSet: preview.changes,
      impactReport: preview,
      migrationReport: {},
      createdById: userId,
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
      appliedAt: new Date('2026-07-23T12:00:01.000Z'),
    });

    const result = await metamodelEvolutionService.apply(
      projectId,
      metamodelId,
      {
        nextMetamodel: renamedMetamodel(),
        expectedSourceHash: preview.sourceHash,
        rules,
        checkpointTag: 'before-speed-rename',
      },
      userId
    );

    expect(result.status).toBe('APPLIED');
    expect(result.sourceCheckpointId).toBe('checkpoint-uuid-1');
    expect(result.migratedModels).toEqual([{
      modelId: 'model-uuid-1',
      changedElements: 1,
      deletedElements: 0,
    }]);
    expect(prismaMock.model.update).toHaveBeenCalledWith({
      where: { id: 'model-uuid-1' },
      data: {
        elements: [expect.objectContaining({ style: { maximumSpeed: 12 } })],
        connections: [],
      },
    });
    expect(prismaMock.metamodel.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: metamodelId },
      data: expect.objectContaining({ classes: renamedMetamodel().classes }),
    }));
  });
});

