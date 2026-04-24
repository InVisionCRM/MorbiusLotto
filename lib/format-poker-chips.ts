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
      n = toChipInt(value);
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
      const floored = Math.floor(Math.max(0, value));
      return BigInt(floored);
    }
    const s = String(value).replace(/[,\s]/g, '').trim();
    if (!s || s === 'null' || s === 'undefined') return 0n;
    // Integer string
    if (/^-?\d+$/.test(s)) {
      const b = BigInt(s);
      return b < 0n ? 0n : b;
    }
    // Postgres NUMERIC / JSON decimals: "5040.0000000000000000"
    const dot = s.indexOf('.');
    if (dot >= 0) {
      const head = s.slice(0, dot) || '0';
      if (!/^-?\d+$/.test(head)) return 0n;
      const b = BigInt(head);
      return b < 0n ? 0n : b;
    }
    return 0n;
  } catch {
    return 0n;
  }
}
