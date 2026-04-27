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
 * PostgreSQL `NUMERIC` often serializes with a fractional part (e.g. "4750.0000000000").
 * `BigInt("4750.0000000000")` throws. Truncate toward zero on the integer part so
 * `distributePrizes` (all prize distribution types: winner-takes-all, top-N, custom %, etc.)
 * receives the correct wei/chip amounts from `calculate_tournament_prizes`.
 */
function bigintStringFromPlainDecimal(s: string): string {
  if (!s.includes('.')) return s;
  const head = s.slice(0, s.indexOf('.')) || '0';
  if (!/^-?\d+$/.test(head)) return s;
  return head;
}

/**
 * Safely convert unknown values (e.g. from DB/JSON) to bigint.
 * Handles: bigint, number (including 1.11e+21), string (including "1.11e+21"), null, undefined;
 * and plain decimal strings from PostgreSQL NUMERIC.
 */
export function toBigIntSafe(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (value === null || value === undefined) return 0n;
  if (typeof value === 'number') {
    return BigInt(toIntegerString(value));
  }
  let s = String(value).trim() || '0';
  if (s.toLowerCase().includes('e')) {
    return BigInt(toIntegerString(Number(s)));
  }
  s = bigintStringFromPlainDecimal(s);
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
}
