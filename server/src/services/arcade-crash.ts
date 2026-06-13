/**
 * arcade-crash.ts — MORBIUS Arcade: Crash.
 *
 * Classic provably-fair crash game:
 *   • A multiplier starts at 1.00× and climbs until it "crashes".
 *   • The player optionally sets an auto-cashout target T (e.g. 2.00×).
 *   • The server rolls r ∈ [0,1) and derives:
 *       crashX100 = max(100, floor((1 - houseEdge) / r × 100))
 *   • If crashX100 >= autoX100 → player wins at T; else bust.
 *
 * Distribution: P(crash ≥ x) = (1 − houseEdge) / x  →  99% RTP.
 * Low multipliers are common; large ones are geometrically rare.
 * At r < houseEdge the formula gives crashX100 = 100 (1.00×), which busts
 * all targets — this is the 1% where the house edge lives.
 *
 * Multipliers are stored ×100 (integers) so all win decisions are exact
 * integer comparisons — no float rounding anywhere in the wallet path.
 */

export const CRASH_HOUSE_EDGE_BP = 100;

export const CRASH_MIN_BET = 10;
export const CRASH_MAX_BET = 2000;

/** Auto-cashout bounds ×100. 1.01× is the minimum sensible target. */
export const CRASH_MIN_CASHOUT_X100 = 101;
export const CRASH_MAX_CASHOUT_X100 = 10_000; // 100.00×

/** Display/verify cap — keeps the number readable on extreme rolls. */
export const CRASH_RESULT_CAP_X100 = 100_000_000; // 1,000,000.00×

/**
 * Derive the round's crash-point multiplier ×100 from the provably-fair float.
 *
 * Formula: crashX100 = max(100, floor((1 − houseEdge) / r × 100))
 *
 * When r → 0: crash → ∞ (rare mega-multiplier).
 * When r → 1: crash → 1× (common, bust most targets).
 * r < houseEdge: formula yields < 1×, clamped to 1.00× (always busts).
 */
export function crashPointFromFloat(r: number): number {
  if (!Number.isFinite(r) || r < 0) throw new Error('Crash float must be in [0,1)');
  const safe = Math.max(r, 1e-12);
  const houseFactor = 1 - CRASH_HOUSE_EDGE_BP / 10_000;
  const raw = houseFactor / safe;
  const x100 = Math.max(100, Math.floor(raw * 100));
  return Math.min(CRASH_RESULT_CAP_X100, x100);
}

export interface CrashResult {
  /** Provably-fair crash point ×100. */
  crashX100: number;
  /** Multiplier the player locked in, ×100. Equals autoX100 on win, crashX100 on bust. */
  cashoutX100: number | null;
  won: boolean;
  /** Total chips returned (0 on bust). */
  payout: number;
}

// ---------------------------------------------------------------------------
// Live-round multiplier curve (web /crash).
//
// The visual curve ported from the crash prototype — the SAME formula runs on
// the client for animation and here for settlement, so the multiplier a
// player sees is the multiplier the server pays:
//
//   t ≤ 5s :  m(t) = e^(0.06·t)
//   t > 5s :  m(t) = e^(0.06·t + 0.01·(t−5)²)      (acceleration kicks in)
//
// Mirrored in lib/crash-curve.ts on the frontend — keep both in sync.
// ---------------------------------------------------------------------------

const CURVE_RATE = 0.06;
const CURVE_ACCEL = 0.01;
const CURVE_ACCEL_AFTER_S = 5;

/** Multiplier ×100 (integer, floored) at `elapsedMs` into a flight. */
export function crashMultiplierX100AtMs(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 100;
  const t = elapsedMs / 1000;
  const exponent =
    t <= CURVE_ACCEL_AFTER_S
      ? CURVE_RATE * t
      : CURVE_RATE * t + CURVE_ACCEL * (t - CURVE_ACCEL_AFTER_S) ** 2;
  const m = Math.exp(exponent);
  return Math.min(CRASH_RESULT_CAP_X100, Math.max(100, Math.floor(m * 100)));
}

