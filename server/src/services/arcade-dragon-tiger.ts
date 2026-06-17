/**
 * arcade-dragon-tiger.ts — MORBIUS Arcade: Dragon Tiger math.
 *
 * The fastest card game: one card to Dragon, one to Tiger, the higher rank
 * wins. There are no decisions after the deal — the whole round is fixed once
 * the deck is shuffled — which makes it a perfect one-shot provably-fair game
 * (settled entirely at /play, like Baccarat / Dice x2).
 *
 * Card encoding matches the shared 52-card deck from provably-fair.service.ts
 * (fisherYatesShuffle → indices 0..51):
 *   suit  = floor(idx / 13)              (0..3)
 *   rank0 = idx % 13                     (0 = Ace .. 12 = King)
 *
 * ⚠ ACE IS LOW. We compare `rank0` directly: 0 (Ace) is the weakest card and 12
 * (King) is the strongest. Suits never matter. Higher rank0 wins; equal = tie.
 *
 * Payout multipliers are stored ×100. They're the *gross* return on a win — the
 * stake is included (the bet was already debited):
 *   • Dragon / Tiger win → 200  (1:1 even money → 2.00× total return)
 *   • Tie win            → 1200 (11:1 → 12.00× total return)
 *   • On a TIE outcome, Dragon & Tiger bets return HALF the stake → 50 (0.50×).
 * Mirrors the dragon-tiger-lab.html prototype exactly:
 *   payout = bet*2 (win), bet*12 (tie bet wins), floor(bet*0.5) (D/T on a tie).
 *
 * All money math is integer ×100 — no floats on the decision or money path.
 */

/** Min and max chips per individual bet zone. Mirrors the lab (Min 100 / Max 50,000). */
export const DT_MIN_BET = 100;
export const DT_MAX_BET = 50_000;

// Multipliers ×100 paid on a winning bet (gross — bet was already debited).
export const DT_PAY_SIDE = 200; // Dragon / Tiger even money → 2.00× total return
export const DT_PAY_TIE = 1200; // Tie 11:1 → 12.00× total return
// On a tie outcome, Dragon/Tiger bets return half the stake.
export const DT_TIE_REFUND = 50; // 0.50× total (half stake back)

// House edges in basis points. Documentation only — chips math is integer.
// Single-deck Dragon Tiger with the standard "lose half on tie" rule:
//   P(tie) = 3/51 ≈ 5.88%, each side wins ≈ 47.06%.
//   Dragon/Tiger: EV = .4706 − .4706 − .5×.0588 → edge ≈ 2.94%.
//   Tie (11:1):   EV = 11×.0588 − .9412      → edge ≈ 29.41%.
export const DT_HOUSE_EDGE_SIDE_BP = 294; // ~2.94%
export const DT_HOUSE_EDGE_TIE_BP = 2941; // ~29.41%

export type DragonTigerResult = 'dragon' | 'tiger' | 'tie';

export type DragonTigerBetKey = 'dragon' | 'tiger' | 'tie';

export interface DragonTigerBets {
  dragon: number;
  tiger: number;
  tie: number;
}

export interface DragonTigerRound {
  dragonCard: number; // deck index 0..51
  tigerCard: number; // deck index 0..51
  dragonRank: number; // 0 = Ace (low) .. 12 = King
  tigerRank: number;
  result: DragonTigerResult;
}

const BET_KEYS: DragonTigerBetKey[] = ['dragon', 'tiger', 'tie'];

/**
 * Ace-low rank of a single card index. Cards use the shared 0..51 encoding
 * (rank0 = idx % 13, where 0 = Ace, 1 = Two, …, 12 = King). Higher wins.
 */
export function dragonTigerRank(cardIdx: number): number {
  return ((cardIdx % 13) + 13) % 13;
}

export interface DragonTigerValidation {
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
 *   • A zone is either 0 (skipped) or within [DT_MIN_BET, DT_MAX_BET].
 *   • At least one zone must have a positive wager.
 */
export function validateBets(bets: DragonTigerBets): DragonTigerValidation {
  let total = 0;
  for (const k of BET_KEYS) {
    const v = bets[k];
    if (!Number.isInteger(v) || v < 0) {
      return { ok: false, total: 0, error: `Invalid bet on ${k}.` };
    }
    if (v > 0 && v < DT_MIN_BET) {
      return { ok: false, total: 0, error: `Min bet per zone is ${DT_MIN_BET} chips.` };
    }
    if (v > DT_MAX_BET) {
      return { ok: false, total: 0, error: `Max bet per zone is ${DT_MAX_BET} chips.` };
    }
    total += v;
  }
  if (total === 0) return { ok: false, total: 0, error: 'Place at least one bet.' };
  return { ok: true, total, error: null };
}

/**
 * Deal a Dragon Tiger round from a pre-shuffled deck and resolve the outcome.
 *
 * dragonCard = deck[0], tigerCard = deck[1] (matches the lab + the verify
 * recipe). Higher ace-low rank wins; equal rank is a tie.
 */
export function dealDragonTiger(deck: number[]): DragonTigerRound {
  if (!Array.isArray(deck) || deck.length < 2) throw new Error('Deck too small');
  const dragonCard = deck[0]!;
  const tigerCard = deck[1]!;
  const dragonRank = dragonTigerRank(dragonCard);
  const tigerRank = dragonTigerRank(tigerCard);
  const result: DragonTigerResult =
    dragonRank > tigerRank ? 'dragon' : tigerRank > dragonRank ? 'tiger' : 'tie';
  return { dragonCard, tigerCard, dragonRank, tigerRank, result };
}

/**
 * Resolve per-zone payouts for a dealt round.
 *
 * Payouts are *gross* — they include the stake on a win. On a loss the zone
 * pays 0 (the original stake was already debited).
 *   • Dragon/Tiger win → that side's bet pays 2.00× (DT_PAY_SIDE).
 *   • Tie outcome      → the Tie bet pays 12.00× (DT_PAY_TIE); Dragon & Tiger
 *                        bets each return HALF the stake (DT_TIE_REFUND).
 * Mirrors the lab's settle() exactly.
 */
export function resolvePayouts(bets: DragonTigerBets, round: DragonTigerRound): DragonTigerBets {
  const out: DragonTigerBets = { dragon: 0, tiger: 0, tie: 0 };

  if (round.result === 'tie') {
    if (bets.tie > 0) out.tie = Math.floor((bets.tie * DT_PAY_TIE) / 100);
    if (bets.dragon > 0) out.dragon = Math.floor((bets.dragon * DT_TIE_REFUND) / 100);
    if (bets.tiger > 0) out.tiger = Math.floor((bets.tiger * DT_TIE_REFUND) / 100);
  } else if (round.result === 'dragon') {
    if (bets.dragon > 0) out.dragon = Math.floor((bets.dragon * DT_PAY_SIDE) / 100);
  } else {
    if (bets.tiger > 0) out.tiger = Math.floor((bets.tiger * DT_PAY_SIDE) / 100);
  }

  return out;
}

/** Sum of all bet zones. */
export function sumBets(bets: DragonTigerBets): number {
  return bets.dragon + bets.tiger + bets.tie;
}

/** Sum of all payout zones. */
export function sumPayouts(payouts: DragonTigerBets): number {
  return payouts.dragon + payouts.tiger + payouts.tie;
}
