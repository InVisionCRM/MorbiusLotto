/**
 * arcade-roulette.ts — MORBIUS Arcade: Roulette (European, single-zero).
 *
 * European roulette has 37 pockets (0–36). The result is derived from
 * HMAC-SHA256 byte stream → bytesToFloat → floor(r × 37).
 *
 * Supported bet types and payouts (gross chips returned on a win — includes
 * returned stake, so betAmount × multiplier):
 *   straight  (single number)  → 36× (35:1 profit)
 *   split     (2 adjacent)     → 18× (17:1 profit)
 *   street    (3-number row)   → 12× (11:1 profit)
 *   corner    (4-number block) →  9× (8:1 profit)
 *   line      (6-number block) →  6× (5:1 profit)
 *   dozen     (1st/2nd/3rd)    →  3× (2:1 profit)
 *   column    (col 1/2/3)      →  3× (2:1 profit)
 *   red/black                  →  2× (1:1 profit)
 *   even/odd                   →  2× (1:1 profit)
 *   low/high  (1-18 / 19-36)   →  2× (1:1 profit)
 *
 * Zero (0) loses all bets except a straight bet on 0.
 */

export const ROULETTE_MIN_BET = 5;
export const ROULETTE_MAX_BET_PER_ZONE = 1000;
export const ROULETTE_MAX_TOTAL_BET = 5000;
export const ROULETTE_MAX_ZONES = 20;

export const ROULETTE_RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export const ROULETTE_WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
  10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export type RouletteBetType =
  | 'straight'
  | 'split'
  | 'street'
  | 'corner'
  | 'line'
  | 'dozen'
  | 'column'
  | 'red'
  | 'black'
  | 'even'
  | 'odd'
  | 'low'
  | 'high';

export interface RouletteBet {
  type: RouletteBetType;
  amount: number;
  /** Numbers covered — required for straight/split/street/corner/line. */
  numbers?: number[];
}

/** Gross multiplier (bet × multiplier = chips returned on win, including stake). */
export function roulettePayoutMultiplier(type: RouletteBetType): number {
  switch (type) {
    case 'straight': return 36;
    case 'split':    return 18;
    case 'street':   return 12;
    case 'corner':   return 9;
    case 'line':     return 6;
    case 'dozen':
    case 'column':   return 3;
    default:         return 2; // even-money bets
  }
}

/** Whether the result pocket wins for a given bet. */
export function isRouletteWin(bet: RouletteBet, result: number): boolean {
  switch (bet.type) {
    case 'straight':
      return (bet.numbers ?? []).includes(result);
    case 'split':
    case 'street':
    case 'corner':
    case 'line':
      return (bet.numbers ?? []).includes(result);
    case 'dozen':
      if (!bet.numbers || bet.numbers.length === 0) return false;
      return bet.numbers.includes(result);
    case 'column':
      if (!bet.numbers || bet.numbers.length === 0) return false;
      return bet.numbers.includes(result);
    case 'red':
      return ROULETTE_RED_NUMBERS.has(result);
    case 'black':
      return result !== 0 && !ROULETTE_RED_NUMBERS.has(result);
    case 'even':
      return result !== 0 && result % 2 === 0;
    case 'odd':
      return result % 2 === 1;
    case 'low':
      return result >= 1 && result <= 18;
    case 'high':
      return result >= 19 && result <= 36;
  }
}

/** Gross payout for a single winning bet (0 if losing). */
export function rouletteBetPayout(bet: RouletteBet, result: number): number {
  if (!isRouletteWin(bet, result)) return 0;
  return Math.floor(bet.amount * roulettePayoutMultiplier(bet.type));
}

/** Derive the result pocket (0-36) from a float r ∈ [0, 1). */
export function rouletteResultFromFloat(r: number): number {
  if (!Number.isFinite(r) || r < 0 || r >= 1) throw new Error('Float out of range [0,1)');
  return Math.floor(r * 37);
}

