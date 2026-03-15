/**
 * Convert a numeric value to an integer string without scientific notation.
 * BigInt("1.11e+21") throws; we need "1110000000000000000000".
 */
function toIntegerString(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value);
  const s = rounded.toString();
  if (!s.includes('e') && !s.includes('E')) return s;
  return rounded.toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 0 });
}

/**
 * Safely convert unknown values (e.g. from JSON/API/DB) to bigint.
 * Handles: bigint, number (including 1.11e+21), string (including "1.11e+21"), null, undefined.
 * Never use raw JS number for value amounts; use this at boundaries.
 */
export function toBigIntSafe(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (value === null || value === undefined) return 0n;
  if (typeof value === 'number') {
    return BigInt(toIntegerString(value));
  }
  const s = String(value).trim() || '0';
  if (s.toLowerCase().includes('e')) {
    return BigInt(toIntegerString(Number(s)));
  }
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
}
