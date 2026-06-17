/**
 * arcade-three-card-poker.ts — MORBIUS Arcade: Three Card Poker math.
 *
 * Player vs dealer with a single play/fold decision plus an optional Pair Plus
 * side bet. A faithful port of public/three-card-poker-lab.html — same
 * evaluator, dealer-qualify rule and paytables.
 *
 * Card encoding matches the shared deck (provably-fair.service.ts
 * fisherYatesShuffle → indices 0..51):
 *   rank = (idx % 13) + 2  (2..14, where 14 = Ace — Ace is HIGH here),
 *   suit = floor(idx / 13).
 * The player gets deck[0,1,2]; the dealer gets deck[3,4,5].
 *
 * 3-card hand ranking (note: a STRAIGHT BEATS A FLUSH with only three cards):
 *   straight flush > three of a kind > straight > flush > pair > high card.
 * Ace is high: A-K-Q is the top straight; A-2-3 is the lowest (the "wheel").
 *
 * Money math is integer chips. *_payout values are GROSS returns (the matching
 * stake is included) — the stakes were already debited at /deal (+/play at the
 * play decision), so a settle just credits these gross buckets.
 */

/** Bet bounds in chips (mirrors the lab: Min 100, Max 50,000 on the Ante). */
export const TCP_MIN_BET = 100;
export const TCP_MAX_BET = 50_000;

/**
 * Pair Plus paytable — multiplier on the Pair Plus stake by 3-card category.
 * Returns are NET odds (e.g. 40 = 40:1), matching the lab's PP_PAY.
 *   straight flush 40:1, three of a kind 30:1, straight 6:1, flush 3:1, pair 1:1.
 */
export const TCP_PAIR_PLUS_PAY: Record<number, number> = {
  5: 40, // straight flush
  4: 30, // three of a kind
  3: 6, // straight
  2: 3, // flush
  1: 1, // pair
};

/**
 * Ante bonus paytable — paid on the Ante for premium hands regardless of the
 * dealer (the lab's ANTE_BONUS). NET odds.
 *   straight flush 5:1, three of a kind 4:1, straight 1:1.
 */
export const TCP_ANTE_BONUS: Record<number, number> = {
  5: 5, // straight flush
  4: 4, // three of a kind
  3: 1, // straight
};

/**
 * House edge (documentation only; chips math is integer). With these standard
 * paytables, the Ante/Play game runs ~3.37% on the Ante (~2.0% per total
 * wagered with optimal Q-6-4 play strategy) and the Pair Plus side bet
 * ~7.28% — the classic Three Card Poker figures.
 */
export const TCP_HOUSE_EDGE_ANTE_BP = 337;
export const TCP_HOUSE_EDGE_PAIR_PLUS_BP = 728;

export type ThreeCardResult =
  | 'play_win'
  | 'play_loss'
  | 'push'
  | 'dealer_no_qualify'
  | 'fold';

export interface Hand3Eval {
  /** 5=straight flush, 4=trips, 3=straight, 2=flush, 1=pair, 0=high card. */
  cat: number;
  /** Tiebreak ranks, most significant first. */
  tie: number[];
  /** All three ranks, descending (for hand naming + high-card compare). */
  ranks: number[];
}

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

/** Card index 0..51 → rank 2..14 (14 = Ace, high). */
export function tcpRank(cardIdx: number): number {
  return (cardIdx % 13) + 2;
}

/** Card index 0..51 → suit 0..3. */
export function tcpSuit(cardIdx: number): number {
  return Math.floor(cardIdx / 13);
}

/** Display label for a rank 2..14. */
export function tcpRankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

/**
 * Evaluate a 3-card hand. Faithful to the lab's evaluate3():
 *   straight flush (5) > trips (4) > straight (3) > flush (2) > pair (1) > high (0).
 * Ace high; the only Ace-low straight is the wheel A-2-3 (ranks 14,3,2),
 * scored as a 3-high straight so it's the lowest straight.
 */
