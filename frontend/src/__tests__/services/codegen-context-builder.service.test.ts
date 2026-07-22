import { CodegenContextBuilderService } from '../../services/codegeneration/codegen-context-builder.service';
import { Metamodel, ModelElement } from '../../models/types';

function makeElement(id: string, name: string, modelElementId = 'Conveyor'): ModelElement {
  return {
    id,
    modelElementId,
    style: { name },
    references: {},
    presentation: {
      position3D: { x: 0, y: 0 },
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
