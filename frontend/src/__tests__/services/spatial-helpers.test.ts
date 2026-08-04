import {
  boundsOf,
  bounds3DOf,
  overlaps,
  overlaps3D,
  clearance,
  clearance3D,
} from '../../services/constraint/spatial.helpers';
import { prepareContextForJS } from '../../services/constraint/js/js.sandbox';
import { evaluateJSConstraint } from '../../services/constraint/js/js.validation';
import { prepareContextForOCL } from '../../services/constraint/ocl/ocl.context';
import { Model, ModelElement, Metamodel, JSConstraint, MetaClass } from '../../models/types';

// The helpers are pure AABB operations built on top of the
// coordinate contract in spatial.helpers.ts (position3D is the element's
// X/Y center and Z base, while size3D provides X/Y/Z extents). These tests
// pin down the box math and confirm the helpers are reachable from both
// the JS sandbox and the OCL context under a `spatial` namespace.

const metaClass: MetaClass = {
  id: 'mc-conveyor',
  name: 'Conveyor',
  eClass: 'EClass',
  abstract: false,
  superTypes: [],
  attributes: [],
  references: [],
};

const metamodel: Metamodel = {
  id: 'mm-warehouse',
  name: 'Warehouse',
  eClass: 'EPackage',
  uri: 'http://example.org/warehouse',
  prefix: 'wh',
  classes: [metaClass],
  conformsTo: 'ecore',
};

function makeElement(id: string, presentation: ModelElement['presentation']): ModelElement {
  return {
    id,
    modelElementId: metaClass.id,
    style: { name: id },
    references: {},
    presentation,
  };
}

// Overlapping pair: centers 100mm apart on each axis, both 400mm square.
const overlapA = makeElement('overlap-a', {
  position3D: { x: 1000, y: 1000, z: 0 },
  size3D: { widthMm: 400, heightMm: 400, depthMm: 200 },
});
const overlapB = makeElement('overlap-b', {
  position3D: { x: 1100, y: 1100, z: 50 },
  size3D: { widthMm: 400, heightMm: 400, depthMm: 200 },
});

// Separated pair: same y-range, 300mm gap along X.
const separatedC = makeElement('separated-c', {
  position3D: { x: 0, y: 0, z: 0 },
  size3D: { widthMm: 200, heightMm: 200, depthMm: 100 },
});
const separatedD = makeElement('separated-d', {
  position3D: { x: 500, y: 0, z: 0 },
  size3D: { widthMm: 200, heightMm: 200, depthMm: 100 },
});

// Touching pair: right edge of E exactly meets left edge of F.
const touchingE = makeElement('touching-e', {
  position3D: { x: 0, y: 0, z: 0 },
  size3D: { widthMm: 200, heightMm: 200, depthMm: 100 },
});
const touchingF = makeElement('touching-f', {
  position3D: { x: 200, y: 0, z: 0 },
  size3D: { widthMm: 200, heightMm: 200, depthMm: 100 },
});

const verticallySeparated = makeElement('vertically-separated', {
  position3D: { x: 1000, y: 1000, z: 300 },
  size3D: { widthMm: 400, heightMm: 400, depthMm: 100 },
});
const verticallyTouching = makeElement('vertically-touching', {
  position3D: { x: 1000, y: 1000, z: 200 },
  size3D: { widthMm: 400, heightMm: 400, depthMm: 100 },
});

const noSize = makeElement('no-size', { position3D: { x: 0, y: 0, z: 0 } });
const noPresentation = makeElement('no-presentation', undefined);

describe('boundsOf', () => {
  it('computes an AABB centered on position3D using size3D width/height', () => {
    expect(boundsOf(overlapA)).toEqual({
      minX: 800,
      minY: 800,
      maxX: 1200,
      maxY: 1200,
    });
  });

  it('returns undefined when size3D is missing', () => {
    expect(boundsOf(noSize)).toBeUndefined();
  });

  it('returns undefined when presentation is missing entirely', () => {
    expect(boundsOf(noPresentation)).toBeUndefined();
  });
});

describe('bounds3DOf', () => {
  it('uses position3D.z as the base and depthMm as the vertical extent', () => {
    expect(bounds3DOf(overlapB)).toEqual({
      minX: 900,
      minY: 900,
      minZ: 50,
      maxX: 1300,
      maxY: 1300,
      maxZ: 250,
    });
  });
});

