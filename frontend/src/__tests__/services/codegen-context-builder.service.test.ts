import { CodegenContextBuilderService } from '../../services/codegeneration/codegen-context-builder.service';
import { CodegenHandlebarsService } from '../../services/codegeneration/codegen-handlebars.service';
import { Metamodel, ModelElement } from '../../models/types';
import Handlebars from 'handlebars';

function makeElement(id: string, name: string, modelElementId = 'Conveyor'): ModelElement {
  return {
    id,
    modelElementId,
    style: { name },
    references: {},
    presentation: {
      position3D: { x: 0, y: 0, z: 0 },
      size3D: { widthMm: 100, heightMm: 200, depthMm: 50 },
    },
  };
}

const metamodel: Metamodel = {
  id: 'metamodel-1',
  name: 'Warehouse',
  eClass: 'EPackage',
  uri: 'warehouse',
  prefix: 'warehouse',
  classes: [
    {
      id: 'Conveyor',
      name: 'Conveyor',
      eClass: 'EClass',
      abstract: false,
      superTypes: [],
      attributes: [],
      references: [],
    },
  ],
  enums: [],
  constraints: [],
  conformsTo: 'ecore',
};

describe('CodegenContextBuilderService deterministic ordering', () => {
  it('sorts generated element arrays by stable name/id keys', () => {
    const service = new CodegenContextBuilderService();
    const elements = [
      makeElement('elem-3', 'Conveyor_C'),
      makeElement('elem-1', 'Conveyor_A'),
      makeElement('elem-2', 'Conveyor_B'),
    ];

    const context = service.prepareMultiElementContext(
      elements,
      { id: 'diagram-1', name: 'View', modelId: 'model-1', elements: [] },
      metamodel
    );

    expect(context.elementsByClassName.Conveyor.map((element: any) => element.name)).toEqual([
      'Conveyor_A',
      'Conveyor_B',
      'Conveyor_C',
    ]);
    expect(service.prepareElementsContext(elements).map((element: any) => element.id)).toEqual([
      'elem-1',
      'elem-2',
      'elem-3',
    ]);
  });

  it('uses id as a deterministic fallback when names are equal', () => {
    const service = new CodegenContextBuilderService();
    const elements = [
      makeElement('elem-b', 'Conveyor'),
      makeElement('elem-a', 'Conveyor'),
    ];

    expect(service.sortElementsForGeneration(elements).map(element => element.id)).toEqual([
      'elem-a',
      'elem-b',
    ]);
  });

  it('exposes stable OPC IDs and resolved reference target summaries', () => {
    const service = new CodegenContextBuilderService();
    const first = makeElement('elem-a', 'Conveyor A');
    const second = makeElement('elem-b', 'Conveyor B');
    first.references = { next: second.id };

    const context = service.prepareMultiElementContext(
      [second, first],
      { id: 'diagram-1', name: 'View', modelId: 'model-1', elements: [] },
      metamodel
    );

    expect(context.elementsByClassName.Conveyor[0]).toMatchObject({
      id: 'elem-a',
      opcNodeId: 'Conveyor1',
      generationIndex: 1,
      resolvedReferences: {
        next: {
          id: 'elem-b',
          name: 'Conveyor B',
          className: 'Conveyor',
          opcNodeId: 'Conveyor2',
        },
      },
    });
  });
});

describe('CodegenContextBuilderService elevation contract', () => {
  it.each([
    [4500, 4500],
    [0, 0],
    [-750, -750],
  ])('exposes z=%s as Z and BaseElevationMm', (z, expected) => {
    const element = makeElement('drone', 'Inspection Drone', 'InspectionDrone');
    element.presentation!.position3D = { x: 1200, y: 800, z };

    const context = new CodegenContextBuilderService().prepareSingleElementContext(element);
    expect(context.position3D).toEqual({ x: 1200, y: 800, z });
    expect(context.Z).toBe(expected);
    expect(context.BaseElevationMm).toBe(expected);
  });

  it('normalizes a legacy two-coordinate position to z = 0', () => {
    const element = makeElement('legacy', 'Legacy');
    element.presentation!.position3D = { x: 5, y: 6 } as any;

    expect(new CodegenContextBuilderService().prepareSingleElementContext(element)).toMatchObject({
      position3D: { x: 5, y: 6, z: 0 },
      X: 5,
      Y: 6,
      Z: 0,
      BaseElevationMm: 0,
    });
  });

  it('uses a diagram-local position override, including elevation', () => {
    const context = new CodegenContextBuilderService().prepareSingleElementContext({
      id: 'diagram-drone',
      type: 'node',
      modelElementId: 'InspectionDrone',
      style: {
        name: 'Drone view',
        position3D: { x: 20, y: 30, z: 4700 },
      },
    });

    expect(context.position3D).toEqual({ x: 20, y: 30, z: 4700 });
    expect(context.Z).toBe(4700);
  });

  it('does not invent Z for non-spatial elements', () => {
    const context = new CodegenContextBuilderService().prepareSingleElementContext({
      id: 'logical', modelElementId: 'Task', style: { name: 'Pick task' }, references: {},
    });
    expect(context.Z).toBeUndefined();
    expect(context.BaseElevationMm).toBeUndefined();
  });
});

describe('baseCenterMeters Handlebars helper', () => {
  beforeAll(() => new CodegenHandlebarsService().registerAllHelpers());

  it('converts base elevation plus half the vertical extent to metres', () => {
    expect(Handlebars.compile('{{baseCenterMeters Z Height}}')({ Z: 4500, Height: 400 })).toBe('4.7');
    expect(Handlebars.compile('{{baseCenterMeters Z Height}}')({ Z: -500, Height: 200 })).toBe('-0.4');
  });
});
