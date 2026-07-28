/**
 * arcade-towers.ts — MORBIUS Arcade: Towers.
 *
 * Stake-style tower climb. The player bets, then ascends an 8-floor tower one
 * floor at a time, picking one tile per floor. Every floor hides exactly one
 * bomb among `tiles` tiles (easy 4, medium 3, hard 2). A safe pick compounds
 * the round multiplier and unlocks the next floor; hitting the bomb busts the
 * round and forfeits the bet. The player may cash out after any completed
 * floor; clearing all 8 floors auto-settles at the top of the ladder.
 *
 * Provably fair: all 8 bomb positions are derived up front from the platform's
 * HMAC-SHA256 byte stream (the same primitive as the poker shuffle, the
 * lottery 6-of-55 draw and Mines). The server commits to `serverSeedHash` at
 * round start and reveals `serverSeed` only when the round settles, so anyone
 * with the public payload can recompute every bomb and confirm the tower was
 * fixed before the first pick and never moved.
 *
 * Math (per floor, with 1 bomb in `tiles` tiles):
 *   P(safe pick) = (tiles - bombs) / tiles
 *   step factor  = (1 - houseEdge) / P(safe pick)
 *
 * Multipliers are stored × 100 as integers (so 1.48× ↔ 148) — the wallet path
 * never compares floats. Each step is computed as
 *   next_x100 = floor(prev_x100 × tiles × (10_000 - houseEdgeBp) / (10_000 × (tiles - bombs)))
 * which floors *toward the house* a fraction of a chip per floor. That's the
 * same rounding convention as `arcade-hilo.advanceHiLoMultiplier` — the
 * published ladder is always honored as a minimum in chips on cash-out.
 */
import { betLimits, DEFAULT_BET_LIMITS } from '../lib/game-limits';

/** House edge, in basis points (1 bp = 0.01%). 100 = 1%. */
export const TOWERS_HOUSE_EDGE_BP = 100;

export const TOWERS_MIN_BET = DEFAULT_BET_LIMITS.towers.min;
export const TOWERS_MAX_BET = DEFAULT_BET_LIMITS.towers.max;

/** Floors in the tower — clear all of them and the round auto-settles as a win. */
export const TOWERS_FLOORS = 8;

export type TowersDifficulty = 'easy' | 'medium' | 'hard';

export interface TowersDifficultyConfig {
  /** Tiles per floor. */
  tiles: number;
  /** Bombs per floor (always 1 — kept explicit so the math reads honestly). */
  bombs: number;
}

export const TOWERS_DIFFICULTIES: Record<TowersDifficulty, TowersDifficultyConfig> = {
  easy: { tiles: 4, bombs: 1 },
  medium: { tiles: 3, bombs: 1 },
  hard: { tiles: 2, bombs: 1 },
};

export function isTowersDifficulty(value: unknown): value is TowersDifficulty {
  return value === 'easy' || value === 'medium' || value === 'hard';
}

/**
 * Derive the bomb position for every floor of the tower.
 *
 * Uses the same HMAC byte stream + bytesToFloat primitives as the poker deck
 * shuffle, the lottery draw and Mines, so the verifier can recompute it from
 * the published seeds with WebCrypto. One 4-byte slice per floor at
 * cursor = floor × 4 — the same cursor convention as `deriveHiLoCard`
 * (cardIndex × 4) and the Fisher-Yates loops (cursor += 4 per draw).
 *
 * Returns an array of TOWERS_FLOORS tile indices; bombs[f] ∈ [0, tiles) is the
 * bomb on floor f (0-indexed from the bottom).
 */
export function deriveTowersBombs(
  hmacByteStream: (cursor: number) => Buffer | Uint8Array,
  bytesToFloat: (bytes: Buffer | Uint8Array) => number,
  difficulty: TowersDifficulty,
): number[] {
  const { tiles } = TOWERS_DIFFICULTIES[difficulty];
  const bombs: number[] = new Array(TOWERS_FLOORS);
  for (let f = 0; f < TOWERS_FLOORS; f++) {
    const bytes = hmacByteStream(f * 4);
    const float = bytesToFloat(bytes);
    // float < 1 always, so floor(float × tiles) ≤ tiles - 1; min() is defence.
    bombs[f] = Math.min(tiles - 1, Math.floor(float * tiles));
  }
  return bombs;
}

/**
 * Advance the round multiplier (× 100) after one safe floor. Floors the result
 * toward the house — see file comment for the rounding contract.
 */
export function towersStepMultiplierX100(
  prevX100: number,
  difficulty: TowersDifficulty,
): number {
  if (!Number.isInteger(prevX100) || prevX100 < 100) {
    throw new Error('Towers prevX100 must be >= 100');
  }
  const { tiles, bombs } = TOWERS_DIFFICULTIES[difficulty];
  const houseNum = 10_000 - TOWERS_HOUSE_EDGE_BP;
  return Math.max(100, Math.floor((prevX100 * tiles * houseNum) / (10_000 * (tiles - bombs))));
}

/**
 * Full multiplier ladder for a difficulty. ladder[f] = multiplier × 100 after
 * f completed floors, so ladder[0] = 100 and ladder[TOWERS_FLOORS] = the
 * full-climb multiplier. Built by iterating the step function so the per-pick
 * server math and the published ladder agree to the integer.
 */
export function towersMultiplierLadder(difficulty: TowersDifficulty): number[] {
  const out: number[] = new Array(TOWERS_FLOORS + 1);
  out[0] = 100;
  for (let f = 1; f <= TOWERS_FLOORS; f++) {
    out[f] = towersStepMultiplierX100(out[f - 1], difficulty);
  }
  return out;
}

/**
 * Payout in chips for a cash-out (or full climb) at the current multiplier.
 * bet × multiplier_x100 / 100 — floored. Matches the verifier's arithmetic.
 */
export function towersPayout(bet: number, multiplierX100: number): number {
  if (!Number.isInteger(bet) || bet < betLimits('towers').min || bet > betLimits('towers').max) {
    throw new Error('Towers bet out of range');
  }
  if (!Number.isInteger(multiplierX100) || multiplierX100 < 100) {
    throw new Error('Towers multiplier out of range');
  }
  return Math.floor((bet * multiplierX100) / 100);
}
