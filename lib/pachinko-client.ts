/**
 * pachinko-client.ts — client types + API wrappers for chips Pachinko (/pachinko).
 *
 * Plinko-family pin-drop with a custom pocket distribution and a rare center
 * jackpot. Talks to the /api/arcade/pachinko/* endpoints; the backend accepts
 * either Telegram initData or the SIWE morb_session cookie, so the web client
 * just relies on apiFetchJson's cookie handling.
 *
 * Game model: pick a risk level (low/medium/high), each with a nine-pocket
 * multiplier table; the server draws the landing pocket from a single weighted
 * float (pocket 4 is the jackpot gate). payout = floor(bet × multX100[pocket] /
 * 100). The `path` is a cosmetic L/R bounce the client replays — it does not
 * decide the pocket.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export { formatMultiplier } from '@/lib/keno-client';

export const PACHINKO_RISKS = ['low', 'medium', 'high'] as const;
export type PachinkoRisk = (typeof PACHINKO_RISKS)[number];

export const PACHINKO_RISK_LABELS: Record<PachinkoRisk, string> = {
  low: 'Low',
  medium: 'Med',
  high: 'High',
};

/** Center pocket index — the rare jackpot gate. */
export const PACHINKO_CENTER = 4;

export interface PachinkoRiskInfo {
  multX100: number[];
  weights: number[];
  total: number;
}

export interface PachinkoInfo {
  minBet: number;
  maxBet: number;
  pockets: number;
  center: number;
  rows: number;
  risks: Record<PachinkoRisk, PachinkoRiskInfo>;
}

export interface PachinkoPlayResult {
  roundId: string;
  bet: number;
  risk: PachinkoRisk;
  pocket: number;
  path: number[];
  multiplierX100: number;
  won: boolean;
  payout: number;
  serverSeedHash: string;
  chipBalance: string;
}

export interface PachinkoHistoryRound {
  roundId: string;
  bet: number;
  risk: PachinkoRisk;
  pocket: number;
  /** Cosmetic L/R bounce for an identical replay; may be empty for older rows. */
  path: number[];
  multiplierX100: number;
  won: boolean;
  payout: number;
  createdAt: string;
}

export interface PachinkoRecentDrop extends PachinkoHistoryRound {
  wallet: string;
}

export interface PachinkoLeaderboardEntry {
  wallet: string;
  drops: number;
  wagered: string;
  won: string;
  net: string;
}

export interface PachinkoVerifyResult {
  roundId: string;
  bet: number;
  risk: PachinkoRisk;
  pockets: number;
  center: number;
  rows: number;
  multX100: number[];
  weights: number[];
  weightTotal: number;
  pocket: number;
  recomputedPocket: number;
  path: number[];
  multiplierX100: number;
  won: boolean;
  payout: number;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  recipe: string;
}

/** True when a pocket index is the rare center jackpot. */
export function isJackpotPocket(pocket: number): boolean {
  return pocket === PACHINKO_CENTER;
}

/** Win chance % for a pocket given its risk table (weight / total). */
export function pachinkoPocketChancePct(info: PachinkoRiskInfo, pocket: number): number {
  if (!info || info.total <= 0) return 0;
  return (info.weights[pocket] / info.total) * 100;
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchPachinkoInfo(): Promise<PachinkoInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/pachinko/info`);
  const j = await r.json();
  return j as PachinkoInfo;
}

export async function playPachinko(args: {
  bet: number;
  risk: PachinkoRisk;
  clientSeed?: string;
}): Promise<PachinkoPlayResult> {
  return apiFetchJson<PachinkoPlayResult>('/api/arcade/pachinko/play', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function fetchPachinkoHistory(limit = 25): Promise<PachinkoHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: PachinkoHistoryRound[] }>(
    `/api/arcade/pachinko/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchPachinkoRecent(limit = 25): Promise<PachinkoRecentDrop[]> {
  const r = await fetch(`${apiBase()}/api/arcade/pachinko/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as PachinkoRecentDrop[];
}

export async function fetchPachinkoLeaderboard(limit = 10): Promise<PachinkoLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/pachinko/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as PachinkoLeaderboardEntry[];
}

export async function verifyPachinko(roundId: string): Promise<PachinkoVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/pachinko/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) throw new Error('Round not found');
  return (await r.json()) as PachinkoVerifyResult;
}
