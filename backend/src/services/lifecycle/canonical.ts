import crypto from 'crypto';

const canonicalize = (value: unknown, inArray = false): unknown => {
  if (value === undefined) return inArray ? null : undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical JSON cannot contain non-finite numbers');
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { $base64: value.toString('base64') };
  if (Array.isArray(value)) return value.map(item => canonicalize(item, true));
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const normalized = canonicalize((value as Record<string, unknown>)[key]);
        if (normalized !== undefined) result[key] = normalized;
        return result;
      }, {});
  }
  throw new Error(`Canonical JSON does not support ${typeof value} values`);
};

export const stableStringify = (value: unknown): string => JSON.stringify(canonicalize(value));

export const contentHash = (value: unknown): string => (
  `sha256:${crypto.createHash('sha256').update(stableStringify(value)).digest('hex')}`
);

