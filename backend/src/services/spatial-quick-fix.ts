import { Metamodel, Model, ModelElement, Position3D, SpatialQuickFixRequest, SpatialRule, ValidationIssue } from '../../../shared/types';
import { evaluateSpatialRules, defaultSizeForClass, isSubtype } from '../../../shared/spatial-rules';
import {
  GEOMETRY_EPSILON_MM, OrientedBox, PlanPoint, elementBox, planContains, planGap, planOverlap, verticalContains, verticalGap,
} from '../../../shared/spatial-geometry';
import { normalizePosition3D } from '../../../shared/spatial';

type Pose = Required<Position3D>;

type Plan = {
  ruleName: string;
  elementName: string;
  targetElementName?: string;
  before: Pose;
  after: Pose;
  clearedIssues: number;
};

const SEPARATION_BUFFER_MM = 0.01;
const dot = (a: PlanPoint, b: PlanPoint) => a.x * b.x + a.y * b.y;
const radius = (box: OrientedBox, direction: PlanPoint) => (
  box.halfWidth * Math.abs(dot(box.axisX, direction)) + box.halfHeight * Math.abs(dot(box.axisY, direction))
);
const subtract = (to: PlanPoint, from: PlanPoint): PlanPoint => ({ x: to.x - from.x, y: to.y - from.y });
const moveAlong = (point: PlanPoint, direction: PlanPoint, distance: number): PlanPoint => ({
  x: point.x + direction.x * distance, y: point.y + direction.y * distance,
});
const lengthOf = (vector: PlanPoint) => Math.hypot(vector.x, vector.y);
const nameOf = (element: ModelElement) => String(element.name || element.style?.name || element.id);

const issueKey = (issue: ValidationIssue) => JSON.stringify([
  issue.constraintId, [issue.elementId, ...(issue.relatedElementIds || [])].filter(Boolean).sort(),
]);

function translatedBox(box: OrientedBox, direction: PlanPoint, distance: number): OrientedBox {
  const dx = direction.x * distance;
  const dy = direction.y * distance;
  return {
    ...box,
    center: { x: box.center.x + dx, y: box.center.y + dy },
    corners: box.corners.map(point => ({ x: point.x + dx, y: point.y + dy })),
  };
}

function candidateMoves(moving: OrientedBox, fixed: OrientedBox, clearance: number | undefined, volume: boolean) {
  const axes = [moving.axisX, moving.axisY, fixed.axisX, fixed.axisY];
  const offset = subtract(moving.center, fixed.center);
  const length = lengthOf(offset);
  if (length > 0 && Number.isFinite(length)) axes.push({ x: offset.x / length, y: offset.y / length });
  const vertical = volume ? verticalGap(moving, fixed) : 0;
  const requiredPlanGap = clearance && vertical < clearance
    ? clearance * Math.sqrt(1 - (vertical / clearance) ** 2) : 0;

  const directions = axes.flatMap(axis => [axis, { x: -axis.x, y: -axis.y }]);
  return directions.filter((direction, index) => directions.findIndex(candidate => (
    Math.abs(candidate.x - direction.x) < 1e-9 && Math.abs(candidate.y - direction.y) < 1e-9
  )) === index).flatMap(direction => {
    // A sufficient bound from the separating-axis projection. Refine it against
    // exact geometry because a corner can clear the other box before this bound.
    let upper = radius(moving, direction) + radius(fixed, direction) + requiredPlanGap
      - dot(offset, direction) + SEPARATION_BUFFER_MM;
    if (!Number.isFinite(upper) || upper <= 0) return [];
    let lower = 0;
    for (let step = 0; step < 32 && upper - lower > SEPARATION_BUFFER_MM; step += 1) {
      const distance = lower + (upper - lower) / 2;
      const shifted = translatedBox(moving, direction, distance);
      const resolved = clearance === undefined ? !planOverlap(shifted, fixed)
        : Math.hypot(planGap(shifted, fixed), vertical) >= clearance;
      if (resolved) upper = distance;
      else lower = distance;
    }
    return [{ direction, distance: upper + SEPARATION_BUFFER_MM }];
  }).sort((left, right) => left.distance - right.distance);
}

