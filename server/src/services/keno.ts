/**
 * keno.ts — MORBIUS server-side Keno (Stake-style) rules & math.
 *
 * Game shape (matches Stake.com Keno exactly):
 *   • 40 tiles (numbers 1..40).
 *   • Player picks 1..10 tiles.
 *   • Server draws 10 distinct numbers.
 *   • Payout = bet × multiplier(risk, picksCount, hits).
 *   • Four risk modes — Classic, Low, Medium, High — each its own paytable.
 *
 * Multipliers are the published Stake values, stored ×100 so chip payouts are
 * exact integer math (e.g. 3.96 ↔ 396, 81.5 ↔ 8150). The win/lose decision is
 * a pure set-intersection of the player's picks with the drawn numbers, so it
 * never touches a float.
 *
 * The draw itself is provably fair and lives in ProvablyFairService.drawKenoNumbers
 * — this module only scores a draw that's already been made.
 */
import { betLimits, DEFAULT_BET_LIMITS } from '../lib/game-limits';

export const KENO_TOTAL_TILES = 40;
export const KENO_DRAW_COUNT = 10;
export const KENO_MIN_PICKS = 1;
export const KENO_MAX_PICKS = 10;

export const KENO_MIN_BET = DEFAULT_BET_LIMITS.keno.min;
// Capped so the worst-case single-round liability (max bet × 1000× top
// multiplier = 1M chips) stays survivable for the house bankroll. Raise
// deliberately once the chip economy proves out — never by accident.
export const KENO_MAX_BET = DEFAULT_BET_LIMITS.keno.max;

export type KenoRisk = 'classic' | 'low' | 'medium' | 'high';
export const KENO_RISKS: readonly KenoRisk[] = ['classic', 'low', 'medium', 'high'] as const;

/**
 * Published Stake Keno multipliers, ×100, indexed [picksCount][hits].
 * picksCount ∈ 1..10, hits ∈ 0..picksCount. A missing/0 cell pays nothing.
 * Source: Stake Keno paytables (Classic/Low/Medium/High).
 */
type KenoTable = Record<number, Record<number, number>>;

const CLASSIC: KenoTable = {
  1: { 0: 0, 1: 396 },
  2: { 0: 0, 1: 190, 2: 450 },
  3: { 0: 0, 1: 100, 2: 310, 3: 1040 },
  4: { 0: 0, 1: 80, 2: 180, 3: 500, 4: 2250 },
  5: { 0: 0, 1: 25, 2: 140, 3: 410, 4: 1650, 5: 3600 },
  6: { 0: 0, 1: 0, 2: 100, 3: 360, 4: 700, 5: 1650, 6: 4000 },
  7: { 0: 0, 1: 0, 2: 47, 3: 300, 4: 450, 5: 1400, 6: 3100, 7: 6000 },
  8: { 0: 0, 1: 0, 2: 0, 3: 220, 4: 400, 5: 1300, 6: 2200, 7: 5500, 8: 7000 },
  9: { 0: 0, 1: 0, 2: 0, 3: 155, 4: 300, 5: 800, 6: 1500, 7: 4400, 8: 6000, 9: 8500 },
  10: { 0: 0, 1: 0, 2: 0, 3: 140, 4: 225, 5: 450, 6: 800, 7: 1700, 8: 5000, 9: 8000, 10: 10000 },
};

const LOW: KenoTable = {
  1: { 0: 70, 1: 185 },
  2: { 0: 0, 1: 200, 2: 380 },
  3: { 0: 0, 1: 110, 2: 138, 3: 2600 },
  4: { 0: 0, 1: 0, 2: 220, 3: 790, 4: 9000 },
  5: { 0: 0, 1: 0, 2: 150, 3: 420, 4: 1300, 5: 30000 },
  6: { 0: 0, 1: 0, 2: 110, 3: 200, 4: 620, 5: 10000, 6: 70000 },
  7: { 0: 0, 1: 0, 2: 110, 3: 160, 4: 350, 5: 1500, 6: 22500, 7: 70000 },
  8: { 0: 0, 1: 0, 2: 110, 3: 150, 4: 200, 5: 550, 6: 3900, 7: 10000, 8: 80000 },
  9: { 0: 0, 1: 0, 2: 110, 3: 130, 4: 170, 5: 250, 6: 750, 7: 5000, 8: 25000, 9: 100000 },
  10: { 0: 0, 1: 0, 2: 110, 3: 120, 4: 130, 5: 180, 6: 350, 7: 1300, 8: 5000, 9: 25000, 10: 100000 },
};

const MEDIUM: KenoTable = {
  1: { 0: 40, 1: 275 },
  2: { 0: 0, 1: 180, 2: 510 },
  3: { 0: 0, 1: 0, 2: 280, 3: 5000 },
  4: { 0: 0, 1: 0, 2: 170, 3: 1000, 4: 10000 },
  5: { 0: 0, 1: 0, 2: 140, 3: 400, 4: 1400, 5: 39000 },
  6: { 0: 0, 1: 0, 2: 0, 3: 300, 4: 900, 5: 18000, 6: 71000 },
  7: { 0: 0, 1: 0, 2: 0, 3: 200, 4: 700, 5: 3000, 6: 40000, 7: 80000 },
  8: { 0: 0, 1: 0, 2: 0, 3: 200, 4: 400, 5: 1100, 6: 6700, 7: 40000, 8: 90000 },
  // 3-hit corrected 2.00 → 1.90: the community source tables (Betrix/Devilla,
  // shared lineage) list 2.00 here, which math-checks to a 102.2% RTP — a player
  // edge no live Keno ships. 1.90 restores a house edge (~99.6% RTP) in line with
  // the rest of the Medium table. Replace with Stake's exact value once confirmed
  // from a live session; every other cell here is verbatim from source.
  9: { 0: 0, 1: 0, 2: 0, 3: 190, 4: 280, 5: 500, 6: 1500, 7: 10000, 8: 50000, 9: 100000 },
  10: { 0: 0, 1: 0, 2: 0, 3: 160, 4: 200, 5: 400, 6: 700, 7: 2600, 8: 10000, 9: 50000, 10: 100000 },
};

