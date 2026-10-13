import { MetaClass, Metamodel, Model, ModelElement, SpatialRule } from '../../models/types';
import {
  defaultSizeForClass,
  evaluateSpatialRules,
  validateSpatialRule,
  validateSpatialRules,
} from '../../services/spatial';
import { deleteMetaClass } from '../../services/metamodel/metaclass-crud.service';
import smartWarehouseMetamodel from '../../examples/data/smart-warehouse-metamodel.json';
import smartWarehouseModel from '../../examples/data/smart-warehouse-model.json';

const metaClass = (id: string, superTypes: string[] = [], extra: Partial<MetaClass> = {}): MetaClass => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  eClass: 'EClass',
  abstract: false,
  superTypes,
  attributes: [],
  references: [],
  ...extra,
});

// equipment <- conveyor, rack; zone <- room; sensor; gateway
const classes: MetaClass[] = [
  metaClass('equipment', [], { abstract: true }),
  metaClass('conveyor', ['equipment']),
  metaClass('rack', ['equipment']),
  metaClass('zone', [], {
    abstract: true,
    concreteSyntax: { three_d: { defaultSizeMm: { widthMm: 4000, heightMm: 3000, depthMm: 3000 } } },
  }),
  metaClass('room', ['zone']),
  metaClass('sensor'),
  metaClass('gateway'),
];

const metamodelWith = (rules: SpatialRule[]): Metamodel => ({
  id: 'mm',
  name: 'Spatial',
  eClass: 'EPackage',
  uri: 'http://example.org/spatial',
  prefix: 'sp',
  conformsTo: 'ecore',
  classes,
  spatialRules: rules,
});

const element = (
  id: string,
  classId: string,
  pose?: { x: number; y: number; z?: number; rotationZ?: number },
  size?: { widthMm: number; heightMm: number; depthMm: number }
): ModelElement => ({
  id,
  modelElementId: classId,
  style: { name: id },
  references: {},
  ...(pose ? {
    presentation: {
      position3D: { x: pose.x, y: pose.y, z: pose.z ?? 0 },
      ...(size ? { size3D: size } : {}),
      ...(pose.rotationZ !== undefined ? { rotationZ: pose.rotationZ } : {}),
    },
  } : {}),
});

const modelOf = (elements: ModelElement[]): Model => ({
  id: 'model',
  name: 'Model',
  metamodelId: 'mm',
  conformsTo: 'mm',
  elements,
});

const conveyorSize = { widthMm: 2000, heightMm: 500, depthMm: 1000 };

const rule = (overrides: Partial<SpatialRule>): SpatialRule => ({
  id: 'rule-1',
  name: 'Rule',
  kind: 'noOverlap',
  sourceClassId: 'equipment',
  targetClassId: 'equipment',
  severity: 'error',
  ...overrides,
});

