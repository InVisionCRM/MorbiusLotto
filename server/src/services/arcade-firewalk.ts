/**
 * arcade-firewalk.ts — MORBIUS Arcade: Firewalk.
 *
 * A push-your-luck crossing (the Chicken family) with a choose-your-pace twist.
 * The player bets, then crosses a row of stones laid over the coals. Every stone
 * independently crumbles with a fixed per-heat probability (low 8%, med 17%,
 * high 30%). Each step the player picks a PACE — hop 1 stone, leap 2, or bound 3
 * — and ALL stones in that leap must be safe or the round busts and forfeits the
 * bet. A safe leap advances the walker and jumps the round multiplier to that
 * rung of the ladder. The player may cash out after any crossed stone; clearing
 * the last stone auto-settles at the top of the ladder.
 *
 * Provably fair: which stones crumble is derived up front from the platform's
 * HMAC-SHA256 byte stream (the same primitive as the poker shuffle, the lottery
 * 6-of-55 draw, Mines, Towers and Chicken). The server commits to
 * `serverSeedHash` at round start and reveals `serverSeed` only when the round
 * settles, so anyone with the public payload can recompute every stone and
 * confirm the coals were fixed before the first step and never moved.
 *
 * Math — FLAT house edge, applied once to the whole ladder (NOT per stone):
 *   P(reach N) = p^N            where p = safe / outcomes (safe-step chance)
 *   ladder[N]  = (1 - EDGE) × (1/p)^N
 *   EV(cash at N) = P(reach N) × ladder[N] × bet = (1 - EDGE) × bet
 * so the edge is the same constant ≈ EDGE regardless of how many stones you
 * cross OR the pace you choose — pace only changes the variance, never the EV.
 *
 * Multipliers are carried × 100 as integers (1.10× ↔ 110) so the wallet path
 * never compares floats. Each rung is computed exactly with BigInt and floored
 * *toward the house*:
 *   ladder[0] = 100 (the starting ledge, before any step)
 *   ladder[N] = floor((10_000 − EDGE_BP) × outcomes^N / (100 × safe^N))   (N ≥ 1)
 * The published ladder is always honored as a minimum in chips on cash-out, the
 * same rounding contract as arcade-chicken / arcade-towers.
 */

/** House edge, in basis points (1 bp = 0.01%). 200 = 2% → ~98% RTP. */
export const FIREWALK_HOUSE_EDGE_BP = 200;

export const FIREWALK_MIN_BET = 10;
export const FIREWALK_MAX_BET = 2000;

/** Total stones over the coals — clear them all and the round auto-settles. */
export const FIREWALK_STONES = 14;

/** Pace = how many stones to commit to in one step. */
export const FIREWALK_PACES = [1, 2, 3] as const;
export type FirewalkPace = (typeof FIREWALK_PACES)[number];

export type FirewalkHeat = 'low' | 'med' | 'high';

export interface FirewalkHeatConfig {
  /**
   * Rational denominator for the per-stone safe chance. P(safe) = safe/outcomes
   * (always ≥ 1), so P(crumble) = (outcomes − safe) / outcomes.
   */
  outcomes: number;
  /** Numerator: P(safe step) = safe / outcomes. */
  safe: number;
}

export const FIREWALK_HEATS: Record<FirewalkHeat, FirewalkHeatConfig> = {
  low: { outcomes: 25, safe: 23 }, //  8% crumble  (P safe 0.92) → top ≈ 3.2×
  med: { outcomes: 100, safe: 83 }, // 17% crumble  (P safe 0.83) → top ≈ 12×
  high: { outcomes: 10, safe: 7 }, //  30% crumble  (P safe 0.70) → top ≈ 76×
};

export function isFirewalkHeat(value: unknown): value is FirewalkHeat {
  return value === 'low' || value === 'med' || value === 'high';
}

