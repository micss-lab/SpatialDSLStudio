import {
  domainExtentsToThree,
  domainToThreePosition,
  pixelToMm,
  mmToPixel,
  PIXEL_TO_MM,
  MM_TO_PIXEL,
  threeToDomainPosition,
} from '../../components/diagram/3d/utils/coordinateConversion';

describe('Coordinate Conversion', () => {
  describe('constants', () => {
    it('PIXEL_TO_MM is 1 (1:1 scale)', () => {
      expect(PIXEL_TO_MM).toBe(1);
    });

    it('MM_TO_PIXEL is 1 (1:1 scale)', () => {
      expect(MM_TO_PIXEL).toBe(1);
    });
  });

  describe('pixelToMm', () => {
    it('converts positive pixels to mm', () => {
      expect(pixelToMm(100)).toBe(100);
    });

    it('converts zero to zero', () => {
      expect(pixelToMm(0)).toBe(0);
    });

    it('handles negative values', () => {
      expect(pixelToMm(-50)).toBe(-50);
    });

    it('handles decimal values', () => {
      expect(pixelToMm(1.5)).toBe(1.5);
    });
  });

  describe('mmToPixel', () => {
    it('converts mm to pixels', () => {
      expect(mmToPixel(200)).toBe(200);
    });

    it('converts zero to zero', () => {
      expect(mmToPixel(0)).toBe(0);
    });

    it('handles negative values', () => {
      expect(mmToPixel(-100)).toBe(-100);
    });
  });

  describe('round trip conversion', () => {
    it('pixel -> mm -> pixel is identity', () => {
      const originalPixels = 1234;
      expect(mmToPixel(pixelToMm(originalPixels))).toBe(originalPixels);
    });
  });

  describe('domain and Three.js axes', () => {
    it('maps domain (x, y, base z) to Three.js (x, z, -y)', () => {
      expect(domainToThreePosition({ x: 1200, y: 800, z: 4500 }))
        .toEqual([1200, 4500, -800]);
    });

    it('round-trips a Three.js position back to the domain', () => {
      expect(threeToDomainPosition({ x: 1200, y: 4500, z: -800 }))
        .toEqual({ x: 1200, y: 800, z: 4500 });
    });

    it('maps persisted X/Y/Z extents onto Three.js X/Y/Z dimensions', () => {
      expect(domainExtentsToThree({ widthMm: 1200, heightMm: 800, depthMm: 400 }))
        .toEqual([1200, 400, 800]);
    });
  });
});
