export interface ParentGroup<T> {
  parentId: string;
  parentName: string;
  color: string;
  items: T[];
}

export const UNKNOWN_PARENT_ID = '__unknown_parent__';

const parentGroupColors = [
  '#2563eb',
  '#059669',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#ca8a04',
  '#c2410c',
  '#be123c',
  '#4f46e5',
  '#15803d',
];

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

export const getParentGroupColor = (parentId?: string | null): string => {
  if (!parentId || parentId === UNKNOWN_PARENT_ID) return '#667085';
  return parentGroupColors[hashString(parentId) % parentGroupColors.length];
};

export const getParentGroupSurfaceColor = (parentId?: string | null): string => (
  `${getParentGroupColor(parentId)}14`
);

export const groupByParent = <T>(
  items: T[],
  getParentId: (item: T) => string | null | undefined,
  getParentName: (parentId: string, item: T) => string
): ParentGroup<T>[] => {
  const groups = new Map<string, ParentGroup<T>>();

  items.forEach(item => {
    const parentId = getParentId(item) || UNKNOWN_PARENT_ID;
    const existing = groups.get(parentId);
    if (existing) {
      existing.items.push(item);
      return;
    }

    groups.set(parentId, {
      parentId,
      parentName: getParentName(parentId, item),
      color: getParentGroupColor(parentId),
      items: [item],
    });
  });

  return Array.from(groups.values()).sort((left, right) => (
    left.parentName.localeCompare(right.parentName)
  ));
};
