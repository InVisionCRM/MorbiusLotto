/**
 * arcade-limbo.ts — MORBIUS Arcade: Limbo math.
 *
 * Limbo is a one-tap, provably-fair multiplier game:
 *   • The player picks a target multiplier T (e.g. 2.00x).
 *   • The server rolls a single float r ∈ [0, 1) from the HMAC stream.
 *   • The round's "crash point" is   C = (1 - houseEdge) / r   clamped at 1.00.
 *   • If C ≥ T the player wins T × bet; otherwise they lose the bet.
 *
 * Math: P(win) = (1 - houseEdge) / T   →   E[payout]/bet = 1 - houseEdge.
 * With houseEdge = 0.01 every target has the same 99% RTP, identical to the
 * Stake-style formula. The "1 - houseEdge" factor is what bakes the house edge
 * directly into the crash distribution rather than the paytable.
 *
 * Multipliers are stored as integers ×100 to keep the win/lose decision exact
 * (no float comparisons). The route reads the float via
 * ProvablyFairService.bytesToFloat(hmacByteStream(seed, client, 0, 0)) and
 * passes it to `crashPointFromFloat()`.
 */
import { betLimits, DEFAULT_BET_LIMITS } from '../lib/game-limits';

/** House edge, in basis points (1 bp = 0.01%). 100 bp = 1%. */
export const LIMBO_HOUSE_EDGE_BP = 100;

export const LIMBO_MIN_BET = DEFAULT_BET_LIMITS.limbo.min;
export const LIMBO_MAX_BET = DEFAULT_BET_LIMITS.limbo.max;

/** Target multiplier bounds, expressed ×100 (so 1.01x ↔ 101, 100x ↔ 10000). */
export const LIMBO_MIN_TARGET_X100 = 101;
export const LIMBO_MAX_TARGET_X100 = 10000;

/** Display cap on the result multiplier — keeps the UI counter sane on huge wins. */
export const LIMBO_RESULT_CAP_X100 = 100_000_000; // 1,000,000.00x

/**
 * Derive the round's crash-point multiplier (×100) from the provably-fair float.
 * The clamp at 1.00 handles the r → 0 boundary so an unlucky-but-fair roll
 * never reads as 0.00x.
 */
export function crashPointFromFloat(r: number): number {
  if (!Number.isFinite(r) || r < 0) throw new Error('Limbo float must be in [0,1)');
  // r is in [0, 1). At r = 0 the formula is +∞; clamp the float to avoid that.
  const safe = Math.max(r, 1e-12);
  const houseFactor = 1 - LIMBO_HOUSE_EDGE_BP / 10_000;
  const raw = houseFactor / (1 - safe);
  const x100 = Math.max(100, Math.floor(raw * 100));
  return Math.min(LIMBO_RESULT_CAP_X100, x100);
}

export interface LimboResult {
  /** Crash-point multiplier ×100 (e.g. 273 = 2.73x). */
  resultX100: number;
  won: boolean;
  /** Total chips returned to the player (0 on a loss). */
  payout: number;
}

/**
 * Resolve a single Limbo round.
 * @param targetX100 player's chosen multiplier ×100 (must be in bounds)
 * @param bet bet in chips (must be in bounds)
 * @param r provably-fair float in [0, 1)
 */
export function resolveLimbo(targetX100: number, bet: number, r: number): LimboResult {
  if (!Number.isInteger(targetX100)) throw new Error('targetX100 must be an integer');
  if (targetX100 < LIMBO_MIN_TARGET_X100 || targetX100 > LIMBO_MAX_TARGET_X100) {
    throw new Error('Limbo target out of range');
  }
  if (!Number.isInteger(bet) || bet < betLimits('limbo').min || bet > betLimits('limbo').max) {
    throw new Error('Limbo bet out of range');
  }
  const resultX100 = crashPointFromFloat(r);
  const won = resultX100 >= targetX100;
  // bet * (targetX100 / 100), rounded to a whole chip. Integer math keeps the
  // round-down behaviour symmetric for all targets without any float drift.
  const payout = won ? Math.floor((bet * targetX100) / 100) : 0;
  return { resultX100, won, payout };
}
