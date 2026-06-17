/**
 * cascade-client.ts — client types + API wrappers for chips Cascade (/cascade).
 *
 * Cluster-pays chain reaction. Talks to /api/arcade/cascade/*; the backend
 * accepts either Telegram initData or the SIWE morb_session cookie, so the web
 * client relies on apiFetchJson's cookie handling.
 *
 * Game model: one drop fills a 6×6 grid; clusters of >= threshold matching gems
 * pop, the grid tumbles + refills, and a combo multiplier climbs each chain link
 * until no more clusters form. The ENTIRE cascade is a deterministic function of
 * the provably-fair seed — /play returns the full ordered step sequence so the
 * client replays the exact animation the server computed. The math is server
 * authoritative; the animation is cosmetic.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export { formatMultiplier } from '@/lib/keno-client';

export type CascadeVolatility = 'calm' | 'standard' | 'frenzy';

/** A single matching cluster: its gem index + member [row, col] cells. */
export interface CascadeCluster {
  sym: number;
  cells: Array<[number, number]>;
}

/** One chain link of the cascade — everything needed to replay this frame. */
export interface CascadeStep {
  /** Grid BEFORE this link's winners pop (row-major; gem index or null). */
  board: Array<Array<number | null>>;
  clusters: CascadeCluster[];
  chain: number;
  comboX100: number;
  winX100: number;
  runningX100: number;
}

export interface CascadeChainEntry {
  chain: number;
  comboX100: number;
  winX100: number;
}

export interface CascadeVolatilityConfig {
  label: string;
  threshold: number;
  weights: number[];
  combo: number[];
  pay: number[];
  sizeBonus: number;
  payScale: number;
}

export interface CascadeInfo {
  minBet: number;
  maxBet: number;
  cols: number;
  rows: number;
  volatilities: Record<CascadeVolatility, CascadeVolatilityConfig>;
}

export interface CascadePlayResult {
  roundId: string;
  bet: number;
  volatility: CascadeVolatility;
  initialBoard: Array<Array<number | null>>;
  finalBoard: Array<Array<number | null>>;
  steps: CascadeStep[];
  chainLog: CascadeChainEntry[];
  clusters: number;
  multiplierX100: number;
  won: boolean;
  payout: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  chipBalance: string;
}

export interface CascadeHistoryRound {
  roundId: string;
  bet: number;
  volatility: CascadeVolatility;
  multiplierX100: number;
  clusters: number;
  won: boolean;
  payout: number;
  createdAt: string;
}

export interface CascadeRecentRound extends CascadeHistoryRound {
  wallet: string;
}

export interface CascadeLeaderboardEntry {
  wallet: string;
  rounds: number;
  wagered: string;
  won: string;
  net: string;
}

export interface CascadeVerifyResult {
  roundId: string;
  bet: number;
  volatility: CascadeVolatility;
  multiplierX100: number;
  recomputedMultiplierX100: number | null;
  clusters: number;
  chainLog: CascadeChainEntry[];
  steps: CascadeStep[];
  initialBoard: Array<Array<number | null>> | null;
  finalBoard: Array<Array<number | null>> | null;
  won: boolean;
  payout: number;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  recipe: string;
}

/** "850" → "8.50×" — total round multiplier ×100. */
export function formatMultiplierX100(x100: number): string {
  return `${(x100 / 100).toFixed(2)}×`;
}

/** "150" → "×1.5" — combo multiplier ×100, trimming a trailing .0. */
export function formatCombo(x100: number): string {
  const v = x100 / 100;
  return `×${Number.isInteger(v) ? v : v.toFixed(1).replace(/\.0$/, '')}`;
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchCascadeInfo(): Promise<CascadeInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/cascade/info`);
  const j = await r.json();
  return j as CascadeInfo;
}

export async function playCascade(args: {
  bet: number;
  volatility: CascadeVolatility;
  clientSeed?: string;
}): Promise<CascadePlayResult> {
  return apiFetchJson<CascadePlayResult>('/api/arcade/cascade/play', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function fetchCascadeHistory(limit = 25): Promise<CascadeHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: CascadeHistoryRound[] }>(
    `/api/arcade/cascade/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchCascadeRecent(limit = 25): Promise<CascadeRecentRound[]> {
  const r = await fetch(`${apiBase()}/api/arcade/cascade/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as CascadeRecentRound[];
}

export async function fetchCascadeLeaderboard(limit = 10): Promise<CascadeLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/cascade/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as CascadeLeaderboardEntry[];
}

export async function verifyCascade(roundId: string): Promise<CascadeVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/cascade/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) throw new Error('Round not found');
  return (await r.json()) as CascadeVerifyResult;
}
