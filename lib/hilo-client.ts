/**
 * hilo-client.ts — client types + API wrappers for chips Hi-Lo (/hilo).
 *
 * Talks to the same /api/arcade/hilo/* endpoints as the Telegram Mini App —
 * the backend accepts either Telegram initData or the SIWE morb_session
 * cookie, so the web client just relies on apiFetchJson's cookie handling.
 *
 * Game model (stateful, like Mines): /start debits the bet and deals a base
 * card; each /pick guesses whether the next card is same-or-higher ('hi') or
 * strictly lower ('lo'). A correct pick compounds the multiplier; a wrong one
 * busts the round. /cashout banks floor(bet × multiplier) any time after the
 * first correct pick. `fetchHiLoState` recovers the active round after a
 * refresh. Multipliers are carried ×100 (integer) end-to-end.
 *
 * Math mirrors (display-only — the credited payout always comes from server
 * responses) follow server/src/services/arcade-hilo.ts exactly:
 *   P(hi | rank c) = (14 - c) / 13      (same-or-higher wins ties)
 *   P(lo | rank c) = (c - 1) / 13       (strictly lower; impossible from Ace)
 *   next_x100 = max(100, floor(cur_x100 × 13 × (10000 - edgeBp) / (10000 × denom)))
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export { formatMultiplier } from '@/lib/keno-client';

export type HiLoDirection = 'hi' | 'lo';

/** Card index 0..51 → rank (idx % 13) + 1 (A=1 … K=13), suit floor(idx / 13). */
export interface HiLoCard {
  index: number;
  rank: number;
  suit: number;
}

export interface HiLoInfo {
  minBet: number;
  maxBet: number;
  maxPicks: number;
  houseEdgeBp: number;
}

export interface HiLoActiveRound {
  roundId: string;
  bet: number;
  cards: HiLoCard[];
  picks: HiLoDirection[];
  multiplierX100: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  maxPicks: number;
}

export interface HiLoStartResult extends HiLoActiveRound {
  chipBalance: string;
}

export type HiLoPickResult =
  | {
      safe: true;
      direction: HiLoDirection;
      card: HiLoCard;
      cards: HiLoCard[];
      picks: HiLoDirection[];
      multiplierX100: number;
      cashoutPayout: number;
      picksRemaining: number;
    }
  | {
      safe: false;
      direction: HiLoDirection;
      card: HiLoCard;
      cards: HiLoCard[];
      picks: HiLoDirection[];
      status: 'busted';
      serverSeed: string;
    };

export interface HiLoCashoutResult {
  roundId: string;
  cards: HiLoCard[];
  picks: HiLoDirection[];
  multiplierX100: number;
  payout: number;
  status: 'cashed_out';
  serverSeed: string;
  chipBalance: string;
}

export interface HiLoHistoryRound {
  roundId: string;
  bet: number;
  picks: number;
  wins: number;
  multiplierX100: number;
  payout: number;
  status: 'busted' | 'cashed_out';
  createdAt: string;
}

export interface HiLoRecentRound extends HiLoHistoryRound {
  wallet: string;
}

export interface HiLoLeaderboardEntry {
  wallet: string;
  rounds: number;
  wagered: string;
  won: string;
  net: string;
}

export interface HiLoVerifyResult {
  roundId: string;
  bet: number;
  cards: HiLoCard[];
  picks: HiLoDirection[];
  multiplierX100: number;
  payout: number;
  status: 'active' | 'busted' | 'cashed_out';
  serverSeedHash: string;
  serverSeed: string | null;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  createdAt: string;
  finalizedAt: string | null;
  recipe: string;
}

// ─────────────────────────── card display helpers ───────────────────────────

const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Suit order matches the server: 0=hearts, 1=diamonds, 2=clubs, 3=spades. */
const SUIT_GLYPHS = ['♥', '♦', '♣', '♠'];

export function hiLoRankLabel(rank: number): string {
  return RANK_LABELS[rank - 1] ?? '?';
}

export function hiLoSuitGlyph(suit: number): string {
  return SUIT_GLYPHS[suit] ?? '?';
}

/** Hearts and diamonds render red; clubs and spades black. */
export function hiLoSuitIsRed(suit: number): boolean {
  return suit === 0 || suit === 1;
}

// ───────────────────────────── math mirrors ─────────────────────────────────

