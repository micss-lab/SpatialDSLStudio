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
});
