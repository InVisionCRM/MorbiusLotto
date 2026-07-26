/**
 * roulette2-client.ts — client types, constants + API wrappers for chips
 * Roulette (/roulette2). European single-zero, instant settlement.
 *
 * Constants mirror server/src/services/arcade-roulette.ts exactly — the
 * fairness modal re-derives results and payouts locally from these tables.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export type Roulette2BetType =
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

export interface Roulette2Bet {
  type: Roulette2BetType;
  amount: number;
  numbers?: number[];
}

export const ROULETTE2_RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

/** Physical pocket order of a European wheel, clockwise from 0. */
export const ROULETTE2_WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
  10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const ROULETTE2_DOZENS: number[][] = [
  Array.from({ length: 12 }, (_, i) => i + 1),
  Array.from({ length: 12 }, (_, i) => i + 13),
  Array.from({ length: 12 }, (_, i) => i + 25),
];

export const ROULETTE2_COLUMNS: number[][] = [
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
];

export type PocketColor = 'green' | 'red' | 'black';

export function pocketColor(n: number): PocketColor {
  if (n === 0) return 'green';
  return ROULETTE2_RED_NUMBERS.has(n) ? 'red' : 'black';
}

/** Gross multiplier (chips returned on win, stake included) — mirrors the server. */
export function roulette2PayoutMultiplier(type: Roulette2BetType): number {
  switch (type) {
    case 'straight': return 36;
    case 'split':    return 18;
    case 'street':   return 12;
    case 'corner':   return 9;
    case 'line':     return 6;
    case 'dozen':
    case 'column':   return 3;
    default:         return 2;
  }
}

/** Numbers covered by a bet — for hover highlighting and local verification. */
export function roulette2Coverage(bet: Roulette2Bet): Set<number> {
  switch (bet.type) {
    case 'red':
      return new Set(ROULETTE2_RED_NUMBERS);
    case 'black':
      return new Set(
        Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => !ROULETTE2_RED_NUMBERS.has(n)),
      );
    case 'even':
      return new Set(Array.from({ length: 18 }, (_, i) => (i + 1) * 2));
    case 'odd':
      return new Set(Array.from({ length: 18 }, (_, i) => i * 2 + 1));
    case 'low':
      return new Set(Array.from({ length: 18 }, (_, i) => i + 1));
    case 'high':
      return new Set(Array.from({ length: 18 }, (_, i) => i + 19));
    default:
      return new Set(bet.numbers ?? []);
  }
}

/** Whether the pocket wins the bet — mirrors the server's isRouletteWin. */
export function roulette2IsWin(bet: Roulette2Bet, result: number): boolean {
  if (bet.type === 'red') return ROULETTE2_RED_NUMBERS.has(result);
  if (bet.type === 'black') return result !== 0 && !ROULETTE2_RED_NUMBERS.has(result);
  if (bet.type === 'even') return result !== 0 && result % 2 === 0;
  if (bet.type === 'odd') return result % 2 === 1;
  if (bet.type === 'low') return result >= 1 && result <= 18;
  if (bet.type === 'high') return result >= 19 && result <= 36;
  return (bet.numbers ?? []).includes(result);
}

/** Gross payout for one bet at a result (0 when losing) — mirrors the server. */
export function roulette2BetPayout(bet: Roulette2Bet, result: number): number {
  if (!roulette2IsWin(bet, result)) return 0;
  return Math.floor(bet.amount * roulette2PayoutMultiplier(bet.type));
}

export interface Roulette2Info {
  minBet: number;
  maxBetPerZone: number;
  maxTotalBet: number;
  maxZones: number;
  payouts: Record<string, number>;
}

export interface Roulette2SpinResult {
  spinId: string;
  bets: Roulette2Bet[];
  totalBet: number;
  result: number;
  payouts: number[];
  totalPayout: number;
  serverSeedHash: string;
  /** Sequential nonce this spin consumed under the active seed commitment. */
  nonce: number;
  chipBalance: string;
}

export interface Roulette2HistorySpin {
  spinId: string;
  bets: Roulette2Bet[];
  totalBet: number;
  result: number;
  totalPayout: number;
  createdAt: string;
}

export interface Roulette2RecentSpin {
  spinId: string;
  wallet: string;
  totalBet: number;
  result: number;
  totalPayout: number;
  createdAt: string;
}

export interface Roulette2LeaderboardEntry {
  wallet: string;
  spins: number;
  wagered: string;
  won: string;
  net: string;
}

export interface Roulette2VerifyResult {
  spinId: string;
  bets: Roulette2Bet[];
  totalBet: number;
  result: number;
  payouts: number[];
  totalPayout: number;
  serverSeedHash: string;
  /** null until the spin's seed pair has been rotated (revealed). */
  serverSeed: string | null;
  seedRevealed: boolean;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  recipe: string;
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchRoulette2Info(): Promise<Roulette2Info> {
  const r = await fetch(`${apiBase()}/api/arcade/roulette/info`);
  const j = await r.json();
  return j as Roulette2Info;
}

export async function spinRoulette2(args: {
  bets: Roulette2Bet[];
}): Promise<Roulette2SpinResult> {
  // Client seed is managed on the persistent seed pair (see arcade-seed-client),
  // not passed per-spin — the server derives the pocket from the pre-committed seed.
  return apiFetchJson<Roulette2SpinResult>('/api/arcade/roulette/spin', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function fetchRoulette2History(limit = 25): Promise<Roulette2HistorySpin[]> {
  const j = await apiFetchJson<{ spins: Roulette2HistorySpin[] }>(
    `/api/arcade/roulette/history?limit=${limit}`,
  );
  return j.spins ?? [];
}

export async function fetchRoulette2Recent(limit = 25): Promise<Roulette2RecentSpin[]> {
  const r = await fetch(`${apiBase()}/api/arcade/roulette/recent?limit=${limit}`);
  const j = await r.json();
  return (j.spins ?? []) as Roulette2RecentSpin[];
}

export async function fetchRoulette2Leaderboard(limit = 10): Promise<Roulette2LeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/roulette/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as Roulette2LeaderboardEntry[];
}

export async function verifyRoulette2(spinId: string): Promise<Roulette2VerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/roulette/verify/${encodeURIComponent(spinId)}`);
  if (!r.ok) throw new Error('Spin not found');
  return (await r.json()) as Roulette2VerifyResult;
}