function containmentPositions(moving: OrientedBox, target: OrientedBox, margin: number, volume: boolean): PlanPoint[] {
  if (volume && !verticalContains(target, moving)) return [];
  const limitX = target.halfWidth - margin - radius(moving, target.axisX);
  const limitY = target.halfHeight - margin - radius(moving, target.axisY);
  if (limitX < -GEOMETRY_EPSILON_MM || limitY < -GEOMETRY_EPSILON_MM) return [];
  const halfX = Math.max(0, limitX);
  const halfY = Math.max(0, limitY);
  const offset = subtract(moving.center, target.center);
  const nearestX = Math.max(-halfX, Math.min(halfX, dot(offset, target.axisX)));
  const nearestY = Math.max(-halfY, Math.min(halfY, dot(offset, target.axisY)));
  // Try the closest fit, center, and corners of the region available to the center.
  return [[nearestX, nearestY], [0, 0], [-halfX, -halfY], [-halfX, halfY], [halfX, -halfY], [halfX, halfY]]
    .map(([x, y]) => moveAlong(moveAlong(target.center, target.axisX, x), target.axisY, y));
}

function horizontalAllowance(distance: number, vertical: number): number | undefined {
  if (vertical > distance + GEOMETRY_EPSILON_MM) return undefined;
  if (distance <= vertical) return 0;
  return distance * Math.sqrt(1 - (vertical / distance) ** 2);
}

function distancePositions(moving: OrientedBox, target: OrientedBox, allowance: number): PlanPoint[] {
  if (allowance === 0) return [target.center];
  const offset = subtract(moving.center, target.center);
  const offsetLength = lengthOf(offset);
  if (!Number.isFinite(offsetLength) || offsetLength === 0) return [target.center];
  const radial = { x: offset.x / offsetLength, y: offset.y / offsetLength };
  const tangent = { x: -radial.y, y: radial.x };
  return [
    moveAlong(target.center, radial, allowance),
    moveAlong(target.center, tangent, allowance),
    moveAlong(target.center, tangent, -allowance),
    moveAlong(target.center, radial, -allowance),
    target.center,
  ];
}

function closestOnSegment(point: PlanPoint, start: PlanPoint, end: PlanPoint): PlanPoint {
  const edge = subtract(end, start);
  const length = dot(edge, edge);
  const offset = length === 0 ? 0 : Math.max(0, Math.min(1, dot(subtract(point, start), edge) / length));
  return moveAlong(start, edge, offset);
}

function adjacencyPositions(moving: OrientedBox, target: OrientedBox, allowedGap: number): PlanPoint[] {
  const positions: PlanPoint[] = [];
  const approach = (from: PlanPoint, to: PlanPoint) => {
    const offset = subtract(to, from);
    const gap = lengthOf(offset);
    if (Number.isFinite(gap) && gap > allowedGap) positions.push(moveAlong(moving.center, offset, 1 - allowedGap / gap));
  };
  // A closest pair of points on disjoint rectangles includes a corner and an
  // edge. Try both directions so rotated rectangles can meet at the right face.
  moving.corners.forEach((point, index) => {
    const next = moving.corners[(index + 1) % moving.corners.length];
    target.corners.forEach((targetPoint, targetIndex) => {
      approach(point, closestOnSegment(point, targetPoint, target.corners[(targetIndex + 1) % target.corners.length]));
      approach(closestOnSegment(targetPoint, point, next), targetPoint);
    });
  });
  return positions;
}

function relationshipPositions(rule: SpatialRule, moving: OrientedBox, target: OrientedBox): PlanPoint[] {
  const volume = rule.mode !== 'plan';
  const distance = rule.distanceMm ?? 0;
  if (rule.kind === 'within') {
    return containmentPositions(moving, target, distance, volume).filter(position => (
      planContains(target, translatedBox(moving, subtract(position, moving.center), 1), distance)
    ));
  }
  if (rule.kind === 'maxDistance') {
    const vertical = volume ? Math.abs((moving.minZ + moving.maxZ) / 2 - (target.minZ + target.maxZ) / 2) : 0;
    const allowance = horizontalAllowance(distance, vertical);
    return allowance === undefined ? [] : distancePositions(moving, target, allowance).filter(position => (
      Math.hypot(lengthOf(subtract(position, target.center)), vertical) <= distance + GEOMETRY_EPSILON_MM
    ));
  }
  const vertical = volume ? verticalGap(moving, target) : 0;
  const allowance = horizontalAllowance(distance, vertical);
  return allowance === undefined ? [] : adjacencyPositions(moving, target, allowance).filter(position => {
    const translated = translatedBox(moving, subtract(position, moving.center), 1);
    return Math.hypot(planGap(translated, target), vertical) <= distance + GEOMETRY_EPSILON_MM;
  });
}

