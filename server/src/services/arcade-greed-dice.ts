/**
 * arcade-greed-dice.ts — MORBIUS Arcade: Greed Dice (Farkle push-your-luck).
 *
 * Faithful port of public/greed-dice-lab.html. The player bets, then rolls a
 * set of dice. Every scoring die is banked automatically (1 = 100, 5 = 50,
 * three-of-a-kind = face × 100 / 1000 for ones, four/five/six-of-a-kind escalate
 * the triple base ×2 / ×4 / ×8). The accumulated points convert to a payout
 * multiplier via a per-volatility `scale`. After each roll the player chooses to
 * BANK (cash out the multiplier) or reroll the remaining dice. A roll that scores
 * nothing is a FARKLE — the whole turn is forfeit. Clearing every die is HOT
 * DICE — reroll the full set, points intact.
 *
 * Provably fair: every die face — the initial roll AND every reroll — is drawn
 * from the platform's HMAC-SHA256 byte stream (the same primitive as the poker
 * shuffle, the lottery 6-of-55 draw, Chicken, Mines, Towers). The server commits
 * to `serverSeedHash` at round start and reveals `serverSeed` only when the round
 * settles. Faces are consumed in roll order at a deterministic cursor:
 *   cursor = (total dice rolled so far this round) × 4
 *   face   = 1 + floor(bytesToFloat(stream(cursor)) × 6)
 * so anyone can replay the whole turn from the seed (the keep/reroll choices are
 * forced by the scoring rules, so the deck order alone reproduces the turn).
 *
 * Scale tuning (Monte-Carlo'd, matching the lab): starting dice 5/6/7 with bust
 * ~25/22/20% and scale 300/440/620 — even strong bank/push play sits just under
 * the stake on average (≈ 96% RTP). Multipliers are carried ×100 as integers so
 * the wallet path never compares floats:
 *   multiplierX100 = round(points / scale × 100)
 *   payout         = floor(bet × multiplierX100 / 100)
 */
import { betLimits, DEFAULT_BET_LIMITS } from '../lib/game-limits';

export const GREED_DICE_MIN_BET = DEFAULT_BET_LIMITS.greed_dice.min;
export const GREED_DICE_MAX_BET = DEFAULT_BET_LIMITS.greed_dice.max;

export type GreedDiceVolatility = 'five' | 'six' | 'seven';

export interface GreedDiceVolatilityConfig {
  /** Starting dice count for the turn. */
  n: number;
  /** points → multiplier scale: multiplierX100 = round(points / scale × 100). */
  scale: number;
}

/**
 * Volatility configs — faithful to the lab's DIFFS table. Fewer dice farkle more
 * often (higher variance) but the scale is tuned per variant so the long-run
 * return is the same across all three.
 */
export const GREED_DICE_VOLATILITIES: Record<GreedDiceVolatility, GreedDiceVolatilityConfig> = {
  five: { n: 5, scale: 300 },
  six: { n: 6, scale: 440 },
  seven: { n: 7, scale: 620 },
};

export const GREED_DICE_VOLATILITY_ORDER: readonly GreedDiceVolatility[] = ['five', 'six', 'seven'];

export function isGreedDiceVolatility(value: unknown): value is GreedDiceVolatility {
  return value === 'five' || value === 'six' || value === 'seven';
}

export interface GreedDiceRollLogEntry {
  /** The faces rolled (1–6) in draw order. */
  dice: number[];
  /** Indices into `dice` that scored and were auto-kept. */
  kept: number[];
  /** Points scored by this roll. */
  points: number;
  /** TRUE when every die in this roll scored (hot dice → reroll the full set). */
  hot: boolean;
}

export interface GreedDiceScoreResult {
  points: number;
  kept: number[];
  /** points > 0 AND every die scored → reroll the full set. */
  hot: boolean;
}

/**
 * Score a set of dice — faithful port of the lab's `scoreRoll`. Auto-keeps every
 * scoring die:
 *   - any three-or-more of a kind scores first (base = 1000 for ones, else
 *     face × 100; multiplied by 1 / 2 / 4 / 8 for 3 / 4 / 5 / 6 of a kind), and
 *     consumes ALL of that face;
 *   - then leftover single 1s score 100 each and leftover single 5s 50 each.
 * Returns the points, the kept indices, and whether it cleared the whole set.
 */
export function scoreGreedDiceRoll(dice: number[]): GreedDiceScoreResult {
  const byFace: Record<number, number[]> = {};
  for (let i = 0; i < dice.length; i++) {
    (byFace[dice[i]] = byFace[dice[i]] || []).push(i);
  }
  let points = 0;
  let kept: number[] = [];
  for (let f = 1; f <= 6; f++) {
    const idxs = byFace[f] || [];
    const cnt = idxs.length;
    if (cnt >= 3) {
      const base = f === 1 ? 1000 : f * 100;
      const m = cnt === 3 ? 1 : cnt === 4 ? 2 : cnt === 5 ? 4 : 8;
      points += base * m;
      kept = kept.concat(idxs);
      byFace[f] = [];
    }
  }
  for (const i of byFace[1] || []) {
    points += 100;
    kept.push(i);
  }
  for (const i of byFace[5] || []) {
    points += 50;
    kept.push(i);
  }
  return { points, kept, hot: points > 0 && kept.length === dice.length };
}

/**
 * Points → payout multiplier ×100 for a volatility. Faithful to the lab's
 * `multX100 = round(points / scale × 100)`. 0 when points = 0.
 */
export function greedDiceMultiplierX100(points: number, volatility: GreedDiceVolatility): number {
  if (!Number.isInteger(points) || points < 0) {
    throw new Error('Greed Dice points must be a non-negative integer');
  }
  const { scale } = GREED_DICE_VOLATILITIES[volatility];
  return Math.round((points / scale) * 100);
}

/**
 * Payout in chips for a /bank at the given points + volatility.
 * floor(bet × multiplierX100 / 100). Matches the verifier's arithmetic.
 */
export function greedDicePayout(bet: number, points: number, volatility: GreedDiceVolatility): number {
  if (!Number.isInteger(bet) || bet < betLimits('greed_dice').min || bet > betLimits('greed_dice').max) {
    throw new Error('Greed Dice bet out of range');
  }
  const multX100 = greedDiceMultiplierX100(points, volatility);
  return Math.floor((bet * multX100) / 100);
}

/**
 * Draw `count` die faces (1–6) from the committed HMAC byte stream, starting at
 * `startCursor` (= total dice already rolled this round × 4). Consumes 4 bytes
 * per face, advancing the cursor in lockstep so the verifier re-derives the exact
 * same sequence. `bytesToFloat` maps the 4 bytes to [0,1); face = 1 + floor(r×6).
 */
export function drawGreedDiceFaces(
  hmacByteStream: (cursor: number) => Buffer | Uint8Array,
  bytesToFloat: (bytes: Buffer | Uint8Array) => number,
  startCursor: number,
  count: number,
): number[] {
  const faces: number[] = [];
  let cursor = startCursor;
  for (let i = 0; i < count; i++) {
    const r = bytesToFloat(hmacByteStream(cursor));
    cursor += 4;
    // r < 1 always, so floor(r × 6) ≤ 5 → face in [1, 6].
    faces.push(1 + Math.min(5, Math.floor(r * 6)));
  }
  return faces;
}

/**
 * Total dice rolled so far across a roll_log — the cursor offset (× 4) for the
 * next roll. Sums each logged roll's dice length.
 */
export function totalDiceRolled(rollLog: GreedDiceRollLogEntry[]): number {
  let total = 0;
  for (const r of rollLog) total += r.dice.length;
  return total;
}
