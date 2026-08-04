import viewpointService from '../../services/viewpoint.service';
import smartWarehouseViewpoints from '../../examples/data/smart-warehouse-viewpoints.json';

describe('viewpoint JSON import parsing', () => {
  const metamodelId = 'metamodel-1';

  it('parses a viewpoint array and assigns representation descriptions to the imported viewpoint', () => {
    const viewpoints = viewpointService.parseViewpointsJson(JSON.stringify([
      {
        id: 'viewpoint-1',
        name: 'Operations',
        metamodelId,
        isDefault: true,
        representationDescriptions: [
          {
            id: 'representation-1',
            name: 'Floor Plan',
            kind: 'diagram',
            visibleMetaClassIds: ['Robot'],
            creatableMetaClassIds: ['Robot'],
            tableColumns: ['name', 'battery', 'name'],
            containerMappings: [
              {
                id: 'container-zone',
                containerMetaClassId: ' Zone ',
                containmentReferenceId: ' robots ',
                childMetaClassIds: ['Robot', 'Robot'],
                concreteSyntax: { two_d: { shape: 'rectangle' } },
              },
            ],
            propertySections: [
              {
                id: 'properties-robot',
                name: ' Robot details ',
                metaClassIds: ['Robot', 'Robot'],
                attributeNames: ['name', 'battery', 'battery'],
                referenceNames: ['station', 'station'],
              },
            ],
            toolDefinitions: [
              {
                id: 'tool-create',
                name: 'Create robot',
                type: 'node',
                metaClassId: 'Robot',
                payload: {
                  operations: [
                    { type: 'set-attribute', attributeName: 'battery', value: 100 },
                  ],
                },
              },
            ],
            concreteSyntaxByMetaClassId: {
              Robot: {
                two_d: {
                  shape: 'circle',
                },
              },
            },
          },
        ],
      },
    ]), metamodelId);

    expect(viewpoints).toHaveLength(1);
    expect(viewpoints[0].name).toBe('Operations');
    expect(viewpoints[0].representationDescriptions[0].viewpointId).toBe('viewpoint-1');
    expect(viewpoints[0].representationDescriptions[0].tableColumns).toEqual(['name', 'battery']);
    expect(viewpoints[0].representationDescriptions[0].containerMappings).toEqual([
      {
        id: 'container-zone',
        containerMetaClassId: 'Zone',
        containmentReferenceId: 'robots',
        childMetaClassIds: ['Robot'],
        concreteSyntax: { two_d: { shape: 'rectangle' } },
      },
    ]);
    expect(viewpoints[0].representationDescriptions[0].propertySections).toEqual([
      {
        id: 'properties-robot',
        name: 'Robot details',
        metaClassIds: ['Robot'],
        attributeNames: ['name', 'battery'],
        referenceNames: ['station'],
      },
    ]);
    expect(viewpoints[0].representationDescriptions[0].toolDefinitions).toEqual([
      expect.objectContaining({
        id: 'tool-create',
        type: 'create-node',
        payload: {
          operations: [
            { type: 'set-attribute', attributeName: 'battery', value: 100 },
          ],
        },
      }),
    ]);
    expect(viewpoints[0].representationDescriptions[0].concreteSyntaxByMetaClassId?.Robot.two_d?.shape).toBe('circle');
  });

  it('imports the Smart Warehouse example with diagram, table, and tree view types', () => {
    const viewpoints = viewpointService.parseViewpointsJson(
      JSON.stringify(smartWarehouseViewpoints),
      '10000000-0000-4000-8000-000000000100'
    );
    const operations = viewpoints.find(viewpoint => viewpoint.name === 'Warehouse Operations');

    expect(operations).toBeDefined();
    expect(new Set(operations!.representationDescriptions.map(description => description.kind)))
      .toEqual(new Set(['diagram', 'table', 'tree']));
    expect(operations!.representationDescriptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Robot Fleet Inventory', kind: 'table' }),
      expect.objectContaining({ name: 'Warehouse Resource Hierarchy', kind: 'tree' }),
      expect.objectContaining({ name: 'Aerial Inspection', kind: 'diagram' }),
    ]));

    const aerial = operations!.representationDescriptions.find(description => description.name === 'Aerial Inspection')!;
    expect(aerial.concreteSyntaxByMetaClassId?.['10000000-0000-4000-8000-00000000010c']
      .three_d?.verticalPlacement).toEqual({
        mode: 'adjustable',
        defaultBaseZMm: 3000,
        minBaseZMm: 0,
        maxBaseZMm: 10000,
        stepMm: 100,
      });
  });

  it('rejects JSON for a different metamodel', () => {
    expect(() => viewpointService.parseViewpointsJson(JSON.stringify({
      id: 'viewpoint-2',
      name: 'Wrong Language',
      metamodelId: 'other-metamodel',
      representationDescriptions: [],
    }), metamodelId)).toThrow('belongs to a different metamodel');
  });

  it('rejects tool operations that contain executable object payloads', () => {
    expect(() => viewpointService.parseViewpointsJson(JSON.stringify({
      id: 'viewpoint-unsafe',
      name: 'Unsafe',
      metamodelId,
      representationDescriptions: [
        {
          name: 'Unsafe diagram',
          kind: 'diagram',
          toolDefinitions: [
            {
              name: 'Unsafe create',
              type: 'create-node',
              payload: {
                operations: [
                  { type: 'set-attribute', attributeName: 'name', value: { expression: 'run()' } },
                ],
              },
            },
          ],
        },
      ],
    }), metamodelId)).toThrow('must be a scalar or null');
  });

  it('rejects inconsistent vertical-placement policies during JSON import', () => {
    expect(() => viewpointService.parseViewpointsJson(JSON.stringify({
      id: 'viewpoint-invalid-elevation',
      name: 'Invalid elevation',
      metamodelId,
      representationDescriptions: [{
        name: 'Invalid diagram',
        kind: 'diagram',
        concreteSyntaxByMetaClassId: {
          Drone: {
            three_d: {
              verticalPlacement: {
                mode: 'adjustable',
                defaultBaseZMm: 12000,
                minBaseZMm: 0,
                maxBaseZMm: 10000,
                stepMm: 100,
              },
            },
          },
        },
      }],
    }), metamodelId)).toThrow('defaultBaseZMm must be less than or equal to');
  });
});
