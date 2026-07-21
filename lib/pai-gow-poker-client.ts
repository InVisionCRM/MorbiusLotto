/**
 * pai-gow-poker-client.ts — client types + API wrappers + card helpers for chips
 * Pai Gow Poker (/pai-gow-poker).
 *
 * Seven cards to you, seven to the dealer, from a standard 52-card deck (no
 * joker). You split your seven into a 5-card HIGH hand and a 2-card LOW hand;
 * the HIGH hand must strictly outrank the LOW hand or the set is FOULED. The
 * dealer always sets by a fixed house way. Win BOTH comparisons → 1:1 minus a
 * 5% commission; win one → push; lose both → bet lost. Copies (exact ties on a
 * comparison) go to the dealer.
 *
 * Talks to /api/arcade/pai-gow-poker/* — the backend accepts either Telegram
 * initData or the SIWE morb_session cookie, so the web client relies on
 * apiFetchJson's cookie handling for authed calls and plain fetch for public.
 *
 * Cards are the shared 0..51 index encoding (pf.fisherYatesShuffle): rank =
 * (idx % 13) + 2 with 14 = Ace (HIGH); suit = floor(idx / 13). The evaluators,
 * house way and settlement below are an index-based mirror of the server module
 * (server/src/services/arcade-pai-gow-poker.ts) for display, the arrange step,
 * and Verify re-derivation. Currency: MORBIUS chips.
 */

import { apiFetchJson } from '@/lib/api-auth';
import { getApiUrlOptional } from '@/lib/api-urls';

// -------------------------------------------------------------------------
// Card helpers (mirror the server's encoding + TCP's suit order).
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
// 0=hearts, 1=diamonds, 2=clubs, 3=spades (provably-fair.service.ts) — the same
// order the Three Card Poker client uses.
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

/** Rank value 2..14 → display label. */
export function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
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

// -------------------------------------------------------------------------
// Evaluators — an index-based port of the server's score5 / low2score /
// cmpScore / handName / lowName. Standard 5-card ranking (a flush BEATS a
// straight here, unlike the 3-card game). Ace high; the only Ace-low straight
// is the wheel A-2-3-4-5, scored 5-high (the lowest straight).
// -------------------------------------------------------------------------

/**
 * Score a 5-card hand (as deck indices) → [category, ...tiebreakers],
 * comparable with cmpScore:
 *   8 straight flush > 7 quads > 6 full house > 5 flush > 4 straight
 *   > 3 trips > 2 two pair > 1 pair > 0 high card.
 */
export function score5(cardIdxs: number[]): number[] {
  const rs = cardIdxs.map(cardRank).sort((a, b) => b - a); // descending
  const s0 = cardSuit(cardIdxs[0]);
  const flush = cardIdxs.every((c) => cardSuit(c) === s0);
  const uniq: number[] = [];
  rs.forEach((r) => {
    if (uniq.indexOf(r) < 0) uniq.push(r);
  });
  const isWheel =
    uniq.length === 5 && uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2;
  const isStraight = (uniq.length === 5 && uniq[0] - uniq[4] === 4) || isWheel;
  const sHigh = isWheel ? 5 : uniq[0];

  const cnt: Record<number, number> = {};
  rs.forEach((r) => {
    cnt[r] = (cnt[r] || 0) + 1;
  });
  const groups = Object.keys(cnt)
    .map((k) => ({ r: +k, c: cnt[+k] }))
    .sort((a, b) => b.c - a.c || b.r - a.r);

  if (isStraight && flush) return [8, sHigh];
  if (groups[0].c === 4) return [7, groups[0].r, groups[1].r];
  if (groups[0].c === 3 && groups[1] && groups[1].c >= 2) return [6, groups[0].r, groups[1].r];
  if (flush) return [5, ...rs];
  if (isStraight) return [4, sHigh];
  if (groups[0].c === 3) return [3, groups[0].r, groups[1].r, groups[2].r];
  if (groups[0].c === 2 && groups[1] && groups[1].c === 2) return [2, groups[0].r, groups[1].r, groups[2].r];
  if (groups[0].c === 2) return [1, groups[0].r, groups[1].r, groups[2].r, groups[3].r];
  return [0, ...rs];
}

/** Score a 2-card low hand (deck indices) → [1, pairRank] for a pair, else [0, high, low]. */
export function low2score(lowIdxs: number[]): number[] {
  const a = cardRank(lowIdxs[0]);
  const b = cardRank(lowIdxs[1]);
  return a === b ? [1, a] : [0, Math.max(a, b), Math.min(a, b)];
}

