/**
 * keno-client.ts — client types + API wrappers for server-side Stake-style Keno.
 *
 * All multipliers are carried ×100 (integer) end-to-end, matching the server,
 * so the UI never accumulates float error. Use `formatMultiplier` for display.
 *
 * Authed calls go through apiFetchJson (sends the morb_session cookie and
 * auto-recovers a 401 with a sign-in prompt). Public reads use plain fetch
 * against the API base so they work logged-out.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export type KenoRisk = 'classic' | 'low' | 'medium' | 'high';

export const KENO_RISKS: readonly KenoRisk[] = ['classic', 'low', 'medium', 'high'] as const;

export const KENO_RISK_LABELS: Record<KenoRisk, string> = {
  classic: 'Classic',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const KENO_TOTAL_TILES = 40;
export const KENO_DRAW_COUNT = 10;
export const KENO_MAX_PICKS = 10;

/** ×100 multiplier → display string, e.g. 396 → "3.96×", 10000 → "100×", 0 → "0×". */
export function formatMultiplier(x100: number): string {
  const v = x100 / 100;
  // Trim trailing zeros: 100 → "100", 3.96 → "3.96", 1.5 → "1.5".
  const str = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
  return `${str}×`;
}

/** Full ×100 paytables keyed [risk][picksCount][hits]. */
export type KenoMultipliers = Record<KenoRisk, Record<number, Record<number, number>>>;

export interface KenoInfo {
  totalTiles: number;
  drawCount: number;
  minPicks: number;
  maxPicks: number;
  minBet: number;
  maxBet: number;
  risks: KenoRisk[];
}

export interface KenoPlayResult {
  roundId: string;
  picks: number[];
  drawn: number[];
  risk: KenoRisk;
  bet: number;
  hits: number;
  multiplierX100: number;
  payout: number;
  won: boolean;
  serverSeedHash: string;
  clientSeed: string;
  /** Sequential nonce this draw consumed under the active seed commitment.
   *  Optional: present on a live /play response, omitted on a synthetic replay. */
  nonce?: number;
  chipBalance: string;
}

export interface KenoHistoryRound {
  roundId: string;
  bet: number;
  risk: KenoRisk;
  picks: number[];
  drawn: number[];
  hits: number;
  multiplierX100: number;
  payout: number;
  serverSeedHash: string;
  createdAt: string;
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchKenoInfo(): Promise<KenoInfo> {
  const r = await fetch(`${apiBase()}/api/keno/info`);
  const j = await r.json();
  return j as KenoInfo;
}

export async function fetchKenoMultipliers(): Promise<KenoMultipliers> {
  const r = await fetch(`${apiBase()}/api/keno/multipliers`);
  const j = await r.json();
  return j.multipliersX100 as KenoMultipliers;
}

export async function fetchKenoBalance(): Promise<bigint> {
  const j = await apiFetchJson<{ chipBalance: string }>('/api/keno/balance');
  return BigInt(j.chipBalance ?? '0');
}

export async function playKeno(args: {
  picks: number[];
  risk: KenoRisk;
  bet: number;
}): Promise<KenoPlayResult> {
  // Client seed is managed on the persistent seed pair (see ArcadeSeedControls),
  // not passed per-bet — the server derives the draw from the pre-committed seed.
  return apiFetchJson<KenoPlayResult>('/api/keno/play', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function fetchKenoHistory(limit = 25): Promise<KenoHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: KenoHistoryRound[] }>(`/api/keno/history?limit=${limit}`);
  return j.rounds ?? [];
}

/** A global Keno win (any player), for the "Recent wins" tab. */
export interface KenoRecentWin {
  roundId: string;
  address: string;
  username: string | null;
  bet: number;
  hits: number;
  multiplierX100: number;
  payout: number;
  createdAt: string;
}

/** A drawn-number frequency entry for the hot-numbers strip. */
export interface KenoHotNumber {
  n: number;
  count: number;
}

export interface KenoRecent {
  wins: KenoRecentWin[];
  hotNumbers: KenoHotNumber[];
  roundsAnalyzed: number;
}

/** Public global feed: recent wins + hot numbers, derived from recent rounds. */
export async function fetchKenoRecent(limit = 200): Promise<KenoRecent> {
  try {
    const r = await fetch(`${apiBase()}/api/keno/recent?limit=${limit}`, { cache: 'no-store' });
    if (!r.ok) return { wins: [], hotNumbers: [], roundsAnalyzed: 0 };
    const j = await r.json();
    return {
      wins: Array.isArray(j?.wins) ? j.wins : [],
      hotNumbers: Array.isArray(j?.hotNumbers) ? j.hotNumbers : [],
      roundsAnalyzed: Number(j?.roundsAnalyzed ?? 0),
    };
  } catch {
    return { wins: [], hotNumbers: [], roundsAnalyzed: 0 };
  }
}

export interface KenoVerifyResult {
  roundId: string;
  wallet: string;
  bet: number;
  risk: KenoRisk;
  picks: number[];
  drawn: number[];
  hits: number;
  multiplierX100: number;
  payout: number;
  /** null until the round's seed pair has been rotated (revealed). */
  serverSeed: string | null;
  seedRevealed: boolean;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  verification: {
    hashMatches: boolean;
    drawMatches: boolean;
    payoutMatches: boolean;
    recomputedDrawn: number[];
    recomputedHits: number | null;
    recomputedMultiplierX100: number | null;
    recomputedPayout: number | null;
  };
  recipe: string;
}

export async function verifyKeno(roundId: string): Promise<KenoVerifyResult> {
  const r = await fetch(`${apiBase()}/api/keno/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) throw new Error('Round not found');
  return (await r.json()) as KenoVerifyResult;
}
