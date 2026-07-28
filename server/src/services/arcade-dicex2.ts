/**
 * arcade-dicex2.ts — MORBIUS Arcade: Dice x2 math (Stake-style range / "in" dice).
 *
 * One-tap, provably-fair range dice. Where /dice2 picks a single roll-under
 * threshold, Dice x2 picks a *band* on the same 0.00–99.99 scale:
 *   • Player drags two handles → a window [low, high) (×100 = [lowX100, highX100)).
 *   • Server rolls a "die face" r ∈ [0.00, 99.99] from the HMAC float stream.
 *   • Win iff lowX100 ≤ rollX100 < highX100 — i.e. the roll lands inside the band.
 *   • Payout = bet × multiplier.
 *   • multiplierX100 = floor((1 - houseEdge) × 10000 / widthX100), widthX100 = high − low.
 *
 * Math: with 10000 equally-likely integer faces (0..9999), the band covers
 * exactly `widthX100` of them, so P(win) = widthX100 / 10000. Then
 *   E[payout]/bet = (widthX100/10000) × (1-h) × 10000/widthX100 = 1-h.
 * Identical 99% RTP at every band width — same constant-edge trick as /dice2 and
 * Limbo; the only player-visible difference is the knob (a width + position,
 * vs. a single threshold). The win chance is set by how *wide* the band is; the
 * position just slides where the winning window sits.
 *
 * Everything is integer ×100 so the win/lose decision is exact (no float compares).
 */
import { betLimits, DEFAULT_BET_LIMITS } from '../lib/game-limits';

/** House edge, in basis points (1 bp = 0.01%). 100 bp = 1%. */
export const DICEX2_HOUSE_EDGE_BP = 100;

export const DICEX2_MIN_BET = DEFAULT_BET_LIMITS.dicex2.min;
export const DICEX2_MAX_BET = DEFAULT_BET_LIMITS.dicex2.max;

/** Band-width bounds, ×100. 2.00 ↔ 200, 98.00 ↔ 9800.
 *  The floor enforces a max multiplier (~49.50x at width 2.00) without a
 *  separate cap; the ceiling keeps the multiplier strictly > 1.00 (~1.01x at 98%). */
export const DICEX2_MIN_WIDTH_X100 = 200;
export const DICEX2_MAX_WIDTH_X100 = 9800;

/** Exclusive upper edge of the scale ×100. The band's `high` may reach 10000
 *  (a winning window of [low, 10000) covers faces up to 9999 = 99.99). */
export const DICEX2_SCALE_MAX_X100 = 10000;

/** Inclusive max for the dice roll ×100 — covers [0.00, 99.99]. */
export const DICEX2_ROLL_MAX_X100 = 9999;

/**
 * Derive the roll value ×100 (0..9999) from a provably-fair float in [0,1).
 * Identical mapping to /dice2 so the verifier re-uses the same recipe:
 *   rollX100 = floor(r * 10000), clamped to [0, 9999].
 */
export function rollX100FromFloat(r: number): number {
  if (!Number.isFinite(r) || r < 0 || r >= 1) {
    throw new Error('Dice float must be in [0,1)');
  }
  return Math.min(DICEX2_ROLL_MAX_X100, Math.max(0, Math.floor(r * 10_000)));
}

/**
 * Multiplier ×100 awarded on a win for a band of the given width.
 *   m = floor((1 - houseEdge) × 10000 / width)
 * Example: width 50.00 (×100 = 5000), edge 1%   →
 *   floor((10000 - 100) * 100 / 5000) = floor(990000 / 5000) = 198 → 1.98x.
 */
export function multiplierX100ForWidth(widthX100: number, houseEdgeBp = DICEX2_HOUSE_EDGE_BP): number {
  if (!Number.isInteger(widthX100) || widthX100 <= 0) {
    throw new Error('widthX100 must be a positive integer');
  }
  const numerator = (10_000 - houseEdgeBp) * 100; // (1 - edge) × 10000 × 100  →  ×100 multiplier
  return Math.floor(numerator / widthX100);
}

export interface DiceX2Result {
  /** Roll value ×100 (0..9999). */
  rollX100: number;
  /** Band width ×100 (= highX100 − lowX100). */
  widthX100: number;
  /** Multiplier ×100 paid on win (constant given width). */
  multiplierX100: number;
  won: boolean;
  /** Total chips returned to the player (0 on a loss). */
  payout: number;
}

/**
 * Resolve a single Dice x2 round.
 * @param lowX100  inclusive lower edge of the win band ×100 (≥ 0)
 * @param highX100 exclusive upper edge of the win band ×100 (≤ 10000)
 * @param bet bet in chips (must be in bounds)
 * @param r provably-fair float in [0, 1)
 */
export function resolveDiceX2(lowX100: number, highX100: number, bet: number, r: number): DiceX2Result {
  if (!Number.isInteger(lowX100) || !Number.isInteger(highX100)) {
    throw new Error('band edges must be integers');
  }
  if (lowX100 < 0 || highX100 > DICEX2_SCALE_MAX_X100 || lowX100 >= highX100) {
    throw new Error('Dice x2 band out of range');
  }
  const widthX100 = highX100 - lowX100;
  if (widthX100 < DICEX2_MIN_WIDTH_X100 || widthX100 > DICEX2_MAX_WIDTH_X100) {
    throw new Error('Dice x2 band width out of range');
  }
  if (!Number.isInteger(bet) || bet < betLimits('dicex2').min || bet > betLimits('dicex2').max) {
    throw new Error('Dice x2 bet out of range');
  }
  const rollX100 = rollX100FromFloat(r);
  const multiplierX100 = multiplierX100ForWidth(widthX100);
  // Inclusive low, exclusive high — counts exactly `widthX100` integer faces.
  const won = rollX100 >= lowX100 && rollX100 < highX100;
  // bet × (multiplierX100 / 100) — integer math floors any fractional chip.
  const payout = won ? Math.floor((bet * multiplierX100) / 100) : 0;
  return { rollX100, widthX100, multiplierX100, won, payout };
}
