import { mockReset } from 'jest-mock-extended';
import { Metamodel, Model } from '../../../../shared/types';
import { prismaMock } from '../helpers/prisma.mock';
import { codeGenerationEngine } from '../../services/pipeline/code-generation.engine';
import { modelValidationEngine } from '../../services/pipeline/model-validation.engine';
import { testExecutionEngine } from '../../services/pipeline/test-execution.engine';
import { transformationEngine } from '../../services/pipeline/transformation.engine';
import { evaluateSpatialRules } from '../../../../shared/spatial-rules';
import smartBuildingMetamodel from '../../../../frontend/src/examples/data/smart-building-metamodel.json';
import smartBuildingModel from '../../../../frontend/src/examples/data/smart-building-model.json';
import smartBuildingProject from '../../../../examples/codegen-projects/smart-building-commissioning-project.json';

const projectId = 'project-uuid-1';

const metamodel: Metamodel = {
  id: 'metamodel-uuid-1',
  name: 'Robot DSL',
  eClass: '',
  uri: 'urn:robot',
  prefix: 'robot',
  conformsTo: 'package-uuid-1',
  classes: [
    {
      id: 'robot-class',
      name: 'Robot',
      eClass: '',
      abstract: false,
      superTypes: [],
      attributes: [
        { id: 'name-attribute', name: 'name', eClass: '', type: 'string', required: true, many: false },
        { id: 'status-attribute', name: 'status', eClass: '', type: 'string', required: false, many: false },
      ],
      references: [{
        id: 'target-reference',
        name: 'target',
        eClass: '',
        target: 'station-class',
        containment: false,
        cardinality: { lowerBound: 0, upperBound: 1 },
      }],
    },
    {
      id: 'station-class',
      name: 'Station',
      eClass: '',
      abstract: false,
      superTypes: [],
      attributes: [],
      references: [],
    },
  ],
};

const model = (): Model => ({
  id: 'model-uuid-1',
  name: 'Robot Fleet',
  metamodelId: metamodel.id,
  conformsTo: metamodel.id,
  elements: [
    {
      id: 'robot-1',
      modelElementId: 'robot-class',
      style: { name: 'Alpha', status: 'idle' },
      references: { target: 'station-1' },
      presentation: { position3D: { x: 1000, y: 2000, z: 3000 } },
    },
    {
      id: 'station-1',
      modelElementId: 'station-class',
      style: {},
      references: {},
    },
  ],
  connections: [],
});

beforeEach(() => {
  mockReset(prismaMock);
});

