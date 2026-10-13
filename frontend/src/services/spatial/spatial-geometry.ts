import { ModelElement, Position3D, Size3D } from '../../models/types';
import { isFiniteNumber, normalizePosition3D } from './spatial-presentation';

// Mirrored by shared/spatial-geometry.ts (backend) and
// frontend/src/services/spatial/spatial-geometry.ts. Keep both copies
// identical below the import block; a parity test enforces it.

/**
 * Oriented geometry for placed model elements.
 *
 * Domain frame: right-handed, Z up, millimetres. `position3D.x/y` is the
 * plan-view centre and `position3D.z` the base elevation. `size3D.widthMm`
 * runs along the element's local X axis, `heightMm` along its local Y axis,
 * and `depthMm` is the vertical extent. `rotationZ` is yaw in degrees about
 * +Z; positive values turn counter-clockwise seen from above, the same sign
 * the 3D editor and OpenUSD `xformOp:rotateZ` use.
 *
 * An element therefore occupies a vertical prism: an oriented rectangle in
 * plan view extruded over `[z, z + depthMm]`.
 */

export interface PlanPoint {
  x: number;
  y: number;
}

export interface PlanBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface OrientedBox {
  center: PlanPoint;
  halfWidth: number;
  halfHeight: number;
  rotationZ: number;
  /** Unit vector of the local X axis in the domain frame. */
  axisX: PlanPoint;
  /** Unit vector of the local Y axis in the domain frame. */
  axisY: PlanPoint;
  /** Plan-view corners, counter-clockwise from local (-w/2, -h/2). */
  corners: PlanPoint[];
  minZ: number;
  maxZ: number;
}

/** Tolerance in millimetres that absorbs floating-point noise from rotation. */
export const GEOMETRY_EPSILON_MM = 1e-6;

const rotationAxes = (rotationZ: number): { cos: number; sin: number } => {
  const normalized = ((rotationZ % 360) + 360) % 360;
  // Exact quarter turns keep axis-aligned layouts free of rounding noise.
  if (normalized === 0) return { cos: 1, sin: 0 };
  if (normalized === 90) return { cos: 0, sin: 1 };
  if (normalized === 180) return { cos: -1, sin: 0 };
  if (normalized === 270) return { cos: 0, sin: -1 };
  const radians = (normalized * Math.PI) / 180;
  return { cos: Math.cos(radians), sin: Math.sin(radians) };
};

export function isValidSize3D(value: unknown): value is Size3D {
  if (!value || typeof value !== 'object') return false;
  const size = value as Record<string, unknown>;
  return ['widthMm', 'heightMm', 'depthMm'].every(field => (
    isFiniteNumber(size[field]) && (size[field] as number) >= 0
  ));
}

export function orientedBox(position: Position3D, size: Size3D, rotationZ = 0): OrientedBox {
  const { cos, sin } = rotationAxes(rotationZ);
  const halfWidth = size.widthMm / 2;
  const halfHeight = size.heightMm / 2;
  const axisX = { x: cos, y: sin };
  const axisY = { x: -sin, y: cos };
  const corner = (u: number, v: number): PlanPoint => ({
    x: position.x + axisX.x * u + axisY.x * v,
    y: position.y + axisX.y * u + axisY.y * v,
  });
  return {
    center: { x: position.x, y: position.y },
    halfWidth,
    halfHeight,
    rotationZ,
    axisX,
    axisY,
    corners: [
      corner(-halfWidth, -halfHeight),
      corner(halfWidth, -halfHeight),
      corner(halfWidth, halfHeight),
      corner(-halfWidth, halfHeight),
    ],
    minZ: position.z,
    maxZ: position.z + size.depthMm,
  };
}

/**
 * Oriented box for an element's persisted presentation. `fallbackSize` is
 * used when the element has no valid `size3D` of its own. Returns undefined
 * when the pose or the extents cannot be resolved.
 */
export function elementBox(element: ModelElement, fallbackSize?: Size3D): OrientedBox | undefined {
  const presentation = element.presentation;
  const position = normalizePosition3D(presentation?.position3D);
  if (!position) return undefined;
  const size = isValidSize3D(presentation?.size3D) ? presentation!.size3D! : fallbackSize;
  if (!size || !isValidSize3D(size)) return undefined;
  const rotationZ = isFiniteNumber(presentation?.rotationZ) ? presentation!.rotationZ! : 0;
  return orientedBox(position, size, rotationZ);
}

