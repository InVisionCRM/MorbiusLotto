/**
 * arcade-baccarat.ts — MORBIUS Arcade: Baccarat (Punto Banco) math.
 *
 * Standard punto banco rules with no player decisions after the deal — the
 * entire hand is fixed once the deck is shuffled. That makes it perfect for
 * one-shot provably-fair settlement (like Dice / Limbo), even though it deals
 * cards like Video Poker.
 *
 * Card encoding matches the shared deck used by Video Poker and Blackjack:
 *   idx = 0..51, rank = (idx % 13) + 2 (so 2..14, where 14 = Ace),
 *   suit = floor(idx / 13).
 *
 * Card value table:
 *   • A     → 1
 *   • 2..9  → face value
 *   • 10,J,Q,K → 0
 * Hand value = (sum of card values) mod 10.
 *
 * Drawing rules:
 *   • Natural: if either initial 2-card total is 8 or 9, both stand.
 *   • Player: stand on 6/7, draw on 0..5.
 *   • Banker (player stood): stand on 6/7, draw on 0..5.
 *   • Banker (player drew a 3rd): depends on banker total + player's 3rd-card
 *     value (the classic punto-banco third-card table).
 *
 * Payout multipliers are stored ×100. They're the *gross* return on a win —
 * BACC_PAY_PLAYER = 200 means a winning Player bet pays 2× the wager (i.e.
 * stake back + equal winnings). BACC_PUSH = 100 means stake returned, no
 * win/loss — used for Player/Banker bets when the hand ties.
 */
import { betLimits, DEFAULT_BET_LIMITS } from '../lib/game-limits';

/** Min and max chips per individual bet zone. */
export const BACC_MIN_BET = DEFAULT_BET_LIMITS.baccarat.min;
export const BACC_MAX_BET = DEFAULT_BET_LIMITS.baccarat.max;

// Multipliers ×100 paid on a winning bet (gross — bet was already debited).
export const BACC_PAY_PLAYER = 200; // 1:1 even money → 2.00× total return
export const BACC_PAY_BANKER = 195; // 0.95:1 (5% commission) → 1.95× total
export const BACC_PAY_TIE = 900; // 8:1 → 9.00× total
export const BACC_PAY_PAIR = 1200; // 11:1 → 12.00× total
// Push on Player/Banker main bets when the hand ties.
export const BACC_PUSH = 100; // 1.00× total (stake returned)

// House edges in basis points. Documentation only — chips math is integer.
export const BACC_HOUSE_EDGE_PLAYER_BP = 124; // ~1.24%
export const BACC_HOUSE_EDGE_BANKER_BP = 106; // ~1.06%
export const BACC_HOUSE_EDGE_TIE_BP = 1436; // ~14.36%
export const BACC_HOUSE_EDGE_PAIR_BP = 1036; // ~10.36%

export type BaccaratResult = 'player' | 'banker' | 'tie';

export type BaccaratBetKey = 'player' | 'banker' | 'tie' | 'playerPair' | 'bankerPair';

export interface BaccaratBets {
  player: number;
  banker: number;
  tie: number;
  playerPair: number;
  bankerPair: number;
}

export interface BaccaratHand {
  playerCards: number[]; // card indices 0..51, in deal order
  bankerCards: number[];
  playerTotal: number; // 0..9
  bankerTotal: number; // 0..9
  result: BaccaratResult;
  playerPair: boolean;
  bankerPair: boolean;
}

const BET_KEYS: BaccaratBetKey[] = ['player', 'banker', 'tie', 'playerPair', 'bankerPair'];

/**
 * Baccarat value of a single card.
 * Cards use the shared 0..51 encoding from provably-fair.service.ts
 * (rank = (idx % 13) + 2; 2..9 are face value, 10..13 are 0, 14 is Ace = 1).
 */
export function baccaratCardValue(cardIdx: number): number {
  const rank = (cardIdx % 13) + 2;
  if (rank === 14) return 1; // Ace
  if (rank >= 10) return 0; // 10, J, Q, K
  return rank; // 2..9
}

/** Rank in 2..14 (matches RANK_LABEL in the shared card encoding). */
function rankOf(cardIdx: number): number {
  return (cardIdx % 13) + 2;
}

/** Hand total: sum of card values mod 10. */
function totalOf(cards: number[]): number {
  let s = 0;
  for (const c of cards) s += baccaratCardValue(c);
  return s % 10;
}

export interface BaccaratValidation {
  ok: boolean;
  total: number;
  error: string | null;
}

/**
 * Validate the bets payload. Returns the total wager on success and an error
 * string on failure.
 *
 * Rules:
 *   • Each zone is a non-negative integer.
 *   • A zone is either 0 (skipped) or within [betLimits('baccarat').min, betLimits('baccarat').max].
 *   • At least one zone must have a positive wager.
 */
