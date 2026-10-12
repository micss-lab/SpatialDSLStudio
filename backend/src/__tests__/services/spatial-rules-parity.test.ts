import fs from 'fs';
import path from 'path';
import * as sharedGeometry from '../../../../shared/spatial-geometry';
import * as sharedRules from '../../../../shared/spatial-rules';
import * as frontendGeometry from '../../../../frontend/src/services/spatial/spatial-geometry';
import * as frontendRules from '../../../../frontend/src/services/spatial/spatial-rules';
import { MetaClass, Metamodel, Model, ModelElement, SpatialRule, SpatialRuleKind } from '../../../../shared/types';
import smartWarehouseMetamodel from '../../../../frontend/src/examples/data/smart-warehouse-metamodel.json';
import smartWarehouseModel from '../../../../frontend/src/examples/data/smart-warehouse-model.json';

// The frontend cannot import shared/, so the geometry and rule evaluator are
// mirrored. These tests keep the two copies byte-identical below their
// import blocks and run the same fixtures through both.

const repoRoot = path.resolve(__dirname, '../../../..');
const bodyOf = (relativePath: string): string => {
  const lines = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').split('\n');
  return lines.slice(lines.findIndex(line => !line.startsWith('import '))).join('\n');
};

const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

const classes: MetaClass[] = [
  { id: 'equipment', name: 'Equipment', eClass: 'EClass', abstract: true, superTypes: [], attributes: [], references: [] },
  { id: 'conveyor', name: 'Conveyor', eClass: 'EClass', abstract: false, superTypes: ['equipment'], attributes: [], references: [] },
  { id: 'rack', name: 'Rack', eClass: 'EClass', abstract: false, superTypes: ['equipment'], attributes: [], references: [] },
  {
    id: 'zone', name: 'Zone', eClass: 'EClass', abstract: false, superTypes: [], attributes: [], references: [],
    concreteSyntax: { three_d: { defaultSizeMm: { widthMm: 9000, heightMm: 7000, depthMm: 3000 } } },
  },
  { id: 'sensor', name: 'Sensor', eClass: 'EClass', abstract: false, superTypes: [], attributes: [], references: [] },
];

const rulesFor = (kind: SpatialRuleKind, mode: 'plan' | 'volume', index: number): SpatialRule => ({
  id: `rule-${index}`,
  name: `${kind}-${mode}`,
  kind,
  sourceClassId: kind === 'within' || kind === 'maxDistance' ? 'sensor' : 'equipment',
  targetClassId: kind === 'within' ? 'zone' : kind === 'maxDistance' ? 'rack' : 'equipment',
  distanceMm: kind === 'noOverlap' ? undefined : kind === 'within' ? 250 : kind === 'maxDistance' ? 6000 : 400,
  mode,
  severity: index % 3 === 0 ? 'warning' : 'error',
});

const kinds: SpatialRuleKind[] = ['noOverlap', 'minClearance', 'maxDistance', 'within', 'adjacentTo'];
const metamodel: Metamodel = {
  id: 'mm', name: 'Parity', eClass: 'EPackage', uri: 'http://example.org/parity', prefix: 'p', conformsTo: 'ecore',
  classes,
  spatialRules: kinds.flatMap((kind, index) => [
    rulesFor(kind, 'plan', index * 2),
    rulesFor(kind, 'volume', index * 2 + 1),
  ]),
};

const randomModel = (seed: number, count: number): Model => {
  const random = seededRandom(seed);
  const classIds = ['conveyor', 'rack', 'zone', 'sensor'];
  const elements: ModelElement[] = Array.from({ length: count }, (_, index) => {
    const classId = classIds[index % classIds.length];
    const sized = classId !== 'zone' || random() < 0.5;
    return {
      id: `e${index}`,
      modelElementId: classId,
      style: { name: `${classId} ${index}` },
      references: {},
      presentation: {
        position3D: { x: Math.round(random() * 20000), y: Math.round(random() * 15000), z: Math.round(random() * 2000) },
        rotationZ: [0, 90, 180, 270, 30, 45, -60][Math.floor(random() * 7)],
        ...(sized ? {
          size3D: {
            widthMm: 300 + Math.round(random() * 3000),
            heightMm: 300 + Math.round(random() * 2000),
            depthMm: 100 + Math.round(random() * 2000),
          },
        } : {}),
      },
    };
  });
  return { id: `model-${seed}`, name: 'Random', metamodelId: 'mm', conformsTo: 'mm', elements };
};

