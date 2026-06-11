/**
 * mines-client.ts — client types + API wrappers for chips Mines (/mines2).
 *
 * Talks to the same /api/arcade/mines/* endpoints as the Telegram Mini App —
 * the backend accepts either Telegram initData or the SIWE morb_session
 * cookie, so the web client just relies on apiFetchJson's cookie handling.
 *
 * All multipliers are carried ×100 (integer) end-to-end, matching the server.
 * Stateful flow: start (debits the bet) → pick* (reveal cells) → cashout or
 * bust. `fetchMinesState` recovers the active round after a refresh.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export { formatMultiplier } from '@/lib/keno-client';

export const MINES_TOTAL_CELLS = 25;

export interface MinesInfo {
  totalCells: number;
  minBet: number;
  maxBet: number;
  minBombs: number;
  maxBombs: number;
  houseEdgeBp: number;
  /** ladders[bombs][k] = ×100 multiplier after k safe picks (index 0 = 100). */
  ladders: Record<number, number[]>;
}

export interface MinesActiveRound {
  roundId: string;
  bet: number;
  bombs: number;
  picks: number[];
  multiplierX100: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  ladder: number[];
}

export interface MinesStartResult {
  roundId: string;
  bet: number;
  bombs: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  ladder: number[];
  chipBalance: string;
}

export type MinesPickResult =
  | {
      safe: true;
      cell: number;
      picks: number[];
      multiplierX100: number;
      cashoutPayout: number;
      safePicksRemaining: number;
    }
  | {
      safe: false;
      cell: number;
      bombs: number[];
      picks: number[];
      status: 'busted';
      serverSeed: string;
    };

export interface MinesCashoutResult {
  roundId: string;
  picks: number[];
  multiplierX100: number;
  payout: number;
  bombs: number[];
  status: 'cashed_out';
  serverSeed: string;
  chipBalance: string;
}

export interface MinesHistoryRound {
  roundId: string;
  bet: number;
  bombs: number;
  gems: number;
  multiplierX100: number;
  payout: number;
  status: 'busted' | 'cashed_out';
  createdAt: string;
}

export interface MinesVerifyResult {
  roundId: string;
  bet: number;
  bombs: number;
  picks: number[];
  multiplierX100: number;
  payout: number;
  status: 'active' | 'busted' | 'cashed_out';
  serverSeedHash: string;
  serverSeed: string | null;
  bombsGrid: number[] | null;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  createdAt: string;
  finalizedAt: string | null;
  recipe: string;
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchMinesInfo(): Promise<MinesInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/mines/info`);
  const j = await r.json();
  return j as MinesInfo;
}

/** The wallet's active round (resume after refresh), or null. Authed. */
export async function fetchMinesState(): Promise<MinesActiveRound | null> {
  const j = await apiFetchJson<{ active: MinesActiveRound | null }>('/api/arcade/mines/state', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return j.active ?? null;
}

export async function startMines(args: {
  bet: number;
  bombs: number;
  clientSeed?: string;
}): Promise<MinesStartResult> {
  return apiFetchJson<MinesStartResult>('/api/arcade/mines/start', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function pickMines(roundId: string, cell: number): Promise<MinesPickResult> {
  return apiFetchJson<MinesPickResult>('/api/arcade/mines/pick', {
    method: 'POST',
    body: JSON.stringify({ roundId, cell }),
  });
}

export async function cashoutMines(roundId: string): Promise<MinesCashoutResult> {
  return apiFetchJson<MinesCashoutResult>('/api/arcade/mines/cashout', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

export async function fetchMinesHistory(limit = 25): Promise<MinesHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: MinesHistoryRound[] }>(
    `/api/arcade/mines/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function verifyMines(roundId: string): Promise<MinesVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/mines/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) throw new Error('Round not found');
  return (await r.json()) as MinesVerifyResult;
}
