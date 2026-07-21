/**
 * Types and validation for the versioned Omniverse asset manifest, which maps
 * DSL classes and individual elements to referenced USD assets.
 *
 * This module is self-contained: it does not import other codegen services
 * and does not touch the filesystem. Callers supply the parsed manifest.
 */

export interface AssetMapping {
  asset: string;
  /** 'uniform' applies uniformScale; 'fit' scales a 1 m unit asset to the element's modelled size. */
  scaleMode?: 'uniform' | 'fit';
  uniformScale?: number;
  rotateXDeg?: number;
  zOffsetM?: number;
}

export interface AssetManifest {
  version: number;
  defaults: Record<string, AssetMapping>;
  overrides?: Record<string, AssetMapping>;
}

export interface AssetManifestValidationResult {
  valid: boolean;
  errors: string[];
}

const ASSET_MAPPING_KEYS = ['asset', 'scaleMode', 'uniformScale', 'rotateXDeg', 'zOffsetM'] as const;
const SCALE_MODES = ['uniform', 'fit'] as const;
const MANIFEST_KEYS = ['version', 'defaults', 'overrides'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateAssetMapping(value: unknown, label: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${label} must be an object`);
    return;
  }

  if (typeof value.asset !== 'string' || value.asset.trim() === '') {
    errors.push(`${label}.asset must be a non-empty string`);
  }

  if ('scaleMode' in value && !(SCALE_MODES as readonly string[]).includes(value.scaleMode as string)) {
    errors.push(`${label}.scaleMode must be one of ${SCALE_MODES.join(', ')} when present`);
  }

  (['uniformScale', 'rotateXDeg', 'zOffsetM'] as const).forEach(field => {
    if (field in value && typeof value[field] !== 'number') {
      errors.push(`${label}.${field} must be a number when present`);
    }
  });

  Object.keys(value).forEach(key => {
    if (!(ASSET_MAPPING_KEYS as readonly string[]).includes(key)) {
      errors.push(`${label} has unexpected property "${key}"`);
    }
  });
}

function validateMappingRecord(value: unknown, label: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  Object.entries(value).forEach(([key, mapping]) => {
    validateAssetMapping(mapping, `${label}.${key}`, errors);
  });
}

/**
 * Validates an unknown value against the asset manifest shape described by
 * asset-manifest.schema.json. Checks are hand-written rather than driven by
 * a JSON Schema library, so keep this in sync with the schema file.
 */
export function validateAssetManifest(obj: unknown): AssetManifestValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(obj)) {
    return { valid: false, errors: ['manifest must be an object'] };
  }

  if (typeof obj.version !== 'number' || !Number.isInteger(obj.version)) {
    errors.push('version must be an integer');
  }

  validateMappingRecord(obj.defaults, 'defaults', errors);

  if ('overrides' in obj && obj.overrides !== undefined) {
    validateMappingRecord(obj.overrides, 'overrides', errors);
  }

  Object.keys(obj).forEach(key => {
    if (!(MANIFEST_KEYS as readonly string[]).includes(key)) {
      errors.push(`manifest has unexpected property "${key}"`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Resolves the asset mapping for an element. A per-element override wins
 * over the per-class default; returns undefined if neither exists.
 */
export function resolveAssetForElement(
  manifest: AssetManifest,
  className: string,
  elementName: string
): AssetMapping | undefined {
  return manifest.overrides?.[elementName] ?? manifest.defaults?.[className];
}
