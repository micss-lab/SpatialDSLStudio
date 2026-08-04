import { Model } from '../../models/types';
import { ModelElementCrudService } from '../../services/model/model-element-crud.service';
import { CodegenContextBuilderService } from '../../services/codegeneration/codegen-context-builder.service';

function makeModel(): Model {
  return {
    id: 'model-1',
    name: 'Warehouse',
    metamodelId: 'metamodel-1',
    conformsTo: 'metamodel-1',
    elements: [
      {
        id: 'conveyor-1',
        modelElementId: 'Conveyor',
        style: { name: 'Conveyor_A' },
        references: {},
        presentation: {
          position2D: { x: 100, y: 200 },
          position3D: { x: 1000, y: -500, z: 4500 },
          size3D: { widthMm: 3000, heightMm: 800, depthMm: 300 },
        },
      },
    ],
    connections: [],
  };
}

describe('ModelElementCrudService spatial presentation updates', () => {
  it('moves existing 3D/codegen position by the 2D edit delta', () => {
    const model = makeModel();
    const service = new ModelElementCrudService();
    const saveCallback = jest.fn();

    const updated = service.updateModelElementPresentation(
      model,
      'conveyor-1',
      { position2D: { x: 130, y: 175 } },
      saveCallback
    );

    expect(updated).toBe(true);
    expect(model.elements[0].presentation?.position2D).toEqual({ x: 130, y: 175 });
    expect(model.elements[0].presentation?.position3D).toEqual({ x: 1030, y: -525, z: 4500 });
    expect(saveCallback).toHaveBeenCalledWith('model-1');
  });

  it('lets explicit 3D updates take precedence over 2D delta sync', () => {
    const model = makeModel();
    const service = new ModelElementCrudService();

    service.updateModelElementPresentation(
      model,
      'conveyor-1',
      {
        position2D: { x: 130, y: 175 },
        position3D: { x: 2500, y: 3000, z: 3000 },
      },
      jest.fn()
    );

    expect(model.elements[0].presentation?.position3D).toEqual({ x: 2500, y: 3000, z: 3000 });
  });

  it('exposes the synced 3D position to code generation context', () => {
    const model = makeModel();
    const crudService = new ModelElementCrudService();
    const contextBuilder = new CodegenContextBuilderService();

    crudService.updateModelElementPresentation(
      model,
      'conveyor-1',
      { position2D: { x: 75, y: 260 } },
      jest.fn()
    );

    const context = contextBuilder.prepareSingleElementContext(model.elements[0]);

    expect(context.X).toBe(975);
    expect(context.Y).toBe(-440);
    expect(context.Z).toBe(4500);
    expect(context.BaseElevationMm).toBe(4500);
  });
});