const HIGH: KenoTable = {
  1: { 0: 0, 1: 396 },
  2: { 0: 0, 1: 0, 2: 1710 },
  3: { 0: 0, 1: 0, 2: 0, 3: 8150 },
  4: { 0: 0, 1: 0, 2: 0, 3: 1000, 4: 25900 },
  5: { 0: 0, 1: 0, 2: 0, 3: 450, 4: 4800, 5: 45000 },
  6: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1100, 5: 35000, 6: 71000 },
  7: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 700, 5: 9000, 6: 40000, 7: 80000 },
  8: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 500, 5: 2000, 6: 27000, 7: 60000, 8: 90000 },
  9: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 400, 5: 1100, 6: 5600, 7: 50000, 8: 80000, 9: 100000 },
  10: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 350, 5: 800, 6: 1300, 7: 6300, 8: 50000, 9: 80000, 10: 100000 },
};

export const KENO_PAYTABLES: Record<KenoRisk, KenoTable> = {
  classic: CLASSIC,
  low: LOW,
  medium: MEDIUM,
  high: HIGH,
};

export function isKenoRisk(value: unknown): value is KenoRisk {
  return typeof value === 'string' && (KENO_RISKS as readonly string[]).includes(value);
}

/**
 * Multiplier ×100 for a (risk, picksCount, hits) cell. 0 when the cell is empty.
 */
export function kenoMultiplierX100(risk: KenoRisk, picksCount: number, hits: number): number {
  return KENO_PAYTABLES[risk]?.[picksCount]?.[hits] ?? 0;
}

/**
 * The full multiplier row (×100) for a given pick count under a risk level —
 * one entry per hit count 0..picksCount. Drives the client's live payout strip.
 */
export function kenoMultiplierRowX100(risk: KenoRisk, picksCount: number): number[] {
  const row: number[] = [];
  for (let hits = 0; hits <= picksCount; hits++) {
    row.push(kenoMultiplierX100(risk, picksCount, hits));
  }
  return row;
}

/**
 * Validate & normalise a set of player picks. Throws on anything illegal so the
 * route can map the message to a 400. Returns the picks de-duplicated & sorted.
 */
export function normalizeKenoPicks(picks: unknown): number[] {
  if (!Array.isArray(picks)) throw new Error('picks must be an array');
  const seen = new Set<number>();
  for (const raw of picks) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > KENO_TOTAL_TILES) {
      throw new Error('picks must be integers in 1..40');
    }
    seen.add(n);
  }
  if (seen.size !== picks.length) throw new Error('picks must be unique');
  if (seen.size < KENO_MIN_PICKS || seen.size > KENO_MAX_PICKS) {
    throw new Error('pick between 1 and 10 tiles');
  }
  return [...seen].sort((a, b) => a - b);
}

export interface KenoResult {
  /** Count of picks present in the drawn set. */
  hits: number;
  /** Multiplier ×100 applied to the bet (0 when the cell pays nothing). */
  multiplierX100: number;
  /** Chips returned to the player (0 on a no-pay cell). */
  payout: number;
}

/**
 * Score a Keno round. `drawn` must be the 10 distinct numbers the server drew.
 * Pure set logic + an integer multiply — no floats on the money path.
 */
export function resolveKeno(
  picks: number[],
  drawn: number[],
  risk: KenoRisk,
  bet: number,
): KenoResult {
  if (!Number.isInteger(bet) || bet < betLimits('keno').min || bet > betLimits('keno').max) {
    throw new Error('Keno bet out of range');
  }
  const drawnSet = new Set(drawn);
  let hits = 0;
  for (const p of picks) {
    if (drawnSet.has(p)) hits++;
  }
  const multiplierX100 = kenoMultiplierX100(risk, picks.length, hits);
  const payout = Math.floor((bet * multiplierX100) / 100);
  return { hits, multiplierX100, payout };
}

// ---------------------------------------------------------------------------
// Theoretical RTP — used by tests to confirm each published table sits under a
// 100% return (house always has an edge) and to surface the exact edge per
// (risk, picks) cell. Not on any request path.
// ---------------------------------------------------------------------------

/** C(n, k) as an exact-ish float (n ≤ 40 here, well within double precision). */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

/**
 * Hypergeometric P(hits = k) when picking `picksCount` tiles and drawing
 * KENO_DRAW_COUNT from KENO_TOTAL_TILES.
 *   P = C(picksCount, k) · C(40 - picksCount, 10 - k) / C(40, 10)
 */
export function kenoHitProbability(picksCount: number, hits: number): number {
  return (
    (choose(picksCount, hits) * choose(KENO_TOTAL_TILES - picksCount, KENO_DRAW_COUNT - hits)) /
    choose(KENO_TOTAL_TILES, KENO_DRAW_COUNT)
  );
}

/** Theoretical return-to-player (1.0 = break-even) for a (risk, picks) cell. */
export function kenoRtp(risk: KenoRisk, picksCount: number): number {
  let rtp = 0;
  for (let hits = 0; hits <= picksCount; hits++) {
    rtp += kenoHitProbability(picksCount, hits) * (kenoMultiplierX100(risk, picksCount, hits) / 100);
  }
  return rtp;
}
