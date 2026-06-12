import { groupByParent, getParentGroupColor, UNKNOWN_PARENT_ID } from '../../services/common/grouping.service';

describe('grouping service', () => {
  it('groups resources by parent and sorts groups by parent name', () => {
    const resources = [
      { id: 'model-1', parentId: 'meta-b' },
      { id: 'model-2', parentId: 'meta-a' },
      { id: 'model-3', parentId: 'meta-b' },
    ];

    const groups = groupByParent(
      resources,
      resource => resource.parentId,
      parentId => parentId === 'meta-a' ? 'Alpha' : 'Beta'
    );

    expect(groups.map(group => group.parentName)).toEqual(['Alpha', 'Beta']);
    expect(groups[0].items.map(resource => resource.id)).toEqual(['model-2']);
    expect(groups[1].items.map(resource => resource.id)).toEqual(['model-1', 'model-3']);
  });

  it('uses a stable fallback group for missing parents', () => {
    const groups = groupByParent(
      [{ id: 'orphan', parentId: undefined }],
      resource => resource.parentId,
      parentId => parentId === UNKNOWN_PARENT_ID ? 'Unknown parent' : parentId
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].parentId).toBe(UNKNOWN_PARENT_ID);
    expect(groups[0].color).toBe(getParentGroupColor(UNKNOWN_PARENT_ID));
  });
});