describe('evaluateSpatialRules: noOverlap', () => {
  it('reports one issue per offending unordered pair, attached to both elements', () => {
    const issues = evaluateSpatialRules(metamodelWith([rule({ name: 'No overlap' })]), modelOf([
      element('c1', 'conveyor', { x: 0, y: 0 }, conveyorSize),
      element('c2', 'conveyor', { x: 0, y: 800, rotationZ: 90 }, conveyorSize),
      element('c3', 'conveyor', { x: 5000, y: 0 }, conveyorSize),
    ]));

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      severity: 'error',
      message: 'No overlap: c1 overlaps c2.',
      elementId: 'c1',
      relatedElementIds: ['c2'],
      location: 'spatialRules.noOverlap',
      constraintId: 'rule-1',
    });
  });

  it('includes instances of subtypes of the source and target classes', () => {
    const issues = evaluateSpatialRules(metamodelWith([rule({})]), modelOf([
      element('conveyor', 'conveyor', { x: 0, y: 0 }, conveyorSize),
      element('rack', 'rack', { x: 1500, y: 0 }, conveyorSize),
      element('sensor', 'sensor', { x: 0, y: 0 }, conveyorSize),
    ]));
    expect(issues.map(issue => [issue.elementId, issue.relatedElementIds])).toEqual([['conveyor', ['rack']]]);
  });

  it('uses the rotated footprint, so a turned conveyor can clear a neighbour', () => {
    const elements = [
      element('c1', 'conveyor', { x: 0, y: 0 }, conveyorSize),
      element('c2', 'conveyor', { x: 1400, y: 0, rotationZ: 90 }, conveyorSize),
    ];
    expect(evaluateSpatialRules(metamodelWith([rule({})]), modelOf(elements))).toHaveLength(0);
    elements[1].presentation!.rotationZ = 0;
    expect(evaluateSpatialRules(metamodelWith([rule({})]), modelOf(elements))).toHaveLength(1);
  });

  it('separates plan and volume modes by elevation', () => {
    const elements = [
      element('low', 'conveyor', { x: 0, y: 0 }, conveyorSize),
      element('high', 'conveyor', { x: 0, y: 0, z: 1500 }, conveyorSize),
    ];
    expect(evaluateSpatialRules(metamodelWith([rule({ mode: 'volume' })]), modelOf(elements))).toHaveLength(0);
    expect(evaluateSpatialRules(metamodelWith([rule({})]), modelOf(elements))).toHaveLength(0);
    const planIssues = evaluateSpatialRules(metamodelWith([rule({ mode: 'plan' })]), modelOf(elements));
    expect(planIssues).toHaveLength(1);
    expect(planIssues[0].message).toBe('Rule: low overlaps high in plan view.');
  });

  it('does not count touching footprints as overlapping', () => {
    expect(evaluateSpatialRules(metamodelWith([rule({ mode: 'plan' })]), modelOf([
      element('a', 'conveyor', { x: 0, y: 0 }, conveyorSize),
      element('b', 'conveyor', { x: 2000, y: 0 }, conveyorSize),
    ]))).toHaveLength(0);
  });

  it('skips elements without a pose or without resolvable extents', () => {
    expect(evaluateSpatialRules(metamodelWith([rule({})]), modelOf([
      element('placed', 'conveyor', { x: 0, y: 0 }, conveyorSize),
      element('no-pose', 'conveyor'),
      element('no-size', 'conveyor', { x: 0, y: 0 }),
    ]))).toHaveLength(0);
  });
});

describe('evaluateSpatialRules: minClearance', () => {
  const clearanceRule = rule({ kind: 'minClearance', distanceMm: 1000, mode: 'plan', name: 'Aisle' });

  it('flags pairs closer than the distance and accepts a gap of exactly the distance', () => {
    const issues = evaluateSpatialRules(metamodelWith([clearanceRule]), modelOf([
      element('a', 'rack', { x: 0, y: 0 }, conveyorSize),
      element('b', 'rack', { x: 2600, y: 0 }, conveyorSize),
      element('c', 'rack', { x: 0, y: 1500 }, conveyorSize),
    ]));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe('Aisle: a is 600 mm from b; at least 1000 mm is required.');
    expect(issues[0].relatedElementIds).toEqual(['b']);
  });

  it('measures the gap in volume mode as sqrt(planGap^2 + verticalGap^2)', () => {
    const elements = [
      element('a', 'rack', { x: 0, y: 0 }, conveyorSize),
      element('b', 'rack', { x: 2600, y: 0, z: 1800 }, conveyorSize),
    ];
    // plan gap 600, vertical gap 800 -> 1000
    expect(evaluateSpatialRules(metamodelWith([{ ...clearanceRule, mode: 'volume' }]), modelOf(elements)))
      .toHaveLength(0);
    expect(evaluateSpatialRules(metamodelWith([clearanceRule]), modelOf(elements))).toHaveLength(1);
  });

  it('fills custom message placeholders', () => {
    const issues = evaluateSpatialRules(metamodelWith([{
      ...clearanceRule,
      message: '{source} is too close to {target} (needs {distance} mm, rule {rule})',
    }]), modelOf([
      element('a', 'rack', { x: 0, y: 0 }, conveyorSize),
      element('b', 'rack', { x: 2600, y: 0 }, conveyorSize),
    ]));
    expect(issues[0].message).toBe('Aisle: a is too close to b (needs 1000 mm, rule Aisle)');
  });
});

