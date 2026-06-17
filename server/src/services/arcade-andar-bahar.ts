/**
 * arcade-andar-bahar.ts — MORBIUS Arcade: Andar Bahar math.
 *
 * Andar Bahar is a pure-chance Indian card game with no decisions after the bet
 * — the whole round is fixed once the deck is shuffled, which makes it perfect
 * for one-shot provably-fair settlement (like Baccarat / Dice x2).
 *
 * Card encoding matches the shared deck (provably-fair.service.ts
 * fisherYatesShuffle): idx = 0..51. Only the RANK matters for the match, so we
 * use rank0 = idx % 13 (0..12). Suit = floor(idx / 13) is carried through for
 * display only.
 *
 * Deal:
 *   • joker     = deck[0]; jokerRank0 = deck[0] % 13.
 *   • deck[1], deck[2], … are dealt alternately to ANDAR (first) then BAHAR
 *     until a dealt card's rank0 === jokerRank0. The pile that received the
 *     matching card wins.
 *
 * Payout multipliers are stored ×100 — the *gross* return on a win (bet was
 * already debited). Andar is dealt first (higher win chance) so it pays 0.9:1
 * → AB_PAY_ANDAR = 190 (1.90× total). Bahar pays 1:1 → AB_PAY_BAHAR = 200
 * (2.00× total). The small asymmetry is the house edge — these numbers match
 * the approved prototype (public/andar-bahar-lab.html: PAY = {andar:0.9, bahar:1.0},
 * payout = floor(bet * (1 + PAY[winner]))).
 */

/** Min and max chips per bet. Mirrors the prototype's Min 100 / Max 50,000. */
export const AB_MIN_BET = 100;
export const AB_MAX_BET = 50_000;

// Multipliers ×100 paid on a winning bet (gross — bet was already debited).
export const AB_PAY_ANDAR = 190; // 0.9:1 → 1.90× total return (dealt first)
export const AB_PAY_BAHAR = 200; // 1:1   → 2.00× total return

// House edge in basis points. Documentation only — chips math is integer.
// Andar is dealt first so wins ~50.9% of finished rounds; paying 0.9:1 there
// and 1:1 on Bahar leaves the house a small consistent edge on both sides.
export const AB_HOUSE_EDGE_BP = 350; // ~3.5%

export type AndarBaharSide = 'andar' | 'bahar';

export interface AndarBaharResult {
  /** Joker card index 0..51 (deck[0]). */
  joker: number;
  /** Cards dealt to Andar / Bahar, in deal order (card indices 0..51). */
  andarCards: number[];
  baharCards: number[];
  /** Side that received the matching card. */
  winningSide: AndarBaharSide;
  /** 0-based alternating deal position of the match (0 = first Andar card). */
  matchIndex: number;
  /** Whether the player's bet side won. */
  won: boolean;
  /** Gross payout in chips (includes stake on a win, 0 on a loss). */
  payout: number;
}

export interface AndarBaharValidation {
  ok: boolean;
  error: string | null;
}

/** rank0 (0..12) of a card index — A..K collapsed; only rank decides the match. */
export function abRank0(cardIdx: number): number {
  return cardIdx % 13;
}

/** Multiplier ×100 paid on a winning bet for the given side. */
export function abPayMultiplierX100(side: AndarBaharSide): number {
  return side === 'andar' ? AB_PAY_ANDAR : AB_PAY_BAHAR;
}

/**
 * Validate a play request: a recognised side and a bet within bounds.
 */
export function validateAndarBahar(side: unknown, bet: unknown): AndarBaharValidation {
  if (side !== 'andar' && side !== 'bahar') {
    return { ok: false, error: 'Pick Andar or Bahar.' };
  }
  if (!Number.isInteger(bet) || (bet as number) < AB_MIN_BET || (bet as number) > AB_MAX_BET) {
    return { ok: false, error: `Bet must be between ${AB_MIN_BET} and ${AB_MAX_BET} chips.` };
  }
  return { ok: true, error: null };
}

/**
 * Resolve an Andar Bahar round from a pre-shuffled deck.
 *
 * @param deck  52 card indices 0..51 (output of fisherYatesShuffle).
 * @param side  the side the player bet on.
 * @param bet   stake in chips (already validated).
 *
 * Deterministic: same deck + side + bet always yields the same result, so the
 * round re-derives exactly in /verify.
 */
export function resolveAndarBahar(
  deck: number[],
  side: AndarBaharSide,
  bet: number,
): AndarBaharResult {
  if (!Array.isArray(deck) || deck.length < 52) {
    throw new Error('Deck too small');
  }

  const joker = deck[0]!;
  const jokerRank0 = abRank0(joker);

  const andarCards: number[] = [];
  const baharCards: number[] = [];
  let winningSide: AndarBaharSide | null = null;
  let matchIndex = -1;

  // pos counts alternating deal positions: 0 → Andar, 1 → Bahar, 2 → Andar, …
  let pos = 0;
  for (let i = 1; i < deck.length; i++) {
    const card = deck[i]!;
    const toAndar = pos % 2 === 0;
    (toAndar ? andarCards : baharCards).push(card);
    if (abRank0(card) === jokerRank0) {
      winningSide = toAndar ? 'andar' : 'bahar';
      matchIndex = pos;
      break;
    }
    pos += 1;
  }

  // A standard 52-card deck always contains the other three cards of the joker's
  // rank, so a match is guaranteed within 51 deals. This guard is belt-and-suspenders.
  if (winningSide === null) {
    throw new Error('No rank match found in deck');
  }

  const won = side === winningSide;
  const payout = won ? Math.floor((bet * abPayMultiplierX100(winningSide)) / 100) : 0;

  return { joker, andarCards, baharCards, winningSide, matchIndex, won, payout };
}
