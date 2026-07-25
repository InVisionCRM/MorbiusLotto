/**
 * dragon-tiger-client.ts — client types + API wrappers for chips Dragon Tiger
 * (/dragon-tiger).
 *
 * The fastest card game: one card to Dragon, one to Tiger, the higher rank wins
 * (Ace is LOW). Talks to the /api/arcade/dragon-tiger/* endpoints; the backend
 * accepts either Telegram initData or the SIWE morb_session cookie, so the web
 * client just relies on apiFetchJson's cookie handling.
 *
 * Bet zones: Dragon, Tiger, Tie. Payouts (×100, gross — stake included on win):
 *   • Dragon / Tiger win → 200 (1:1)
 *   • Tie win            → 1200 (11:1)
 *   • On a tie outcome, Dragon & Tiger bets return half the stake (50 ×100).
 * Currency: MORBIUS chips.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export type DragonTigerResult = 'dragon' | 'tiger' | 'tie';

export interface DragonTigerBets {
  dragon: number;
  tiger: number;
  tie: number;
}

export interface DragonTigerPayoutTable {
  dragon: number;
  tiger: number;
  tie: number;
  tieRefund: number;
}

export interface DragonTigerInfo {
  minBet: number;
  maxBet: number;
  payouts: DragonTigerPayoutTable;
  houseEdgeBp: { side: number; tie: number };
}

export interface DragonTigerPlayResult {
  roundId: string;
  bets: DragonTigerBets;
  totalBet: number;
  dragonCard: number;
  tigerCard: number;
  dragonRank: number;
  tigerRank: number;
  result: DragonTigerResult;
  payouts: DragonTigerBets;
  totalPayout: number;
  won: boolean;
  serverSeedHash: string;
  /** Sequential nonce this round consumed under the active seed commitment.
   *  Optional: present on a live /play response, omitted on a synthetic replay. */
  nonce?: number;
  chipBalance: string;
}

export interface DragonTigerHistoryRound {
  roundId: string;
  bets: DragonTigerBets;
  totalBet: number;
  dragonCard: number;
  tigerCard: number;
  result: DragonTigerResult;
  payouts: DragonTigerBets;
  totalPayout: number;
  won: boolean;
  createdAt: string;
}

export interface DragonTigerRecentRound {
  roundId: string;
  wallet: string;
  totalBet: number;
  dragonCard: number;
  tigerCard: number;
  result: DragonTigerResult;
  totalPayout: number;
  won: boolean;
  createdAt: string;
}

export interface DragonTigerLeaderboardEntry {
  wallet: string;
  rounds: number;
  wagered: string;
  won: string;
  net: string;
}

export interface DragonTigerVerifyResult {
  roundId: string;
  bets: DragonTigerBets;
  totalBet: number;
  dragonCard: number;
  tigerCard: number;
  result: DragonTigerResult;
  payouts: DragonTigerBets;
  totalPayout: number;
  won: boolean;
  serverSeedHash: string;
  /** null until the round's seed pair has been rotated (revealed). */
  serverSeed: string | null;
  seedRevealed: boolean;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  recipe: string;
}

const RANK_LABEL = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_GLYPH = ['♥', '♦', '♣', '♠'];

/** Card index 0..51 → ace-low rank (0 = Ace, 12 = King). Higher wins. */
export function cardRank(cardIdx: number): number {
  return ((cardIdx % 13) + 13) % 13;
}

/** Card index 0..51 → suit 0..3 (0=♥, 1=♦, 2=♣, 3=♠). */
export function cardSuit(cardIdx: number): number {
  return Math.floor(cardIdx / 13);
}

/** Card index 0..51 → display rank label (A, 2..10, J, Q, K). */
export function cardRankLabel(cardIdx: number): string {
  return RANK_LABEL[cardRank(cardIdx)] ?? '?';
}

/** Card index 0..51 → suit glyph. */
export function cardSuitGlyph(cardIdx: number): string {
  return SUIT_GLYPH[cardSuit(cardIdx)] ?? '?';
}

/** True for red suits (hearts / diamonds). */
export function cardIsRed(cardIdx: number): boolean {
  const s = cardSuit(cardIdx);
  return s === 0 || s === 1;
}

/** Friendly result label, e.g. "Dragon wins" / "Tiger wins" / "Tie". */
export function resultLabel(result: DragonTigerResult): string {
  if (result === 'tie') return 'Tie';
  return result === 'dragon' ? 'Dragon wins' : 'Tiger wins';
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchDragonTigerInfo(): Promise<DragonTigerInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/dragon-tiger/info`);
  const j = await r.json();
  return j as DragonTigerInfo;
}

export async function playDragonTiger(args: {
  bets: DragonTigerBets;
}): Promise<DragonTigerPlayResult> {
  // Client seed is managed on the persistent seed pair (see arcade-seed-client),
  // not passed per-bet — the server derives the deck from the pre-committed seed.
  return apiFetchJson<DragonTigerPlayResult>('/api/arcade/dragon-tiger/play', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function fetchDragonTigerHistory(limit = 25): Promise<DragonTigerHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: DragonTigerHistoryRound[] }>(
    `/api/arcade/dragon-tiger/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchDragonTigerRecent(limit = 25): Promise<DragonTigerRecentRound[]> {
  const r = await fetch(`${apiBase()}/api/arcade/dragon-tiger/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as DragonTigerRecentRound[];
}

export async function fetchDragonTigerLeaderboard(
  limit = 10,
): Promise<DragonTigerLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/dragon-tiger/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as DragonTigerLeaderboardEntry[];
}

export async function verifyDragonTiger(roundId: string): Promise<DragonTigerVerifyResult> {
  const r = await fetch(
    `${apiBase()}/api/arcade/dragon-tiger/verify/${encodeURIComponent(roundId)}`,
  );
  if (!r.ok) throw new Error('Round not found');
  return (await r.json()) as DragonTigerVerifyResult;
}
