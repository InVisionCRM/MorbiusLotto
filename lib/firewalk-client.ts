/**
 * firewalk-client.ts — client types + API wrappers for chips Firewalk (/firewalk).
 *
 * Talks to the /api/arcade/firewalk/* endpoints — the backend accepts either
 * Telegram initData or the SIWE morb_session cookie, so the web client just
 * relies on apiFetchJson's cookie handling.
 *
 * All multipliers are carried ×100 (integer) end-to-end, matching the server.
 * Stateful flow: start (debits the bet, seals every stone behind a committed
 * hash) → step at a chosen pace (hop 1 / leap 2 / bound 3, every stone in the
 * leap must be safe) → cashout, crumble, or a full-crossing auto-settle.
 * `fetchFirewalkActive` recovers the active round after a refresh.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export { formatMultiplier } from '@/lib/keno-client';

export type FirewalkHeat = 'low' | 'med' | 'high';

export type FirewalkPace = 1 | 2 | 3;

export const FIREWALK_HEAT_ORDER: readonly FirewalkHeat[] = ['low', 'med', 'high'];

export const FIREWALK_HEAT_LABELS: Record<FirewalkHeat, string> = {
  low: 'Low',
  med: 'Med',
  high: 'High',
};

export const FIREWALK_PACE_LABELS: Record<FirewalkPace, string> = {
  1: 'Hop 1',
  2: 'Leap 2',
  3: 'Bound 3',
};

export interface FirewalkHeatInfo {
  stones: number;
  outcomes: number;
  safe: number;
  /** ladder[N] = ×100 multiplier after N crossed stones (index 0 = 100). */
  ladder: number[];
}

export interface FirewalkInfo {
  minBet: number;
  maxBet: number;
  stones: number;
  paces: number[];
  houseEdgeBp: number;
  heats: Record<FirewalkHeat, FirewalkHeatInfo>;
}

export interface FirewalkActiveRound {
  roundId: string;
  bet: number;
  heat: FirewalkHeat;
  position: number;
  multiplierX100: number;
  serverSeedHash: string;
  stones: number;
  ladder: number[];
}

export interface FirewalkStartResult {
  roundId: string;
  bet: number;
  heat: FirewalkHeat;
  stones: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  ladder: number[];
  chipBalance: string;
}

/**
 * The /step result, as a discriminated union on a single literal `kind` field
 * (derived client-side in `stepFirewalk` from the raw response). A single
 * literal discriminant lets TS narrow each branch cleanly — the raw server
 * payload's `safe`/`settled` pair doesn't discriminate on its own.
 */
export type FirewalkStepResult =
  | {
      /** Safe step, crossing continues. */
      kind: 'advance';
      safe: true;
      settled: false;
      pace: number;
      position: number;
      multiplierX100: number;
      cashoutPayout: number;
      stonesRemaining: number;
    }
  | {
      /** Safe step onto the final stone — full crossing, auto-settled as a win. */
      kind: 'cleared';
      safe: true;
      settled: true;
      won: true;
      pace: number;
      position: number;
      multiplierX100: number;
      payout: number;
      crumbleStones: number[];
      status: 'settled';
      serverSeed: string;
      chipBalance: string;
    }
  | {
      /** A crumbling stone in the leap — round settled as a loss, crossing revealed. */
      kind: 'busted';
      safe: false;
      settled: true;
      won: false;
      pace: number;
      position: number;
      crumbleStones: number[];
      status: 'settled';
      serverSeed: string;
    };

export interface FirewalkCashoutResult {
  roundId: string;
  position: number;
  multiplierX100: number;
  payout: number;
  crumbleStones: number[];
  status: 'settled';
  won: true;
  serverSeed: string;
  chipBalance: string;
}

export interface FirewalkHistoryRound {
  roundId: string;
  bet: number;
  heat: FirewalkHeat;
  position: number;
  multiplierX100: number;
  won: boolean;
  payout: number;
  createdAt: string;
}

export interface FirewalkRecentRound extends FirewalkHistoryRound {
  wallet: string;
}

export interface FirewalkLeaderboardEntry {
  wallet: string;
  rounds: number;
  wagered: string;
  won: string;
  net: string;
}

export interface FirewalkVerifyResult {
  roundId: string;
  bet: number;
  heat: FirewalkHeat;
  stones: number;
  outcomes: number;
  safe: number;
  position: number;
  multiplierX100: number;
  status: 'settled';
  won: boolean;
  payout: number;
  serverSeedHash: string;
  serverSeed: string;
  crumbleStones: number[];
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

export async function fetchFirewalkInfo(): Promise<FirewalkInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/firewalk/info`);
  const j = await r.json();
  return j as FirewalkInfo;
}

/** The wallet's active round (resume after refresh), or null. Authed. */
export async function fetchFirewalkActive(): Promise<FirewalkActiveRound | null> {
  const j = await apiFetchJson<{ active: FirewalkActiveRound | null }>('/api/arcade/firewalk/active');
  return j.active ?? null;
}

export async function startFirewalk(args: {
  bet: number;
  heat: FirewalkHeat;
  clientSeed?: string;
}): Promise<FirewalkStartResult> {
  return apiFetchJson<FirewalkStartResult>('/api/arcade/firewalk/start', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function stepFirewalk(roundId: string, pace: FirewalkPace): Promise<FirewalkStepResult> {
  const raw = await apiFetchJson<{ safe: boolean; settled: boolean } & Record<string, unknown>>(
    '/api/arcade/firewalk/step',
    {
      method: 'POST',
      body: JSON.stringify({ roundId, pace }),
    },
  );
  // Tag with a single literal discriminant so callers narrow cleanly.
  const kind: FirewalkStepResult['kind'] = !raw.settled ? 'advance' : raw.safe ? 'cleared' : 'busted';
  return { ...raw, kind } as FirewalkStepResult;
}

export async function cashoutFirewalk(roundId: string): Promise<FirewalkCashoutResult> {
  return apiFetchJson<FirewalkCashoutResult>('/api/arcade/firewalk/cashout', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

export async function fetchFirewalkHistory(limit = 25): Promise<FirewalkHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: FirewalkHistoryRound[] }>(
    `/api/arcade/firewalk/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchFirewalkRecent(limit = 25): Promise<FirewalkRecentRound[]> {
  const r = await fetch(`${apiBase()}/api/arcade/firewalk/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as FirewalkRecentRound[];
}

export async function fetchFirewalkLeaderboard(limit = 10): Promise<FirewalkLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/firewalk/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as FirewalkLeaderboardEntry[];
}

export async function verifyFirewalk(roundId: string): Promise<FirewalkVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/firewalk/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) {
    let detail = '';
    try {
      detail = ((await r.json()) as { error?: string }).error ?? '';
    } catch {
      /* plain 404 body */
    }
    throw new Error(detail || 'Round not found');
  }
  return (await r.json()) as FirewalkVerifyResult;
}