/** Propose one horizontal placement change using the model's exact spatial rules. */
export function planSpatialQuickFix(
  metamodel: Metamodel, model: Model, request: SpatialQuickFixRequest
): { status: 'ready'; plan: Plan } | { status: 'stale' | 'unavailable' } {
  const rule = metamodel.spatialRules?.find(candidate => candidate?.id === request.ruleId);
  if (!rule || rule.enabled === false) return { status: 'stale' };
  const paired = rule.kind === 'noOverlap' || rule.kind === 'minClearance';
  const pair = [request.elementId, request.relatedElementId];
  if (paired) {
    if (!request.relatedElementId || pair[0] === pair[1] || !pair.includes(request.moveElementId)) return { status: 'stale' };
  } else if (request.relatedElementId || request.moveElementId !== request.elementId) return { status: 'stale' };

  const moving = model.elements.find(element => element.id === request.moveElementId);
  const before = normalizePosition3D(moving?.presentation?.position3D);
  if (!moving || !before) return { status: 'stale' };

  // Only rules involving the moving class can change verdicts. Recheck all
  // instances of those rules, including elements outside the active view.
  const affected = { ...metamodel, spatialRules: metamodel.spatialRules?.filter(candidate => candidate && (
    isSubtype(metamodel, moving.modelElementId, candidate.sourceClassId)
    || isSubtype(metamodel, moving.modelElementId, candidate.targetClassId)
  )) };
  const baseline = new Set(evaluateSpatialRules(affected, model, moving.id).map(issueKey));
  const selected = issueKey({
    severity: rule.severity, message: '', constraintId: rule.id, elementId: request.elementId,
    relatedElementIds: request.relatedElementId ? [request.relatedElementId] : undefined,
  });
  if (!baseline.has(selected)) return { status: 'stale' };

  if (moving.presentation?.attachedToElementId || model.elements.some(element => element.presentation?.attachedToElementId === moving.id)) {
    return { status: 'unavailable' };
  }
  const box = (element: ModelElement) => elementBox(element, defaultSizeForClass(metamodel, element.modelElementId));
  const movingBox = box(moving);
  if (!movingBox) return { status: 'stale' };

  let candidates: Array<{ position: PlanPoint; target?: ModelElement }>;
  if (paired) {
    const other = model.elements.find(element => element.id !== moving.id && pair.includes(element.id));
    const otherBox = other && box(other);
    if (!otherBox) return { status: 'stale' };
    const clearance = rule.kind === 'minClearance' ? rule.distanceMm : undefined;
    candidates = candidateMoves(movingBox, otherBox, clearance, rule.mode !== 'plan').map(({ direction, distance }) => ({
      position: moveAlong(before, direction, distance),
    }));
  } else {
    candidates = model.elements.flatMap(target => {
      if (target.id === moving.id || !isSubtype(metamodel, target.modelElementId, rule.targetClassId)) return [];
      const targetBox = box(target);
      return targetBox ? relationshipPositions(rule, movingBox, targetBox).map(position => ({ position, target })) : [];
    }).sort((left, right) => lengthOf(subtract(left.position, before)) - lengthOf(subtract(right.position, before)));
  }

  const checked = new Set<string>();
  for (const { position, target } of candidates) {
    const after = { ...position, z: before.z };
    if (!Number.isFinite(after.x) || !Number.isFinite(after.y)) continue;
    const coordinates = `${after.x},${after.y}`;
    if (checked.has(coordinates)) continue;
    checked.add(coordinates);
    const candidate = {
      ...model,
      elements: model.elements.map(element => element === moving
        ? { ...element, presentation: { ...element.presentation, position3D: after } } : element),
    };
    const remaining = new Set(evaluateSpatialRules(affected, candidate, moving.id).map(issueKey));
    if (remaining.has(selected) || [...remaining].some(key => !baseline.has(key))) continue;
    return { status: 'ready', plan: {
      ruleName: rule.name,
      elementName: nameOf(moving),
      ...(target && { targetElementName: nameOf(target) }),
      before,
      after,
      clearedIssues: baseline.size - remaining.size,
    } };
  }
  return { status: 'unavailable' };
}