describe('spatial geometry and rules parity between shared/ and the frontend mirror', () => {
  it.each([
    ['shared/spatial-geometry.ts', 'frontend/src/services/spatial/spatial-geometry.ts'],
    ['shared/spatial-rules.ts', 'frontend/src/services/spatial/spatial-rules.ts'],
  ])('keeps %s and %s identical below the imports', (shared, frontend) => {
    const sharedBody = bodyOf(shared);
    expect(sharedBody.length).toBeGreaterThan(1000);
    expect(bodyOf(frontend)).toBe(sharedBody);
  });

  it('exports the same functions from both copies', () => {
    expect(Object.keys(frontendGeometry).sort()).toEqual(Object.keys(sharedGeometry).sort());
    expect(Object.keys(frontendRules).sort()).toEqual(Object.keys(sharedRules).sort());
  });

  it.each([1, 2, 3])('computes identical geometry for seeded random element pairs (seed %i)', seed => {
    const model = randomModel(seed, 40);
    const boxes = model.elements.map(element => ({
      shared: sharedGeometry.elementBox(element, { widthMm: 1000, heightMm: 1000, depthMm: 1000 }),
      frontend: frontendGeometry.elementBox(element, { widthMm: 1000, heightMm: 1000, depthMm: 1000 }),
    }));
    boxes.forEach(({ shared, frontend }) => expect(frontend).toEqual(shared));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i].shared!;
        const b = boxes[j].shared!;
        expect([
          frontendGeometry.planOverlap(a, b),
          frontendGeometry.volumeOverlap(a, b),
          frontendGeometry.planGap(a, b),
          frontendGeometry.volumeGap(a, b),
          frontendGeometry.planContains(a, b, 100),
          frontendGeometry.volumeCenterDistance(a, b),
        ]).toEqual([
          sharedGeometry.planOverlap(a, b),
          sharedGeometry.volumeOverlap(a, b),
          sharedGeometry.planGap(a, b),
          sharedGeometry.volumeGap(a, b),
          sharedGeometry.planContains(a, b, 100),
          sharedGeometry.volumeCenterDistance(a, b),
        ]);
      }
    }
  });

  it.each([11, 12, 13])('reports identical rule issues for every kind and mode (seed %i)', seed => {
    const model = randomModel(seed, 120);
    const sharedIssues = sharedRules.evaluateSpatialRules(metamodel, model);
    const frontendIssues = frontendRules.evaluateSpatialRules(metamodel as any, model as any);

    expect(frontendIssues).toEqual(sharedIssues);
    const firedRules = new Set(sharedIssues.map(issue => issue.constraintId));
    expect(firedRules.size).toBeGreaterThanOrEqual(6);
  });

  it('agrees on the Smart Warehouse example, before and after a live violation', () => {
    const exampleMetamodel = smartWarehouseMetamodel as unknown as Metamodel;
    const exampleModel = JSON.parse(JSON.stringify(smartWarehouseModel)) as Model;
    expect(sharedRules.evaluateSpatialRules(exampleMetamodel, exampleModel)).toEqual([]);
    expect(frontendRules.evaluateSpatialRules(exampleMetamodel as any, exampleModel as any)).toEqual([]);

    const rack = exampleModel.elements.find(element => element.style.name === 'Storage Rack #2')!;
    rack.presentation!.position3D = { x: 12500, y: 12000, z: 0 };
    const sharedIssues = sharedRules.evaluateSpatialRules(exampleMetamodel, exampleModel);
    expect(sharedIssues.length).toBeGreaterThan(0);
    expect(frontendRules.evaluateSpatialRules(exampleMetamodel as any, exampleModel as any)).toEqual(sharedIssues);
  });
});
