import {
  ModelElement,
  ModelElementPresentation,
  Position3D,
  Size3D,
  VerticalPlacement3D,
} from '../../models/types';

export const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const VERTICAL_PLACEMENT_NUMBER_FIELDS = [
  'defaultBaseZMm',
  'minBaseZMm',
  'maxBaseZMm',
  'stepMm',
] as const;

export function validateVerticalPlacement3D(
  value: unknown,
  path = 'verticalPlacement'
): string[] {
  if (!isRecord(value)) return [`${path} must be an object`];

  const errors: string[] = [];
  if (value.mode !== 'grounded' && value.mode !== 'adjustable') {
    errors.push(`${path}.mode must be grounded or adjustable`);
  }

  for (const field of VERTICAL_PLACEMENT_NUMBER_FIELDS) {
    if (value[field] !== undefined && !isFiniteNumber(value[field])) {
      errors.push(`${path}.${field} must be a finite number`);
    }
  }

  const policy = value as Partial<VerticalPlacement3D>;
  if (isFiniteNumber(policy.stepMm) && policy.stepMm <= 0) {
    errors.push(`${path}.stepMm must be greater than 0`);
  }
  if (
    isFiniteNumber(policy.minBaseZMm)
    && isFiniteNumber(policy.maxBaseZMm)
    && policy.minBaseZMm > policy.maxBaseZMm
  ) {
    errors.push(`${path}.minBaseZMm must be less than or equal to ${path}.maxBaseZMm`);
  }
  if (
    isFiniteNumber(policy.defaultBaseZMm)
    && isFiniteNumber(policy.minBaseZMm)
    && policy.defaultBaseZMm < policy.minBaseZMm
  ) {
    errors.push(`${path}.defaultBaseZMm must be greater than or equal to ${path}.minBaseZMm`);
  }
  if (
    isFiniteNumber(policy.defaultBaseZMm)
    && isFiniteNumber(policy.maxBaseZMm)
    && policy.defaultBaseZMm > policy.maxBaseZMm
  ) {
    errors.push(`${path}.defaultBaseZMm must be less than or equal to ${path}.maxBaseZMm`);
  }

  return errors;
}

export function validateConcreteSyntaxVerticalPlacement(
  value: unknown,
  path = 'concreteSyntax'
): string[] {
  if (!isRecord(value)) return [`${path} must be an object`];
  if (value.three_d === undefined) return [];
  if (!isRecord(value.three_d)) return [`${path}.three_d must be an object`];
  if (value.three_d.verticalPlacement === undefined) return [];
  return validateVerticalPlacement3D(
    value.three_d.verticalPlacement,
    `${path}.three_d.verticalPlacement`
  );
}

export function validateConcreteSyntaxMapVerticalPlacements(
  value: unknown,
  path = 'concreteSyntaxByMetaClassId'
): string[] {
  if (!isRecord(value)) return [`${path} must be an object`];
  return Object.entries(value).flatMap(([key, syntax]) => (
    validateConcreteSyntaxVerticalPlacement(syntax, `${path}[${JSON.stringify(key)}]`)
  ));
}

export function normalizePosition3D(value: unknown): Position3D | undefined {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    return undefined;
  }
  if (value.z !== undefined && !isFiniteNumber(value.z)) return undefined;
  return { x: value.x, y: value.y, z: value.z ?? 0 };
}

export function normalizePresentation(
  presentation: ModelElementPresentation | undefined
): ModelElementPresentation | undefined {
  if (!presentation?.position3D) return presentation;
  const position3D = normalizePosition3D(presentation.position3D);
  return position3D ? { ...presentation, position3D } : presentation;
}

/**
 * Normalize a semantic element at a load/import boundary. Legacy
 * `style.position3D` is consumed as migration input and removed so
 * presentation remains the only writable pose store.
 */
export function normalizeModelElementSpatial(element: ModelElement): ModelElement {
  const style = { ...(element.style || {}) };
  const legacyPosition = normalizePosition3D(style.position3D);
  const presentationPosition = normalizePosition3D(element.presentation?.position3D);
  delete style.position3D;

  const position3D = presentationPosition || legacyPosition;
  return {
    ...element,
    style,
    ...(element.presentation || position3D
      ? {
        presentation: {
          ...(element.presentation || {}),
          ...(position3D ? { position3D } : {}),
        },
      }
      : {}),
  };
}

export function domainToRenderPosition(position: Position3D): [number, number, number] {
  return [position.x, position.z, -position.y];
}

export function renderToDomainPosition(
  position: { x: number; y: number; z: number }
): Position3D {
  return { x: position.x, y: -position.z, z: position.y };
}

export function axisExtents(size: Size3D): { x: number; y: number; z: number } {
  return { x: size.widthMm, y: size.heightMm, z: size.depthMm };
}

export function domainExtentsToRender(size: Size3D): [number, number, number] {
  const extents = axisExtents(size);
  return [extents.x, extents.z, extents.y];
}

export function baseCenterMeters(baseZMm: number, verticalExtentMm: number): number {
  return (baseZMm + verticalExtentMm / 2) / 1000;
}

export function validatePosition3D(value: unknown, path = 'position3D'): string[] {
  if (!isRecord(value)) return [`${path} must be an object`];
  const errors: string[] = [];
  if (!isFiniteNumber(value.x)) errors.push(`${path}.x must be a finite number`);
  if (!isFiniteNumber(value.y)) errors.push(`${path}.y must be a finite number`);
  if (value.z !== undefined && !isFiniteNumber(value.z)) {
    errors.push(`${path}.z must be a finite number`);
  }
  return errors;
}

const validatePoint = (value: unknown, fields: string[], path: string): string[] => {
  if (!isRecord(value)) return [`${path} must be an object`];
  return fields
    .filter(field => !isFiniteNumber(value[field]))
    .map(field => `${path}.${field} must be a finite number`);
};

/** Validate only canonical presentation fields present in a patch or sidecar. */
export function validatePresentation(value: unknown, path = 'presentation'): string[] {
  if (!isRecord(value)) return [`${path} must be an object`];
  const errors: string[] = [];
  if (value.position2D !== undefined) {
    errors.push(...validatePoint(value.position2D, ['x', 'y'], `${path}.position2D`));
  }
  if (value.position3D !== undefined) {
    errors.push(...validatePosition3D(value.position3D, `${path}.position3D`));
  }
  if (value.size2D !== undefined) {
    errors.push(...validatePoint(value.size2D, ['width', 'height'], `${path}.size2D`));
  }
  if (value.size3D !== undefined) {
    errors.push(...validatePoint(
      value.size3D,
      ['widthMm', 'heightMm', 'depthMm'],
      `${path}.size3D`
    ));
  }
  if (value.rotationZ !== undefined && !isFiniteNumber(value.rotationZ)) {
    errors.push(`${path}.rotationZ must be a finite number`);
  }
  if (isRecord(value.appearance) && value.appearance.verticalPlacement !== undefined) {
    errors.push(...validateVerticalPlacement3D(
      value.appearance.verticalPlacement,
      `${path}.appearance.verticalPlacement`
    ));
  }
  return errors;
}
