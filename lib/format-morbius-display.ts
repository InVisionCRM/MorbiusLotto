import { toBigIntSafe } from '@/lib/safe-bigint';

/** One MORBIUS in wei (18 decimals), same as `formatEther` / ETH-style units */
export const MORBIUS_WAD = 10n ** 18n;

/**
 * Mathematical floor(wei / 10^18): whole MORBIUS toward −∞ (matches "round down" for balances).
 */
export function floorMorbiusWholeFromWei(wei: bigint): bigint {
  if (wei >= 0n) return wei / MORBIUS_WAD;
  return -((-wei + MORBIUS_WAD - 1n) / MORBIUS_WAD);
}

export type FormatMorbiusFloorOptions = {
  /** When true (default), use integer K / M for large whole amounts */
  compact?: boolean;
};

/**
 * Human-readable MORBIUS from wei: always whole numbers (floored), never fractional display.
 */
export function formatMorbiusFloor(weiLike: unknown, options?: FormatMorbiusFloorOptions): string {
  const compact = options?.compact !== false;
  const wei = toBigIntSafe(weiLike);
  const whole = floorMorbiusWholeFromWei(wei);
  const neg = whole < 0n;
  const abs = neg ? -whole : whole;

  if (abs === 0n) return '0';

  let body: string;
  if (compact && abs >= 1_000_000n) {
    body = `${(abs / 1_000_000n).toLocaleString()}M`;
  } else if (compact && abs >= 1_000n) {
    body = `${(abs / 1_000n).toLocaleString()}K`;
  } else {
    body = abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return neg ? `-${body}` : body;
}

/** Plain digits only (no grouping) — useful for input defaults that `parseEther` will accept */
export function formatMorbiusFloorPlain(weiLike: unknown): string {
  return floorMorbiusWholeFromWei(toBigIntSafe(weiLike)).toString();
}
