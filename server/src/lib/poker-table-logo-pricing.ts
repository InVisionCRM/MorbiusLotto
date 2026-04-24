import { POKER_TABLE_LOGO_SPONSOR_WINDOW_MS } from './poker-table-logo-constants';

const PRICE_MIN_CHIPS = 50n;
const PRICE_MAX_CHIPS = 10000n;

/**
 * Next cost (whole MORBIUS / poker chips) to change the table logo.
 * - No active sponsorship: flat 50.
 * - Active sponsorship: linear from 10,000 (full 10m remaining) down to 50 (at expiry).
 * Integer math; remaining time uses floor of ms in the ratio for stability.
 */
export function computeTableLogoChangePriceMorbiusChips(args: {
  sponsoredActive: boolean;
  /** Milliseconds until sponsorship ends; ignored if not sponsoredActive. */
  remainingMs: number;
}): bigint {
  if (!args.sponsoredActive) return PRICE_MIN_CHIPS;
  const window = BigInt(POKER_TABLE_LOGO_SPONSOR_WINDOW_MS);
  let r = BigInt(Math.max(0, Math.floor(args.remainingMs)));
  if (r > window) r = window;
  const span = PRICE_MAX_CHIPS - PRICE_MIN_CHIPS;
  return PRICE_MIN_CHIPS + (span * r) / window;
}
