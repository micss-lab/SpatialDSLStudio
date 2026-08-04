import { spatialElementErrors } from '../../middleware/presentationValidation';

describe('spatial presentation validation', () => {
  it('accepts the legacy X/Y shape so it can normalize to ground elevation', () => {
    expect(spatialElementErrors({
      presentation: { position3D: { x: 10, y: 20 } },
    })).toEqual([]);
  });

  it('rejects NaN and infinities before persistence', () => {
    expect(spatialElementErrors({
      presentation: {
        position3D: { x: Number.NaN, y: 20, z: Number.POSITIVE_INFINITY },
        rotationZ: Number.NEGATIVE_INFINITY,
      },
      style: { widthMm: Number.POSITIVE_INFINITY },
    })).toEqual([
      'element.presentation.position3D.x must be a finite number',
      'element.presentation.position3D.z must be a finite number',
      'element.presentation.rotationZ must be a finite number',
      'element.style.widthMm must be a finite number',
    ]);
  });

  it('rejects inconsistent placement policies in presentation and legacy style appearance', () => {
    expect(spatialElementErrors({
      presentation: {
        appearance: {
          verticalPlacement: {
            mode: 'adjustable',
            defaultBaseZMm: 200,
            minBaseZMm: 500,
          },
        },
      },
      style: {
        appearance: {
          verticalPlacement: { mode: 'adjustable', stepMm: 0 },
        },
      },
    })).toEqual([
      'element.presentation.appearance.verticalPlacement.defaultBaseZMm must be greater than or equal to element.presentation.appearance.verticalPlacement.minBaseZMm',
      'element.style.appearance.verticalPlacement.stepMm must be greater than 0',
    ]);
  });
});
