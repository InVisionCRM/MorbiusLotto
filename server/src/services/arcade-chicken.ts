/**
 * arcade-chicken.ts — MORBIUS Arcade: Chicken.
 *
 * Stake-style lane crossing. The player bets, then crosses a road one lane at a
 * time. Every lane independently hides a bumper with probability
 * bumpers / outcomes (easy 1/10, medium 1/6, hard 3/10). A safe step compounds
 * the round multiplier and unlocks the next lane; stepping into a bumper busts
 * the round and forfeits the bet. The player may cash out after any completed
 * lane; clearing every lane auto-settles at the top of the ladder.
 *
 * Provably fair: the bumper lanes for the whole road are derived up front from
 * the platform's HMAC-SHA256 byte stream (the same primitive as the poker
 * shuffle, the lottery 6-of-55 draw, Mines and Towers). The server commits to
 * `serverSeedHash` at round start and reveals `serverSeed` only when the round
 * settles, so anyone with the public payload can recompute every lane and
 * confirm the road was fixed before the first step and never moved.
 *
 * Math (per lane, with `bumpers` bumper slots in `outcomes` slots):
 *   P(safe step) = (outcomes - bumpers) / outcomes
 *   step factor  = (1 - houseEdge) / P(safe step)
 *
 * Multipliers are stored × 100 as integers (so 1.10× ↔ 110) — the wallet path
 * never compares floats. Each step is computed as
 *   next_x100 = floor(prev_x100 × outcomes × (10_000 - houseEdgeBp)
 *                     / (10_000 × (outcomes - bumpers)))
 * which floors *toward the house* a fraction of a chip per lane. That's the
 * same rounding convention as `arcade-towers.towersStepMultiplierX100` — the
 * published ladder is always honored as a minimum in chips on cash-out.
 */

/** House edge, in basis points (1 bp = 0.01%). 100 = 1%. */
export const CHICKEN_HOUSE_EDGE_BP = 100;

export const CHICKEN_MIN_BET = 10;
export const CHICKEN_MAX_BET = 2000;

export type ChickenDifficulty = 'easy' | 'medium' | 'hard';

export interface ChickenDifficultyConfig {
  /** Total lanes to cross — clear them all and the round auto-settles as a win. */
  lanes: number;
  /** Rational denominator for the per-lane bumper chance. */
  outcomes: number;
  /** Numerator: P(bumper per lane) = bumpers / outcomes (always ≥ 1). */
  bumpers: number;
}

export const CHICKEN_DIFFICULTIES: Record<ChickenDifficulty, ChickenDifficultyConfig> = {
  easy: { lanes: 20, outcomes: 10, bumpers: 1 }, // 10% bumper per lane  → top ≈ 6.7×
  medium: { lanes: 15, outcomes: 6, bumpers: 1 }, // 16.67%             → top ≈ 13×
  hard: { lanes: 10, outcomes: 10, bumpers: 3 }, // 30%                  → top ≈ 32×
};

export function isChickenDifficulty(value: unknown): value is ChickenDifficulty {
  return value === 'easy' || value === 'medium' || value === 'hard';
}

/**
 * Derive the bumper lanes for the whole road. One 4-byte slice per lane at
 * cursor = lane × 4 — the same cursor convention as `deriveTowersBombs`
 * (floor × 4) and the Fisher-Yates loops (cursor += 4 per draw). Lane L is a
 * bumper when floor(r × outcomes) < bumpers, so P(bumper) = bumpers / outcomes.
 *
 * Returns the sorted array of bumper lane indices in [0, lanes).
 */
export function deriveChickenBumpers(
  hmacByteStream: (cursor: number) => Buffer | Uint8Array,
  bytesToFloat: (bytes: Buffer | Uint8Array) => number,
  difficulty: ChickenDifficulty,
): number[] {
  const { lanes, outcomes, bumpers } = CHICKEN_DIFFICULTIES[difficulty];
  const out: number[] = [];
  for (let lane = 0; lane < lanes; lane++) {
    const float = bytesToFloat(hmacByteStream(lane * 4));
    // float < 1 always, so floor(float × outcomes) ≤ outcomes - 1.
    const slot = Math.min(outcomes - 1, Math.floor(float * outcomes));
    if (slot < bumpers) out.push(lane);
  }
  return out;
}

/**
 * Advance the round multiplier (× 100) after one safe lane. Floors the result
 * toward the house — see file comment for the rounding contract.
 */
export function chickenStepMultiplierX100(
  prevX100: number,
  difficulty: ChickenDifficulty,
): number {
  if (!Number.isInteger(prevX100) || prevX100 < 100) {
    throw new Error('Chicken prevX100 must be >= 100');
  }
  const { outcomes, bumpers } = CHICKEN_DIFFICULTIES[difficulty];
  const houseNum = 10_000 - CHICKEN_HOUSE_EDGE_BP;
  return Math.max(
    100,
    Math.floor((prevX100 * outcomes * houseNum) / (10_000 * (outcomes - bumpers))),
  );
}

/**
 * Full multiplier ladder for a difficulty. ladder[L] = multiplier × 100 after
 * L crossed lanes, so ladder[0] = 100 and ladder[lanes] = the full-crossing
 * multiplier. Built by iterating the step function so the per-step server math
 * and the published ladder agree to the integer.
 */
export function chickenMultiplierLadder(difficulty: ChickenDifficulty): number[] {
  const { lanes } = CHICKEN_DIFFICULTIES[difficulty];
  const out: number[] = new Array(lanes + 1);
  out[0] = 100;
  for (let l = 1; l <= lanes; l++) {
    out[l] = chickenStepMultiplierX100(out[l - 1], difficulty);
  }
  return out;
}

/**
 * Payout in chips for a cash-out (or full crossing) at the current multiplier.
 * bet × multiplier_x100 / 100 — floored. Matches the verifier's arithmetic.
 */
export function chickenPayout(bet: number, multiplierX100: number): number {
  if (!Number.isInteger(bet) || bet < CHICKEN_MIN_BET || bet > CHICKEN_MAX_BET) {
    throw new Error('Chicken bet out of range');
  }
  if (!Number.isInteger(multiplierX100) || multiplierX100 < 100) {
    throw new Error('Chicken multiplier out of range');
  }
  return Math.floor((bet * multiplierX100) / 100);
}
