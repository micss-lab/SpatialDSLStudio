import type { Object3D } from 'three';

/**
 * Whether a pointer hit belongs to an element: the hit object is one of the
 * element's roots or lies below one. A hit on an asset lands on a mesh nested
 * inside the loaded model, not on the element's own mesh or a direct child.
 */
export const isHitWithin = (
  object: Object3D | null | undefined,
  roots: Array<Object3D | null | undefined>
): boolean => {
  for (let current = object; current; current = current.parent) {
    if (roots.includes(current)) return true;
  }
  return false;
};
