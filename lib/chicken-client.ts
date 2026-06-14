/**
 * chicken-client.ts — client types + API wrappers for chips Chicken (/chicken).
 *
 * Talks to the /api/arcade/chicken/* endpoints — the backend accepts either
 * Telegram initData or the SIWE morb_session cookie, so the web client just
 * relies on apiFetchJson's cookie handling.
 *
 * All multipliers are carried ×100 (integer) end-to-end, matching the server.
 * Stateful flow: start (debits the bet, seals every lane behind a committed
 * hash) → step (cross one lane at a time) → cashout, bumper, or a full-crossing
 * auto-settle. `fetchChickenActive` recovers the active round after a refresh.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export { formatMultiplier } from '@/lib/keno-client';

export type ChickenDifficulty = 'easy' | 'medium' | 'hard';

export const CHICKEN_DIFFICULTY_ORDER: readonly ChickenDifficulty[] = ['easy', 'medium', 'hard'];

export const CHICKEN_DIFFICULTY_LABELS: Record<ChickenDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export interface ChickenDifficultyInfo {
  lanes: number;
  outcomes: number;
  bumpers: number;
  /** ladder[L] = ×100 multiplier after L crossed lanes (index 0 = 100). */
  ladder: number[];
}

export interface ChickenInfo {
  minBet: number;
  maxBet: number;
  houseEdgeBp: number;
  difficulties: Record<ChickenDifficulty, ChickenDifficultyInfo>;
}

export interface ChickenActiveRound {
  roundId: string;
  bet: number;
  difficulty: ChickenDifficulty;
  lane: number;
  multiplierX100: number;
  serverSeedHash: string;
  lanes: number;
  ladder: number[];
}

export interface ChickenStartResult {
  roundId: string;
  bet: number;
  difficulty: ChickenDifficulty;
  lanes: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  ladder: number[];
  chipBalance: string;
}

export type ChickenStepResult =
  | {
      /** Safe step, crossing continues. */
      safe: true;
      settled: false;
      lane: number;
      multiplierX100: number;
      cashoutPayout: number;
      lanesRemaining: number;
    }
  | {
      /** Safe step onto the final lane — full crossing, auto-settled as a win. */
      safe: true;
      settled: true;
      won: true;
      lane: number;
      multiplierX100: number;
      payout: number;
      bumperLanes: number[];
      status: 'settled';
      serverSeed: string;
      chipBalance: string;
    }
  | {
      /** Bumper — round settled as a loss, road revealed. */
      safe: false;
      settled: true;
      won: false;
      lane: number;
      bumperLanes: number[];
      status: 'settled';
      serverSeed: string;
    };

export interface ChickenCashoutResult {
  roundId: string;
  lane: number;
  multiplierX100: number;
  payout: number;
  bumperLanes: number[];
  status: 'settled';
  won: true;
  serverSeed: string;
  chipBalance: string;
}

export interface ChickenHistoryRound {
  roundId: string;
  bet: number;
  difficulty: ChickenDifficulty;
  lane: number;
  multiplierX100: number;
  won: boolean;
  payout: number;
  createdAt: string;
}

export interface ChickenRecentRound extends ChickenHistoryRound {
  wallet: string;
}

export interface ChickenLeaderboardEntry {
  wallet: string;
  rounds: number;
  wagered: string;
  won: string;
  net: string;
}

export interface ChickenVerifyResult {
  roundId: string;
  bet: number;
  difficulty: ChickenDifficulty;
  lanes: number;
  outcomes: number;
  bumpers: number;
  lane: number;
  multiplierX100: number;
  status: 'settled';
  won: boolean;
  payout: number;
  serverSeedHash: string;
  serverSeed: string;
  bumperLanes: number[];
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

export async function fetchChickenInfo(): Promise<ChickenInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/chicken/info`);
  const j = await r.json();
  return j as ChickenInfo;
}

/** The wallet's active round (resume after refresh), or null. Authed. */
export async function fetchChickenActive(): Promise<ChickenActiveRound | null> {
  const j = await apiFetchJson<{ active: ChickenActiveRound | null }>('/api/arcade/chicken/active');
  return j.active ?? null;
}

export async function startChicken(args: {
  bet: number;
  difficulty: ChickenDifficulty;
  clientSeed?: string;
}): Promise<ChickenStartResult> {
  return apiFetchJson<ChickenStartResult>('/api/arcade/chicken/start', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function stepChicken(roundId: string): Promise<ChickenStepResult> {
  return apiFetchJson<ChickenStepResult>('/api/arcade/chicken/step', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

export async function cashoutChicken(roundId: string): Promise<ChickenCashoutResult> {
  return apiFetchJson<ChickenCashoutResult>('/api/arcade/chicken/cashout', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

export async function fetchChickenHistory(limit = 25): Promise<ChickenHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: ChickenHistoryRound[] }>(
    `/api/arcade/chicken/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchChickenRecent(limit = 25): Promise<ChickenRecentRound[]> {
  const r = await fetch(`${apiBase()}/api/arcade/chicken/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as ChickenRecentRound[];
}

export async function fetchChickenLeaderboard(limit = 10): Promise<ChickenLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/chicken/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as ChickenLeaderboardEntry[];
}

export async function verifyChicken(roundId: string): Promise<ChickenVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/chicken/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) {
    let detail = '';
    try {
      detail = ((await r.json()) as { error?: string }).error ?? '';
    } catch {
      /* plain 404 body */
    }
    throw new Error(detail || 'Round not found');
  }
  return (await r.json()) as ChickenVerifyResult;
}
