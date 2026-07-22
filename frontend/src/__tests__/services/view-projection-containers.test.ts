import { Diagram, Metamodel, Model, RepresentationDescription, Viewpoint } from '../../models/types';
import { metamodelService } from '../../services/metamodel';
import { modelService } from '../../services/model';
import { viewProjectionService } from '../../services/diagram/view-projection.service';
import viewpointService from '../../services/viewpoint.service';
import activityMetamodelFixture from '../../examples/data/activity-diagram-metamodel.json';
import activityModelFixture from '../../examples/data/activity-diagram-model.json';
import activityViewsFixture from '../../examples/data/activity-diagram-views.json';
import activityViewpointsFixture from '../../examples/data/activity-diagram-viewpoints.json';

const metamodel: Metamodel = {
  id: 'mm-containers',
  name: 'Containers',
  eClass: 'EPackage',
  uri: 'urn:containers',
  prefix: 'containers',
  conformsTo: 'ecore',
  classes: [
    {
      id: 'class-system',
      name: 'System',
      eClass: 'EClass',
      abstract: false,
      superTypes: [],
      attributes: [],
      references: [
        {
          id: 'ref-components',
          name: 'components',
          eClass: 'EReference',
          target: 'class-component',
          containment: true,
          cardinality: { lowerBound: 0, upperBound: '*' },
        },
      ],
    },
    {
      id: 'class-component',
      name: 'Component',
      eClass: 'EClass',
      abstract: false,
      superTypes: [],
      attributes: [],
      references: [],
    },
  ],
};

const model: Model = {
  id: 'model-containers',
  name: 'Contained System',
  metamodelId: metamodel.id,
  conformsTo: metamodel.id,
  elements: [
    {
      id: 'system-1',
      modelElementId: 'class-system',
      style: { name: 'System' },
      references: { components: ['component-1'] },
      presentation: { position2D: { x: 20, y: 20 } },
    },
    {
      id: 'component-1',
      modelElementId: 'class-component',
      style: { name: 'Component' },
      references: {},
      presentation: {
        position2D: { x: 900, y: 900 },
        size2D: { width: 120, height: 80 },
      },
    },
  ],
};

const representation: RepresentationDescription = {
  id: 'representation-containers',
  name: 'Container Diagram',
  viewpointId: 'viewpoint-containers',
  kind: 'diagram',
  visibleMetaClassIds: ['class-system', 'class-component'],
  creatableMetaClassIds: ['class-system', 'class-component'],
  containerMappings: [
    {
      id: 'mapping-components',
      containerMetaClassId: 'class-system',
      containmentReferenceId: 'ref-components',
      childMetaClassIds: ['class-component'],
      concreteSyntax: {
        two_d: {
          shape: 'rectangle',
          fillColor: '#dbeafe',
          defaultSize: { width: 400, height: 260 },
        },
      },
    },
  ],
};

const viewpoint: Viewpoint = {
  id: 'viewpoint-containers',
  name: 'Containers',
  metamodelId: metamodel.id,
  representationDescriptions: [representation],
};

const diagram: Diagram = {
  id: 'diagram-containers',
  name: 'Container Diagram',
  modelId: model.id,
  viewpointId: viewpoint.id,
  representationDescriptionId: representation.id,
  includedElementIds: ['system-1', 'component-1'],
  elements: [],
  schemaVersion: 2,
};

describe('view projection container mappings', () => {
  beforeEach(() => {
    jest.spyOn(modelService, 'getModelById').mockReturnValue(model);
    jest.spyOn(metamodelService, 'getMetamodelById').mockReturnValue(metamodel);
    jest.spyOn(viewpointService, 'resolveRepresentationDescription').mockReturnValue({
      viewpoint,
      representationDescription: representation,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('projects containment children inside their mapped container and hides the containment edge', () => {
    const materialized = viewProjectionService.materializeDiagram(diagram);
    const system = materialized.elements.find(element => element.id === 'system-1')!;
    const component = materialized.elements.find(element => element.id === 'component-1')!;

    expect(system).toEqual(expect.objectContaining({
      containerMappingId: 'mapping-components',
      x: 20,
      y: 20,
      width: 400,
      height: 260,
    }));
    expect(component).toEqual(expect.objectContaining({
      parentId: 'system-1',
      x: 288,
      y: 188,
      width: 120,
      height: 80,
    }));
    expect(materialized.elements.filter(element => element.type === 'edge')).toHaveLength(0);
  });

  it('renders the activity example with nodes inside both activity containers', () => {
    const activityMetamodel = activityMetamodelFixture as unknown as Metamodel;
    const activityModel = activityModelFixture as unknown as Model;
    const activityDiagram = (activityViewsFixture as unknown as Diagram[])[0];
    const activityViewpoint = (activityViewpointsFixture as unknown as Viewpoint[])[0];
    const activityRepresentation = activityViewpoint.representationDescriptions[0];

    jest.spyOn(modelService, 'getModelById').mockReturnValue(activityModel);
    jest.spyOn(metamodelService, 'getMetamodelById').mockReturnValue(activityMetamodel);
    jest.spyOn(viewpointService, 'resolveRepresentationDescription').mockReturnValue({
      viewpoint: activityViewpoint,
      representationDescription: activityRepresentation,
    });

    const materialized = viewProjectionService.materializeDiagram(activityDiagram);
    const orderProcessing = materialized.elements.find(element => (
      element.id === 'a2200000-0000-4000-8000-000000000001'
    ));
    const start = materialized.elements.find(element => (
      element.id === 'a2200000-0000-4000-8000-000000000010'
    ));
    const shipping = materialized.elements.find(element => (
      element.id === 'a2200000-0000-4000-8000-0000000000e0'
    ));
    const prepareShipment = materialized.elements.find(element => (
      element.id === 'a2200000-0000-4000-8000-000000000100'
    ));

    expect(orderProcessing).toEqual(expect.objectContaining({
      containerMappingId: 'a4400000-0000-4000-8000-000000000401',
      width: 1490,
      height: 360,
    }));
    expect(start?.parentId).toBe(orderProcessing?.id);
    expect(shipping).toEqual(expect.objectContaining({
      containerMappingId: 'a4400000-0000-4000-8000-000000000401',
      width: 740,
      height: 150,
    }));
    expect(prepareShipment?.parentId).toBe(shipping?.id);
    expect(materialized.elements.some(element => element.style?.name === 'containsNodes')).toBe(false);
  });
});