/** Count of the 13 ranks that win this pick. 0 ⇒ the pick is impossible. */
export function hiLoWinDenominator(direction: HiLoDirection, rank: number): number {
  return direction === 'hi' ? 14 - rank : rank - 1;
}

/** Win probability in percent for picking `direction` from `rank`. */
export function hiLoWinChancePct(direction: HiLoDirection, rank: number): number {
  return (hiLoWinDenominator(direction, rank) / 13) * 100;
}

/** True iff `direction` wins on `prevRank → nextRank` (hi wins ties). */
export function isHiLoWin(direction: HiLoDirection, prevRank: number, nextRank: number): boolean {
  if (direction === 'hi') return nextRank >= prevRank;
  return nextRank < prevRank;
}

/**
 * Prospective total multiplier (×100) after winning `direction` from `rank`,
 * mirroring the server's `advanceHiLoMultiplier` flooring exactly. Returns
 * null when the pick is impossible (lo from an Ace).
 */
export function hiLoNextMultiplierX100(
  currentX100: number,
  direction: HiLoDirection,
  rank: number,
  houseEdgeBp: number,
): number | null {
  const denom = hiLoWinDenominator(direction, rank);
  if (denom <= 0) return null;
  return Math.max(100, Math.floor((currentX100 * 13 * (10_000 - houseEdgeBp)) / (10_000 * denom)));
}

/** Cash-out preview in chips — same floor as the server's `hiLoPayout`. */
export function hiLoPayoutPreview(bet: number, multiplierX100: number): number {
  return Math.floor((bet * multiplierX100) / 100);
}

/**
 * Replay the multiplier ladder over a settled (or resumed) round: returns the
 * ×100 multiplier AFTER each pick — walk[i] is the value once picks[i]
 * resolved (unchanged on the losing pick, which busts the round instead).
 * `ranks` is the chronological card ranks (base card first).
 */
export function hiLoMultiplierWalkX100(
  ranks: number[],
  picks: HiLoDirection[],
  houseEdgeBp: number,
): number[] {
  const walk: number[] = [];
  let cur = 100;
  for (let i = 0; i < picks.length; i++) {
    const prev = ranks[i];
    const next = ranks[i + 1];
    if (prev == null || next == null) break;
    if (isHiLoWin(picks[i], prev, next)) {
      cur = hiLoNextMultiplierX100(cur, picks[i], prev, houseEdgeBp) ?? cur;
    }
    walk.push(cur);
  }
  return walk;
}

// ───────────────────────────── API wrappers ─────────────────────────────────

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchHiLoInfo(): Promise<HiLoInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/hilo/info`);
  const j = await r.json();
  return j as HiLoInfo;
}

/** The wallet's active round (resume after refresh), or null. Authed. */
export async function fetchHiLoState(): Promise<HiLoActiveRound | null> {
  const j = await apiFetchJson<{ active: HiLoActiveRound | null }>('/api/arcade/hilo/state', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return j.active ?? null;
}

export async function startHiLo(args: {
  bet: number;
  clientSeed?: string;
}): Promise<HiLoStartResult> {
  return apiFetchJson<HiLoStartResult>('/api/arcade/hilo/start', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function pickHiLo(roundId: string, direction: HiLoDirection): Promise<HiLoPickResult> {
  return apiFetchJson<HiLoPickResult>('/api/arcade/hilo/pick', {
    method: 'POST',
    body: JSON.stringify({ roundId, direction }),
  });
}

export async function cashoutHiLo(roundId: string): Promise<HiLoCashoutResult> {
  return apiFetchJson<HiLoCashoutResult>('/api/arcade/hilo/cashout', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

export async function fetchHiLoHistory(limit = 25): Promise<HiLoHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: HiLoHistoryRound[] }>(
    `/api/arcade/hilo/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchHiLoRecent(limit = 25): Promise<HiLoRecentRound[]> {
  const r = await fetch(`${apiBase()}/api/arcade/hilo/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as HiLoRecentRound[];
}

export async function fetchHiLoLeaderboard(limit = 10): Promise<HiLoLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/hilo/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as HiLoLeaderboardEntry[];
}

export async function verifyHiLo(roundId: string): Promise<HiLoVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/hilo/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) throw new Error('Round not found');
  return (await r.json()) as HiLoVerifyResult;
}
