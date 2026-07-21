/**
 * arcade-pai-gow-poker.ts — MORBIUS Arcade: Pai Gow Poker math.
 *
 * Seven cards to the player, seven to the dealer, from a standard 52-card deck
 * (no joker in this variant). The player splits their seven into a 5-card HIGH
 * hand and a 2-card LOW hand; the HIGH hand must strictly outrank the LOW hand
 * or the set is FOULED. The dealer always sets by a fixed "house way". Both
 * high hands and both low hands are compared:
 *   win BOTH  → paid 1:1 minus a 5% commission,
 *   win ONE   → push,
 *   lose BOTH → bet lost.
 * Copies (exact ties on a hand) go to the dealer.
 *
 * A faithful port of public/pai-gow-lab.html — same evaluators, house way and
 * settlement. Card encoding matches the shared deck (provably-fair.service.ts
 * fisherYatesShuffle → indices 0..51):
 *   rank = (idx % 13) + 2   (2..14, where 14 = Ace, HIGH),
 *   suit = floor(idx / 13).
 * The player gets deck[0..6]; the dealer gets deck[7..13].
 *
 * Money math is integer chips. `*Payout` values are GROSS returns (the stake is
 * included) — the bet was already debited at /deal, so settle just credits it.
 */

/** Bet bounds in chips (mirrors the lab: Min 100, Max 10,000). */
export const PG_MIN_BET = 100;
export const PG_MAX_BET = 10_000;

/** Commission taken on a hand that wins BOTH comparisons (basis points: 5%). */
export const PG_COMMISSION_BP = 500;

/**
 * House edge (documentation only; chips math is integer). With the copy-to-dealer
 * rule and 5% commission on outright wins, and hands set close to the house way,
 * the game runs ~2.7% — the classic Pai Gow Poker figure. Roughly 41% of hands
 * push (win one / lose one).
 */
export const PG_HOUSE_EDGE_BP = 270;

export type PaiGowResult = 'win' | 'push' | 'loss';

const RANK_LABEL: Record<number, string> = {
  14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10',
  9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2',
};

/** Card index 0..51 → rank 2..14 (14 = Ace, high). */
export function pgRank(cardIdx: number): number {
  return (cardIdx % 13) + 2;
}

/** Card index 0..51 → suit 0..3. */
export function pgSuit(cardIdx: number): number {
  return Math.floor(cardIdx / 13);
}

/** Display label for a rank 2..14. */
export function pgRankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

/** Internal card view carrying its deck index alongside rank/suit. */
interface PGCard {
  idx: number;
  r: number;
  s: number;
}

function toCard(idx: number): PGCard {
  return { idx, r: pgRank(idx), s: pgSuit(idx) };
}

/**
 * Score a 5-card hand → [category, ...tiebreakers], comparable with cmpScore.
 * Faithful to the lab's score5():
 *   8 straight flush > 7 quads > 6 full house > 5 flush > 4 straight
 *   > 3 trips > 2 two pair > 1 pair > 0 high card.
 * (Standard 5-card ranking: here a flush DOES beat a straight, unlike the
 * 3-card game.) Ace high; the only Ace-low straight is the wheel A-2-3-4-5,
 * scored as 5-high so it is the lowest straight.
 */
function score5(cards: PGCard[]): number[] {
  const rs = cards.map((c) => c.r).sort((a, b) => b - a); // descending
  const flush = cards.every((c) => c.s === cards[0].s);
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

/** Score a 2-card low hand → [1, pairRank] for a pair, else [0, high, low]. */
function low2score(low: PGCard[]): number[] {
  const a = low[0].r;
  const b = low[1].r;
  return a === b ? [1, a] : [0, Math.max(a, b), Math.min(a, b)];
}

/** Compare two score arrays element-by-element: >0 a wins, <0 b wins, 0 tie. */
function cmpScore(a: number[], b: number[]): number {
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
      return `Four ${pgRankLabel(sc[1])}s`;
    case 6:
      return 'Full house';
    case 5:
      return 'Flush';
    case 4:
      return 'Straight';
    case 3:
      return `Three ${pgRankLabel(sc[1])}s`;
    case 2:
      return 'Two pair';
    case 1:
      return `Pair of ${pgRankLabel(sc[1])}s`;
    default:
      return `${pgRankLabel(sc[1])} high`;
  }
}

/** Human-readable name for a 2-card low hand (mirrors lowName). */
export function lowName(low: PGCard[] | number[]): string {
  const cards = (low as any[]).map((c) => (typeof c === 'number' ? toCard(c) : (c as PGCard)));
  const a = cards[0].r;
  const b = cards[1].r;
  return a === b
    ? `Pair of ${pgRankLabel(a)}s`
    : `${pgRankLabel(Math.max(a, b))}-${pgRankLabel(Math.min(a, b))} high`;
}

/** The 5-card high hand must strictly outrank the 2-card low hand. */
function isValidSplit(high: PGCard[], low: PGCard[]): boolean {
  return cmpScore(score5(high), low2score(low)) > 0;
}

/**
 * Simplified house way — the dealer always sets by this, and it is offered to
 * the player via the "House way" button. A faithful port of the lab's
 * houseWay(): given seven cards, return { low: 2 cards, high: 5 cards }.
 * Guaranteed never to foul (safety fallback keeps the top card high with the
 * 2nd/3rd highest in the low).
 */
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
        const sc = score5(hi);
        if (sc[0] === 4 || sc[0] === 5 || sc[0] === 8) {
          const ls = low2score(lw);
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
  if (!isValidSplit(res.high, res.low)) res = make([cs[1], cs[2]]); // safety — never foul
  return res;
}

