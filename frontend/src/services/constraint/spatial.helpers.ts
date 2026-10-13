import { ModelElement } from '../../models/types';
import {
  elementBox,
  normalizePosition3D,
  planEnvelope,
  planGap,
  planOverlap,
  volumeGap,
  volumeOverlap,
} from '../spatial';

/**
 * Spatial presentation fields exposed to constraint evaluation contexts.
 *
 * Placement is persisted on element.presentation, not element.style
 * (diagram.service strips spatial keys from style updates), so without
 * this, JS/OCL constraints could never read position, size, or rotation.
 * Constraint contexts spread these fields after semantic style data so the
 * canonical presentation record remains authoritative over any unmigrated
 * legacy `style.position3D` value.
 */
export function spatialContextFields(element: ModelElement): Record<string, any> {
  const presentation = element.presentation;
  if (!presentation) return {};

  const fields: Record<string, any> = {};
  if (presentation.position2D) fields.position2D = presentation.position2D;
  if (presentation.position3D) fields.position3D = normalizePosition3D(presentation.position3D);
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

/**
 * Axis-aligned 3D bounds in domain coordinates and millimeters.
 * Z is a base elevation, so the vertical interval is [z, z + depthMm].
 */
export interface SpatialBounds3D extends SpatialBounds {
  minZ: number;
  maxZ: number;
}

// The predicates below honour rotationZ: each element is the oriented
// rectangle widthMm x heightMm centred on position3D and turned by its yaw
// (counter-clockwise seen from above), extruded over [z, z + depthMm].
// boundsOf and bounds3DOf return the axis-aligned envelope of that rotated
// footprint, which is useful as an envelope but not for exact tests.

/**
 * Axis-aligned envelope of the element's rotated footprint.
 * Returns undefined if position3D or size3D is missing.
 */
export function boundsOf(element: ModelElement): SpatialBounds | undefined {
  const box = elementBox(element);
  return box ? planEnvelope(box) : undefined;
}

/**
 * Axis-aligned envelope of the element's rotated volume. The persisted
 * elevation is the object's base, so the vertical interval is [z, z + depthMm].
 */
export function bounds3DOf(element: ModelElement): SpatialBounds3D | undefined {
  const box = elementBox(element);
  return box ? { ...planEnvelope(box), minZ: box.minZ, maxZ: box.maxZ } : undefined;
}

/**
 * True if the two elements' rotated footprints intersect in plan view.
 * Touching edges do not count as overlapping.
 */
export function overlaps(a: ModelElement, b: ModelElement): boolean {
  const boxA = elementBox(a);
  const boxB = elementBox(b);
  return Boolean(boxA && boxB && planOverlap(boxA, boxB));
}

/** True when the two rotated volumes overlap. Touching faces do not overlap. */
export function overlaps3D(a: ModelElement, b: ModelElement): boolean {
  const boxA = elementBox(a);
  const boxB = elementBox(b);
  return Boolean(boxA && boxB && volumeOverlap(boxA, boxB));
}

/**
 * Plan-view gap between the two rotated footprints. Zero when they overlap or touch.
 * Returns Infinity if either element is missing bounds data.
 */
export function clearance(a: ModelElement, b: ModelElement): number {
  const boxA = elementBox(a);
  const boxB = elementBox(b);
  return boxA && boxB ? planGap(boxA, boxB) : Infinity;
}

/**
 * Euclidean gap between two rotated volumes: sqrt(planGap^2 + verticalGap^2).
 * Returns zero for overlap/touching and Infinity when either element has no
 * spatial volume.
 */
export function clearance3D(a: ModelElement, b: ModelElement): number {
  const boxA = elementBox(a);
  const boxB = elementBox(b);
  return boxA && boxB ? volumeGap(boxA, boxB) : Infinity;
}
