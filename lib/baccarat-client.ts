/**
 * baccarat-client.ts — client types + API wrappers for chips Baccarat (/baccarat).
 *
 * Talks to the same /api/arcade/baccarat/* endpoints as the Telegram Mini App —
 * the backend accepts either Telegram initData or the SIWE morb_session
 * cookie, so the web client just relies on apiFetchJson's cookie handling.
 *
 * Game model: punto banco. Wager any combination of five zones (player /
 * banker / tie + the two pair side bets); the server shuffles a committed
 * 52-card deck, deals with the standard third-card rules, and settles
 * instantly. Cards use the shared 0..51 encoding: rank = (idx % 13) + 2
 * (2..14, 14 = Ace), suit = floor(idx / 13) (0=♥ 1=♦ 2=♣ 3=♠).
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

export { formatMultiplier } from '@/lib/keno-client';

export type BaccaratResult = 'player' | 'banker' | 'tie';

export type BaccaratBetKey = 'player' | 'banker' | 'tie' | 'playerPair' | 'bankerPair';

/** Chips per zone — used for both wagers and the per-zone (gross) payouts. */
export interface BaccaratBets {
  player: number;
  banker: number;
  tie: number;
  playerPair: number;
  bankerPair: number;
}

export interface BaccaratInfo {
  minBet: number;
  maxBet: number;
  /** Gross multipliers ×100 paid on a winning zone (stake included). */
  payouts: BaccaratBets;
}

export interface BaccaratPlayResult {
  handId: string;
  bets: BaccaratBets;
  totalBet: number;
  playerCards: number[];
  bankerCards: number[];
  playerTotal: number;
  bankerTotal: number;
  result: BaccaratResult;
  playerPair: boolean;
  bankerPair: boolean;
  payouts: BaccaratBets;
  totalPayout: number;
  serverSeedHash: string;
  chipBalance: string;
}

export interface BaccaratHistoryHand {
  handId: string;
  bets: BaccaratBets;
  totalBet: number;
  playerTotal: number;
  bankerTotal: number;
  result: BaccaratResult;
  playerPair: boolean;
  bankerPair: boolean;
  payouts: BaccaratBets;
  totalPayout: number;
  createdAt: string;
}

export interface BaccaratRecentHand {
  handId: string;
  wallet: string;
  totalBet: number;
  playerTotal: number;
  bankerTotal: number;
  result: BaccaratResult;
  playerPair: boolean;
  bankerPair: boolean;
  totalPayout: number;
  createdAt: string;
}

export interface BaccaratLeaderboardEntry {
  wallet: string;
  hands: number;
  wagered: string;
  won: string;
  net: string;
}

