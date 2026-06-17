/**
 * andar-bahar-client.ts — client types + API wrappers for chips Andar Bahar
 * (/andar-bahar).
 *
 * Single-shot card-match game. Talks to the /api/arcade/andar-bahar/* endpoints;
 * the backend accepts either Telegram initData or the SIWE morb_session cookie,
 * so the web client just relies on apiFetchJson's cookie handling.
 *
 * Game model: pick a side ('andar' | 'bahar') + a bet. The server cuts a joker
 * (deck[0]) and deals deck[1], deck[2], … alternately to Andar (first) then
 * Bahar until a card's rank matches the joker's; that side wins. Andar pays
 * 1.90× total (0.9:1), Bahar pays 2.00× total (1:1). Cards are returned as
 * indices 0..51 — rank = idx % 13, suit = floor(idx / 13).
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export type AndarBaharSide = 'andar' | 'bahar';

export interface AndarBaharInfo {
  minBet: number;
  maxBet: number;
  /** Gross multiplier ×100 paid on a winning Andar / Bahar bet. */
  payAndarX100: number;
  payBaharX100: number;
  houseEdgeBp: number;
}

export interface AndarBaharPlayResult {
  roundId: string;
  side: AndarBaharSide;
  bet: number;
  /** Joker card index 0..51 (deck[0]). */
  joker: number;
  /** Cards dealt to each pile, in deal order (card indices 0..51). */
  andarCards: number[];
  baharCards: number[];
  winningSide: AndarBaharSide;
  /** 0-based alternating deal position of the match (0 = first Andar card). */
  matchIndex: number;
  won: boolean;
  payout: number;
  serverSeedHash: string;
  chipBalance: string;
}

export interface AndarBaharHistoryRound {
  roundId: string;
  side: AndarBaharSide;
  bet: number;
  joker: number;
  andarCards: number[];
  baharCards: number[];
  winningSide: AndarBaharSide;
  matchIndex: number;
  won: boolean;
  payout: number;
  createdAt: string;
}

export interface AndarBaharRecentRound {
  roundId: string;
  wallet: string;
  side: AndarBaharSide;
  bet: number;
  joker: number;
  winningSide: AndarBaharSide;
  matchIndex: number;
  won: boolean;
  payout: number;
  createdAt: string;
}

export interface AndarBaharLeaderboardEntry {
  wallet: string;
  rounds: number;
  wagered: string;
  won: string;
  net: string;
}

export interface AndarBaharVerifyResult {
  roundId: string;
  side: AndarBaharSide;
  bet: number;
  joker: number;
  andarCards: number[];
  baharCards: number[];
  winningSide: AndarBaharSide;
  matchIndex: number;
  won: boolean;
  payout: number;
  recomputedJoker: number;
  recomputedAndarCards: number[];
  recomputedBaharCards: number[];
  recomputedWinningSide: AndarBaharSide;
  recomputedPayout: number;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  createdAt: string;
  recipe: string;
}

const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

/** rank0 (0..12) of a card index — A..K collapsed; only rank decides the match. */
export function cardRank0(cardIdx: number): number {
  return cardIdx % 13;
}

/** Suit index 0..3 (0=♠,1=♥,2=♦,3=♣) of a card index. */
export function cardSuit(cardIdx: number): number {
  return Math.floor(cardIdx / 13);
}

/** True when the card is a red suit (♥ or ♦) — for tinting the pip. */
export function cardIsRed(cardIdx: number): boolean {
  const s = cardSuit(cardIdx);
  return s === 1 || s === 2;
}

/** Display rank label: "2".."10","J","Q","K","A". */
export function cardRankLabel(cardIdx: number): string {
  return RANK_LABELS[cardRank0(cardIdx)] ?? '?';
}

/** Display suit glyph: ♠ ♥ ♦ ♣. */
export function cardSuitGlyph(cardIdx: number): string {
  return SUITS[cardSuit(cardIdx)] ?? '?';
}

/** "190" → "1.90×" — a gross multiplier label. */
export function formatPayMultiplier(payX100: number): string {
  return `${(payX100 / 100).toFixed(2)}×`;
}

/** "andar" → "Andar". */
export function sideLabel(side: AndarBaharSide): string {
  return side === 'andar' ? 'Andar' : 'Bahar';
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchAndarBaharInfo(): Promise<AndarBaharInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/andar-bahar/info`);
  const j = await r.json();
  return j as AndarBaharInfo;
}

export async function playAndarBahar(args: {
  side: AndarBaharSide;
  bet: number;
  clientSeed?: string;
}): Promise<AndarBaharPlayResult> {
  return apiFetchJson<AndarBaharPlayResult>('/api/arcade/andar-bahar/play', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function fetchAndarBaharHistory(limit = 25): Promise<AndarBaharHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: AndarBaharHistoryRound[] }>(
    `/api/arcade/andar-bahar/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchAndarBaharRecent(limit = 25): Promise<AndarBaharRecentRound[]> {
  const r = await fetch(`${apiBase()}/api/arcade/andar-bahar/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as AndarBaharRecentRound[];
}

export async function fetchAndarBaharLeaderboard(limit = 10): Promise<AndarBaharLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/andar-bahar/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as AndarBaharLeaderboardEntry[];
}

export async function verifyAndarBahar(roundId: string): Promise<AndarBaharVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/andar-bahar/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) throw new Error('Round not found');
  return (await r.json()) as AndarBaharVerifyResult;
}
