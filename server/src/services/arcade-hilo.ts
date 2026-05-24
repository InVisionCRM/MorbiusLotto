/**
 * arcade-hilo.ts — MORBIUS Arcade: Hi-Lo (provably-fair card game).
 *
 * Stake-style Higher-or-Lower. A round starts with a single base card. On each
 * pick the player chooses "same or higher" (hi) or "strictly lower" (lo) for
 * the next card. A correct pick advances the multiplier; an incorrect pick
 * busts the round and forfeits the bet. The player may cash out after any
 * successful pick.
 *
 * Math (with ranks 1..13, A=1, K=13):
 *   P(hi | current = c) = (14 - c) / 13         (same-or-higher wins ties)
 *   P(lo | current = c) = (c - 1) / 13          (strictly lower)
 *   P(hi) + P(lo)        = 1                    (no degenerate overlap)
 *
 *   multiplier_factor = (1 - houseEdge) / P
 *   compound multiplier = product of factors over all correct picks
 *
 * Multipliers are stored × 100 as integers (so 1.07× ↔ 107) — the wallet path
 * never compares floats. Each step is computed as
 *   new_x100 = floor(old_x100 × 13 × (10_000 - houseEdgeBp) / (10_000 × denom))
 * which floors *toward the house* a fraction of a chip per step. That's the
 * same rounding convention as `arcade-mines.minesPayout` — the published
 * multiplier is always honored as a minimum in chips on cash-out.
 *
 * Cards are derived from the platform's HMAC byte stream — same primitive as
 * the poker shuffle and the lottery 6-of-55 draw, so the public verifier can
 * recompute every card with WebCrypto. Card index 0..51 maps to rank
 * (idx % 13) + 1 and suit floor(idx / 13).
 */

/** House edge, in basis points (1 bp = 0.01%). 100 = 1%. */
export const HILO_HOUSE_EDGE_BP = 100;

export const HILO_MIN_BET = 10;
export const HILO_MAX_BET = 2000;

/**
 * Hard cap on picks per round. After this many correct picks the player must
 * cash out — keeps house exposure bounded and prevents one-round-forever play.
 */
export const HILO_MAX_PICKS = 11;

/** Total cards in a standard deck — kept here for re-use & clarity. */
export const HILO_DECK_SIZE = 52;

export type HiLoDirection = 'hi' | 'lo';

/**
 * Derive the rank (1..13) and full card index (0..51) for the Nth card in the
 * round, where N=0 is the base card and N=1+ are picks. Uses a 4-byte slice of
 * the HMAC stream at cursor = N * 4, then `float × 52 → floor` — the same
 * unbiased mapping the lottery and Mines code uses.
 *
 * The float-then-floor introduces a single-ULP bias that is negligible at 52
 * outcomes (well under one count over 2^32 samples). Symmetric across all
 * ranks, so no rank is meaningfully more or less likely than 1/13.
 */
export function deriveHiLoCard(
  hmacByteStream: (cursor: number) => Buffer | Uint8Array,
  bytesToFloat: (bytes: Buffer | Uint8Array) => number,
  cardIndex: number,
): { rank: number; suit: number; index: number } {
  if (!Number.isInteger(cardIndex) || cardIndex < 0) {
    throw new Error('Hi-Lo cardIndex must be a non-negative integer');
  }
  const bytes = hmacByteStream(cardIndex * 4);
  const float = bytesToFloat(bytes);
  const index = Math.min(HILO_DECK_SIZE - 1, Math.floor(float * HILO_DECK_SIZE));
  return { rank: (index % 13) + 1, suit: Math.floor(index / 13), index };
}

/**
 * True iff `direction` is a winning pick against `prev → next` ranks.
 *   hi = "same or higher": wins on next.rank >= prev.rank
 *   lo = "strictly lower": wins on next.rank <  prev.rank
 * These two predicates partition the 13-rank outcome space without overlap.
 */
export function isHiLoWin(direction: HiLoDirection, prevRank: number, nextRank: number): boolean {
  if (direction === 'hi') return nextRank >= prevRank;
  return nextRank < prevRank;
}

/**
 * Win probability denominator (count of ranks out of 13 that win this pick).
 * Returns 0 when the pick is impossible (hi from… nothing — and lo from Ace).
 */
export function hiLoWinDenominator(direction: HiLoDirection, prevRank: number): number {
  if (!Number.isInteger(prevRank) || prevRank < 1 || prevRank > 13) {
    throw new Error('Hi-Lo prevRank must be in 1..13');
  }
  return direction === 'hi' ? 14 - prevRank : prevRank - 1;
}

/**
 * Advance the round multiplier (× 100) after a correct pick. Floors the result
 * toward the house — see file comment for the rounding contract.
 */
export function advanceHiLoMultiplier(
  currentX100: number,
  direction: HiLoDirection,
  prevRank: number,
): number {
  if (!Number.isInteger(currentX100) || currentX100 < 100) {
    throw new Error('Hi-Lo currentX100 must be >= 100');
  }
  const denom = hiLoWinDenominator(direction, prevRank);
  if (denom <= 0) {
    throw new Error('Hi-Lo pick is impossible (denominator is 0)');
  }
  const houseNum = 10_000 - HILO_HOUSE_EDGE_BP;
  return Math.max(
    100,
    Math.floor((currentX100 * 13 * houseNum) / (10_000 * denom)),
  );
}

/**
 * Payout in chips for a cash-out at the current multiplier.
 * bet × multiplier_x100 / 100 — floored. Matches the verifier's arithmetic.
 */
export function hiLoPayout(bet: number, multiplierX100: number): number {
  if (!Number.isInteger(bet) || bet < HILO_MIN_BET || bet > HILO_MAX_BET) {
    throw new Error('Hi-Lo bet out of range');
  }
  if (!Number.isInteger(multiplierX100) || multiplierX100 < 100) {
    throw new Error('Hi-Lo multiplier out of range');
  }
  return Math.floor((bet * multiplierX100) / 100);
}