/** Compare two score arrays element-by-element: >0 a wins, <0 b wins, 0 tie. */
export function cmpScore(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Human-readable name for a 5-card score array (mirrors handName). */
export function handName(sc: number[]): string {
  switch (sc[0]) {
    case 8:
      return sc[1] === 14 ? 'Royal flush' : 'Straight flush';
    case 7:
      return `Four ${rankLabel(sc[1])}s`;
    case 6:
      return 'Full house';
    case 5:
      return 'Flush';
    case 4:
      return 'Straight';
    case 3:
      return `Three ${rankLabel(sc[1])}s`;
    case 2:
      return 'Two pair';
    case 1:
      return `Pair of ${rankLabel(sc[1])}s`;
    default:
      return `${rankLabel(sc[1])} high`;
  }
}

/** Human-readable name for a 2-card low hand (mirrors lowName). */
export function lowName(lowIdxs: number[]): string {
  const a = cardRank(lowIdxs[0]);
  const b = cardRank(lowIdxs[1]);
  return a === b
    ? `Pair of ${rankLabel(a)}s`
    : `${rankLabel(Math.max(a, b))}-${rankLabel(Math.min(a, b))} high`;
}

/** Convenience: 5-card high-hand name from deck indices. */
export function highHandName(cardIdxs: number[]): string {
  return handName(score5(cardIdxs));
}

/** The 5-card high hand must strictly outrank the 2-card low hand. */
export function isValidSplit(highIdxs: number[], lowIdxs: number[]): boolean {
  return cmpScore(score5(highIdxs), low2score(lowIdxs)) > 0;
}

// -------------------------------------------------------------------------
// House way — the dealer always sets by this, and it is offered to the player
// via the "House way" button. A faithful index-based port of the server's
// houseWayCards(). Guaranteed never to foul (safety fallback keeps the top
// card high with the 2nd/3rd highest in the low).
// -------------------------------------------------------------------------

interface PGCard {
  idx: number;
  r: number;
  s: number;
}

function toCard(idx: number): PGCard {
  return { idx, r: cardRank(idx), s: cardSuit(idx) };
}

function houseWayCards(cards: PGCard[]): { low: PGCard[]; high: PGCard[] } {
  const cs = cards.slice().sort((a, b) => b.r - a.r);
  const byRank: Record<number, PGCard[]> = {};
  cs.forEach((c) => {
    (byRank[c.r] = byRank[c.r] || []).push(c);
  });
  const quads: PGCard[][] = [];
  const trips: PGCard[][] = [];
  const pairs: PGCard[][] = [];
  const singles: PGCard[] = [];
  Object.keys(byRank)
    .map(Number)
    .sort((a, b) => b - a)
    .forEach((r) => {
      const g = byRank[r];
      if (g.length === 4) quads.push(g);
      else if (g.length === 3) trips.push(g);
      else if (g.length === 2) pairs.push(g);
      else singles.push(g[0]);
    });

  function make(low: PGCard[]): { low: PGCard[]; high: PGCard[] } {
    const high = cs.filter((c) => low.indexOf(c) < 0);
    return { low: low.slice().sort((a, b) => b.r - a.r), high };
  }

  function pick(): { low: PGCard[]; high: PGCard[] } {
    // quads: keep together with a pair (or trips) for the low; else split into two pairs
    if (quads.length) {
      if (pairs.length) return make(pairs[0]);
      if (trips.length) return make([trips[0][0], trips[0][1]]);
      return make([quads[0][0], quads[0][1]]);
    }
    // full house (trips + pair): split — trips high, best pair low
    if (trips.length === 1 && pairs.length >= 1) return make(pairs[0]);
    // two trips: pair from the higher trips low, lower trips play high
    if (trips.length === 2) return make([trips[0][0], trips[0][1]]);
    // straight / flush / straight flush: keep intact if a decent low remains
    let cand: PGCard[] | null = null;
    let candScore: number[] | null = null;
    for (let i = 0; i < cs.length - 1; i++)
      for (let j = i + 1; j < cs.length; j++) {
        const lw = [cs[i], cs[j]];
        const hi = cs.filter((c) => c !== cs[i] && c !== cs[j]);
        const sc = score5(hi.map((c) => c.idx));
        if (sc[0] === 4 || sc[0] === 5 || sc[0] === 8) {
          const ls = low2score(lw.map((c) => c.idx));
          if (!cand || cmpScore(ls, candScore as number[]) > 0) {
            cand = lw;
            candScore = ls;
          }
        }
      }
    if (cand) {
      const decent = (candScore as number[])[0] === 1 || (candScore as number[])[1] >= 11; // pair, or J-high+ up top
      if (decent || pairs.length < 2) return make(cand);
      // weak low AND two pair available → fall through to two-pair split rules
    }
    // trips (no pair alongside): keep trips high — but split three aces
    if (trips.length === 1) {
      if (trips[0][0].r === 14) return make([trips[0][2], singles[0]]);
      return make([singles[0], singles[1]]);
    }
    // three pairs: highest pair low
    if (pairs.length === 3) return make(pairs[0]);
    // two pair: split unless both small (6s or lower) with an ace to save
    if (pairs.length === 2) {
      if (pairs[0][0].r <= 6 && singles.length && singles[0].r === 14) return make([singles[0], singles[1]]);
      return make(pairs[1]);
    }
    // one pair: pair high, top two kickers low
    if (pairs.length === 1) return make([singles[0], singles[1]]);
    // no pair: highest card high, 2nd + 3rd highest low
    return make([cs[1], cs[2]]);
  }

  let res = pick();
  if (!isValidSplit(res.high.map((c) => c.idx), res.low.map((c) => c.idx))) res = make([cs[1], cs[2]]); // safety — never foul
  return res;
}

/** Public house way over card indices → { low, high } as index arrays (never fouls). */
export function houseWay(cardIdxs: number[]): { low: number[]; high: number[] } {
  const res = houseWayCards(cardIdxs.map(toCard));
  return { low: res.low.map((c) => c.idx), high: res.high.map((c) => c.idx) };
}

export interface PaiGowSplitCheck {
  ok: boolean;
  fouled: boolean;
  /** UI hint message (matches the lab's validate()). */
  message: string;
}

/**
 * Live foul check for the arrange step. `lowIdxs` are the 0..1 chosen player
 * card indices (as deck indices); the rest of `playerCards` is the high hand.
 * Mirrors the lab's validate(): prompt until two are chosen, then either a foul
 * or the "High: … · Low: …" summary.
 */
export function checkSplit(playerCards: number[], lowIdxs: number[]): PaiGowSplitCheck {
  if (lowIdxs.length !== 2) {
    const need = 2 - lowIdxs.length;
    return {
      ok: false,
      fouled: false,
      message: `Tap ${need} card${need === 1 ? '' : 's'} below to set your 2-card low hand`,
    };
  }
  const high = playerCards.filter((c) => lowIdxs.indexOf(c) < 0);
  if (!isValidSplit(high, lowIdxs)) {
    return { ok: false, fouled: true, message: 'Fouled — your low hand outranks your 5-card high hand' };
  }
  return { ok: true, fouled: false, message: `High: ${handName(score5(high))} · Low: ${lowName(lowIdxs)}` };
}

// -------------------------------------------------------------------------
// Settlement mirror (for Verify reconciliation): copies to dealer, 5% commission.
// -------------------------------------------------------------------------

export interface PaiGowReconcile {
  result: PaiGowResult;
  totalPayout: number;
  net: number;
  winHigh: boolean;
  winLow: boolean;
  copyHigh: boolean;
  copyLow: boolean;
  won: boolean;
}

/** Reconcile a settled hand from its four hands + bet (mirrors settlePaiGow). */
export function reconcileSettlement(
  pHigh: number[],
  pLow: number[],
  dHigh: number[],
  dLow: number[],
  bet: number,
): PaiGowReconcile {
  const hCmp = cmpScore(score5(pHigh), score5(dHigh));
  const lCmp = cmpScore(low2score(pLow), low2score(dLow));
  const copyHigh = hCmp === 0;
  const copyLow = lCmp === 0;
  const winHigh = hCmp > 0;
  const winLow = lCmp > 0;
  const wins = (winHigh ? 1 : 0) + (winLow ? 1 : 0);

  let totalPayout: number;
  let result: PaiGowResult;
  if (wins === 2) {
    const commission = Math.floor((bet * PG_COMMISSION_BP) / 10_000);
    totalPayout = bet + (bet - commission);
    result = 'win';
  } else if (wins === 1) {
    totalPayout = bet;
    result = 'push';
  } else {
    totalPayout = 0;
    result = 'loss';
  }
  return {
    result,
    totalPayout,
    net: totalPayout - bet,
    winHigh,
    winLow,
    copyHigh,
    copyLow,
    won: totalPayout > bet,
  };
}

/** Commission taken on a hand that wins BOTH comparisons (basis points: 5%). */
export const PG_COMMISSION_BP = 500;

// -------------------------------------------------------------------------
// API types
// -------------------------------------------------------------------------

export type PaiGowResult = 'win' | 'push' | 'loss';

export interface PaiGowInfo {
  minBet: number;
  maxBet: number;
  commissionBp: number;
  houseEdgeBp: number;
  rules: Record<string, unknown>;
}

export interface PaiGowActiveHand {
  roundId: string;
  bet: number;
  playerCards: number[];
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface PaiGowDealResult {
  roundId: string;
  bet: number;
  playerCards: number[];
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  chipBalance: string;
}

export interface PaiGowDecisionResult {
  roundId: string;
  bet: number;
  playerCards: number[];
  dealerCards: number[];
  playerLow: number[];
  playerHigh: number[];
  dealerLow: number[];
  dealerHigh: number[];
  result: PaiGowResult;
  totalPayout: number;
  net: number;
  winHigh: boolean;
  winLow: boolean;
  copyHigh: boolean;
  copyLow: boolean;
  won: boolean;
  status: string;
  serverSeed: string;
  chipBalance: string;
}

export interface PaiGowHistoryRound {
  roundId: string;
  bet: number;
  playerCards: number[];
  dealerCards: number[];
  playerLow: number[];
  playerHigh: number[];
  dealerLow: number[];
  dealerHigh: number[];
  result: PaiGowResult;
  totalPayout: number;
  net: number;
  won: boolean;
  createdAt: string;
}

export interface PaiGowRecentHand {
  roundId: string;
  wallet: string;
  bet: number;
  result: PaiGowResult;
  committed: number;
  totalPayout: number;
  won: boolean;
  createdAt: string;
}

export interface PaiGowLeaderboardEntry {
  wallet: string;
  hands: number;
  wagered: string;
  won: string;
  net: string;
}

export interface PaiGowVerifyResult {
  roundId: string;
  bet: number;
  playerCards: number[];
  dealerCards: number[];
  playerLow: number[];
  playerHigh: number[];
  dealerLow: number[];
  dealerHigh: number[];
  result: PaiGowResult;
  totalPayout: number;
  committed: number;
  net: number;
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
export function resultLabel(result: PaiGowResult): string {
  switch (result) {
    case 'win':
      return 'Win both';
    case 'push':
      return 'Push';
    case 'loss':
      return 'Loss';
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

export async function fetchPaiGowInfo(): Promise<PaiGowInfo> {
  const r = await fetch(`${apiBase()}/api/arcade/pai-gow-poker/info`);
  const j = await r.json();
  return j as PaiGowInfo;
}

export async function fetchPaiGowActive(): Promise<PaiGowActiveHand | null> {
  const j = await apiFetchJson<{ active: PaiGowActiveHand | null }>('/api/arcade/pai-gow-poker/active');
  return j.active ?? null;
}

export async function dealPaiGow(args: { bet: number; clientSeed?: string }): Promise<PaiGowDealResult> {
  return apiFetchJson<PaiGowDealResult>('/api/arcade/pai-gow-poker/deal', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function decidePaiGow(roundId: string, lowIndices: number[]): Promise<PaiGowDecisionResult> {
  return apiFetchJson<PaiGowDecisionResult>('/api/arcade/pai-gow-poker/decision', {
    method: 'POST',
    body: JSON.stringify({ roundId, lowIndices }),
  });
}

export async function fetchPaiGowHistory(limit = 25): Promise<PaiGowHistoryRound[]> {
  const j = await apiFetchJson<{ rounds: PaiGowHistoryRound[] }>(
    `/api/arcade/pai-gow-poker/history?limit=${limit}`,
  );
  return j.rounds ?? [];
}

export async function fetchPaiGowRecent(limit = 25): Promise<PaiGowRecentHand[]> {
  const r = await fetch(`${apiBase()}/api/arcade/pai-gow-poker/recent?limit=${limit}`);
  const j = await r.json();
  return (j.rounds ?? []) as PaiGowRecentHand[];
}

export async function fetchPaiGowLeaderboard(limit = 10): Promise<PaiGowLeaderboardEntry[]> {
  const r = await fetch(`${apiBase()}/api/arcade/pai-gow-poker/leaderboard?limit=${limit}`);
  const j = await r.json();
  return (j.players ?? []) as PaiGowLeaderboardEntry[];
}

export async function verifyPaiGow(roundId: string): Promise<PaiGowVerifyResult> {
  const r = await fetch(`${apiBase()}/api/arcade/pai-gow-poker/verify/${encodeURIComponent(roundId)}`);
  if (!r.ok) throw new Error('Hand not found');
  return (await r.json()) as PaiGowVerifyResult;
}
