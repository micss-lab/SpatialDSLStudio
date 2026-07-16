import { Metamodel, Model } from '../../models/types';

jest.mock('../../services/metamodel', () => ({
  metamodelService: {
    getMetamodelById: jest.fn(),
  },
}));

import { modelReferenceService } from '../../services/model/model-reference.service';
import { metamodelService } from '../../services/metamodel';

const FLOW_NODE_ID = 'class-flownode';
const INITIAL_NODE_ID = 'class-initialnode';
const ACTION_ID = 'class-action';

const metamodel = {
  id: 'mm-1',
  name: 'UMLActivityDiagramMM',
  classes: [
    {
      id: FLOW_NODE_ID,
      name: 'FlowNode',
      abstract: true,
      attributes: [],
      references: [
        {
          id: 'ref-flowsto',
          name: 'flowsTo',
          target: FLOW_NODE_ID,
          containment: false,
          cardinality: { lowerBound: 0, upperBound: '*' },
        },
      ],
    },
    {
      id: INITIAL_NODE_ID,
      name: 'InitialNode',
      abstract: false,
      superTypes: [FLOW_NODE_ID],
      attributes: [],
      references: [],
    },
    {
      id: ACTION_ID,
      name: 'Action',
      abstract: false,
      superTypes: [FLOW_NODE_ID],
      attributes: [],
      references: [],
    },
  ],
} as unknown as Metamodel;

const makeModel = (): Model =>
  ({
    id: 'model-1',
    name: 'OrderProcessing',
    metamodelId: 'mm-1',
    conformsTo: 'mm-1',
    elements: [
      { id: 'el-start', modelElementId: INITIAL_NODE_ID, style: {}, references: {} },
      { id: 'el-action', modelElementId: ACTION_ID, style: {}, references: {} },
    ],
    connections: [],
  } as unknown as Model);

beforeEach(() => {
  (metamodelService.getMetamodelById as jest.Mock).mockReturnValue(metamodel);
});

describe('setModelElementReference with inherited references', () => {
  it('creates a flowsTo reference inherited from an abstract supertype', () => {
    const model = makeModel();
    const save = jest.fn();

    const result = modelReferenceService.setModelElementReference(
      model,
      'el-start',
      'flowsTo',
      'el-action',
      save
    );

    expect(result).toBe(true);
    expect(model.elements[0].references.flowsTo).toEqual(['el-action']);
    expect(save).toHaveBeenCalled();
  });

  it('still rejects reference names that exist nowhere in the hierarchy', () => {
    const model = makeModel();

    const result = modelReferenceService.setModelElementReference(
      model,
      'el-start',
      'notARealReference',
      'el-action',
      jest.fn()
    );

    expect(result).toBe(false);
    expect(model.elements[0].references.notARealReference).toBeUndefined();
  });
});
