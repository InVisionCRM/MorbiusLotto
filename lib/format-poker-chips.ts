/**
 * Poker chip formatting. The server stores and sends raw chip integers
 * (1 chip = 1 MORBIUS at the ledger boundary; poker UI shows chip counts only).
 */

/** Format a chip-int value (bigint | number | string) as an integer with thousands separators. */
export function formatChips(value: bigint | number | string): string {
  let n: bigint;
  try {
    if (typeof value === 'bigint') n = value;
    else if (typeof value === 'number') {
      if (!Number.isFinite(value)) return '0';
      n = BigInt(Math.max(0, Math.round(value)));
    } else {
      n = BigInt(value || '0');
    }
  } catch {
    return '0';
  }
  if (n < 0n) n = 0n;
  return n.toLocaleString('en-US');
}

/** Parse a user-typed chip amount into a non-negative integer chip count string. */
export function parseChipInput(input: string): string {
  const cleaned = input.replace(/[,\s]/g, '');
  if (!cleaned) return '0';
  if (!/^\d+$/.test(cleaned)) return '0';
  return String(BigInt(cleaned));
}

/** Safe chip-int to bigint conversion (for arithmetic). */
export function toChipInt(value: bigint | number | string | null | undefined): bigint {
  if (value == null) return 0n;
  try {
    if (typeof value === 'bigint') return value < 0n ? 0n : value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return 0n;
      const rounded = Math.max(0, Math.round(value));
      return BigInt(rounded);
    }
    const s = String(value).replace(/[,\s]/g, '');
    if (!/^-?\d+$/.test(s)) return 0n;
    const b = BigInt(s);
    return b < 0n ? 0n : b;
  } catch {
    return 0n;
  }
}