/** Public house way over card indices → { low, high } as index arrays. */
export function houseWaySplit(cardIdxs: number[]): { low: number[]; high: number[] } {
  if (!Array.isArray(cardIdxs) || cardIdxs.length !== 7) {
    throw new Error('houseWaySplit requires exactly 7 cards');
  }
  const res = houseWayCards(cardIdxs.map(toCard));
  return { low: res.low.map((c) => c.idx), high: res.high.map((c) => c.idx) };
}

export interface PaiGowSplitValidation {
  ok: boolean;
  /** 2-card low hand as deck indices (empty on error). */
  low: number[];
  /** 5-card high hand as deck indices (empty on error). */
  high: number[];
  error: string | null;
}

/**
 * Validate a player's chosen split. `lowIdxs` must be exactly two of the seven
 * player card indices; the remaining five form the high hand. Rejects a foul
 * (low hand outranks the high hand).
 */
export function validateSplit(playerCardIdxs: number[], lowIdxs: unknown): PaiGowSplitValidation {
  if (!Array.isArray(playerCardIdxs) || playerCardIdxs.length !== 7) {
    return { ok: false, low: [], high: [], error: 'Invalid player hand.' };
  }
  if (!Array.isArray(lowIdxs) || lowIdxs.length !== 2) {
    return { ok: false, low: [], high: [], error: 'Select exactly 2 cards for the low hand.' };
  }
  const low: number[] = [];
  for (const raw of lowIdxs) {
    const idx = Math.floor(Number(raw));
    if (!Number.isInteger(idx) || !playerCardIdxs.includes(idx)) {
      return { ok: false, low: [], high: [], error: 'Low-hand cards must be from your dealt hand.' };
    }
    if (low.includes(idx)) {
      return { ok: false, low: [], high: [], error: 'Low-hand cards must be distinct.' };
    }
    low.push(idx);
  }
  const high = playerCardIdxs.filter((idx) => !low.includes(idx));
  const lowCards = low.map(toCard);
  const highCards = high.map(toCard);
  if (!isValidSplit(highCards, lowCards)) {
    return { ok: false, low: [], high: [], error: 'Fouled — your low hand outranks your 5-card high hand.' };
  }
  return { ok: true, low, high, error: null };
}

export interface PaiGowSettlement {
  result: PaiGowResult;
  /** Total gross chips to credit on settle (0 on a loss, bet on a push). */
  totalPayout: number;
  /** Net chips vs the bet (payout − bet). */
  net: number;
  /** Player won the high-hand comparison. */
  winHigh: boolean;
  /** Player won the low-hand comparison. */
  winLow: boolean;
  /** High hands tied (copy → dealer). */
  copyHigh: boolean;
  /** Low hands tied (copy → dealer). */
  copyLow: boolean;
  /** Player came out ahead. */
  won: boolean;
}

/**
 * Settle a hand. Faithful to the lab's settle():
 *   win BOTH  → gross = bet + floor(bet × 0.95)  (1:1 minus 5% commission),
 *   win ONE   → gross = bet  (push),
 *   lose BOTH → gross = 0.
 * Copies (exact ties on either comparison) go to the dealer.
 *
 * @param pHigh 5-card high hand (deck indices); @param pLow 2-card low hand.
 * @param dHigh dealer high; @param dLow dealer low. @param bet already debited.
 */
export function settlePaiGow(
  pHigh: number[],
  pLow: number[],
  dHigh: number[],
  dLow: number[],
  bet: number,
): PaiGowSettlement {
  const hCmp = cmpScore(score5(pHigh.map(toCard)), score5(dHigh.map(toCard)));
  const lCmp = cmpScore(low2score(pLow.map(toCard)), low2score(dLow.map(toCard)));
  const copyHigh = hCmp === 0;
  const copyLow = lCmp === 0;
  const winHigh = hCmp > 0;
  const winLow = lCmp > 0;
  const wins = (winHigh ? 1 : 0) + (winLow ? 1 : 0);

  let totalPayout: number;
  let result: PaiGowResult;
  if (wins === 2) {
    const commission = Math.floor((bet * PG_COMMISSION_BP) / 10_000);
    totalPayout = bet + (bet - commission); // stake back + winnings net of commission
    result = 'win';
  } else if (wins === 1) {
    totalPayout = bet; // push — stake returned
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

export interface PaiGowBetValidation {
  ok: boolean;
  bet: number;
  error: string | null;
}

/** Validate the /deal payload: bet required and within [MIN, MAX]. */
export function validateBet(rawBet: unknown): PaiGowBetValidation {
  const bet = Math.floor(Number(rawBet));
  if (!Number.isFinite(bet) || bet < PG_MIN_BET || bet > PG_MAX_BET) {
    return { ok: false, bet: 0, error: `Bet must be between ${PG_MIN_BET} and ${PG_MAX_BET} chips.` };
  }
  return { ok: true, bet, error: null };
}

/** Convenience: 5-card high-hand name from deck indices. */
export function highHandName(cardIdxs: number[]): string {
  return handName(score5(cardIdxs.map(toCard)));
}