/** Axis-aligned envelope of the rotated plan-view footprint. */
export function planEnvelope(box: OrientedBox): PlanBounds {
  const xs = box.corners.map(point => point.x);
  const ys = box.corners.map(point => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

const dot = (a: PlanPoint, b: PlanPoint): number => a.x * b.x + a.y * b.y;

const projectedRadius = (box: OrientedBox, axis: PlanPoint): number => (
  box.halfWidth * Math.abs(dot(box.axisX, axis)) + box.halfHeight * Math.abs(dot(box.axisY, axis))
);

/**
 * Separating-axis test on the two plan-view footprints. Interiors must
 * intersect: footprints that only touch along an edge or at a corner do not
 * overlap.
 */
export function planOverlap(a: OrientedBox, b: OrientedBox): boolean {
  const offset = { x: b.center.x - a.center.x, y: b.center.y - a.center.y };
  const axes = [a.axisX, a.axisY, b.axisX, b.axisY];
  for (let index = 0; index < axes.length; index += 1) {
    const axis = axes[index];
    const distance = Math.abs(dot(offset, axis));
    if (distance >= projectedRadius(a, axis) + projectedRadius(b, axis) - GEOMETRY_EPSILON_MM) {
      return false;
    }
  }
  return true;
}

/** True when the vertical intervals share more than a touching face. */
export function verticalOverlap(a: OrientedBox, b: OrientedBox): boolean {
  return a.minZ < b.maxZ - GEOMETRY_EPSILON_MM && b.minZ < a.maxZ - GEOMETRY_EPSILON_MM;
}

/** Volume overlap: plan footprints and vertical intervals both overlap. */
export function volumeOverlap(a: OrientedBox, b: OrientedBox): boolean {
  return verticalOverlap(a, b) && planOverlap(a, b);
}

const pointSegmentDistance = (point: PlanPoint, start: PlanPoint, end: PlanPoint): number => {
  const segment = { x: end.x - start.x, y: end.y - start.y };
  const lengthSquared = dot(segment, segment);
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, dot({ x: point.x - start.x, y: point.y - start.y }, segment) / lengthSquared));
  const dx = point.x - (start.x + segment.x * t);
  const dy = point.y - (start.y + segment.y * t);
  return Math.sqrt(dx * dx + dy * dy);
};

const cornersToEdgesDistance = (from: OrientedBox, to: OrientedBox): number => {
  let minimum = Infinity;
  from.corners.forEach(point => {
    to.corners.forEach((start, index) => {
      const end = to.corners[(index + 1) % to.corners.length];
      minimum = Math.min(minimum, pointSegmentDistance(point, start, end));
    });
  });
  return minimum;
};

/**
 * Minimum plan-view distance between the two footprints; 0 when they
 * overlap or touch. For disjoint convex polygons the minimum is reached
 * between a corner of one and an edge of the other.
 */
export function planGap(a: OrientedBox, b: OrientedBox): number {
  if (planOverlap(a, b)) return 0;
  const gap = Math.min(cornersToEdgesDistance(a, b), cornersToEdgesDistance(b, a));
  return gap < GEOMETRY_EPSILON_MM ? 0 : gap;
}

/** Distance between the vertical intervals; 0 when they overlap or touch. */
export function verticalGap(a: OrientedBox, b: OrientedBox): number {
  return Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ, 0);
}

/**
 * Exact distance between the two prisms: the plan-view gap and the vertical
 * gap are independent, so the 3D gap is sqrt(planGap^2 + verticalGap^2).
 */
export function volumeGap(a: OrientedBox, b: OrientedBox): number {
  const plan = planGap(a, b);
  const vertical = verticalGap(a, b);
  return Math.sqrt(plan * plan + vertical * vertical);
}

/** Centre-to-centre distance in plan view. */
export function planCenterDistance(a: OrientedBox, b: OrientedBox): number {
  const dx = a.center.x - b.center.x;
  const dy = a.center.y - b.center.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance between the volume centres (plan centre at mid elevation). */
export function volumeCenterDistance(a: OrientedBox, b: OrientedBox): number {
  const plan = planCenterDistance(a, b);
  const dz = (a.minZ + a.maxZ) / 2 - (b.minZ + b.maxZ) / 2;
  return Math.sqrt(plan * plan + dz * dz);
}

/**
 * True when every corner of `inner` lies inside `outer`'s footprint shrunk
 * by `marginMm` on each side. Boundary contact counts as inside. A margin
 * larger than half of the outer footprint leaves no room for anything.
 */
export function planContains(outer: OrientedBox, inner: OrientedBox, marginMm = 0): boolean {
  const limitX = outer.halfWidth - marginMm;
  const limitY = outer.halfHeight - marginMm;
  if (limitX < -GEOMETRY_EPSILON_MM || limitY < -GEOMETRY_EPSILON_MM) return false;
  return inner.corners.every(point => {
    const offset = { x: point.x - outer.center.x, y: point.y - outer.center.y };
    return Math.abs(dot(offset, outer.axisX)) <= limitX + GEOMETRY_EPSILON_MM
      && Math.abs(dot(offset, outer.axisY)) <= limitY + GEOMETRY_EPSILON_MM;
  });
}

/** True when `inner`'s vertical interval lies inside `outer`'s. */
export function verticalContains(outer: OrientedBox, inner: OrientedBox): boolean {
  return inner.minZ >= outer.minZ - GEOMETRY_EPSILON_MM && inner.maxZ <= outer.maxZ + GEOMETRY_EPSILON_MM;
}