describe('evaluateSpatialRules: maxDistance', () => {
  const rangeRule = rule({
    kind: 'maxDistance', sourceClassId: 'sensor', targetClassId: 'gateway', distanceMm: 10000, name: 'Range',
  });
  const small = { widthMm: 100, heightMm: 100, depthMm: 100 };

  it('reports each source with no target centre within the distance', () => {
    const issues = evaluateSpatialRules(metamodelWith([rangeRule]), modelOf([
      element('gw', 'gateway', { x: 0, y: 0 }, small),
      element('near', 'sensor', { x: 6000, y: 8000 }, small),
      element('far', 'sensor', { x: 9000, y: 8000 }, small),
    ]));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      elementId: 'far',
      message: 'Range: far has no Gateway within 10000 mm; the nearest is 12041.6 mm away.',
    });
    expect(issues[0].relatedElementIds).toBeUndefined();
  });

  it('measures volume centres at mid elevation and plan centres ignoring elevation', () => {
    const elements = [
      element('gw', 'gateway', { x: 0, y: 0, z: 0 }, small),
      element('ceiling', 'sensor', { x: 6000, y: 6000, z: 7950 }, small),
    ];
    // plan distance 8485.3, vertical distance 7950 -> 11627.5 in volume mode
    expect(evaluateSpatialRules(metamodelWith([rangeRule]), modelOf(elements))).toHaveLength(1);
    expect(evaluateSpatialRules(metamodelWith([{ ...rangeRule, mode: 'plan' }]), modelOf(elements))).toHaveLength(0);
  });

  it('treats unplaced targets as absent', () => {
    const issues = evaluateSpatialRules(metamodelWith([rangeRule]), modelOf([
      element('gw', 'gateway'),
      element('sensor', 'sensor', { x: 0, y: 0 }, small),
    ]));
    expect(issues[0].message).toBe('Range: sensor has no placed Gateway within 10000 mm.');
  });
});

describe('evaluateSpatialRules: within', () => {
  const withinRule = rule({ kind: 'within', sourceClassId: 'sensor', targetClassId: 'zone', name: 'In a room' });
  const detector = { widthMm: 200, heightMm: 200, depthMm: 100 };

  it('uses the metaclass default extents for zones without size3D', () => {
    expect(defaultSizeForClass(metamodelWith([]), 'room')).toEqual({ widthMm: 4000, heightMm: 3000, depthMm: 3000 });
    const issues = evaluateSpatialRules(metamodelWith([withinRule]), modelOf([
      element('room', 'room', { x: 0, y: 0 }),
      element('inside', 'sensor', { x: 1800, y: 0, z: 2700 }, detector),
      element('outside', 'sensor', { x: 2100, y: 0, z: 2700 }, detector),
    ]));
    expect(issues.map(issue => issue.elementId)).toEqual(['outside']);
    expect(issues[0].message).toBe('In a room: outside is not inside any Zone.');
  });

  it('shrinks the target footprint by the margin', () => {
    const issues = evaluateSpatialRules(metamodelWith([{ ...withinRule, distanceMm: 300 }]), modelOf([
      element('room', 'room', { x: 0, y: 0 }),
      element('edge', 'sensor', { x: 1800, y: 0, z: 2700 }, detector),
      element('centre', 'sensor', { x: 0, y: 0, z: 2700 }, detector),
    ]));
    expect(issues.map(issue => issue.message)).toEqual(['In a room: edge is not inside any Zone with a 300 mm margin.']);
  });

  it('honours the target rotation', () => {
    const elements = [
      element('room', 'room', { x: 0, y: 0, rotationZ: 90 }),
      element('sensor', 'sensor', { x: 0, y: 1800, z: 100 }, detector),
    ];
    // Turned 90 degrees, the 4000 mm side runs along Y.
    expect(evaluateSpatialRules(metamodelWith([withinRule]), modelOf(elements))).toHaveLength(0);
    elements[0].presentation!.rotationZ = 0;
    expect(evaluateSpatialRules(metamodelWith([withinRule]), modelOf(elements))).toHaveLength(1);
  });

  it('requires the vertical interval inside the target in volume mode only', () => {
    const elements = [
      element('room', 'room', { x: 0, y: 0 }),
      element('above', 'sensor', { x: 0, y: 0, z: 2950 }, detector),
    ];
    expect(evaluateSpatialRules(metamodelWith([withinRule]), modelOf(elements))).toHaveLength(1);
    expect(evaluateSpatialRules(metamodelWith([{ ...withinRule, mode: 'plan' }]), modelOf(elements))).toHaveLength(0);
  });
});

