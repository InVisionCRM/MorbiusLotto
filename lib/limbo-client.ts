/**
 * limbo-client.ts — client types + API wrappers for chips Limbo (/limbo2).
 *
 * Talks to the same /api/arcade/limbo/* endpoints as the Telegram Mini App —
 * the backend accepts either Telegram initData or the SIWE morb_session
 * cookie, so the web client just relies on apiFetchJson's cookie handling.
 *
 * Game model: pick a target multiplier (×100, i.e. 2.00× → 200); the server
 * draws a result multiplier. You win when result ≥ target, paid bet × target.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export { formatMultiplier } from '@/lib/keno-client';

export interface LimboInfo {
  minBet: number;
  maxBet: number;
  minTargetX100: number;
  maxTargetX100: number;
  houseEdgeBp: number;
}

export interface LimboPlayResult {
  roundId: string;
  bet: number;
  targetX100: number;
  resultX100: number;
  won: boolean;
  payout: number;
  serverSeedHash: string;
  chipBalance: string;
}

export interface LimboHistoryRound {
  roundId: string;
  bet: number;
  targetX100: number;
  resultX100: number;
  won: boolean;
  payout: number;
  createdAt: string;
}

export interface LimboRecentRound extends LimboHistoryRound {
  wallet: string;
}

export interface LimboLeaderboardEntry {
  wallet: string;
  rounds: number;
  wagered: string;
  won: string;
  net: string;
}

export interface LimboVerifyResult {
  roundId: string;
  bet: number;
  targetX100: number;
  resultX100: number;
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

/** Win chance in percent: P(result ≥ target) = (1 − edge)/target.
 *  e.g. edge 400bp, target 2.00× (200) → 9600/200 = 48%. */
export function limboWinChancePct(targetX100: number, houseEdgeBp: number): number {
  if (targetX100 <= 0) return 0;
  return (10000 - houseEdgeBp) / targetX100;
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchLimboInfo(): Promise<LimboInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/limbo/info`);
  const j = await r.json();
  return j as LimboInfo;
}

export async function playLimbo(args: {
  bet: number;
  targetX100: number;
  clientSeed?: string;
}): Promise<LimboPlayResult> {
  return apiFetchJson<LimboPlayResult>('/api/arcade/limbo/play', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function fetchLimboHistory(limit = 25): Promise<LimboHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: LimboHistoryRound[] }>(
    `/api/arcade/limbo/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchLimboRecent(limit = 25): Promise<LimboRecentRound[]> {
  const r = await fetch(`${apiBase()}/api/arcade/limbo/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as LimboRecentRound[];
}

export async function fetchLimboLeaderboard(limit = 10): Promise<LimboLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/limbo/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as LimboLeaderboardEntry[];
}

export async function verifyLimbo(roundId: string): Promise<LimboVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/limbo/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) throw new Error('Round not found');
  return (await r.json()) as LimboVerifyResult;
}
