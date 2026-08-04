import {
  validatePosition3D,
  validatePresentation,
  validateVerticalPlacement3D,
} from '../../../shared/spatial';

const isRecord = (value: unknown): value is Record<string, any> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export function spatialElementErrors(value: unknown, path = 'element'): string[] {
  if (!isRecord(value)) return [`${path} must be an object`];
  const errors: string[] = [];
  if (value.presentation !== undefined) {
    errors.push(...validatePresentation(value.presentation, `${path}.presentation`));
  }
  if (value.style?.position3D !== undefined) {
    errors.push(...validatePosition3D(value.style.position3D, `${path}.style.position3D`));
  }
  if (
    isRecord(value.style?.appearance)
    && value.style.appearance.verticalPlacement !== undefined
  ) {
    errors.push(...validateVerticalPlacement3D(
      value.style.appearance.verticalPlacement,
      `${path}.style.appearance.verticalPlacement`
    ));
  }
  ['widthMm', 'heightMm', 'depthMm', 'rotationZ'].forEach(field => {
    if (
      value.style?.[field] !== undefined
      && (typeof value.style[field] !== 'number' || !Number.isFinite(value.style[field]))
    ) {
      errors.push(`${path}.style.${field} must be a finite number`);
    }
  });
  return errors;
}

export function requireNoSpatialErrors(errors: string[]): true {
  if (errors.length > 0) throw new Error(errors[0]);
  return true;
}
