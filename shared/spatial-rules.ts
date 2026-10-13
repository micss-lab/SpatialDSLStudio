import { ConcreteSyntax3D, Metamodel, Model, ModelElement, Size3D, SpatialRuleKind, ValidationIssue } from './types';
import { isFiniteNumber } from './spatial';
import { GEOMETRY_EPSILON_MM, OrientedBox, PlanBounds, elementBox, isValidSize3D, planCenterDistance, planContains, planEnvelope, planGap, planOverlap, verticalContains, verticalGap, verticalOverlap, volumeCenterDistance, volumeGap } from './spatial-geometry';

// Mirrored by shared/spatial-rules.ts (backend) and
// frontend/src/services/spatial/spatial-rules.ts. Keep both copies identical
// below the import block; a parity test enforces it.

/**
 * Declarative spatial rules.
 *
 * S is the set of placed instances of the rule's source class (subtypes
 * included) and T the same for the target class. An element is placed when
 * it has a valid `presentation.position3D` and resolvable extents:
 * `presentation.size3D`, otherwise the metaclass default
 * `concreteSyntax.three_d.defaultSizeMm` (inherited along `superTypes` the
 * way the concrete-syntax resolver inherits notation). Unplaced elements are
 * skipped and never satisfy an "exists" clause.
 *
 * | kind               | holds when                                                   | issues                       |
 * | ------------------ | ------------------------------------------------------------ | ---------------------------- |
 * | noOverlap          | no a in S, b in T, a != b intersect                          | one per offending pair       |
 * | minClearance(d)    | gap(a, b) >= d for all a in S, b in T, a != b                | one per offending pair       |
 * | maxDistance(d)     | every a in S has some b in T with centreDistance(a, b) <= d  | one per unsatisfied source   |
 * | within(margin)     | every a in S lies inside some b in T shrunk by margin        | one per unsatisfied source   |
 * | adjacentTo(tol)    | every a in S has some b in T, b != a, with gap(a, b) <= tol  | one per unsatisfied source   |
 *
 * `mode: 'plan'` compares plan-view footprints and plan centres; `'volume'`
 * (the default) uses the vertical prisms: overlap needs the vertical
 * intervals to overlap too, gaps are sqrt(planGap^2 + verticalGap^2),
 * centres sit at mid elevation, and `within` also needs the vertical
 * interval of a inside that of b. Touching does not count as overlapping.
 * Pair issues are reported once per unordered pair, on the source element,
 * with the target in `relatedElementIds`.
 */

export const SPATIAL_RULE_KINDS: SpatialRuleKind[] = ['noOverlap', 'minClearance', 'maxDistance', 'within', 'adjacentTo'];

const SEVERITIES = ['error', 'warning', 'info'];

/** Kinds that cannot be evaluated without `distanceMm`. */
export const spatialRuleRequiresDistance = (kind: SpatialRuleKind): boolean => (
  kind === 'minClearance' || kind === 'maxDistance' || kind === 'adjacentTo'
);

/** Kinds that read `distanceMm` at all (`within` treats it as an optional margin). */
export const spatialRuleUsesDistance = (kind: SpatialRuleKind): boolean => kind !== 'noOverlap';

export const isSubtype = (
  metamodel: Pick<Metamodel, 'classes'>,
  typeId: string,
  expectedTypeId: string,
  visited: Record<string, boolean> = {}
): boolean => {
  if (typeId === expectedTypeId) return true;
  if (visited[typeId]) return false;
  visited[typeId] = true;
  const metaClass = metamodel.classes.find(candidate => candidate.id === typeId);
  return Boolean(metaClass?.superTypes?.some(superType => (
    isSubtype(metamodel, superType, expectedTypeId, visited)
  )));
};

/**
 * Validate one spatial rule. With a metamodel, the source and target
 * classes must exist in it.
 */