export function validateBets(bets: BaccaratBets): BaccaratValidation {
  let total = 0;
  for (const k of BET_KEYS) {
    const v = bets[k];
    if (!Number.isInteger(v) || v < 0) {
      return { ok: false, total: 0, error: `Invalid bet on ${k}.` };
    }
    if (v > 0 && v < betLimits('baccarat').min) {
      return { ok: false, total: 0, error: `Min bet per zone is ${betLimits('baccarat').min} chips.` };
    }
    if (v > betLimits('baccarat').max) {
      return { ok: false, total: 0, error: `Max bet per zone is ${betLimits('baccarat').max} chips.` };
    }
    total += v;
  }
  if (total === 0) return { ok: false, total: 0, error: 'Place at least one bet.' };
  return { ok: true, total, error: null };
}

/**
 * Standard punto-banco banker third-card rule. Called only when player drew a
 * 3rd card AND banker's initial total is in 0..7 (the no-natural range).
 *
 *   B 0..2  → always draws
 *   B 3     → draws unless player's 3rd-card value = 8
 *   B 4     → draws if player's 3rd in 2..7
 *   B 5     → draws if player's 3rd in 4..7
 *   B 6     → draws if player's 3rd in 6..7
 *   B 7     → always stands
 */
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
 * Deal a baccarat hand from a pre-shuffled deck and resolve it.
 *
 * Deal order is canonical (P1, B1, P2, B2, P3?, B3?). In real-table baccarat
 * the dealer alternates and the cards-from-shoe order is the same; collapsing
 * to a single index sequence is just a convention so the deck is the only
 * thing that needs to be committed for verification.
 */
export function dealBaccarat(deck: number[]): BaccaratHand {
  if (!Array.isArray(deck) || deck.length < 6) throw new Error('Deck too small');
  const p: number[] = [deck[0]!, deck[2]!];
  const b: number[] = [deck[1]!, deck[3]!];

  const p0 = totalOf(p);
  const b0 = totalOf(b);

  // Natural on either side → both stand.
  if (p0 >= 8 || b0 >= 8) {
    return finalize(p, b);
  }

  // Player rule: stand on 6/7, draw on 0..5.
  let playerThirdValue: number | null = null;
  if (p0 <= 5) {
    p.push(deck[4]!);
    playerThirdValue = baccaratCardValue(deck[4]!);
  }

  // Banker rule.
  if (playerThirdValue === null) {
    // Player stood — banker mirrors the standard "stand on 6/7" rule. We pull
    // banker's potential 3rd card from deck[4] because the player didn't
    // consume it (deck[5] is reserved for the case where the player drew).
    if (b0 <= 5) b.push(deck[4]!);
  } else if (bankerDrawsOnPlayerThird(b0, playerThirdValue)) {
    b.push(deck[5]!);
  }

  return finalize(p, b);
}

function finalize(p: number[], b: number[]): BaccaratHand {
  const pTot = totalOf(p);
  const bTot = totalOf(b);
  const result: BaccaratResult = pTot > bTot ? 'player' : bTot > pTot ? 'banker' : 'tie';
  return {
    playerCards: p,
    bankerCards: b,
    playerTotal: pTot,
    bankerTotal: bTot,
    result,
    playerPair: rankOf(p[0]!) === rankOf(p[1]!),
    bankerPair: rankOf(b[0]!) === rankOf(b[1]!),
  };
}

/**
 * Resolve per-zone payouts for a dealt hand.
 *
 * Payouts are *gross* — they include the stake on a win. On a loss the zone
 * pays 0 (the original stake was already debited). On a tie, PLAYER and
 * BANKER main bets push (stake returned, 1× total), TIE wins big.
 */
export function resolvePayouts(bets: BaccaratBets, hand: BaccaratHand): BaccaratBets {
  const out: BaccaratBets = { player: 0, banker: 0, tie: 0, playerPair: 0, bankerPair: 0 };

  if (hand.result === 'player') {
    if (bets.player > 0) out.player = Math.floor((bets.player * BACC_PAY_PLAYER) / 100);
  } else if (hand.result === 'banker') {
    if (bets.banker > 0) out.banker = Math.floor((bets.banker * BACC_PAY_BANKER) / 100);
  } else {
    if (bets.player > 0) out.player = Math.floor((bets.player * BACC_PUSH) / 100);
    if (bets.banker > 0) out.banker = Math.floor((bets.banker * BACC_PUSH) / 100);
    if (bets.tie > 0) out.tie = Math.floor((bets.tie * BACC_PAY_TIE) / 100);
  }

  if (bets.playerPair > 0 && hand.playerPair) {
    out.playerPair = Math.floor((bets.playerPair * BACC_PAY_PAIR) / 100);
  }
  if (bets.bankerPair > 0 && hand.bankerPair) {
    out.bankerPair = Math.floor((bets.bankerPair * BACC_PAY_PAIR) / 100);
  }

  return out;
}

/** Sum of all bet zones. */
export function sumBets(bets: BaccaratBets): number {
  return bets.player + bets.banker + bets.tie + bets.playerPair + bets.bankerPair;
}

/** Sum of all payout zones. */
export function sumPayouts(payouts: BaccaratBets): number {
  return payouts.player + payouts.banker + payouts.tie + payouts.playerPair + payouts.bankerPair;
}