describe('evaluateSpatialRules: adjacentTo', () => {
  const adjacentRule = rule({
    kind: 'adjacentTo', sourceClassId: 'rack', targetClassId: 'equipment', distanceMm: 100, mode: 'plan', name: 'Next to',
  });

  it('needs a distinct target within the gap tolerance', () => {
    const issues = evaluateSpatialRules(metamodelWith([adjacentRule]), modelOf([
      element('rack', 'rack', { x: 0, y: 0 }, conveyorSize),
      element('lonely', 'rack', { x: 10000, y: 0 }, conveyorSize),
      element('conveyor', 'conveyor', { x: 2050, y: 0 }, conveyorSize),
    ]));
    // rack is 50 mm from the conveyor; lonely only has itself, which does not count.
    expect(issues.map(issue => issue.elementId)).toEqual(['lonely']);
    expect(issues[0].message).toBe('Next to: lonely is not within 100 mm of any Equipment.');
  });
});

describe('spatial rule configuration', () => {
  it('validates required fields, distances, and class references', () => {
    const metamodel = metamodelWith([]);
    expect(validateSpatialRule(rule({}), metamodel)).toEqual([]);
    expect(validateSpatialRule(rule({ kind: 'minClearance' }), metamodel))
      .toEqual(['spatialRule.distanceMm is required for minClearance']);
    expect(validateSpatialRule(rule({ kind: 'within' }), metamodel)).toEqual([]);
    expect(validateSpatialRule(rule({ kind: 'maxDistance', distanceMm: -1 }), metamodel))
      .toEqual(['spatialRule.distanceMm must be a non-negative number']);
    expect(validateSpatialRule(rule({ targetClassId: 'missing' }), metamodel))
      .toEqual(['spatialRule.targetClassId references unknown metaclass missing']);
    expect(validateSpatialRules([rule({}), rule({})], metamodel))
      .toEqual(['spatialRules[1].id duplicates rule rule-1']);
  });

  it('reports an invalid rule once, without evaluating it', () => {
    const issues = evaluateSpatialRules(metamodelWith([rule({ sourceClassId: 'deleted', name: 'Broken' })]), modelOf([
      element('a', 'conveyor', { x: 0, y: 0 }, conveyorSize),
      element('b', 'conveyor', { x: 0, y: 0 }, conveyorSize),
    ]));
    expect(issues).toEqual([{
      severity: 'error',
      message: 'Spatial rule "Broken" is invalid: sourceClassId references unknown metaclass deleted',
      location: 'spatialRules.noOverlap',
      constraintId: 'rule-1',
    }]);
  });

  it('drops rules that reference a deleted class', () => {
    const metamodel = JSON.parse(JSON.stringify(metamodelWith([
      rule({ id: 'keep', sourceClassId: 'equipment', targetClassId: 'equipment' }),
      rule({ id: 'drop', kind: 'within', sourceClassId: 'sensor', targetClassId: 'zone' }),
    ])));
    expect(deleteMetaClass(metamodel, 'zone')).toBe(true);
    expect(metamodel.spatialRules.map((candidate: SpatialRule) => candidate.id)).toEqual(['keep']);
  });

  it('ignores disabled rules', () => {
    expect(evaluateSpatialRules(metamodelWith([rule({ enabled: false })]), modelOf([
      element('a', 'conveyor', { x: 0, y: 0 }, conveyorSize),
      element('b', 'conveyor', { x: 0, y: 0 }, conveyorSize),
    ]))).toEqual([]);
  });
});

describe('Smart Warehouse example rules', () => {
  const metamodel = smartWarehouseMetamodel as unknown as Metamodel;
  const model = smartWarehouseModel as unknown as Model;

  it('ships rules that the bundled model satisfies', () => {
    expect(metamodel.spatialRules!.length).toBeGreaterThanOrEqual(3);
    expect(validateSpatialRules(metamodel.spatialRules, metamodel)).toEqual([]);
    expect(evaluateSpatialRules(metamodel, model)).toEqual([]);
  });

  it('reports a conveyor moved onto another conveyor, rotated or not', () => {
    const moved: Model = JSON.parse(JSON.stringify(model));
    const conveyors = moved.elements.filter(candidate => candidate.style.name?.startsWith('Conveyor'));
    const [first, second] = conveyors;
    second.presentation!.position3D = {
      x: first.presentation!.position3D!.x + 3500,
      y: first.presentation!.position3D!.y,
      z: 0,
    };
    second.presentation!.rotationZ = 90;

    const issues = evaluateSpatialRules(metamodel, moved);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: 'error',
      elementId: first.id,
      relatedElementIds: [second.id],
    });
  });
});
