import {
  prepareContextForJS,
  createJSSandbox,
  evaluateInSandbox
} from '../../services/constraint/js/js.sandbox';
import { Model, ModelElement, Metamodel } from '../../models/types';

const metamodel = {
  id: 'mm-1',
  name: 'WarehouseMM',
  classes: [
    { id: 'class-rack', name: 'Rack', attributes: [], references: [], constraints: [] }
  ],
  constraints: []
} as unknown as Metamodel;

const placedElement: ModelElement = {
  id: 'el-1',
  modelElementId: 'class-rack',
  style: { name: 'Rack A' },
  references: {},
  presentation: {
    position2D: { x: 120, y: 80 },
    position3D: { x: 1200, y: 800 },
    size3D: { widthMm: 1000, heightMm: 400, depthMm: 2000 },
    rotationZ: 90
  }
};

const unplacedElement: ModelElement = {
  id: 'el-2',
  modelElementId: 'class-rack',
  style: { name: 'Rack B' },
  references: {}
};

const makeModel = (elements: ModelElement[]): Model =>
  ({
    id: 'model-1',
    name: 'Warehouse',
    metamodelId: 'mm-1',
    conformsTo: 'mm-1',
    elements
  } as Model);

describe('prepareContextForJS placement exposure', () => {
  it('leaves spatial fields undefined for elements without a presentation record', () => {
    const context = prepareContextForJS(unplacedElement, makeModel([unplacedElement]), metamodel);

    expect(context.self.position3D).toBeUndefined();
    expect(context.self.position2D).toBeUndefined();
    expect(context.self.name).toBe('Rack B');
  });

  it('exposes the presentation record on self', () => {
    const context = prepareContextForJS(placedElement, makeModel([placedElement]), metamodel);

    expect(context.self.position3D).toEqual({ x: 1200, y: 800 });
    expect(context.self.position2D).toEqual({ x: 120, y: 80 });
    expect(context.self.size3D).toEqual({ widthMm: 1000, heightMm: 400, depthMm: 2000 });
    expect(context.self.rotationZ).toBe(90);
  });

  it('gives style values precedence over presentation values', () => {
    const overridden: ModelElement = {
      ...placedElement,
      style: { name: 'Rack A', position3D: { x: 5, y: 6 } }
    };
    const context = prepareContextForJS(overridden, makeModel([overridden]), metamodel);

    expect(context.self.position3D).toEqual({ x: 5, y: 6 });
  });

  it('exposes placement on peer elements via model.elements', () => {
    const context = prepareContextForJS(
      unplacedElement,
      makeModel([unplacedElement, placedElement]),
      metamodel
    );

    const peer = context.model.elements.find((e: any) => e.id === 'el-1');
    expect(peer.position3D).toEqual({ x: 1200, y: 800 });
    expect(peer.name).toBe('Rack A');
  });

  it('exposes placement on referenced elements', () => {
    const referencing: ModelElement = {
      id: 'el-3',
      modelElementId: 'class-rack',
      style: { name: 'Rack C' },
      references: { neighbor: 'el-1', shelves: ['el-1'] }
    };
    const context = prepareContextForJS(
      referencing,
      makeModel([referencing, placedElement]),
      metamodel
    );

    expect(context.self.neighbor.position3D).toEqual({ x: 1200, y: 800 });
    expect(context.self.shelves[0].position3D).toEqual({ x: 1200, y: 800 });
  });

  it('evaluates a spatial constraint against real placement values end-to-end', () => {
    const context = prepareContextForJS(placedElement, makeModel([placedElement]), metamodel);
    const sandbox = createJSSandbox(context, makeModel([placedElement]));

    const result = evaluateInSandbox(
      'self.position3D && self.position3D.x >= 0 && self.position3D.y >= 0',
      sandbox
    );

    expect(result).toBe(true);
  });

  it('fails a spatial constraint for out-of-bounds placement', () => {
    const outOfBounds: ModelElement = {
      ...placedElement,
      id: 'el-4',
      presentation: { position3D: { x: -50, y: 800 } }
    };
    const context = prepareContextForJS(outOfBounds, makeModel([outOfBounds]), metamodel);
    const sandbox = createJSSandbox(context, makeModel([outOfBounds]));

    const result = evaluateInSandbox(
      '!self.position3D || (self.position3D.x >= 0 && self.position3D.y >= 0)',
      sandbox
    );

    expect(result).not.toBe(true);
  });
});
