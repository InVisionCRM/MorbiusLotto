/**
 * three-card-poker-client.ts — client types + API wrappers + card helpers for
 * chips Three Card Poker (/three-card-poker).
 *
 * Two-step session game (deal → play/fold). Talks to the
 * /api/arcade/three-card-poker/* endpoints; the backend accepts either Telegram
 * initData or the SIWE morb_session cookie, so the web client just relies on
 * apiFetchJson's cookie handling.
 *
 * Cards are the shared 0..51 index encoding (pf.fisherYatesShuffle): rank =
 * (idx % 13) + 2 with 14 = Ace (HIGH); suit = floor(idx / 13). Three-card hand
 * ranking — and the evaluator below for display — follows the rule where a
 * STRAIGHT BEATS A FLUSH.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

// -------------------------------------------------------------------------
// Card helpers (mirror the server's encoding + the lab's evaluator).
// -------------------------------------------------------------------------

const RANK_LABEL: Record<number, string> = {
  14: 'A',
  13: 'K',
  12: 'Q',
  11: 'J',
  10: '10',
  9: '9',
  8: '8',
  7: '7',
  6: '6',
  5: '5',
  4: '4',
  3: '3',
  2: '2',
};

// suit index → glyph. fisherYatesShuffle suit = floor(idx/13); the server uses
// 0=hearts, 1=diamonds, 2=clubs, 3=spades (provably-fair.service.ts).
const SUIT_GLYPH = ['♥', '♦', '♣', '♠'];

/** Card index 0..51 → rank 2..14 (14 = Ace, high). */
export function cardRank(cardIdx: number): number {
  return (cardIdx % 13) + 2;
}

/** Card index 0..51 → suit 0..3 (0=♥, 1=♦, 2=♣, 3=♠). */
export function cardSuit(cardIdx: number): number {
  return Math.floor(cardIdx / 13);
}

/** Card index 0..51 → display rank label (A, K, Q, J, 10, 9..2). */
export function cardRankLabel(cardIdx: number): string {
  return RANK_LABEL[cardRank(cardIdx)] ?? '?';
}

/** Card index 0..51 → suit glyph. */
export function cardSuitGlyph(cardIdx: number): string {
  return SUIT_GLYPH[cardSuit(cardIdx)] ?? '?';
}

/** Is the card a red suit (hearts/diamonds)? */
export function cardIsRed(cardIdx: number): boolean {
  const s = cardSuit(cardIdx);
  return s === 0 || s === 1;
}

export interface Hand3Eval {
  cat: number; // 5=SF, 4=trips, 3=straight, 2=flush, 1=pair, 0=high
  tie: number[];
  ranks: number[];
}

/** Evaluate a 3-card hand (straight beats flush; Ace high, wheel A-2-3). */
export function evaluate3(cards: number[]): Hand3Eval {
  const ranks = cards.map(cardRank).sort((a, b) => b - a);
  const suits = cards.map(cardSuit);
  const suited = suits[0] === suits[1] && suits[1] === suits[2];
  const asc = ranks.slice().sort((a, b) => a - b);
  const isTrips = ranks[0] === ranks[1] && ranks[1] === ranks[2];
  let pairRank: number | null = null;
  let kicker: number | null = null;
  if (!isTrips) {
    if (ranks[0] === ranks[1]) {
      pairRank = ranks[0];
      kicker = ranks[2];
    } else if (ranks[1] === ranks[2]) {
      pairRank = ranks[1];
      kicker = ranks[0];
    }
  }
  const straightNorm = asc[1] === asc[0] + 1 && asc[2] === asc[1] + 1;
  const wheel = asc[0] === 2 && asc[1] === 3 && asc[2] === 14;
  const isStraight = straightNorm || wheel;
  const sHigh = wheel ? 3 : asc[2];
  let cat: number;
  let tie: number[];
  if (isStraight && suited) {
    cat = 5;
    tie = [sHigh];
  } else if (isTrips) {
    cat = 4;
    tie = [ranks[0]];
  } else if (isStraight) {
    cat = 3;
    tie = [sHigh];
  } else if (suited) {
    cat = 2;
    tie = ranks.slice();
  } else if (pairRank !== null) {
    cat = 1;
    tie = [pairRank, kicker as number];
  } else {
    cat = 0;
    tie = ranks.slice();
  }
  return { cat, tie, ranks };
}

/** Human-readable hand name. */
export function handName3(e: Hand3Eval): string {
  if (e.cat === 5) return 'Straight flush';
  if (e.cat === 4) return `Three ${RANK_LABEL[e.tie[0]]}s`;
  if (e.cat === 3) return 'Straight';
  if (e.cat === 2) return 'Flush';
  if (e.cat === 1) return `Pair of ${RANK_LABEL[e.tie[0]]}s`;
  return `${RANK_LABEL[e.ranks[0]]} high`;
}

/** Dealer qualifies on Queen-high or better. */
export function dealerQualifies(e: Hand3Eval): boolean {
  return e.cat >= 1 || e.ranks[0] >= 12;
}

