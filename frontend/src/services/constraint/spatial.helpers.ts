import { ModelElement } from '../../models/types';

/**
 * Spatial presentation fields exposed to constraint evaluation contexts.
 *
 * Placement is persisted on element.presentation, not element.style
 * (diagram.service strips spatial keys from style updates), so without
 * this, JS/OCL constraints could never read position, size, or rotation.
 * Spread BEFORE element.style: explicit style values take precedence,
 * presentation is the fallback (the contract pinned by
 * js-sandbox-presentation.test.ts).
 */
export function spatialContextFields(element: ModelElement): Record<string, any> {
  const presentation = element.presentation;
  if (!presentation) return {};

  const fields: Record<string, any> = {};
  if (presentation.position2D) fields.position2D = presentation.position2D;
  if (presentation.position3D) fields.position3D = presentation.position3D;
  if (presentation.size2D) fields.size2D = presentation.size2D;
  if (presentation.size3D) fields.size3D = presentation.size3D;
  if (typeof presentation.rotationZ === 'number') fields.rotationZ = presentation.rotationZ;
  return fields;
}

/**
 * Axis-aligned bounding box in millimeters, in the same coordinate space as position3D.
 */
export interface SpatialBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// rotationZ is intentionally ignored by boundsOf/overlaps/clearance below: these
// helpers work on axis-aligned boxes (AABB) only. Rotated-bounds support can
// follow once the coordinate contract this builds on has settled further.

/**
 * Axis-aligned bounding box for an element, centered on its position3D.
 * Returns undefined if position3D or size3D is missing.
 */
export function boundsOf(element: ModelElement): SpatialBounds | undefined {
  const position3D = element.presentation?.position3D;
  const size3D = element.presentation?.size3D;
  if (!position3D || !size3D) return undefined;

  const halfWidth = size3D.widthMm / 2;
  const halfHeight = size3D.heightMm / 2;
  return {
    minX: position3D.x - halfWidth,
    minY: position3D.y - halfHeight,
    maxX: position3D.x + halfWidth,
    maxY: position3D.y + halfHeight,
  };
}

/**
 * True if the two elements' AABBs intersect. Touching edges do not count as overlapping.
 */
export function overlaps(a: ModelElement, b: ModelElement): boolean {
  const boxA = boundsOf(a);
  const boxB = boundsOf(b);
  if (!boxA || !boxB) return false;

  return (
    boxA.minX < boxB.maxX &&
    boxA.maxX > boxB.minX &&
    boxA.minY < boxB.maxY &&
    boxA.maxY > boxB.minY
  );
}

/**
 * Gap distance between the two elements' AABBs. Zero when they overlap or touch.
 * Returns Infinity if either element is missing bounds data.
 */
export function clearance(a: ModelElement, b: ModelElement): number {
  const boxA = boundsOf(a);
  const boxB = boundsOf(b);
  if (!boxA || !boxB) return Infinity;

  const dx = Math.max(boxA.minX - boxB.maxX, boxB.minX - boxA.maxX, 0);
  const dy = Math.max(boxA.minY - boxB.maxY, boxB.minY - boxA.maxY, 0);
  return Math.sqrt(dx * dx + dy * dy);
}
