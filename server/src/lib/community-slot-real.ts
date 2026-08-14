/**
 * community-slot-real.ts — the denomination and solvency rules for real-money
 * community slot sessions.
 *
 * Spins stay in integer credits (cabinet-math's float payout arithmetic must
 * never see wei-scale numbers); a machine's credit_value fixes how many token
 * base units one credit is worth. Deposits floor-convert on the way in,
 * cashouts multiply exactly on the way out.
 *
 * Solvency is one rule, priced against the win cap (which clamps every
 * round, so the worst case is exact, not estimated):
 *
 *   effective max bet = min(ladder ceiling, bankroll / (SAFETY × winCapX))
 *
 * The bankroll always covers the worst possible single-round win SAFETY
 * times over. When even the machine's minimum bet doesn't fit, the machine
 * is paused for real play until the creator tops up — no human involved.
 */

/** The bankroll must cover the worst-case round win this many times over. */
export const BANKROLL_SAFETY = Math.max(2, Number(process.env.SLOT_BANKROLL_SAFETY ?? 10));

/** Hard RTP gate for publishing a machine that has a betting token (percent). */
export const RTP_GATE_MIN_PCT = Number(process.env.SLOT_RTP_GATE_MIN_PCT ?? 80);
export const RTP_GATE_MAX_PCT = Number(process.env.SLOT_RTP_GATE_MAX_PCT ?? 99);

/** Default credit value: 0.001 token per credit (floor 1 base unit). */
export function defaultCreditValue(decimals: number): bigint {
  const exp = Math.max(0, Math.floor(decimals) - 3);
  return 10n ** BigInt(exp);
}

export function parseCreditValue(raw: unknown): bigint | null {
  if (typeof raw !== 'string' || !/^[0-9]{1,78}$/.test(raw)) return null;
  try {
    const v = BigInt(raw);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** Floor conversion — the sub-credit remainder stays in the pool as dust. */
export function baseUnitsToCredits(baseUnits: bigint, creditValue: bigint): bigint {
  return baseUnits / creditValue;
}

export function creditsToBaseUnits(credits: bigint, creditValue: bigint): bigint {
  return credits * creditValue;
}

/**
 * Highest bet (in credits) the bankroll can safely accept right now.
 * 0 means the machine cannot take even a 1-credit bet.
 */
export function effectiveMaxBetCredits(params: {
  bankrollBaseUnits: bigint;
  creditValue: bigint;
  winCapX: number;
  ladderMaxBet: number;
}): number {
  const { bankrollBaseUnits, creditValue, winCapX, ladderMaxBet } = params;
  if (bankrollBaseUnits <= 0n || creditValue <= 0n) return 0;
  const denom = BigInt(BANKROLL_SAFETY) * BigInt(Math.max(1, winCapX)) * creditValue;
  const byBankroll = bankrollBaseUnits / denom;
  const capped = byBankroll < BigInt(ladderMaxBet) ? Number(byBankroll) : ladderMaxBet;
  return Math.max(0, capped);
}