// -------------------------------------------------------------------------
// API types
// -------------------------------------------------------------------------

export type ThreeCardResult =
  | 'play_win'
  | 'play_loss'
  | 'push'
  | 'dealer_no_qualify'
  | 'fold';

export interface ThreeCardInfo {
  minBet: number;
  maxBet: number;
  pairPlusPay: Record<string, number>;
  anteBonus: Record<string, number>;
  dealerQualify: string;
  houseEdgeAnteBp: number;
  houseEdgePairPlusBp: number;
}

export interface ThreeCardActiveHand {
  roundId: string;
  ante: number;
  pairPlus: number;
  playerCards: number[];
  serverSeedHash: string;
}

export interface ThreeCardDealResult {
  roundId: string;
  ante: number;
  pairPlus: number;
  playerCards: number[];
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  chipBalance: string;
}

export interface ThreeCardDecisionResult {
  roundId: string;
  action: 'play' | 'fold';
  played: boolean;
  ante: number;
  pairPlus: number;
  play: number;
  playerCards: number[];
  dealerCards: number[];
  dealerQualifies: boolean;
  result: ThreeCardResult;
  antePayout: number;
  pairPlusPayout: number;
  totalPayout: number;
  won: boolean;
  winSide: 'player' | 'dealer' | null;
  serverSeed: string;
  chipBalance?: string;
}

export interface ThreeCardHistoryRound {
  roundId: string;
  ante: number;
  pairPlus: number;
  play: number;
  playerCards: number[];
  dealerCards: number[];
  result: ThreeCardResult;
  antePayout: number;
  pairPlusPayout: number;
  totalPayout: number;
  won: boolean;
  createdAt: string;
}

export interface ThreeCardRecentHand {
  roundId: string;
  wallet: string;
  ante: number;
  pairPlus: number;
  play: number;
  result: ThreeCardResult;
  committed: number;
  totalPayout: number;
  won: boolean;
  createdAt: string;
}

export interface ThreeCardLeaderboardEntry {
  wallet: string;
  hands: number;
  wagered: string;
  won: string;
  net: string;
}

export interface ThreeCardVerifyResult {
  roundId: string;
  ante: number;
  pairPlus: number;
  play: number;
  playerCards: number[];
  dealerCards: number[];
  result: ThreeCardResult;
  antePayout: number;
  pairPlusPayout: number;
  totalPayout: number;
  committed: number;
  won: boolean;
  status: string;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  settledAt: string | null;
  recipe: string;
}

/** Short, friendly label for a settle result. */
export function resultLabel(result: ThreeCardResult): string {
  switch (result) {
    case 'play_win':
      return 'You win';
    case 'play_loss':
      return 'Dealer wins';
    case 'push':
      return 'Push';
    case 'dealer_no_qualify':
      return 'Dealer folds';
    case 'fold':
      return 'Folded';
    default:
      return result;
  }
}

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

// -------------------------------------------------------------------------
// API wrappers
// -------------------------------------------------------------------------

export async function fetchThreeCardInfo(): Promise<ThreeCardInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/three-card-poker/info`);
  const j = await r.json();
  return j as ThreeCardInfo;
}

export async function fetchThreeCardActive(): Promise<ThreeCardActiveHand | null> {
  const j = await apiFetchJson<{ active: ThreeCardActiveHand | null }>(
    '/api/arcade/three-card-poker/active',
  );
  return j.active ?? null;
}

export async function dealThreeCard(args: {
  ante: number;
  pairPlus: boolean;
  clientSeed?: string;
}): Promise<ThreeCardDealResult> {
  return apiFetchJson<ThreeCardDealResult>('/api/arcade/three-card-poker/deal', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function decideThreeCard(
  roundId: string,
  action: 'play' | 'fold',
): Promise<ThreeCardDecisionResult> {
  return apiFetchJson<ThreeCardDecisionResult>('/api/arcade/three-card-poker/decision', {
    method: 'POST',
    body: JSON.stringify({ roundId, action }),
  });
}

export async function fetchThreeCardHistory(limit = 25): Promise<ThreeCardHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: ThreeCardHistoryRound[] }>(
    `/api/arcade/three-card-poker/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchThreeCardRecent(limit = 25): Promise<ThreeCardRecentHand[]> {
  const r = await fetch(`${apiBase()}/api/arcade/three-card-poker/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as ThreeCardRecentHand[];
}

export async function fetchThreeCardLeaderboard(limit = 10): Promise<ThreeCardLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/three-card-poker/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as ThreeCardLeaderboardEntry[];
}

export async function verifyThreeCard(roundId: string): Promise<ThreeCardVerifyResult> {
  const r = await fetch(
    `${apiBase()}/api/arcade/three-card-poker/verify/${encodeURIComponent(roundId)}`,
  );
  if (!r.ok) throw new Error('Hand not found');
  return (await r.json()) as ThreeCardVerifyResult;
}
