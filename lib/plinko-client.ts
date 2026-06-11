/**
 * plinko-client.ts — client types + API wrappers for server-side chips Plinko.
 *
 * All multipliers are carried ×100 (integer) end-to-end, matching the server.
 * `formatMultiplier` is shared with Keno (same ×100 convention).
 *
 * The server speaks risk = 'low' | 'medium' | 'high'; the existing PlinkoGame
 * board renders risk = 'GREEN' | 'YELLOW' | 'RED'. PLINKO_RISK_TO_BOARD maps
 * between the two at the component boundary.
 *
 * Authed calls go through apiFetchJson (sends the morb_session cookie and
 * auto-recovers a 401 with a sign-in prompt). Public reads use plain fetch
 * against the API base so they work logged-out.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';
import type { RiskLevel } from '@/app/PLINKO/types';

export { formatMultiplier } from '@/lib/keno-client';

export type PlinkoRisk = 'low' | 'medium' | 'high';

export const PLINKO_RISKS: readonly PlinkoRisk[] = ['low', 'medium', 'high'] as const;

export const PLINKO_RISK_LABELS: Record<PlinkoRisk, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** Server risk → the board colourway PlinkoGame renders. */
export const PLINKO_RISK_TO_BOARD: Record<PlinkoRisk, RiskLevel> = {
  low: 'GREEN',
  medium: 'YELLOW',
  high: 'RED',
};

export const PLINKO_ROWS = 16;
export const PLINKO_BUCKETS = 17;

/** ×100 multiplier tables keyed [risk][bucket]. */
export type PlinkoMultipliers = Record<PlinkoRisk, number[]>;

export interface PlinkoInfo {
  rows: number;
  buckets: number;
  minBet: number;
  maxBet: number;
  risks: PlinkoRisk[];
}

export interface PlinkoPlayResult {
  roundId: string;
  risk: PlinkoRisk;
  bet: number;
  /** 16 steps, 0 = left, 1 = right. */
  path: number[];
  bucket: number;
  multiplierX100: number;
  payout: number;
  won: boolean;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  chipBalance: string;
}

export interface PlinkoHistoryRound {
  roundId: string;
  bet: number;
  risk: PlinkoRisk;
  path: number[];
  bucket: number;
  multiplierX100: number;
  payout: number;
  serverSeedHash: string;
  createdAt: string;
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchPlinkoInfo(): Promise<PlinkoInfo> {
  const r = await fetch(`${apiBase()}/api/plinko/info`);
  const j = await r.json();
  return j as PlinkoInfo;
}

export async function fetchPlinkoMultipliers(): Promise<PlinkoMultipliers> {
  const r = await fetch(`${apiBase()}/api/plinko/multipliers`);
  const j = await r.json();
  return j.multipliersX100 as PlinkoMultipliers;
}

export async function playPlinko(args: {
  risk: PlinkoRisk;
  bet: number;
  clientSeed?: string;
}): Promise<PlinkoPlayResult> {
  return apiFetchJson<PlinkoPlayResult>('/api/plinko/play', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function fetchPlinkoHistory(limit = 25): Promise<PlinkoHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: PlinkoHistoryRound[] }>(`/api/plinko/history?limit=${limit}`);
  return j.rounds ?? [];
}

export interface PlinkoVerifyResult {
  roundId: string;
  wallet: string;
  bet: number;
  risk: PlinkoRisk;
  path: number[];
  bucket: number;
  multiplierX100: number;
  payout: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  verification: {
    hashMatches: boolean;
    pathMatches: boolean;
    payoutMatches: boolean;
    recomputedPath: number[];
    recomputedBucket: number;
    recomputedMultiplierX100: number;
    recomputedPayout: number;
  };
  recipe: string;
}

export async function verifyPlinko(roundId: string): Promise<PlinkoVerifyResult> {
  const r = await fetch(`${apiBase()}/api/plinko/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) throw new Error('Round not found');
  return (await r.json()) as PlinkoVerifyResult;
}