export interface BaccaratVerifyResult {
  handId: string;
  bets: BaccaratBets;
  totalBet: number;
  deck: number[];
  playerCards: number[];
  bankerCards: number[];
  playerTotal: number;
  bankerTotal: number;
  result: BaccaratResult;
  playerPair: boolean;
  bankerPair: boolean;
  payouts: BaccaratBets;
  totalPayout: number;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  recipe: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Payout constants — mirror of server/src/services/arcade-baccarat.ts. The
// /info endpoint returns the live table; this mirror backs the fairness
// modal's offline payout reconciliation and the UI's pre-fetch fallback.
// ────────────────────────────────────────────────────────────────────────────

export const BACC_PAYOUTS_FALLBACK: BaccaratBets = {
  player: 200, // 1:1 even money → 2.00× total return
  banker: 195, // 0.95:1 (5% commission) → 1.95× total
  tie: 900, // 8:1 → 9.00× total
  playerPair: 1200, // 11:1 → 12.00× total
  bankerPair: 1200,
};

/** Push multiplier ×100 on Player/Banker main bets when the hand ties. */
export const BACC_PUSH_X100 = 100;

export const BACCARAT_BET_KEYS: BaccaratBetKey[] = [
  'player',
  'banker',
  'tie',
  'playerPair',
  'bankerPair',
];

// ────────────────────────────────────────────────────────────────────────────
// Card helpers (shared 0..51 encoding)
// ────────────────────────────────────────────────────────────────────────────

/** Suit glyphs indexed by floor(idx / 13): 0=♥ 1=♦ 2=♣ 3=♠. */
export const BACC_SUIT_GLYPHS = ['♥', '♦', '♣', '♠'] as const;

/** Rank 2..14 where 14 = Ace. */
export function baccCardRank(idx: number): number {
  return (idx % 13) + 2;
}

/** Suit 0..3 (0=hearts, 1=diamonds, 2=clubs, 3=spades). */
export function baccCardSuit(idx: number): number {
  return Math.floor(idx / 13);
}

/** "A", "K", "Q", "J" or "2".."10". */
export function baccCardRankLabel(idx: number): string {
  const rank = baccCardRank(idx);
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  return String(rank);
}

/** Hearts/diamonds render red; clubs/spades black. */
export function baccCardIsRed(idx: number): boolean {
  return baccCardSuit(idx) <= 1;
}

/** Baccarat value of one card: A=1, 2..9 face, 10/J/Q/K=0. */
export function baccaratCardValue(idx: number): number {
  const rank = baccCardRank(idx);
  if (rank === 14) return 1;
  if (rank >= 10) return 0;
  return rank;
}

/** Hand total: sum of card values mod 10. */
export function baccaratHandTotal(cards: number[]): number {
  let s = 0;
  for (const c of cards) s += baccaratCardValue(c);
  return s % 10;
}

/** True when the hand ended on a two-card 8/9 (both sides stood pat). */
export function baccaratIsNatural(
  playerCards: number[],
  bankerCards: number[],
  playerTotal: number,
  bankerTotal: number,
): boolean {
  return (
    playerCards.length === 2 &&
    bankerCards.length === 2 &&
    (playerTotal >= 8 || bankerTotal >= 8)
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Punto banco deal + payouts — exact client ports of the server math, used by
// the fairness modal to re-derive the whole hand from the revealed seeds.
// ────────────────────────────────────────────────────────────────────────────

export interface BaccaratDealtHand {
  playerCards: number[];
  bankerCards: number[];
  playerTotal: number;
  bankerTotal: number;
  result: BaccaratResult;
  playerPair: boolean;
  bankerPair: boolean;
}

/** Standard punto-banco banker third-card table (player drew a 3rd card). */
function bankerDrawsOnPlayerThird(bankerTotal: number, playerThirdValue: number): boolean {
  if (bankerTotal <= 2) return true;
  if (bankerTotal === 7) return false;
  if (bankerTotal === 3) return playerThirdValue !== 8;
  if (bankerTotal === 4) return playerThirdValue >= 2 && playerThirdValue <= 7;
  if (bankerTotal === 5) return playerThirdValue >= 4 && playerThirdValue <= 7;
  if (bankerTotal === 6) return playerThirdValue === 6 || playerThirdValue === 7;
  return false;
}

/**
 * Deal a hand from a pre-shuffled deck — mirror of `dealBaccarat` in
 * server/src/services/arcade-baccarat.ts. Deal order: P1 = deck[0],
 * B1 = deck[1], P2 = deck[2], B2 = deck[3]; when the player stands the
 * banker's potential 3rd card comes from deck[4] (the player didn't consume
 * it), otherwise P3 = deck[4] and B3 = deck[5].
 */
export function dealBaccaratFromDeck(deck: number[]): BaccaratDealtHand {
  if (!Array.isArray(deck) || deck.length < 6) throw new Error('Deck too small');
  const p: number[] = [deck[0], deck[2]];
  const b: number[] = [deck[1], deck[3]];

  const p0 = baccaratHandTotal(p);
  const b0 = baccaratHandTotal(b);

  if (p0 < 8 && b0 < 8) {
    let playerThirdValue: number | null = null;
    if (p0 <= 5) {
      p.push(deck[4]);
      playerThirdValue = baccaratCardValue(deck[4]);
    }
    if (playerThirdValue === null) {
      if (b0 <= 5) b.push(deck[4]);
    } else if (bankerDrawsOnPlayerThird(b0, playerThirdValue)) {
      b.push(deck[5]);
    }
  }

  const playerTotal = baccaratHandTotal(p);
  const bankerTotal = baccaratHandTotal(b);
  const result: BaccaratResult =
    playerTotal > bankerTotal ? 'player' : bankerTotal > playerTotal ? 'banker' : 'tie';
  return {
    playerCards: p,
    bankerCards: b,
    playerTotal,
    bankerTotal,
    result,
    playerPair: baccCardRank(p[0]) === baccCardRank(p[1]),
    bankerPair: baccCardRank(b[0]) === baccCardRank(b[1]),
  };
}

/**
 * Per-zone gross payouts — mirror of `resolvePayouts` on the server. On a tie
 * the Player/Banker main bets push (stake returned at 1.00×).
 */
export function resolveBaccaratPayouts(
  bets: BaccaratBets,
  hand: BaccaratDealtHand,
  payouts: BaccaratBets = BACC_PAYOUTS_FALLBACK,
): BaccaratBets {
  const out: BaccaratBets = { player: 0, banker: 0, tie: 0, playerPair: 0, bankerPair: 0 };

  if (hand.result === 'player') {
    if (bets.player > 0) out.player = Math.floor((bets.player * payouts.player) / 100);
  } else if (hand.result === 'banker') {
    if (bets.banker > 0) out.banker = Math.floor((bets.banker * payouts.banker) / 100);
  } else {
    if (bets.player > 0) out.player = Math.floor((bets.player * BACC_PUSH_X100) / 100);
    if (bets.banker > 0) out.banker = Math.floor((bets.banker * BACC_PUSH_X100) / 100);
    if (bets.tie > 0) out.tie = Math.floor((bets.tie * payouts.tie) / 100);
  }

  if (bets.playerPair > 0 && hand.playerPair) {
    out.playerPair = Math.floor((bets.playerPair * payouts.playerPair) / 100);
  }
  if (bets.bankerPair > 0 && hand.bankerPair) {
    out.bankerPair = Math.floor((bets.bankerPair * payouts.bankerPair) / 100);
  }

  return out;
}

/** Sum of all five zones. */
export function sumBaccaratZones(zones: BaccaratBets): number {
  return zones.player + zones.banker + zones.tie + zones.playerPair + zones.bankerPair;
}

// ────────────────────────────────────────────────────────────────────────────
// API wrappers
// ────────────────────────────────────────────────────────────────────────────

function apiBase(): string {
  return getApiUrlOptional() ?? '';
}

export async function fetchBaccaratInfo(): Promise<BaccaratInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/baccarat/info`);
  const j = await r.json();
  return j as BaccaratInfo;
}

export async function playBaccarat(args: {
  bets: Partial<BaccaratBets>;
  clientSeed?: string;
}): Promise<BaccaratPlayResult> {
  return apiFetchJson<BaccaratPlayResult>('/api/arcade/baccarat/play', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function fetchBaccaratHistory(limit = 25): Promise<BaccaratHistoryHand[]> {
  const j = await apiFetchJson<{ hands: BaccaratHistoryHand[] }>(
    `/api/arcade/baccarat/history?limit=${limit}`,
  );
  return j.hands ?? [];
}

export async function fetchBaccaratRecent(limit = 25): Promise<BaccaratRecentHand[]> {
  const r = await fetch(`${apiBase()}/api/arcade/baccarat/recent?limit=${limit}`);
  const j = await r.json();
  return (j.hands ?? []) as BaccaratRecentHand[];
}

export async function fetchBaccaratLeaderboard(limit = 10): Promise<BaccaratLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/baccarat/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as BaccaratLeaderboardEntry[];
}

export async function verifyBaccarat(handId: string): Promise<BaccaratVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/baccarat/verify/${encodeURIComponent(handId)}`);
  if (!r.ok) throw new Error('Hand not found');
  return (await r.json()) as BaccaratVerifyResult;
}
