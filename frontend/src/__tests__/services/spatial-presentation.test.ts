import {
  axisExtents,
  baseCenterMeters,
  domainExtentsToRender,
  domainToRenderPosition,
  normalizeModelElementSpatial,
  normalizePosition3D,
  renderToDomainPosition,
  validateConcreteSyntaxMapVerticalPlacements,
  validatePresentation,
  validateVerticalPlacement3D,
} from '../../services/spatial';
import { ModelElement } from '../../models/types';

const element = (overrides: Partial<ModelElement> = {}): ModelElement => ({
  id: 'element-1',
  modelElementId: 'class-1',
  style: { name: 'Element' },
  references: {},
  ...overrides,
});

describe('canonical spatial presentation', () => {
  it('normalizes a legacy X/Y pose to base elevation zero', () => {
    expect(normalizePosition3D({ x: 1200, y: 800 }))
      .toEqual({ x: 1200, y: 800, z: 0 });
  });

  it('preserves finite zero, positive, and negative elevations', () => {
    expect(normalizePosition3D({ x: 1, y: 2, z: 0 })?.z).toBe(0);
    expect(normalizePosition3D({ x: 1, y: 2, z: 4500 })?.z).toBe(4500);
    expect(normalizePosition3D({ x: 1, y: 2, z: -250 })?.z).toBe(-250);
  });

  it.each([
    null,
    { x: 1 },
    { x: '1', y: 2 },
    { x: 1, y: 2, z: Number.NaN },
    { x: 1, y: 2, z: Number.POSITIVE_INFINITY },
  ])('does not normalize malformed input: %j', value => {
    expect(normalizePosition3D(value)).toBeUndefined();
  });

  it('moves legacy style placement into presentation and removes the duplicate pose store', () => {
    const normalized = normalizeModelElementSpatial(element({
      style: { name: 'Legacy', position3D: { x: 10, y: 20 } as any },
    }));

    expect(normalized.presentation?.position3D).toEqual({ x: 10, y: 20, z: 0 });
    expect(normalized.style.position3D).toBeUndefined();
  });

  it('keeps canonical presentation authoritative over legacy style placement', () => {
    const normalized = normalizeModelElementSpatial(element({
      style: { name: 'Mixed', position3D: { x: 10, y: 20, z: 30 } },
      presentation: { position3D: { x: 100, y: 200, z: 4500 } },
    }));

    expect(normalized.presentation?.position3D).toEqual({ x: 100, y: 200, z: 4500 });
    expect(normalized.style.position3D).toBeUndefined();
  });

  it('does not fabricate a pose for a non-spatial semantic element', () => {
    expect(normalizeModelElementSpatial(element()).presentation).toBeUndefined();
  });

  it('reports malformed presentation fields without treating them as ground placement', () => {
    expect(validatePresentation({
      position3D: { x: 1, y: 2, z: '0' },
      size3D: { widthMm: 10, heightMm: 20, depthMm: null },
      rotationZ: Number.POSITIVE_INFINITY,
    })).toEqual([
      'presentation.position3D.z must be a finite number',
      'presentation.size3D.depthMm must be a finite number',
      'presentation.rotationZ must be a finite number',
    ]);
  });

  it('accepts consistent grounded and adjustable placement policies', () => {
    expect(validateVerticalPlacement3D({ mode: 'grounded' })).toEqual([]);
    expect(validateVerticalPlacement3D({
      mode: 'adjustable',
      defaultBaseZMm: 3000,
      minBaseZMm: 0,
      maxBaseZMm: 10000,
      stepMm: 100,
    })).toEqual([]);
  });

  it('reports malformed and internally inconsistent placement policies', () => {
    expect(validateVerticalPlacement3D({
      mode: 'flight',
      defaultBaseZMm: 12000,
      minBaseZMm: 10000,
      maxBaseZMm: 5000,
      stepMm: 0,
    })).toEqual([
      'verticalPlacement.mode must be grounded or adjustable',
      'verticalPlacement.stepMm must be greater than 0',
      'verticalPlacement.minBaseZMm must be less than or equal to verticalPlacement.maxBaseZMm',
      'verticalPlacement.defaultBaseZMm must be less than or equal to verticalPlacement.maxBaseZMm',
    ]);

    expect(validateVerticalPlacement3D({
      mode: 'adjustable',
      defaultBaseZMm: '3000',
      stepMm: Number.POSITIVE_INFINITY,
    })).toEqual([
      'verticalPlacement.defaultBaseZMm must be a finite number',
      'verticalPlacement.stepMm must be a finite number',
    ]);
  });

  it('identifies the metaclass path for invalid policies in notation maps', () => {
    expect(validateConcreteSyntaxMapVerticalPlacements({
      Drone: {
        three_d: {
          verticalPlacement: {
            mode: 'adjustable',
            defaultBaseZMm: -1,
            minBaseZMm: 0,
          },
        },
      },
    })).toEqual([
      'concreteSyntaxByMetaClassId["Drone"].three_d.verticalPlacement.defaultBaseZMm must be greater than or equal to concreteSyntaxByMetaClassId["Drone"].three_d.verticalPlacement.minBaseZMm',
    ]);
  });

  it('validates instance-level placement overrides in presentation appearance', () => {
    expect(validatePresentation({
      appearance: {
        verticalPlacement: { mode: 'adjustable', stepMm: -50 },
      },
    })).toEqual([
      'presentation.appearance.verticalPlacement.stepMm must be greater than 0',
    ]);
  });

  it('uses the shared axis and base-center formulas', () => {
    expect(domainToRenderPosition({ x: 1200, y: 800, z: 4500 }))
      .toEqual([1200, 4500, -800]);
    expect(renderToDomainPosition({ x: 1200, y: 4500, z: -800 }))
      .toEqual({ x: 1200, y: 800, z: 4500 });
    expect(axisExtents({ widthMm: 1200, heightMm: 800, depthMm: 400 }))
      .toEqual({ x: 1200, y: 800, z: 400 });
    expect(domainExtentsToRender({ widthMm: 1200, heightMm: 800, depthMm: 400 }))
      .toEqual([1200, 400, 800]);
    expect(baseCenterMeters(4500, 400)).toBe(4.7);
  });
});