/** Numbers covered by the first dozen (1-12). */
export const DOZEN_1 = Array.from({ length: 12 }, (_, i) => i + 1);
/** Numbers covered by the second dozen (13-24). */
export const DOZEN_2 = Array.from({ length: 12 }, (_, i) => i + 13);
/** Numbers covered by the third dozen (25-36). */
export const DOZEN_3 = Array.from({ length: 12 }, (_, i) => i + 25);

/** Numbers in each column (bottom, middle, top row of the felt grid). */
export const COLUMN_1 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];
export const COLUMN_2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
export const COLUMN_3 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];

const VALID_BET_TYPES = new Set<RouletteBetType>([
  'straight', 'split', 'street', 'corner', 'line',
  'dozen', 'column', 'red', 'black', 'even', 'odd', 'low', 'high',
]);

function validStraight(bet: RouletteBet): boolean {
  return Array.isArray(bet.numbers) && bet.numbers.length === 1 &&
    bet.numbers[0] >= 0 && bet.numbers[0] <= 36;
}

function validInnerBet(bet: RouletteBet, expectedLen: number): boolean {
  return (
    Array.isArray(bet.numbers) &&
    bet.numbers.length === expectedLen &&
    bet.numbers.every((n) => n >= 1 && n <= 36)
  );
}

function validOuterBet(bet: RouletteBet): boolean {
  return (
    Array.isArray(bet.numbers) &&
    bet.numbers.length > 0 &&
    bet.numbers.every((n) => n >= 1 && n <= 36)
  );
}

export function validateRouletteBets(
  bets: unknown,
): { ok: false; error: string } | { ok: true; total: number } {
  if (!Array.isArray(bets) || bets.length === 0) {
    return { ok: false, error: 'No bets placed.' };
  }
  if (bets.length > ROULETTE_MAX_ZONES) {
    return { ok: false, error: `Too many bet zones (max ${ROULETTE_MAX_ZONES}).` };
  }
  let total = 0;
  for (const b of bets) {
    if (typeof b !== 'object' || b === null) return { ok: false, error: 'Invalid bet object.' };
    const bet = b as RouletteBet;
    if (!VALID_BET_TYPES.has(bet.type)) return { ok: false, error: `Unknown bet type: ${bet.type}` };
    const amt = Math.floor(Number(bet.amount));
    if (!Number.isFinite(amt) || amt < ROULETTE_MIN_BET) {
      return { ok: false, error: `Minimum bet per zone is ${ROULETTE_MIN_BET} chips.` };
    }
    if (amt > ROULETTE_MAX_BET_PER_ZONE) {
      return { ok: false, error: `Max bet per zone is ${ROULETTE_MAX_BET_PER_ZONE} chips.` };
    }
    switch (bet.type) {
      case 'straight':
        if (!validStraight(bet)) return { ok: false, error: 'Straight bet needs exactly one number (0-36).' };
        break;
      case 'split':
        if (!validInnerBet(bet, 2)) return { ok: false, error: 'Split bet needs 2 numbers.' };
        break;
      case 'street':
        if (!validInnerBet(bet, 3)) return { ok: false, error: 'Street bet needs 3 numbers.' };
        break;
      case 'corner':
        if (!validInnerBet(bet, 4)) return { ok: false, error: 'Corner bet needs 4 numbers.' };
        break;
      case 'line':
        if (!validInnerBet(bet, 6)) return { ok: false, error: 'Line bet needs 6 numbers.' };
        break;
      case 'dozen':
      case 'column':
        if (!validOuterBet(bet)) return { ok: false, error: `${bet.type} bet needs numbers array.` };
        break;
    }
    total += amt;
  }
  if (total > ROULETTE_MAX_TOTAL_BET) {
    return { ok: false, error: `Total bet exceeds ${ROULETTE_MAX_TOTAL_BET} chips.` };
  }
  return { ok: true, total };
}

/** Compute per-bet payouts. Parallel array to `bets`. */
export function resolveRoulettePayouts(bets: RouletteBet[], result: number): number[] {
  return bets.map((b) => rouletteBetPayout(b, result));
}

export function sumRoulettePayouts(payouts: number[]): number {
  return payouts.reduce((a, b) => a + b, 0);
}
