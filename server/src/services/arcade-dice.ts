/**
 * arcade-dice.ts — MORBIUS Arcade: Dice math (Stake-style roll-under).
 *
 * One-tap, provably-fair dice:
 *   • Player picks a roll-under threshold T ∈ [2.00, 98.00] (×100 = [200, 9800]).
 *   • Server rolls a "die face" r ∈ [0.00, 99.99] from the HMAC float stream.
 *   • Win iff rollX100 < targetX100. Payout = bet × multiplier.
 *   • multiplierX100 = floor((1 - houseEdge) × 10000 / targetX100).
 *
 * Math: P(win) = T / 100; E[payout]/bet = (T/100) × (1-h) × 100/T = 1-h.
 * Identical 99% RTP across every threshold — the house edge lives in the
 * multiplier rather than the win/lose decision. This is the same trick Limbo
 * uses; the difference is the player-visible knob (threshold vs. multiplier).
 *
 * All thresholds, rolls, and multipliers are stored as integers ×100 so the
 * win/lose decision is exact (no float compares ever).
 */
import { betLimits, DEFAULT_BET_LIMITS } from '../lib/game-limits';

/** House edge, in basis points (1 bp = 0.01%). 100 bp = 1%. */
export const DICE_HOUSE_EDGE_BP = 100;

export const DICE_MIN_BET = DEFAULT_BET_LIMITS.dice.min;
export const DICE_MAX_BET = DEFAULT_BET_LIMITS.dice.max;

/** Roll-under threshold bounds, ×100. 2.00 ↔ 200, 98.00 ↔ 9800.
 *  Floors enforce a max multiplier (~49.50x at 2.00x) without introducing a
 *  separate cap; ceilings keep the multiplier strictly > 1.00 (~1.01x at 98%). */
export const DICE_MIN_TARGET_X100 = 200;
export const DICE_MAX_TARGET_X100 = 9800;

/** Inclusive max for the dice roll ×100 — covers [0.00, 99.99]. */
export const DICE_ROLL_MAX_X100 = 9999;

/**
 * Derive the roll value ×100 (0..9999) from a provably-fair float in [0,1).
 * Multiply by 10000 and floor so each integer in [0, 9999] is reachable with
 * the same probability — identical to the Stake "roll = floor(r * 10000) / 100"
 * shape, just with the divide held off until display time.
 */
export function rollX100FromFloat(r: number): number {
  if (!Number.isFinite(r) || r < 0 || r >= 1) {
    throw new Error('Dice float must be in [0,1)');
  }
  // Math.floor(r * 10000) is always in [0, 9999] for r in [0,1).
  return Math.min(DICE_ROLL_MAX_X100, Math.max(0, Math.floor(r * 10_000)));
}

/**
 * Multiplier ×100 awarded on a win at the given target.
 *   m = floor((1 - houseEdge) × 10000 / target)
 * Example: target 50.00 (×100 = 5000), edge 1%   →
 *   floor((10000 - 100) * 100 / 5000) = floor(990000 / 5000) = 198 → 1.98x.
 */
export function multiplierX100ForTarget(targetX100: number, houseEdgeBp = DICE_HOUSE_EDGE_BP): number {
  if (!Number.isInteger(targetX100) || targetX100 <= 0) {
    throw new Error('targetX100 must be a positive integer');
  }
  const numerator = (10_000 - houseEdgeBp) * 100; // (1 - edge) × 10000 × 100  →  ×100 multiplier
  return Math.floor(numerator / targetX100);
}

export interface DiceResult {
  /** Roll value ×100 (0..9999). */
  rollX100: number;
  /** Multiplier ×100 paid on win (constant given target). */
  multiplierX100: number;
  won: boolean;
  /** Total chips returned to the player (0 on a loss). */
  payout: number;
}

/**
 * Resolve a single Dice round.
 * @param targetX100 player's chosen roll-under threshold ×100 (must be in bounds)
 * @param bet bet in chips (must be in bounds)
 * @param r provably-fair float in [0, 1)
 */
export function resolveDice(targetX100: number, bet: number, r: number): DiceResult {
  if (!Number.isInteger(targetX100)) throw new Error('targetX100 must be an integer');
  if (targetX100 < DICE_MIN_TARGET_X100 || targetX100 > DICE_MAX_TARGET_X100) {
    throw new Error('Dice target out of range');
  }
  if (!Number.isInteger(bet) || bet < betLimits('dice').min || bet > betLimits('dice').max) {
    throw new Error('Dice bet out of range');
  }
  const rollX100 = rollX100FromFloat(r);
  const multiplierX100 = multiplierX100ForTarget(targetX100);
  const won = rollX100 < targetX100;
  // bet × (multiplierX100 / 100) — integer math floors any fractional chip.
  const payout = won ? Math.floor((bet * multiplierX100) / 100) : 0;
  return { rollX100, multiplierX100, won, payout };
}
