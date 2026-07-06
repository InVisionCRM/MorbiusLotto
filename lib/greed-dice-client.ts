/**
 * greed-dice-client.ts — client types + API wrappers for chips Greed Dice
 * (/greed-dice), the Farkle push-your-luck game.
 *
 * Talks to the /api/arcade/greed-dice/* endpoints — the backend accepts either
 * Telegram initData or the SIWE morb_session cookie, so the web client just
 * relies on apiFetchJson's cookie handling.
 *
 * Stateful flow: start (debits the bet, seals the seed, rolls the starting dice)
 * → roll (bank scoring dice + reroll the rest; farkle ends the turn; hot dice
 * rerolls the full set) → bank (cash out the multiplier). `fetchGreedDiceActive`
 * recovers the active turn after a refresh. All multipliers are ×100 integers.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export { formatMultiplier } from '@/lib/keno-client';

export type GreedDiceVolatility = 'five' | 'six' | 'seven';

export const GREED_DICE_VOLATILITY_ORDER: readonly GreedDiceVolatility[] = ['five', 'six', 'seven'];

export const GREED_DICE_VOLATILITY_LABELS: Record<GreedDiceVolatility, string> = {
  five: '5 dice',
  six: '6 dice',
  seven: '7 dice',
};

/** Short volatility tag for the tile/board. */
export const GREED_DICE_VOLATILITY_META: Record<GreedDiceVolatility, string> = {
  five: 'high vol',
  six: 'balanced',
  seven: 'low vol',
};

export interface GreedDiceVolatilityConfig {
  n: number;
  scale: number;
}

export interface GreedDiceInfo {
  minBet: number;
  maxBet: number;
  volatilities: Record<GreedDiceVolatility, GreedDiceVolatilityConfig>;
}

export interface GreedDiceRollLogEntry {
  dice: number[];
  kept: number[];
  points: number;
  hot: boolean;
}

export interface GreedDiceActiveRound {
  roundId: string;
  bet: number;
  volatility: GreedDiceVolatility;
  diceCount: number;
  points: number;
  multiplierX100: number;
  remaining: number;
  lastRoll: GreedDiceRollLogEntry | null;
  rollCount: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface GreedDiceStartResult {
  roundId: string;
  bet: number;
  volatility: GreedDiceVolatility;
  diceCount: number;
  dice: number[];
  kept: number[];
  rollPoints: number;
  hot: boolean;
  farkle: boolean;
  points: number;
  multiplierX100: number;
  remaining: number;
  status: 'active' | 'settled';
  /** Only present on an instant farkle (round settled at start). */
  serverSeed?: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  chipBalance: string;
}

export type GreedDiceRollResult =
  | {
      /** Scored — turn continues. */
      farkle: false;
      settled: false;
      dice: number[];
      kept: number[];
      rollPoints: number;
      hot: boolean;
      points: number;
      multiplierX100: number;
      remaining: number;
      cashoutPayout: number;
    }
  | {
      /** No scoring dice — farkle, turn forfeit, seed revealed. */
      farkle: true;
      settled: true;
      won: false;
      dice: number[];
      kept: [];
      rollPoints: 0;
      hot: false;
      points: 0;
      multiplierX100: 0;
      payout: 0;
      status: 'settled';
      serverSeed: string;
    };

export interface GreedDiceBankResult {
  roundId: string;
  points: number;
  multiplierX100: number;
  payout: number;
  status: 'settled';
  won: true;
  serverSeed: string;
  chipBalance: string;
}

export interface GreedDiceHistoryRound {
  roundId: string;
  bet: number;
  volatility: GreedDiceVolatility;
  diceCount: number;
  points: number;
  multiplierX100: number;
  rolls: number;
  /** Full roll log (dice + kept per roll) — lets a settled turn be re-watched. */
  rollLog: GreedDiceRollLogEntry[];
  won: boolean;
  payout: number;
  createdAt: string;
}

export interface GreedDiceRecentRound extends GreedDiceHistoryRound {
  wallet: string;
}

export interface GreedDiceLeaderboardEntry {
  wallet: string;
  rounds: number;
  wagered: string;
  won: string;
  net: string;
}

export interface GreedDiceVerifyResult {
  roundId: string;
  bet: number;
  volatility: GreedDiceVolatility;
  diceCount: number;
  scale: number;
  points: number;
  multiplierX100: number;
  status: 'settled';
  won: boolean;
  payout: number;
  rollLog: GreedDiceRollLogEntry[];
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  settledAt: string | null;
  recipe: string;
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchGreedDiceInfo(): Promise<GreedDiceInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/greed-dice/info`);
  const j = await r.json();
  return j as GreedDiceInfo;
}

/** The wallet's active turn (resume after refresh), or null. Authed. */
export async function fetchGreedDiceActive(): Promise<GreedDiceActiveRound | null> {
  const j = await apiFetchJson<{ active: GreedDiceActiveRound | null }>(
    '/api/arcade/greed-dice/active',
  );
  return j.active ?? null;
}

export async function startGreedDice(args: {
  bet: number;
  volatility: GreedDiceVolatility;
  clientSeed?: string;
}): Promise<GreedDiceStartResult> {
  return apiFetchJson<GreedDiceStartResult>('/api/arcade/greed-dice/start', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function rollGreedDice(roundId: string): Promise<GreedDiceRollResult> {
  return apiFetchJson<GreedDiceRollResult>('/api/arcade/greed-dice/roll', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

export async function bankGreedDice(roundId: string): Promise<GreedDiceBankResult> {
  return apiFetchJson<GreedDiceBankResult>('/api/arcade/greed-dice/bank', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

export async function fetchGreedDiceHistory(limit = 25): Promise<GreedDiceHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: GreedDiceHistoryRound[] }>(
    `/api/arcade/greed-dice/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchGreedDiceRecent(limit = 25): Promise<GreedDiceRecentRound[]> {
  const r = await fetch(`${apiBase()}/api/arcade/greed-dice/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as GreedDiceRecentRound[];
}

export async function fetchGreedDiceLeaderboard(limit = 10): Promise<GreedDiceLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/greed-dice/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as GreedDiceLeaderboardEntry[];
}

export async function verifyGreedDice(roundId: string): Promise<GreedDiceVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/greed-dice/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) {
    let detail = '';
    try {
      detail = ((await r.json()) as { error?: string }).error ?? '';
    } catch {
      /* plain 404 body */
    }
    throw new Error(detail || 'Round not found');
  }
  return (await r.json()) as GreedDiceVerifyResult;
}
