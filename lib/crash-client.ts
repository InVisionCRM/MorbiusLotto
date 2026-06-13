/**
 * crash-client.ts — client types + API wrappers for chips Crash (/crash).
 *
 * Talks to /api/arcade/crash/* (proxied to the Express backend). Auth is the
 * SIWE morb_session cookie via apiFetchJson, same as the other arcade2 games.
 *
 * Live round model:
 *   startCrash()  → bet debited, crash point committed (hash only), round 'active'
 *   cashoutCrash() → lock the server-clock multiplier while flying
 *   fetchCrashRound() → poll; the server settles the round once the curve
 *                       passes the crash point and only then reveals it
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export interface CrashInfo {
  minBet: number;
  maxBet: number;
  minCashoutX100: number;
  maxCashoutX100: number;
  houseEdgeBp: number;
}

export interface CrashStartResult {
  roundId: string;
  bet: number;
  autoCashoutX100: number | null;
  serverSeedHash: string;
  /** Server clock (ms epoch) at flight start. */
  startedAt: number;
  chipBalance: string;
}

export interface CrashCashoutResult {
  roundId: string;
  won: boolean;
  cashoutX100: number | null;
  crashX100: number;
  payout: number;
  chipBalance?: string;
}

export type CrashRoundState =
  | { roundId: string; status: 'active'; startedAt: number; serverSeedHash: string }
  | {
      roundId: string;
      status: 'settled';
      bet: number;
      autoCashoutX100: number | null;
      crashX100: number;
      cashoutX100: number | null;
      won: boolean;
      payout: number;
      serverSeedHash: string;
    };

export interface CrashHistoryRound {
  roundId: string;
  bet: number;
  autoCashoutX100: number | null;
  crashX100: number;
  cashoutX100: number | null;
  won: boolean;
  payout: number;
  createdAt: string;
}

export interface CrashRecentRound {
  roundId: string;
  wallet: string;
  bet: number;
  crashX100: number;
  cashoutX100: number | null;
  won: boolean;
  payout: number;
  createdAt: string;
}

export interface CrashLeaderboardEntry {
  wallet: string;
  rounds: number;
  wagered: string;
  won: string;
  net: string;
}

export interface CrashVerifyResult {
  roundId: string;
  bet: number;
  autoCashoutX100: number | null;
  crashX100: number;
  cashoutX100: number | null;
  won: boolean;
  payout: number;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  createdAt: string;
  recipe: string;
}

export function formatCrashMultiplier(x100: number): string {
  return `${(x100 / 100).toFixed(2)}x`;
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchCrashInfo(): Promise<CrashInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/crash/info`);
  const j = await r.json();
  return j as CrashInfo;
}

export async function startCrash(args: {
  bet: number;
  autoCashoutX100: number;
  clientSeed?: string;
}): Promise<CrashStartResult> {
  return apiFetchJson<CrashStartResult>('/api/arcade/crash/start', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function cashoutCrash(roundId: string): Promise<CrashCashoutResult> {
  return apiFetchJson<CrashCashoutResult>('/api/arcade/crash/cashout', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

export async function fetchCrashRound(roundId: string): Promise<CrashRoundState> {
  return apiFetchJson<CrashRoundState>(
    `/api/arcade/crash/round/${encodeURIComponent(roundId)}`,
  );
}

export async function fetchCrashHistory(limit = 25): Promise<CrashHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: CrashHistoryRound[] }>(
    `/api/arcade/crash/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchCrashRecent(limit = 25): Promise<CrashRecentRound[]> {
  const r = await fetch(`${apiBase()}/api/arcade/crash/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as CrashRecentRound[];
}

export async function fetchCrashLeaderboard(limit = 10): Promise<CrashLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/crash/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as CrashLeaderboardEntry[];
}

export async function verifyCrash(roundId: string): Promise<CrashVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/crash/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) throw new Error('Round not found');
  return (await r.json()) as CrashVerifyResult;
}
