/**
 * heist-client.ts — client types + API wrappers for chips Heist (/heist).
 *
 * Push-your-luck vault cracking (Mines/Towers family). Talks to the
 * /api/arcade/heist/* endpoints — the backend accepts either Telegram initData
 * or the SIWE morb_session cookie, so the web client just relies on
 * apiFetchJson's cookie handling.
 *
 * All multipliers are carried ×100 (integer) end-to-end, matching the server.
 * Stateful flow: start (debits the bet, seals every room's alarm door(s) behind
 * a committed hash) → step (open a door index per room) → cashout (escape),
 * bust, or a full-clear auto-settle. `fetchHeistActive` recovers the active
 * round after a refresh.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export { formatMultiplier } from '@/lib/keno-client';

export type HeistDifficulty = 'sneaky' | 'standard' | 'daring';

export const HEIST_DIFFICULTY_ORDER: readonly HeistDifficulty[] = ['sneaky', 'standard', 'daring'];

export const HEIST_DIFFICULTY_LABELS: Record<HeistDifficulty, string> = {
  sneaky: 'Sneaky',
  standard: 'Standard',
  daring: 'Daring',
};

export interface HeistDifficultyInfo {
  doors: number;
  alarms: number;
  rooms: number;
  /** ladder[r] = ×100 multiplier after r cleared rooms (index 0 = 100). */
  ladder: number[];
}

export interface HeistInfo {
  minBet: number;
  maxBet: number;
  houseEdgeBp: number;
  difficulties: Record<HeistDifficulty, HeistDifficultyInfo>;
}

export interface HeistActiveRound {
  roundId: string;
  bet: number;
  difficulty: HeistDifficulty;
  room: number;
  picks: number[];
  multiplierX100: number;
  serverSeedHash: string;
  rooms: number;
  doors: number;
  alarms: number;
  ladder: number[];
}

export interface HeistStartResult {
  roundId: string;
  bet: number;
  difficulty: HeistDifficulty;
  rooms: number;
  doors: number;
  alarms: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  ladder: number[];
  chipBalance: string;
}

export type HeistStepResult =
  | {
      /** Safe pick, the heist continues. */
      safe: true;
      settled: false;
      door: number;
      room: number;
      picks: number[];
      multiplierX100: number;
      cashoutPayout: number;
      roomsRemaining: number;
    }
  | {
      /** Safe pick in the last room — full clear, auto-settled as a win. */
      safe: true;
      settled: true;
      won: true;
      door: number;
      room: number;
      picks: number[];
      multiplierX100: number;
      payout: number;
      alarmDoors: number[][];
      status: 'settled';
      serverSeed: string;
      chipBalance: string;
    }
  | {
      /** Alarm — round settled as a loss, vault revealed. */
      safe: false;
      settled: true;
      won: false;
      door: number;
      room: number;
      picks: number[];
      alarmDoors: number[][];
      status: 'settled';
      serverSeed: string;
    };

export interface HeistCashoutResult {
  roundId: string;
  room: number;
  picks: number[];
  multiplierX100: number;
  payout: number;
  alarmDoors: number[][];
  status: 'settled';
  won: true;
  serverSeed: string;
  chipBalance: string;
}

export interface HeistHistoryRound {
  roundId: string;
  bet: number;
  difficulty: HeistDifficulty;
  room: number;
  multiplierX100: number;
  won: boolean;
  payout: number;
  createdAt: string;
}

export interface HeistRecentRound extends HeistHistoryRound {
  wallet: string;
}

export interface HeistLeaderboardEntry {
  wallet: string;
  rounds: number;
  wagered: string;
  won: string;
  net: string;
}

export interface HeistVerifyResult {
  roundId: string;
  bet: number;
  difficulty: HeistDifficulty;
  doors: number;
  alarms: number;
  rooms: number;
  room: number;
  picks: number[];
  multiplierX100: number;
  status: 'settled';
  won: boolean;
  payout: number;
  serverSeedHash: string;
  serverSeed: string;
  alarmDoors: number[][];
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

export async function fetchHeistInfo(): Promise<HeistInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/heist/info`);
  const j = await r.json();
  return j as HeistInfo;
}

/** The wallet's active round (resume after refresh), or null. Authed. */
export async function fetchHeistActive(): Promise<HeistActiveRound | null> {
  const j = await apiFetchJson<{ active: HeistActiveRound | null }>('/api/arcade/heist/active');
  return j.active ?? null;
}

export async function startHeist(args: {
  bet: number;
  difficulty: HeistDifficulty;
  clientSeed?: string;
}): Promise<HeistStartResult> {
  return apiFetchJson<HeistStartResult>('/api/arcade/heist/start', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function stepHeist(roundId: string, door: number): Promise<HeistStepResult> {
  return apiFetchJson<HeistStepResult>('/api/arcade/heist/step', {
    method: 'POST',
    body: JSON.stringify({ roundId, door }),
  });
}

export async function cashoutHeist(roundId: string): Promise<HeistCashoutResult> {
  return apiFetchJson<HeistCashoutResult>('/api/arcade/heist/cashout', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

export async function fetchHeistHistory(limit = 25): Promise<HeistHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: HeistHistoryRound[] }>(
    `/api/arcade/heist/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchHeistRecent(limit = 25): Promise<HeistRecentRound[]> {
  const r = await fetch(`${apiBase()}/api/arcade/heist/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as HeistRecentRound[];
}

export async function fetchHeistLeaderboard(limit = 10): Promise<HeistLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/heist/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as HeistLeaderboardEntry[];
}

export async function verifyHeist(roundId: string): Promise<HeistVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/heist/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) {
    let detail = '';
    try {
      detail = ((await r.json()) as { error?: string }).error ?? '';
    } catch {
      /* plain 404 body */
    }
    throw new Error(detail || 'Round not found');
  }
  return (await r.json()) as HeistVerifyResult;
}