/** Inverse of the curve: flight milliseconds until the multiplier reaches `x100`. */
export function crashMsUntilX100(x100: number): number {
  if (!Number.isFinite(x100) || x100 <= 100) return 0;
  const L = Math.log(x100 / 100);
  if (L <= CURVE_RATE * CURVE_ACCEL_AFTER_S) return (L / CURVE_RATE) * 1000;
  // Solve CURVE_ACCEL·u² + CURVE_RATE·u + (CURVE_RATE·5 − L) = 0 for u = t − 5.
  const u =
    (-CURVE_RATE +
      Math.sqrt(CURVE_RATE * CURVE_RATE - 4 * CURVE_ACCEL * (CURVE_RATE * CURVE_ACCEL_AFTER_S - L))) /
    (2 * CURVE_ACCEL);
  return (CURVE_ACCEL_AFTER_S + u) * 1000;
}

export type LiveCrashOutcome =
  | { settle: false }
  | { settle: true; won: boolean; cashoutX100: number | null; payout: number };

/**
 * Live-round settle rule, evaluated against the server clock.
 *
 * A round settles when the curve reaches the crash point, or — for rounds
 * with NO auto-cashout — when it reaches the max-cashout cap (the player
 * can't win more than the cap, so the house force-banks the max win rather
 * than letting a disconnect turn a >cap crash into a loss).
 *
 * Outcomes on settle:
 *   • auto target set and target ≤ crash → win at the target (ties win,
 *     matching the instant /play path's `resolveCrash`).
 *   • no auto target and crash > cap     → forced win at the cap.
 *   • otherwise                          → bust.
 */
export function resolveLiveCrash(
  autoX100: number | null,
  bet: number,
  crashX100: number,
  elapsedMs: number,
): LiveCrashOutcome {
  const curveX100 = crashMultiplierX100AtMs(elapsedMs);
  const capped = autoX100 === null && curveX100 >= CRASH_MAX_CASHOUT_X100 && crashX100 > CRASH_MAX_CASHOUT_X100;
  if (curveX100 < crashX100 && !capped) return { settle: false };

  if (autoX100 !== null && autoX100 <= crashX100) {
    return { settle: true, won: true, cashoutX100: autoX100, payout: Math.floor((bet * autoX100) / 100) };
  }
  if (autoX100 === null && crashX100 > CRASH_MAX_CASHOUT_X100) {
    return {
      settle: true,
      won: true,
      cashoutX100: CRASH_MAX_CASHOUT_X100,
      payout: Math.floor((bet * CRASH_MAX_CASHOUT_X100) / 100),
    };
  }
  return { settle: true, won: false, cashoutX100: null, payout: 0 };
}

/**
 * Resolve a single Crash round.
 *
 * @param autoX100 Player's auto-cashout ×100, or null to skip (instant bust).
 * @param bet      Bet in chips.
 * @param r        Provably-fair float ∈ [0, 1).
 */
export function resolveCrash(
  autoX100: number | null,
  bet: number,
  r: number,
): CrashResult {
  if (!Number.isInteger(bet) || bet < CRASH_MIN_BET || bet > CRASH_MAX_BET) {
    throw new Error('Crash bet out of range');
  }
  if (
    autoX100 !== null &&
    (!Number.isInteger(autoX100) ||
      autoX100 < CRASH_MIN_CASHOUT_X100 ||
      autoX100 > CRASH_MAX_CASHOUT_X100)
  ) {
    throw new Error('Crash auto-cashout out of range');
  }

  const crashX100 = crashPointFromFloat(r);

  if (autoX100 === null || crashX100 < autoX100) {
    // Bust: player had no target, or crash happened before the target.
    return {
      crashX100,
      cashoutX100: null,
      won: false,
      payout: 0,
    };
  }

  // Win: crash cleared the target.
  const payout = Math.floor((bet * autoX100) / 100);
  return {
    crashX100,
    cashoutX100: autoX100,
    won: true,
    payout,
  };
}
