import { prepareContextForJS } from '../../services/constraint/js/js.sandbox';
import { evaluateJSConstraint } from '../../services/constraint/js/js.validation';
import { prepareContextForOCL } from '../../services/constraint/ocl/ocl.context';
import { Model, ModelElement, Metamodel, JSConstraint, MetaClass } from '../../models/types';

// Spatial placement is persisted on element.presentation, not element.style.
// These tests pin down that JS/OCL constraint contexts expose it, which is
// what makes user-written spatial checks (overlap, bounds, clearance) possible.

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

const conveyorA = makeElement('conveyor-a', {
  position3D: { x: 1200, y: 400, z: 250 },
  size3D: { widthMm: 500, heightMm: 800, depthMm: 200 },
  rotationZ: 90,
});

const conveyorB = makeElement('conveyor-b', {
  // Legacy persisted values are normalized at the constraint boundary.
  position3D: { x: 3000, y: 400 } as any,
});

const model: Model = {
  id: 'model-1',
  name: 'Warehouse Model',
  metamodelId: metamodel.id,
  elements: [conveyorA, conveyorB],
  conformsTo: metamodel.id,
};

describe('spatial presentation data in constraint contexts', () => {
  it('exposes position, size, and rotation on self for JS constraints', () => {
    const context = prepareContextForJS(conveyorA, model, metamodel);

    expect(context.self.position3D).toEqual({ x: 1200, y: 400, z: 250 });
    expect(context.self.size3D).toEqual({ widthMm: 500, heightMm: 800, depthMm: 200 });
    expect(context.self.rotationZ).toBe(90);
  });

  it('exposes spatial fields on model.elements for pairwise checks', () => {
    const context = prepareContextForJS(conveyorA, model, metamodel);
    const other = context.model.elements.find((e: any) => e.id === 'conveyor-b');

    expect(other.position3D).toEqual({ x: 3000, y: 400, z: 0 });
  });

  it('evaluates a JS constraint that reads spatial placement', () => {
    const constraint: JSConstraint = {
      id: 'c-1',
      name: 'within-hall-x',
      contextClassName: metaClass.name,
      contextClassId: metaClass.id,
      expression: 'self.position3D !== undefined && self.position3D.x < 10000',
      isValid: true,
      severity: 'error',
      type: 'javascript',
    };

    const result = evaluateJSConstraint(constraint, conveyorA, model, metamodel);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('fails a JS spatial constraint when placement violates it', () => {
    const constraint: JSConstraint = {
      id: 'c-2',
      name: 'within-hall-x-tight',
      contextClassName: metaClass.name,
      contextClassId: metaClass.id,
      expression: 'self.position3D.x < 1000',
      isValid: true,
      severity: 'error',
      type: 'javascript',
    };

    const result = evaluateJSConstraint(constraint, conveyorA, model, metamodel);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
  });

  it('exposes spatial fields in the OCL evaluation context', () => {
    const context = prepareContextForOCL(conveyorA, model, metamodel);

    expect(context.position3D).toEqual({ x: 1200, y: 400, z: 250 });
    expect(context.size3D).toEqual({ widthMm: 500, heightMm: 800, depthMm: 200 });
    expect(context.rotationZ).toBe(90);
  });

  it('leaves elements without presentation untouched', () => {
    const bare = makeElement('bare', undefined);
    const context = prepareContextForJS(bare, model, metamodel);

    expect(context.self.position3D).toBeUndefined();
    expect(context.self.rotationZ).toBeUndefined();
  });
});
