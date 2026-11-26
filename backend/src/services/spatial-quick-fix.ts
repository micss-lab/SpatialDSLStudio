import { Metamodel, Model, ModelElement, Position3D, SpatialQuickFixRequest, ValidationIssue } from '../../../shared/types';
import { evaluateSpatialRules, defaultSizeForClass, isSubtype } from '../../../shared/spatial-rules';
import { OrientedBox, PlanPoint, elementBox, planGap, planOverlap, verticalGap } from '../../../shared/spatial-geometry';
import { normalizePosition3D } from '../../../shared/spatial';

type Pose = Required<Position3D>;

type Plan = {
  ruleName: string;
  elementName: string;
  before: Pose;
  after: Pose;
  clearedIssues: number;
};

const SEPARATION_BUFFER_MM = 0.01;
const dot = (a: PlanPoint, b: PlanPoint) => a.x * b.x + a.y * b.y;
const radius = (box: OrientedBox, direction: PlanPoint) => (
  box.halfWidth * Math.abs(dot(box.axisX, direction)) + box.halfHeight * Math.abs(dot(box.axisY, direction))
);

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
  const offset = { x: moving.center.x - fixed.center.x, y: moving.center.y - fixed.center.y };
  const length = Math.hypot(offset.x, offset.y);
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

/** Propose one horizontal placement change using the model's exact spatial rules. */
export function planSpatialQuickFix(
  metamodel: Metamodel, model: Model, request: SpatialQuickFixRequest
): { status: 'ready'; plan: Plan } | { status: 'stale' | 'unavailable' } {
  const rule = metamodel.spatialRules?.find(candidate => candidate?.id === request.ruleId);
  if (!rule || (rule.kind !== 'noOverlap' && rule.kind !== 'minClearance')) return { status: 'stale' };
  const pair = [request.elementId, request.relatedElementId];
  if (pair[0] === pair[1] || !pair.includes(request.moveElementId)) return { status: 'stale' };

  const moving = model.elements.find(element => element.id === request.moveElementId);
  const other = model.elements.find(element => element.id !== request.moveElementId && pair.includes(element.id));
  const before = normalizePosition3D(moving?.presentation?.position3D);
  if (!moving || !other || !before) return { status: 'stale' };

  // Only rules involving the moving class can change verdicts. Recheck all
  // instances of those rules, including elements outside the active view.
  const affected = { ...metamodel, spatialRules: metamodel.spatialRules?.filter(candidate => candidate && (
    isSubtype(metamodel, moving.modelElementId, candidate.sourceClassId)
    || isSubtype(metamodel, moving.modelElementId, candidate.targetClassId)
  )) };
  const baseline = new Set(evaluateSpatialRules(affected, model).map(issueKey));
  const selected = issueKey({
    severity: rule.severity, message: '', constraintId: rule.id, elementId: pair[0], relatedElementIds: [pair[1]],
  });
  if (!baseline.has(selected)) return { status: 'stale' };

  if (moving.presentation?.attachedToElementId || model.elements.some(element => element.presentation?.attachedToElementId === moving.id)) {
    return { status: 'unavailable' };
  }
  const box = (element: ModelElement) => elementBox(element, defaultSizeForClass(metamodel, element.modelElementId));
  const movingBox = box(moving);
  const otherBox = box(other);
  if (!movingBox || !otherBox) return { status: 'stale' };

  const clearance = rule.kind === 'minClearance' ? rule.distanceMm : undefined;
  for (const { direction, distance } of candidateMoves(movingBox, otherBox, clearance, rule.mode !== 'plan')) {
    const after = { x: before.x + direction.x * distance, y: before.y + direction.y * distance, z: before.z };
    if (!Number.isFinite(after.x) || !Number.isFinite(after.y)) continue;
    const candidate = {
      ...model,
      elements: model.elements.map(element => element === moving
        ? { ...element, presentation: { ...element.presentation, position3D: after } } : element),
    };
    const remaining = new Set(evaluateSpatialRules(affected, candidate).map(issueKey));
    if (remaining.has(selected) || [...remaining].some(key => !baseline.has(key))) continue;
    return { status: 'ready', plan: {
      ruleName: rule.name,
      elementName: String(moving.name || moving.style?.name || moving.id),
      before,
      after,
      clearedIssues: baseline.size - remaining.size,
    } };
  }
  return { status: 'unavailable' };
}
