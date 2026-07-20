import fs from 'fs';
import path from 'path';
import {
  AssetManifest,
  resolveAssetForElement,
  validateAssetManifest,
} from '../../services/codegeneration/asset-manifest.service';

const manifestPath = (filename: string): string => path.resolve(
  process.cwd(),
  '..',
  'examples',
  'omniverse-assets',
  filename
);

function loadManifest(filename: string): unknown {
  return JSON.parse(fs.readFileSync(manifestPath(filename), 'utf8'));
}

describe('asset-manifest.service', () => {
  describe('validateAssetManifest', () => {
    it('accepts the committed asset-manifest.json', () => {
      const manifest = loadManifest('asset-manifest.json');
      const result = validateAssetManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects a manifest missing version', () => {
      const manifest = loadManifest('asset-manifest.json') as Record<string, unknown>;
      delete manifest.version;

      const result = validateAssetManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects a default mapping missing the asset field', () => {
      const manifest = {
        version: 1,
        defaults: {
          MobileRobot: { uniformScale: 0.01, rotateXDeg: 90, zOffsetM: 0 },
        },
        overrides: {},
      };

      const result = validateAssetManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects an override mapping missing the asset field', () => {
      const manifest = {
        version: 1,
        defaults: {},
        overrides: {
          Robot1: { uniformScale: 0.02 },
        },
      };

      const result = validateAssetManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('accepts a mapping with scaleMode "fit"', () => {
      const manifest = {
        version: 1,
        defaults: {
          StorageRack: { asset: 'warehouse-kit/storage_rack.usda', scaleMode: 'fit' },
        },
        overrides: {},
      };

      const result = validateAssetManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects a mapping with an unknown scaleMode', () => {
      const manifest = {
        version: 1,
        defaults: {
          StorageRack: { asset: 'warehouse-kit/storage_rack.usda', scaleMode: 'stretch' },
        },
        overrides: {},
      };

      const result = validateAssetManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('resolveAssetForElement', () => {
    const manifest: AssetManifest = {
      version: 1,
      defaults: {
        MobileRobot: { asset: 'default/robot.usda', uniformScale: 0.01 },
      },
      overrides: {
        Robot1: { asset: 'override/special-robot.usda', uniformScale: 0.02 },
      },
    };

    it('returns the per-element override when present', () => {
      const result = resolveAssetForElement(manifest, 'MobileRobot', 'Robot1');

      expect(result).toEqual({ asset: 'override/special-robot.usda', uniformScale: 0.02 });
    });

    it('falls back to the per-class default when no override exists', () => {
      const result = resolveAssetForElement(manifest, 'MobileRobot', 'Robot2');

      expect(result).toEqual({ asset: 'default/robot.usda', uniformScale: 0.01 });
    });

    it('returns undefined when neither an override nor a default exists', () => {
      const result = resolveAssetForElement(manifest, 'Conveyor', 'Conveyor1');

      expect(result).toBeUndefined();
    });
  });
});
