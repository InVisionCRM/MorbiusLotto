/**
 * video-poker-client.ts — client types + API wrappers for chips Video Poker
 * (/video-poker), 9/6 Jacks or Better.
 *
 * Talks to the /api/video-poker/* endpoints — the backend accepts either
 * Telegram initData or the SIWE morb_session cookie, so the web client just
 * relies on apiFetchJson's cookie handling.
 *
 * Flow: /deal charges the bet and deals 5 cards from a committed deck → the
 * player holds any subset → /draw replaces the rest (from deck[5..9]),
 * evaluates and pays. The whole deck is sealed at deal time, so the draw is
 * locked before holds are chosen. Card indices 0-51:
 *   rank = (idx % 13) + 2   (2..14, 14 = Ace)
 *   suit = floor(idx / 13)  (0 = ♥ 1 = ♦ 2 = ♣ 3 = ♠)
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export type VideoPokerCategory =
  | 'royal_flush'
  | 'straight_flush'
  | 'four_of_a_kind'
  | 'full_house'
  | 'flush'
  | 'straight'
  | 'three_of_a_kind'
  | 'two_pair'
  | 'jacks_or_better'
  | 'nothing';

export interface VideoPokerPaytable {
  minBet: number;
  maxBet: number;
  paytable: Record<VideoPokerCategory, number>;
  names: Record<VideoPokerCategory, string>;
  order: VideoPokerCategory[];
}

export interface VideoPokerDealResult {
  handId: string;
  dealtHand: number[];
  bet: number;
  serverSeedHash: string;
  chipBalance: string;
}

export interface VideoPokerDrawResult {
  handId: string;
  holds: boolean[];
  finalHand: number[];
  category: VideoPokerCategory;
  categoryName: string;
  multiplier: number;
  payout: number;
  serverSeed: string;
  clientSeed: string;
  chipBalance: string;
}

export interface VideoPokerVerifyResult {
  handId: string;
  status: string;
  bet: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  serverSeed: string | null;
  deck: number[] | null;
  dealtHand: number[];
  holds: boolean[] | null;
  finalHand: number[] | null;
  resultCategory: VideoPokerCategory | null;
  payout: number | null;
  resolvedAt: string | null;
  recipe: string;
}

// ─────────────────────────── card display helpers ───────────────────────────

const RANK_LABELS: Record<number, string> = {
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

/** Suit order matches the server: 0=♥ 1=♦ 2=♣ 3=♠. */
const SUIT_GLYPHS = ['♥', '♦', '♣', '♠'];

/** Rank 2..14 (14 = Ace). */
export function vpCardRank(idx: number): number {
  return (idx % 13) + 2;
}

export function vpCardSuit(idx: number): number {
  return Math.floor(idx / 13);
}

export function vpRankLabel(idx: number): string {
  const rank = vpCardRank(idx);
  return RANK_LABELS[rank] ?? String(rank);
}

export function vpSuitGlyph(idx: number): string {
  return SUIT_GLYPHS[vpCardSuit(idx)] ?? '?';
}

/** Hearts and diamonds render red; clubs and spades black. */
export function vpCardIsRed(idx: number): boolean {
  return vpCardSuit(idx) <= 1;
}

/**
 * Apply the player's hold mask to a committed deck — mirror of `applyHolds` on
 * the server. deck[0..4] is the deal; deck[5..9] are the draw replacements,
 * consumed in order for each discarded card. Used by the fairness modal.
 */
export function applyVideoPokerHolds(deck: number[], holds: boolean[]): number[] {
  const dealt = deck.slice(0, 5);
  let nextDraw = 5;
  return dealt.map((card, i) => (holds[i] ? card : deck[nextDraw++]));
}

// ───────────────────────────── API wrappers ─────────────────────────────────

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchVideoPokerPaytable(): Promise<VideoPokerPaytable> {
  const r = await fetch(`${apiBase()}/api/video-poker/paytable`);
  const j = await r.json();
  return j as VideoPokerPaytable;
}

export async function dealVideoPoker(args: {
  bet: number;
  clientSeed?: string;
}): Promise<VideoPokerDealResult> {
  return apiFetchJson<VideoPokerDealResult>('/api/video-poker/deal', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function drawVideoPoker(args: {
  handId: string;
  holds: boolean[];
}): Promise<VideoPokerDrawResult> {
  return apiFetchJson<VideoPokerDrawResult>('/api/video-poker/draw', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function verifyVideoPoker(handId: string): Promise<VideoPokerVerifyResult> {
  const r = await fetch(`${apiBase()}/api/video-poker/verify/${encodeURIComponent(handId)}`);
  if (!r.ok) throw new Error('Hand not found');
  return (await r.json()) as VideoPokerVerifyResult;
}
