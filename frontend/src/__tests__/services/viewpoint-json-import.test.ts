import viewpointService from '../../services/viewpoint.service';

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
});
