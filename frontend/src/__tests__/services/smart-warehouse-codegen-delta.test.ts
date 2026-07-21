import Handlebars from 'handlebars';
import smartWarehouseMetamodel from '../../examples/data/smart-warehouse-metamodel.json';
import smartWarehouseModel from '../../examples/data/smart-warehouse-model.json';
import smartWarehouseProject from '../../examples/data/smart-warehouse-project.json';
import { CodegenContextBuilderService } from '../../services/codegeneration/codegen-context-builder.service';
import { ModelElementCrudService } from '../../services/model/model-element-crud.service';
import { Diagram, Metamodel, Model } from '../../models/types';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function buildContext(model: Model, metamodel: Metamodel) {
  const contextBuilder = new CodegenContextBuilderService();
  const virtualDiagram: Diagram = {
    id: 'warehouse-codegen-test-diagram',
    name: 'Warehouse Codegen Test Diagram',
    modelId: model.id,
    elements: [],
  };

  return {
    ...contextBuilder.prepareMultiElementContext(model.elements, virtualDiagram, metamodel),
    elements: contextBuilder.prepareElementsContext(model.elements),
    model: {
      id: model.id,
      name: model.name,
      elements: contextBuilder.prepareElementsContext(model.elements),
    },
  };
}

function generateConveyorLocations(model: Model): Array<{ Name: string; X: number; Y: number; Rz: number }> {
  const metamodel = smartWarehouseMetamodel as Metamodel;
  const template = smartWarehouseProject.templates.find(projectTemplate => projectTemplate.name === 'ConveyorLocation');
  if (!template) {
    throw new Error('ConveyorLocation template not found');
  }

  const compiled = Handlebars.compile(template.templateContent, { noEscape: true });
  return JSON.parse(compiled(buildContext(model, metamodel)));
}

describe('smart warehouse code generation delta evidence', () => {
  it('regenerates stable conveyor coordinates after a 2D spatial edit', () => {
    const model = clone(smartWarehouseModel) as unknown as Model;
    const modelWithReversedElements = {
      ...clone(smartWarehouseModel),
      elements: clone(smartWarehouseModel.elements).reverse(),
    } as unknown as Model;

    const before = generateConveyorLocations(model);
    expect(before.map(record => record.Name)).toEqual(['Conveyor', 'Conveyor #2']);
    expect(generateConveyorLocations(modelWithReversedElements)).toEqual(before);

    const conveyor = model.elements.find(element => element.style?.name === 'Conveyor');
    if (!conveyor?.presentation?.position2D) {
      throw new Error('Conveyor fixture is missing 2D presentation data');
    }

    const delta = { x: 30, y: -25 };
    const updated = new ModelElementCrudService().updateModelElementPresentation(
      model,
      conveyor.id,
      {
        position2D: {
          x: conveyor.presentation.position2D.x + delta.x,
          y: conveyor.presentation.position2D.y + delta.y,
        },
      },
      jest.fn()
    );

    expect(updated).toBe(true);

    const after = generateConveyorLocations(model);
    const changedRecords = after.filter((record, index) => JSON.stringify(record) !== JSON.stringify(before[index]));

    expect(changedRecords.map(record => record.Name)).toEqual(['Conveyor']);
    expect(after.find(record => record.Name === 'Conveyor')).toEqual({
      ...before.find(record => record.Name === 'Conveyor'),
      X: before.find(record => record.Name === 'Conveyor')!.X + delta.x,
      Y: before.find(record => record.Name === 'Conveyor')!.Y + delta.y,
    });
    expect(after.find(record => record.Name === 'Conveyor #2')).toEqual(
      before.find(record => record.Name === 'Conveyor #2')
    );
  });
});