export function evaluate3(cards: number[]): Hand3Eval {
  if (!Array.isArray(cards) || cards.length !== 3) {
    throw new Error('evaluate3 requires exactly 3 cards');
  }
  const ranks = cards.map(tcpRank).sort((a, b) => b - a); // descending
  const suits = cards.map(tcpSuit);
  const suited = suits[0] === suits[1] && suits[1] === suits[2];

  const asc = ranks.slice().sort((a, b) => a - b); // ascending
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
  const wheel = asc[0] === 2 && asc[1] === 3 && asc[2] === 14; // A-2-3
  const isStraight = straightNorm || wheel;
  const straightHigh = wheel ? 3 : asc[2];

  let cat: number;
  let tie: number[];
  if (isStraight && suited) {
    cat = 5;
    tie = [straightHigh];
  } else if (isTrips) {
    cat = 4;
    tie = [ranks[0]];
  } else if (isStraight) {
    cat = 3;
    tie = [straightHigh];
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

/** Human-readable hand name (mirrors handName3 in the lab). */
export function handName3(e: Hand3Eval): string {
  if (e.cat === 5) return 'Straight flush';
  if (e.cat === 4) return `Three ${tcpRankLabel(e.tie[0])}s`;
  if (e.cat === 3) return 'Straight';
  if (e.cat === 2) return 'Flush';
  if (e.cat === 1) return `Pair of ${tcpRankLabel(e.tie[0])}s`;
  return `${tcpRankLabel(e.ranks[0])} high`;
}

/**
 * Compare two 3-card hands: > 0 if a wins, < 0 if b wins, 0 on a tie. Category
 * first, then tiebreak ranks most-significant-first (mirrors cmpEval).
 */
export function compare3(a: Hand3Eval, b: Hand3Eval): number {
  if (a.cat !== b.cat) return a.cat - b.cat;
  const len = Math.max(a.tie.length, b.tie.length);
  for (let i = 0; i < len; i++) {
    const x = a.tie[i] ?? 0;
    const y = b.tie[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/**
 * Dealer qualifies on Queen-high or better — i.e. any made hand (cat >= 1) OR a
 * high-card hand whose top card is at least a Queen (12). Mirrors qualifies().
 */
export function dealerQualifies(e: Hand3Eval): boolean {
  return e.cat >= 1 || e.ranks[0] >= 12;
}

export interface ThreeCardSettlement {
  result: ThreeCardResult;
  /** Gross chips returned on the Ante bucket (Ante stake + Play stake + bonuses). */
  antePayout: number;
  /** Gross chips returned on the Pair Plus bucket (stake + winnings). */
  pairPlusPayout: number;
  /** Total gross chips to credit on settle. */
  totalPayout: number;
  /** Player came out ahead (net positive over everything committed). */
  won: boolean;
  /** Which winning side (for the felt highlight): 'player' | 'dealer' | null. */
  winSide: 'player' | 'dealer' | null;
}

/**
 * Settle a hand. Faithful to the lab's settle():
 *
 *  Pair Plus (only when the player PLAYS; folding forfeits it — the lab loses
 *  PP on fold): pays TCP_PAIR_PLUS_PAY[cat] : 1 on the player's own hand,
 *  win or lose vs the dealer. Gross = stake + stake * mult.
 *
 *  Ante bonus (only on a play): TCP_ANTE_BONUS[cat] : 1 on the Ante for
 *  straight+, regardless of the dealer. Added to the Ante bucket.
 *
 *  Main Ante/Play resolution on a PLAY:
 *   • dealer doesn't qualify → Ante pays 1:1 (gross 2× ante) + Play pushes
 *     (gross 1× play). result = 'dealer_no_qualify'.
 *   • dealer qualifies, player hand higher → Ante 1:1 + Play 1:1 (gross 2×
 *     each). result = 'play_win'.
 *   • tie → Ante + Play both push (gross 1× each). result = 'push'.
 *   • dealer higher → Ante + Play lost. result = 'play_loss'.
 *
 *  FOLD: forfeit the Ante; Pair Plus also forfeited (lab behaviour).
 *  result = 'fold'.
 *
 * @param ante      Ante stake (chips), already debited.
 * @param pairPlus  Pair Plus stake (chips, 0 if off), already debited.
 * @param played    true = player chose Play (Play stake = ante, already
 *                  debited); false = folded.
 */
export function settleThreeCard(
  playerEval: Hand3Eval,
  dealerEval: Hand3Eval,
  ante: number,
  pairPlus: number,
  played: boolean,
): ThreeCardSettlement {
  // FOLD — forfeit everything committed (Ante + Pair Plus).
  if (!played) {
    return {
      result: 'fold',
      antePayout: 0,
      pairPlusPayout: 0,
      totalPayout: 0,
      won: false,
      winSide: 'dealer',
    };
  }

  const play = ante; // Play bet equals the Ante.

  // Pair Plus — independent of the dealer.
  let pairPlusPayout = 0;
  if (pairPlus > 0) {
    const ppMult = TCP_PAIR_PLUS_PAY[playerEval.cat];
    if (ppMult) pairPlusPayout = pairPlus + pairPlus * ppMult; // gross
  }

  // Ante bonus — premium hands, regardless of the dealer.
  let antePayout = 0;
  const bonusMult = TCP_ANTE_BONUS[playerEval.cat];
  if (bonusMult) antePayout += ante * bonusMult; // bonus only (net winnings)

  const q = dealerQualifies(dealerEval);
  const cmp = compare3(playerEval, dealerEval);

  let result: ThreeCardResult;
  let winSide: 'player' | 'dealer' | null;
  if (!q) {
    // Ante pays 1:1 (gross 2× ante); Play pushes (gross 1× play).
    antePayout += ante * 2 + play;
    result = 'dealer_no_qualify';
    winSide = 'player';
  } else if (cmp > 0) {
    // Player wins both bets even money (gross 2× each).
    antePayout += ante * 2 + play * 2;
    result = 'play_win';
    winSide = 'player';
  } else if (cmp === 0) {
    // Push — both stakes returned (gross 1× each).
    antePayout += ante + play;
    result = 'push';
    winSide = null;
  } else {
    // Dealer wins — Ante + Play lost (only the ante bonus, if any, survives).
    result = 'play_loss';
    winSide = 'dealer';
  }

  const committed = ante + play + pairPlus;
  const totalPayout = antePayout + pairPlusPayout;
  return {
    result,
    antePayout,
    pairPlusPayout,
    totalPayout,
    won: totalPayout > committed,
    winSide,
  };
}

export interface ThreeCardValidation {
  ok: boolean;
  ante: number;
  pairPlus: number;
  error: string | null;
}

/**
 * Validate the deal payload. Ante is required and within [MIN, MAX]; Pair Plus
 * is optional but, when present, equals the Ante (the lab's "= ante" side bet).
 */
export function validateDeal(rawAnte: unknown, rawPairPlus: unknown): ThreeCardValidation {
  const ante = Math.floor(Number(rawAnte));
  if (!Number.isFinite(ante) || ante < TCP_MIN_BET || ante > TCP_MAX_BET) {
    return {
      ok: false,
      ante: 0,
      pairPlus: 0,
      error: `Ante must be between ${TCP_MIN_BET} and ${TCP_MAX_BET} chips.`,
    };
  }
  // Pair Plus is a toggle in the lab; accept a boolean flag or a numeric stake.
  let pairPlus = 0;
  if (typeof rawPairPlus === 'boolean') {
    pairPlus = rawPairPlus ? ante : 0;
  } else if (rawPairPlus != null && rawPairPlus !== '') {
    const pp = Math.floor(Number(rawPairPlus));
    if (!Number.isFinite(pp) || pp < 0) {
      return { ok: false, ante: 0, pairPlus: 0, error: 'Invalid Pair Plus bet.' };
    }
    // The Pair Plus side bet equals the Ante (matches the lab); any positive
    // value turns it on at the Ante amount.
    pairPlus = pp > 0 ? ante : 0;
  }
  return { ok: true, ante, pairPlus, error: null };
}
