import { Diagram, Metamodel, Model, ToolDefinition } from '../../models/types';
import smartWarehouseMetamodelData from '../../examples/data/smart-warehouse-metamodel.json';
import smartWarehouseModelData from '../../examples/data/smart-warehouse-model.json';
import smartWarehouseViewsData from '../../examples/data/smart-warehouse-views.json';
import smartWarehouseViewpointsData from '../../examples/data/smart-warehouse-viewpoints.json';

jest.mock('../../services/diagram/diagram.service', () => ({
  diagramService: {
    getDiagramById: jest.fn(),
    createModelElementInView: jest.fn(),
    removeElementsForModelElement: jest.fn(),
  },
}));

jest.mock('../../services/model', () => ({
  modelService: {
    getModelById: jest.fn(),
    setModelElementReference: jest.fn(),
    removeModelElementReference: jest.fn(),
    reconnectModelElementReference: jest.fn(),
    deleteModelElement: jest.fn(),
    updateModel: jest.fn(),
  },
  modelInheritanceUtilsService: {
    getAllReferences: jest.fn((metaClass) => metaClass.references || []),
  },
}));

jest.mock('../../services/metamodel', () => ({
  metamodelService: {
    getMetamodelById: jest.fn(),
  },
}));

import { diagramToolExecutionService } from '../../services/diagram/diagram-tool-execution.service';
import { diagramService } from '../../services/diagram/diagram.service';
import { metamodelService } from '../../services/metamodel';
import { modelInheritanceUtilsService, modelService } from '../../services/model';

const mockedDiagramService = diagramService as any;
const mockedMetamodelService = metamodelService as any;
const mockedModelService = modelService as any;

const metamodel: Metamodel = {
  id: 'mm-1',
  name: 'Warehouse',
  eClass: 'epackage',
  uri: 'warehouse',
  prefix: 'wh',
  conformsTo: 'core',
  classes: [
    {
      id: 'robot',
      name: 'MobileRobot',
      eClass: 'eclass',
      abstract: false,
      superTypes: [],
      attributes: [
        { id: 'name', name: 'name', eClass: 'eattribute', type: 'string', many: false },
        { id: 'battery', name: 'BatteryLevel', eClass: 'eattribute', type: 'number', many: false },
        { id: 'product', name: 'HasProduct', eClass: 'eattribute', type: 'boolean', many: false },
      ],
      references: [
        {
          id: 'assigned-station',
          name: 'assignedStation',
          eClass: 'ereference',
          target: 'station',
          containment: false,
          cardinality: { lowerBound: 0, upperBound: 1 },
        },
      ],
    },
    {
      id: 'station',
      name: 'ChargingStation',
      eClass: 'eclass',
      abstract: false,
      superTypes: [],
      attributes: [{ id: 'station-name', name: 'name', eClass: 'eattribute', type: 'string', many: false }],
      references: [],
    },
  ],
};

const model: Model = {
  id: 'model-1',
  name: 'Warehouse model',
  metamodelId: metamodel.id,
  conformsTo: metamodel.id,
  elements: [
    { id: 'robot-1', modelElementId: 'robot', style: {}, references: { assignedStation: 'station-1' } },
    { id: 'station-1', modelElementId: 'station', style: {}, references: {} },
    { id: 'station-2', modelElementId: 'station', style: {}, references: {} },
  ],
  connections: [],
};