describe('headless pipeline engines', () => {
  it('validates metamodel conformance, attribute types, references, and spatial data', () => {
    expect(modelValidationEngine.validate(model(), metamodel)).toEqual({ valid: true, issues: [] });

    const invalid = model();
    invalid.elements[0].style.name = 42;
    invalid.elements[0].references.target = 'missing-station';
    invalid.elements[0].presentation = { position3D: { x: 0, y: 0, z: Number.NaN } };
    const result = modelValidationEngine.validate(invalid, metamodel);

    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.message)).toEqual(expect.arrayContaining([
      'Robot.name has an invalid value',
      'Robot.target targets missing element missing-station',
      'elements[robot-1].presentation.position3D.z must be a finite number',
    ]));
  });

  it('reports metamodel spatial rules with the same issues as the shared evaluator', () => {
    const withRules: Metamodel = {
      ...metamodel,
      spatialRules: [{
        id: 'robots-apart',
        name: 'Robots apart',
        kind: 'noOverlap',
        sourceClassId: 'robot-class',
        targetClassId: 'robot-class',
        severity: 'error',
      }, {
        id: 'robot-spacing',
        name: 'Robot spacing',
        kind: 'minClearance',
        sourceClassId: 'robot-class',
        targetClassId: 'robot-class',
        distanceMm: 500,
        mode: 'plan',
        severity: 'warning',
      }],
    };
    const fleet = model();
    fleet.elements[0].presentation = {
      position3D: { x: 0, y: 0, z: 0 },
      size3D: { widthMm: 2000, heightMm: 500, depthMm: 1000 },
    };
    fleet.elements.push({
      id: 'robot-2',
      modelElementId: 'robot-class',
      style: { name: 'Beta' },
      references: {},
      presentation: {
        position3D: { x: 0, y: 800, z: 0 },
        size3D: { widthMm: 2000, heightMm: 500, depthMm: 1000 },
        rotationZ: 90,
      },
    });

    const result = modelValidationEngine.validate(fleet, withRules);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(evaluateSpatialRules(withRules, fleet));
    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'Robots apart: Alpha overlaps Beta.',
        elementId: 'robot-1',
        relatedElementIds: ['robot-2'],
        constraintId: 'robots-apart',
      }),
      expect.objectContaining({
        severity: 'warning',
        message: 'Robot spacing: Alpha is 0 mm from Beta; at least 500 mm is required.',
        constraintId: 'robot-spacing',
      }),
    ]);

    const beta = fleet.elements.find(element => element.id === 'robot-2')!;
    beta.presentation!.rotationZ = 0;
    beta.presentation!.position3D = { x: 0, y: 1000, z: 0 };
    expect(modelValidationEngine.validate(fleet, withRules)).toEqual({ valid: true, issues: [] });
  });

  it('generates deterministic files with model/spatial context and helper support', () => {
    const templates = [{
      id: 'template-1',
      name: 'Robots JSON',
      language: 'json' as const,
      targetMetamodelId: metamodel.id,
      outputPattern: '{{snakeCase model.name}}.json',
      templateContent: 'count={{countByClassName "Robot"}};z={{#each Robot}}{{#if @first}}{{meters Z}}{{/if}}{{/each}}',
    }];

    const first = codeGenerationEngine.generate(model(), metamodel, templates);
    const second = codeGenerationEngine.generate(model(), metamodel, templates);

    expect(first).toEqual(second);
    expect(first[0]).toEqual(expect.objectContaining({
      filename: 'robot_fleet.json',
      content: 'count=1;z=3',
    }));
    expect(first[0].contentHash).toMatch(/^sha256:/);
  });

  it('validates and generates the Smart Building example with reference names and elevations', () => {
    const buildingMetamodel = smartBuildingMetamodel as unknown as Metamodel;
    const buildingModel = smartBuildingModel as unknown as Model;
    expect(modelValidationEngine.validate(buildingModel, buildingMetamodel)).toEqual({ valid: true, issues: [] });

    const [file] = codeGenerationEngine.generate(
      buildingModel,
      buildingMetamodel,
      smartBuildingProject.templates as any
    );
    const output = JSON.parse(file.content);
    expect(file.filename).toBe('device-commissioning.json');
    expect(output.devices).toHaveLength(25);
    output.devices.forEach((device: any) => {
      const element = buildingModel.elements.find(candidate => candidate.style.deviceId === device.deviceId)!;
      expect(device.z).toBeCloseTo(element.presentation!.position3D!.z / 1000, 9);
      expect(device.room).toBe(buildingModel.elements.find(candidate => (
        candidate.id === element.references.installedIn
      ))!.style.name);
    });
    expect(output.devices.find((device: any) => device.deviceId === 'SD-105')).toEqual(expect.objectContaining({
      room: 'Room 105', gateway: 'GW-1', z: 3,
    }));
  });

  it('rejects generated path traversal', () => {
    expect(() => codeGenerationEngine.generate(model(), metamodel, [{
      id: 'template-1',
      name: 'Unsafe',
      language: 'plaintext',
      targetMetamodelId: metamodel.id,
      outputPattern: '../../secrets.txt',
      templateContent: 'no',
    }])).toThrow('Generated output path is unsafe');
  });

  it('runs persisted attribute tests with expected-validity semantics', async () => {
    prismaMock.testCase.findMany.mockResolvedValue([{
      id: 'test-1',
      name: 'Robot.name test',
      type: 'attribute',
      targetMetaClassId: 'robot-class',
      targetMetaClassName: 'Robot',
      targetProperty: 'name',
      testValues: [
        { id: 'value-1', value: 'A', expected: true },
        { id: 'value-2', value: 42, expected: false },
      ],
      modelId: model().id,
      projectId,
    }] as any);

    const output = await testExecutionEngine.run(projectId, model(), metamodel);

    expect(output).toEqual(expect.objectContaining({ total: 1, passed: 1, failed: 0 }));
    expect(prismaMock.testCase.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'test-1' },
      data: expect.objectContaining({ status: 'passed', errorMessage: null }),
    }));
  });

  it('applies the deterministic literal LHS/RHS transformation subset', async () => {
    prismaMock.transformationRule.findFirst.mockResolvedValue({
      id: 'rule-uuid-1',
      name: 'Activate robot',
      enabled: true,
      priority: 0,
      conditions: [],
      lhs: {
        id: 'lhs-1', name: 'LHS', type: 'LHS',
        elements: [{
          id: 'robot-pattern', name: 'Robot', type: 'robot-class',
          attributes: { status: 'idle' }, references: {},
        }],
      },
      rhs: {
        id: 'rhs-1', name: 'RHS', type: 'RHS',
        elements: [{
          id: 'robot-pattern', name: 'Robot', type: 'robot-class',
          attributes: { status: 'active' }, references: {},
        }],
      },
      nacs: [],
      projectId,
    } as any);

    const output = await transformationEngine.apply(projectId, model(), metamodel, 'rule-uuid-1', 3);

    expect(output.appliedIterations).toBe(1);
    expect(output.model.elements.find((element: any) => element.id === 'robot-1').style.status).toBe('active');
    expect(prismaMock.model.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'model-uuid-1' },
    }));
  });
});