export function isFirewalkPace(value: unknown): value is FirewalkPace {
  return value === 1 || value === 2 || value === 3;
}

/**
 * Derive the crumbling stones for the whole crossing. One 4-byte slice per stone
 * at cursor = (stone − 1) × 4 — the same cursor convention as
 * `deriveChickenBumpers` (lane × 4) and the Fisher-Yates loops (cursor += 4 per
 * draw). Stone S (1-based) crumbles when bytesToFloat(stream) ≥ p, i.e. when
 * floor(r × outcomes) ≥ safe, so P(crumble) = (outcomes − safe) / outcomes.
 *
 * Returns the sorted array of crumbling stone indices in [1, stones].
 */
export function deriveCrumbleStones(
  hmacByteStream: (cursor: number) => Buffer | Uint8Array,
  bytesToFloat: (bytes: Buffer | Uint8Array) => number,
  heat: FirewalkHeat,
): number[] {
  const { outcomes, safe } = FIREWALK_HEATS[heat];
  const out: number[] = [];
  for (let stone = 1; stone <= FIREWALK_STONES; stone++) {
    const float = bytesToFloat(hmacByteStream((stone - 1) * 4));
    // float < 1 always, so floor(float × outcomes) ≤ outcomes - 1.
    const slot = Math.min(outcomes - 1, Math.floor(float * outcomes));
    if (slot >= safe) out.push(stone);
  }
  return out;
}

/**
 * The ×100 multiplier after N crossed stones. Flat-edge ladder: the edge is
 * applied once to the whole ladder, so EV is the same constant regardless of N.
 *   ladder[0] = 100; ladder[N] = floor((10000 − EDGE_BP) × outcomes^N
 *                                        / (100 × safe^N))   (N ≥ 1)
 * Computed with BigInt so outcomes^N / safe^N never loses precision, and floored
 * toward the house. Always ≥ 101 for N ≥ 1 (a crossed stone never pays ≤ 1.00×).
 */
export function firewalkMultiplierX100(heat: FirewalkHeat, crossed: number): number {
  if (!Number.isInteger(crossed) || crossed < 0 || crossed > FIREWALK_STONES) {
    throw new Error('Firewalk crossed out of range');
  }
  if (crossed === 0) return 100;
  const { outcomes, safe } = FIREWALK_HEATS[heat];
  const houseNum = BigInt(10_000 - FIREWALK_HOUSE_EDGE_BP);
  const num = houseNum * BigInt(outcomes) ** BigInt(crossed);
  const den = 100n * BigInt(safe) ** BigInt(crossed);
  const rung = Number(num / den);
  return Math.max(101, rung);
}

/**
 * Full multiplier ladder for a heat. ladder[N] = multiplier × 100 after N
 * crossed stones, so ladder[0] = 100 and ladder[FIREWALK_STONES] = the
 * full-crossing multiplier. Each rung is computed directly (position-only), so
 * the per-step server math and the published ladder agree to the integer for
 * every pace.
 */
export function firewalkMultiplierLadder(heat: FirewalkHeat): number[] {
  const out: number[] = new Array(FIREWALK_STONES + 1);
  for (let n = 0; n <= FIREWALK_STONES; n++) {
    out[n] = firewalkMultiplierX100(heat, n);
  }
  return out;
}

/**
 * Payout in chips for a cash-out (or full crossing) at the current multiplier.
 * bet × multiplier_x100 / 100 — floored. Matches the verifier's arithmetic.
 */
export function firewalkPayout(bet: number, multiplierX100: number): number {
  if (!Number.isInteger(bet) || bet < FIREWALK_MIN_BET || bet > FIREWALK_MAX_BET) {
    throw new Error('Firewalk bet out of range');
  }
  if (!Number.isInteger(multiplierX100) || multiplierX100 < 100) {
    throw new Error('Firewalk multiplier out of range');
  }
  return Math.floor((bet * multiplierX100) / 100);
}