const diagram: Diagram = {
  id: 'diagram-1',
  name: 'Floor',
  modelId: model.id,
  elements: [
    { id: 'robot-1', type: 'node', modelElementId: 'robot', style: { linkedModelElementId: 'robot-1' } },
    { id: 'station-1', type: 'node', modelElementId: 'station', style: { linkedModelElementId: 'station-1' } },
    { id: 'station-2', type: 'node', modelElementId: 'station', style: { linkedModelElementId: 'station-2' } },
    {
      id: 'ref-robot-1-assignedStation-station-1-0',
      type: 'edge',
      modelElementId: 'assigned-station',
      sourceId: 'robot-1',
      targetId: 'station-1',
      style: { name: 'assignedStation' },
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedDiagramService.getDiagramById.mockReturnValue(diagram);
  mockedModelService.getModelById.mockReturnValue(model);
  mockedMetamodelService.getMetamodelById.mockReturnValue(metamodel);
  (modelInheritanceUtilsService.getAllReferences as jest.Mock)
    .mockImplementation((metaClass) => metaClass.references || []);
});

describe('diagram tool execution', () => {
  it('creates a node with only declared, type-safe set-attribute operations', async () => {
    const tool: ToolDefinition = {
      id: 'create-robot',
      name: 'Deploy robot',
      type: 'create-node',
      metaClassId: 'robot',
      payload: {
        operations: [
          { type: 'set-attribute', attributeName: 'BatteryLevel', value: 100 },
          { type: 'set-attribute', attributeName: 'HasProduct', value: false },
          { type: 'set-attribute', attributeName: 'notAnAttribute', value: 'ignored' },
        ],
      },
    };
    const created = { id: 'robot-created', type: 'node', modelElementId: 'robot', style: {} };
    mockedDiagramService.createModelElementInView.mockResolvedValue(created);

    const result = await diagramToolExecutionService.executeCreateNodeTool(
      diagram.id,
      tool,
      { position2D: { x: 20, y: 30 } }
    );

    expect(result.ok).toBe(true);
    expect(mockedDiagramService.createModelElementInView).toHaveBeenCalledWith(
      diagram.id,
      'robot',
      { position2D: { x: 20, y: 30 } },
      { name: 'MobileRobot 1', BatteryLevel: 100, HasProduct: false }
    );
  });

  it('executes a create-edge tool using its configured reference', () => {
    mockedModelService.setModelElementReference.mockReturnValue(true);
    const tool: ToolDefinition = {
      id: 'assign',
      name: 'Assign station',
      type: 'create-edge',
      referenceId: 'assigned-station',
    };

    const result = diagramToolExecutionService.executeCreateEdgeTool(
      diagram.id,
      tool,
      'robot-1',
      'station-2'
    );

    expect(result.ok).toBe(true);
    expect(mockedModelService.setModelElementReference).toHaveBeenCalledWith(
      model.id,
      'robot-1',
      'assignedStation',
      'station-2'
    );
  });

  it('deletes a selected model node through a delete tool', () => {
    mockedModelService.deleteModelElement.mockReturnValue(true);
    const tool: ToolDefinition = { id: 'delete', name: 'Delete asset', type: 'delete' };

    const result = diagramToolExecutionService.executeDeleteTool(diagram.id, tool, diagram.elements[0]);

    expect(result.ok).toBe(true);
    expect(mockedModelService.deleteModelElement).toHaveBeenCalledWith(model.id, 'robot-1');
    expect(mockedDiagramService.removeElementsForModelElement).toHaveBeenCalledWith(model.id, 'robot-1');
  });

  it('reconnects a semantic reference edge to a compatible target', () => {
    mockedModelService.reconnectModelElementReference.mockReturnValue(true);
    const tool: ToolDefinition = {
      id: 'reconnect',
      name: 'Reassign station',
      type: 'reconnect',
      referenceId: 'assigned-station',
    };

    const result = diagramToolExecutionService.executeReconnectTool(
      diagram.id,
      tool,
      diagram.elements[3],
      'station-2'
    );

    expect(result.ok).toBe(true);
    expect(mockedModelService.reconnectModelElementReference).toHaveBeenCalledWith(
      model.id,
      'robot-1',
      'assignedStation',
      'station-1',
      'station-2'
    );
  });
});

describe('Smart Warehouse authored tools', () => {
  it('creates and deletes a robot using the bundled floor-plan tool definitions', async () => {
    const warehouseMetamodel = JSON.parse(JSON.stringify(smartWarehouseMetamodelData)) as Metamodel;
    const warehouseModel = JSON.parse(JSON.stringify(smartWarehouseModelData)) as Model;
    const warehouseView = JSON.parse(JSON.stringify(smartWarehouseViewsData[0])) as Diagram;
    const floorPlan = smartWarehouseViewpointsData[0].representationDescriptions[0];
    const fixtureTools = floorPlan.toolDefinitions as unknown as ToolDefinition[];
    const createTool = fixtureTools.find(tool => tool.id === 'tool-floor-mobile-robot')!;
    const deleteTool = fixtureTools.find(tool => tool.id === 'tool-floor-delete')!;
    const createdDiagramElement = {
      id: 'fixture-created-robot',
      type: 'node' as const,
      modelElementId: createTool.metaClassId!,
      style: { linkedModelElementId: 'fixture-created-robot' },
    };

    mockedDiagramService.getDiagramById.mockReturnValue(warehouseView);
    mockedModelService.getModelById.mockReturnValue(warehouseModel);
    mockedMetamodelService.getMetamodelById.mockReturnValue(warehouseMetamodel);
    mockedDiagramService.createModelElementInView.mockResolvedValue(createdDiagramElement);
    mockedModelService.deleteModelElement.mockReturnValue(true);

    const createResult = await diagramToolExecutionService.executeCreateNodeTool(
      warehouseView.id,
      createTool,
      { position2D: { x: 100, y: 100 } }
    );
    const createStyle = mockedDiagramService.createModelElementInView.mock.calls[0][3];
    expect(createResult.ok).toBe(true);
    expect(createStyle).toEqual(expect.objectContaining({ BatteryLevel: 100, HasProduct: false }));

    warehouseModel.elements.push({
      id: 'fixture-created-robot',
      modelElementId: createTool.metaClassId!,
      style: createStyle,
      references: {},
    });
    warehouseView.elements.push(createdDiagramElement);

    const deleteResult = diagramToolExecutionService.executeDeleteTool(
      warehouseView.id,
      deleteTool,
      createdDiagramElement
    );
    expect(deleteResult.ok).toBe(true);
    expect(mockedModelService.deleteModelElement).toHaveBeenCalledWith(
      warehouseModel.id,
      'fixture-created-robot'
    );
  });
});