describe('overlaps', () => {
  it('is true for two AABBs that intersect', () => {
    expect(overlaps(overlapA, overlapB)).toBe(true);
  });

  it('is false for two clearly separated AABBs', () => {
    expect(overlaps(separatedC, separatedD)).toBe(false);
  });

  it('is false when the boxes only touch at an edge', () => {
    expect(overlaps(touchingE, touchingF)).toBe(false);
  });

  it('is false when either element has no bounds', () => {
    expect(overlaps(overlapA, noSize)).toBe(false);
    expect(overlaps(overlapA, noPresentation)).toBe(false);
  });
});

describe('overlaps3D', () => {
  it('requires overlap on X, Y, and Z', () => {
    expect(overlaps3D(overlapA, overlapB)).toBe(true);
    expect(overlaps3D(overlapA, verticallySeparated)).toBe(false);
  });

  it('does not count touching horizontal faces as overlap', () => {
    expect(overlaps3D(overlapA, verticallyTouching)).toBe(false);
  });
});

describe('clearance', () => {
  it('is 0 when the boxes overlap', () => {
    expect(clearance(overlapA, overlapB)).toBe(0);
  });

  it('is 0 when the boxes only touch', () => {
    expect(clearance(touchingE, touchingF)).toBe(0);
  });

  it('is the correct positive gap when separated along one axis', () => {
    expect(clearance(separatedC, separatedD)).toBe(300);
  });

  it('is Infinity when either element has no bounds', () => {
    expect(clearance(overlapA, noSize)).toBe(Infinity);
    expect(clearance(overlapA, noPresentation)).toBe(Infinity);
  });
});

describe('clearance3D', () => {
  it('includes the vertical gap and treats touching as zero clearance', () => {
    expect(clearance3D(overlapA, verticallySeparated)).toBe(100);
    expect(clearance3D(overlapA, verticallyTouching)).toBe(0);
  });

  it('is Infinity when either element has no volume', () => {
    expect(clearance3D(overlapA, noSize)).toBe(Infinity);
  });
});

describe('spatial namespace in constraint contexts', () => {
  const model: Model = {
    id: 'model-1',
    name: 'Warehouse Model',
    metamodelId: metamodel.id,
    elements: [overlapA, overlapB, separatedC, separatedD],
    conformsTo: metamodel.id,
  };

  it('is reachable from the JS sandbox context', () => {
    const context = prepareContextForJS(overlapA, model, metamodel);
    expect(typeof context.spatial.overlaps).toBe('function');
    expect(typeof context.spatial.overlaps3D).toBe('function');
    expect(typeof context.spatial.boundsOf).toBe('function');
    expect(typeof context.spatial.bounds3DOf).toBe('function');
    expect(typeof context.spatial.clearance).toBe('function');
    expect(typeof context.spatial.clearance3D).toBe('function');
  });

  it('evaluates a JS constraint that calls spatial.overlaps on two real model elements', () => {
    const constraint: JSConstraint = {
      id: 'c-spatial-1',
      name: 'no-overlap',
      contextClassName: metaClass.name,
      contextClassId: metaClass.id,
      expression: "spatial.overlaps(findElementById('overlap-a'), findElementById('overlap-b'))",
      isValid: true,
      severity: 'error',
      type: 'javascript',
    };

    const result = evaluateJSConstraint(constraint, overlapA, model, metamodel);
    // The expression returns true (the elements do overlap), which the
    // constraint engine treats as a passing constraint result.
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('evaluates a JS constraint that calls spatial.clearance on separated elements', () => {
    const constraint: JSConstraint = {
      id: 'c-spatial-2',
      name: 'clearance-check',
      contextClassName: metaClass.name,
      contextClassId: metaClass.id,
      expression: "spatial.clearance(findElementById('separated-c'), findElementById('separated-d')) >= 300",
      isValid: true,
      severity: 'error',
      type: 'javascript',
    };

    const result = evaluateJSConstraint(constraint, separatedC, model, metamodel);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('is reachable from the OCL context and produces correct results', () => {
    const context = prepareContextForOCL(overlapA, model, metamodel);
    expect(typeof context.spatial.overlaps).toBe('function');
    expect(context.spatial.overlaps(overlapA, overlapB)).toBe(true);
    expect(context.spatial.overlaps(separatedC, separatedD)).toBe(false);
    expect(context.spatial.clearance(separatedC, separatedD)).toBe(300);
    expect(context.spatial.overlaps3D(overlapA, verticallySeparated)).toBe(false);
    expect(context.spatial.clearance3D(overlapA, verticallySeparated)).toBe(100);
  });
});