export function validateSpatialRule(
  value: unknown,
  metamodel?: Pick<Metamodel, 'classes'>,
  path = 'spatialRule'
): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${path} must be an object`];
  const rule = value as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof rule.id !== 'string' || !rule.id.trim()) errors.push(`${path}.id is required`);
  if (typeof rule.name !== 'string' || !rule.name.trim()) errors.push(`${path}.name is required`);
  const kind = rule.kind as SpatialRuleKind;
  if (SPATIAL_RULE_KINDS.indexOf(kind) < 0) {
    errors.push(`${path}.kind must be one of ${SPATIAL_RULE_KINDS.join(', ')}`);
  }
  ['sourceClassId', 'targetClassId'].forEach(field => {
    const classId = rule[field];
    if (typeof classId !== 'string' || !classId) {
      errors.push(`${path}.${field} is required`);
    } else if (metamodel && !metamodel.classes.some(metaClass => metaClass.id === classId)) {
      errors.push(`${path}.${field} references unknown metaclass ${classId}`);
    }
  });
  if (rule.distanceMm !== undefined && rule.distanceMm !== null) {
    if (!isFiniteNumber(rule.distanceMm) || rule.distanceMm < 0) {
      errors.push(`${path}.distanceMm must be a non-negative number`);
    }
  } else if (SPATIAL_RULE_KINDS.indexOf(kind) >= 0 && spatialRuleRequiresDistance(kind)) {
    errors.push(`${path}.distanceMm is required for ${kind}`);
  }
  if (rule.mode !== undefined && rule.mode !== 'plan' && rule.mode !== 'volume') {
    errors.push(`${path}.mode must be plan or volume`);
  }
  if (SEVERITIES.indexOf(rule.severity as string) < 0) {
    errors.push(`${path}.severity must be error, warning, or info`);
  }
  if (rule.message !== undefined && rule.message !== null && typeof rule.message !== 'string') {
    errors.push(`${path}.message must be a string`);
  }
  if (rule.enabled !== undefined && typeof rule.enabled !== 'boolean') {
    errors.push(`${path}.enabled must be a boolean`);
  }
  return errors;
}

/** Validate a metamodel's `spatialRules` array, including unique rule IDs. */
export function validateSpatialRules(
  value: unknown,
  metamodel?: Pick<Metamodel, 'classes'>,
  path = 'spatialRules'
): string[] {
  if (!Array.isArray(value)) return [`${path} must be an array`];
  const errors: string[] = [];
  const seen: Record<string, boolean> = {};
  value.forEach((rule, index) => {
    errors.push(...validateSpatialRule(rule, metamodel, `${path}[${index}]`));
    const id = rule && typeof rule === 'object' ? (rule as Record<string, unknown>).id : undefined;
    if (typeof id === 'string' && id) {
      if (seen[id]) errors.push(`${path}[${index}].id duplicates rule ${id}`);
      seen[id] = true;
    }
  });
  return errors;
}

const nearestThreeDNotation = (
  metamodel: Pick<Metamodel, 'classes'>,
  classId: string,
  visited: Record<string, boolean>
): ConcreteSyntax3D | undefined => {
  if (visited[classId]) return undefined;
  visited[classId] = true;
  const metaClass = metamodel.classes.find(candidate => candidate.id === classId);
  if (!metaClass) return undefined;
  const own = metaClass.concreteSyntax?.three_d;
  if (own && Object.keys(own).length > 0) return own;
  for (let index = 0; index < (metaClass.superTypes || []).length; index += 1) {
    const inherited = nearestThreeDNotation(metamodel, metaClass.superTypes[index], visited);
    if (inherited) return inherited;
  }
  return undefined;
};

/**
 * Metaclass default extents, `concreteSyntax.three_d.defaultSizeMm`, taken
 * from the nearest 3D notation along the class and its `superTypes`
 * (declared order, first ancestor with notation wins), as the
 * concrete-syntax resolver inherits notation.
 */
export function defaultSizeForClass(metamodel: Pick<Metamodel, 'classes'>, classId: string): Size3D | undefined {
  const notation = nearestThreeDNotation(metamodel, classId, {});
  return notation && isValidSize3D(notation.defaultSizeMm) ? notation.defaultSizeMm : undefined;
}

interface PlacedElement {
  index: number;
  element: ModelElement;
  box: OrientedBox;
  envelope: PlanBounds;
}

const envelopeGap = (a: PlanBounds, b: PlanBounds): number => {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY, 0);
  return Math.sqrt(dx * dx + dy * dy);
};

const round = (value: number): number => Math.round(value * 10) / 10;

const elementLabel = (element: ModelElement): string => (
  String(element.name || element.style?.name || element.id)
);

const fillMessage = (template: string, values: Record<string, string>): string => (
  template.replace(/\{(source|target|distance|rule)\}/g, (_match, key: string) => values[key])
);

/**
 * Evaluate every enabled spatial rule of the metamodel against the model.
 * Pure and deterministic: issues follow rule order, then model element order.
 */
export function evaluateSpatialRules(metamodel: Metamodel, model: Model): ValidationIssue[] {
  const rules = (metamodel.spatialRules || []).filter(rule => rule && rule.enabled !== false);
  if (rules.length === 0) return [];

  const defaultSizes: Record<string, Size3D | undefined> = {};
  const placed: PlacedElement[] = [];
  model.elements.forEach(element => {
    if (!(element.modelElementId in defaultSizes)) {
      defaultSizes[element.modelElementId] = defaultSizeForClass(metamodel, element.modelElementId);
    }
    const box = elementBox(element, defaultSizes[element.modelElementId]);
    if (box) placed.push({ index: placed.length, element, box, envelope: planEnvelope(box) });
  });

  const issues: ValidationIssue[] = [];
  rules.forEach(rule => {
    const location = `spatialRules.${SPATIAL_RULE_KINDS.indexOf(rule.kind) >= 0 ? rule.kind : 'invalid'}`;
    const errors = validateSpatialRule(rule, metamodel);
    if (errors.length > 0) {
      issues.push({
        severity: 'error',
        message: `Spatial rule "${rule.name || rule.id}" is invalid: ${errors[0].replace(/^spatialRule\./, '')}`,
        location,
        constraintId: rule.id,
      });
      return;
    }

    const membership = (classId: string): boolean[] => {
      const byClass: Record<string, boolean> = {};
      return placed.map(item => {
        const typeId = item.element.modelElementId;
        if (!(typeId in byClass)) byClass[typeId] = isSubtype(metamodel, typeId, classId);
        return byClass[typeId];
      });
    };
    const inSource = membership(rule.sourceClassId);
    const inTarget = membership(rule.targetClassId);
    const sources = placed.filter(item => inSource[item.index]);
    const targets = placed.filter(item => inTarget[item.index]);
    const volume = rule.mode !== 'plan';
    const distance = rule.distanceMm ?? 0;
    const targetClassName = metamodel.classes.find(metaClass => metaClass.id === rule.targetClassId)?.name
      || rule.targetClassId;
    const report = (source: PlacedElement, defaultText: string, target?: PlacedElement): void => {
      const text = rule.message
        ? fillMessage(rule.message, {
          source: elementLabel(source.element),
          target: target ? elementLabel(target.element) : targetClassName,
          distance: String(distance),
          rule: rule.name,
        })
        : defaultText;
      issues.push({
        severity: rule.severity,
        message: `${rule.name}: ${text}`,
        elementId: source.element.id,
        ...(target ? { relatedElementIds: [target.element.id] } : {}),
        location,
        constraintId: rule.id,
      });
    };

    if (rule.kind === 'noOverlap' || rule.kind === 'minClearance') {
      sources.forEach(a => {
        targets.forEach(b => {
          if (a.index === b.index) return;
          // Each unordered pair once: skip (a, b) when it was already visited as (b, a).
          if (inSource[b.index] && inTarget[a.index] && b.index < a.index) return;
          if (rule.kind === 'noOverlap') {
            if (volume && !verticalOverlap(a.box, b.box)) return;
            if (envelopeGap(a.envelope, b.envelope) > 0 || !planOverlap(a.box, b.box)) return;
            report(a, `${elementLabel(a.element)} overlaps ${elementLabel(b.element)}${volume ? '' : ' in plan view'}.`, b);
            return;
          }
          const vertical = volume ? verticalGap(a.box, b.box) : 0;
          const lowerBound = envelopeGap(a.envelope, b.envelope);
          if (Math.sqrt(lowerBound * lowerBound + vertical * vertical) >= distance) return;
          const gap = volume ? volumeGap(a.box, b.box) : planGap(a.box, b.box);
          if (gap >= distance - GEOMETRY_EPSILON_MM) return;
          report(
            a,
            `${elementLabel(a.element)} is ${round(gap)} mm from ${elementLabel(b.element)}; at least ${distance} mm is required.`,
            b
          );
        });
      });
      return;
    }

    sources.forEach(a => {
      if (rule.kind === 'maxDistance') {
        let nearest = Infinity;
        for (let index = 0; index < targets.length; index += 1) {
          const b = targets[index];
          const centreDistance = volume ? volumeCenterDistance(a.box, b.box) : planCenterDistance(a.box, b.box);
          nearest = Math.min(nearest, centreDistance);
          if (centreDistance <= distance + GEOMETRY_EPSILON_MM) return;
        }
        report(a, nearest === Infinity
          ? `${elementLabel(a.element)} has no placed ${targetClassName} within ${distance} mm.`
          : `${elementLabel(a.element)} has no ${targetClassName} within ${distance} mm; the nearest is ${round(nearest)} mm away.`);
        return;
      }
      if (rule.kind === 'within') {
        const inside = targets.some(b => (
          planContains(b.box, a.box, distance) && (!volume || verticalContains(b.box, a.box))
        ));
        if (!inside) {
          report(a, `${elementLabel(a.element)} is not inside any ${targetClassName}${distance > 0 ? ` with a ${distance} mm margin` : ''}.`);
        }
        return;
      }
      const adjacent = targets.some(b => (
        b.index !== a.index
        && (volume ? volumeGap(a.box, b.box) : planGap(a.box, b.box)) <= distance + GEOMETRY_EPSILON_MM
      ));
      if (!adjacent) {
        report(a, `${elementLabel(a.element)} is not within ${distance} mm of any ${targetClassName}.`);
      }
    });
  });
  return issues;
}
