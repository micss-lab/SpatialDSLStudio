import { concreteSyntaxResolver } from '../../services/diagram/concrete-syntax.resolver';
import {
  Metamodel,
  ModelElement,
  RepresentationDescription,
  Viewpoint,
} from '../../models/types';

const element: ModelElement = {
  id: 'drone-1',
  modelElementId: 'drone',
  style: { name: 'Drone' },
  references: {},
};

const metamodel = {
  id: 'warehouse',
  name: 'Warehouse',
  classes: [{
    id: 'drone',
    name: 'InspectionDrone',
    attributes: [],
    references: [],
    superTypes: [],
    concreteSyntax: {
      three_d: {
        verticalPlacement: { mode: 'adjustable', defaultBaseZMm: 1000 },
      },
    },
  }],
} as unknown as Metamodel;

describe('vertical placement resolution', () => {
  it('defaults missing policy to grounded', () => {
    const plainMetamodel = {
      ...metamodel,
      classes: [{ ...metamodel.classes[0], concreteSyntax: undefined }],
    } as Metamodel;

    expect(concreteSyntaxResolver.resolve3D(element, plainMetamodel).verticalPlacement)
      .toEqual({ mode: 'grounded' });
  });

  it('resolves inherited, viewpoint, representation, then instance policy priority', () => {
    const viewpoint = {
      id: 'viewpoint',
      name: 'Operations',
      metamodelId: 'warehouse',
      representationDescriptions: [],
      sharedConcreteSyntaxByMetaClassId: {
        drone: { three_d: { verticalPlacement: { mode: 'adjustable', defaultBaseZMm: 2000 } } },
      },
    } as unknown as Viewpoint;
    const representation = {
      id: 'aerial',
      viewpointId: 'viewpoint',
      name: 'Aerial',
      kind: 'diagram',
      concreteSyntaxByMetaClassId: {
        drone: {
          three_d: {
            verticalPlacement: {
              mode: 'adjustable',
              defaultBaseZMm: 3000,
              minBaseZMm: 0,
              maxBaseZMm: 10000,
              stepMm: 100,
            },
          },
        },
      },
    } as unknown as RepresentationDescription;

    expect(concreteSyntaxResolver.resolve3D(element, metamodel, representation, viewpoint).verticalPlacement)
      .toEqual({
        mode: 'adjustable',
        defaultBaseZMm: 3000,
        minBaseZMm: 0,
        maxBaseZMm: 10000,
        stepMm: 100,
      });

    const instance = {
      ...element,
      presentation: {
        appearance: { verticalPlacement: { mode: 'grounded' } },
      },
    } as ModelElement;
    expect(concreteSyntaxResolver.resolve3D(instance, metamodel, representation, viewpoint).verticalPlacement)
      .toEqual({ mode: 'grounded' });
  });
});
