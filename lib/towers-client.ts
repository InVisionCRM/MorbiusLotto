/**
 * towers-client.ts — client types + API wrappers for chips Towers (/towers).
 *
 * Talks to the /api/arcade/towers/* endpoints — the backend accepts either
 * Telegram initData or the SIWE morb_session cookie, so the web client just
 * relies on apiFetchJson's cookie handling.
 *
 * All multipliers are carried ×100 (integer) end-to-end, matching the server.
 * Stateful flow: start (debits the bet, seals all 8 bombs behind a committed
 * hash) → pick* (one tile per floor) → cashout, bust, or a full-climb
 * auto-settle. `fetchTowersActive` recovers the active round after a refresh.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export { formatMultiplier } from '@/lib/keno-client';

export const TOWERS_FLOORS = 8;

export type TowersDifficulty = 'easy' | 'medium' | 'hard';

export const TOWERS_DIFFICULTY_ORDER: readonly TowersDifficulty[] = ['easy', 'medium', 'hard'];

export const TOWERS_DIFFICULTY_LABELS: Record<TowersDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export interface TowersDifficultyInfo {
  tiles: number;
  bombs: number;
  /** ladder[f] = ×100 multiplier after f completed floors (index 0 = 100). */
  ladder: number[];
}

export interface TowersInfo {
  floors: number;
  minBet: number;
  maxBet: number;
  houseEdgeBp: number;
  difficulties: Record<TowersDifficulty, TowersDifficultyInfo>;
}

export interface TowersActiveRound {
  roundId: string;
  bet: number;
  difficulty: TowersDifficulty;
  floor: number;
  picks: number[];
  multiplierX100: number;
  serverSeedHash: string;
  ladder: number[];
}

export interface TowersStartResult {
  roundId: string;
  bet: number;
  difficulty: TowersDifficulty;
  floors: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  ladder: number[];
  chipBalance: string;
}

export type TowersPickResult =
  | {
      /** Safe pick, climb continues. */
      safe: true;
      settled: false;
      tile: number;
      floor: number;
      picks: number[];
      multiplierX100: number;
      cashoutPayout: number;
      floorsRemaining: number;
    }
  | {
      /** Safe pick on the top floor — full climb, auto-settled as a win. */
      safe: true;
      settled: true;
      won: true;
      tile: number;
      floor: number;
      picks: number[];
      multiplierX100: number;
      payout: number;
      bombPositions: number[];
      status: 'settled';
      serverSeed: string;
      chipBalance: string;
    }
  | {
      /** Bomb — round settled as a loss, tower revealed. */
      safe: false;
      settled: true;
      won: false;
      tile: number;
      floor: number;
      picks: number[];
      bombPositions: number[];
      status: 'settled';
      serverSeed: string;
    };

export interface TowersCashoutResult {
  roundId: string;
  floor: number;
  picks: number[];
  multiplierX100: number;
  payout: number;
  bombPositions: number[];
  status: 'settled';
  won: true;
  serverSeed: string;
  chipBalance: string;
}

export interface TowersHistoryRound {
  roundId: string;
  bet: number;
  difficulty: TowersDifficulty;
  floor: number;
  /** picks[f] = the tile chosen on completed floor f — drives the replay reveal. */
  picks: number[];
  /** bombPositions[f] = the bomb tile on floor f — drives the replay reveal. */
  bombPositions: number[];
  multiplierX100: number;
  won: boolean;
  payout: number;
  createdAt: string;
}

export interface TowersRecentRound extends TowersHistoryRound {
  wallet: string;
}

export interface TowersLeaderboardEntry {
  wallet: string;
  rounds: number;
  wagered: string;
  won: string;
  net: string;
}

export interface TowersVerifyResult {
  roundId: string;
  bet: number;
  difficulty: TowersDifficulty;
  tiles: number;
  floors: number;
  floor: number;
  picks: number[];
  multiplierX100: number;
  status: 'settled';
  won: boolean;
  payout: number;
  serverSeedHash: string;
  serverSeed: string;
  bombPositions: number[];
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  createdAt: string;
  settledAt: string | null;
  recipe: string;
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchTowersInfo(): Promise<TowersInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/towers/info`);
  const j = await r.json();
  return j as TowersInfo;
}

/** The wallet's active round (resume after refresh), or null. Authed. */
export async function fetchTowersActive(): Promise<TowersActiveRound | null> {
  const j = await apiFetchJson<{ active: TowersActiveRound | null }>('/api/arcade/towers/active');
  return j.active ?? null;
}

export async function startTowers(args: {
  bet: number;
  difficulty: TowersDifficulty;
  clientSeed?: string;
}): Promise<TowersStartResult> {
  return apiFetchJson<TowersStartResult>('/api/arcade/towers/start', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function pickTowers(roundId: string, tile: number): Promise<TowersPickResult> {
  return apiFetchJson<TowersPickResult>('/api/arcade/towers/pick', {
    method: 'POST',
    body: JSON.stringify({ roundId, tile }),
  });
}

export async function cashoutTowers(roundId: string): Promise<TowersCashoutResult> {
  return apiFetchJson<TowersCashoutResult>('/api/arcade/towers/cashout', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

export async function fetchTowersHistory(limit = 25): Promise<TowersHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: TowersHistoryRound[] }>(
    `/api/arcade/towers/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchTowersRecent(limit = 25): Promise<TowersRecentRound[]> {
  const r = await fetch(`${apiBase()}/api/arcade/towers/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as TowersRecentRound[];
}

export async function fetchTowersLeaderboard(limit = 10): Promise<TowersLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/towers/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as TowersLeaderboardEntry[];
}

export async function verifyTowers(roundId: string): Promise<TowersVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/towers/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) {
    let detail = '';
    try {
      detail = ((await r.json()) as { error?: string }).error ?? '';
    } catch {
      /* plain 404 body */
    }
    throw new Error(detail || 'Round not found');
  }
  return (await r.json()) as TowersVerifyResult;
}
