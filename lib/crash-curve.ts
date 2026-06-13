/**
 * crash-curve.ts — the live Crash multiplier curve (client mirror).
 *
 * IDENTICAL to the server's curve in server/src/services/arcade-crash.ts —
 * the server settles cashouts with this exact formula against its own clock,
 * so the multiplier on screen is the multiplier that pays. Keep both in sync.
 *
 *   t ≤ 5s :  m(t) = e^(0.06·t)
 *   t > 5s :  m(t) = e^(0.06·t + 0.01·(t−5)²)
 */

const CURVE_RATE = 0.06;
const CURVE_ACCEL = 0.01;
const CURVE_ACCEL_AFTER_S = 5;

/** Display cap, matching the server's CRASH_RESULT_CAP_X100. */
export const CRASH_RESULT_CAP_X100 = 100_000_000;

/** Raw float multiplier at `elapsedMs` into a flight (≥ 1). */
export function crashMultiplierAtMs(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 1;
  const t = elapsedMs / 1000;
  const exponent =
    t <= CURVE_ACCEL_AFTER_S
      ? CURVE_RATE * t
      : CURVE_RATE * t + CURVE_ACCEL * (t - CURVE_ACCEL_AFTER_S) ** 2;
  return Math.exp(exponent);
}

/** Integer ×100 multiplier at `elapsedMs` — the exact value the server pays. */
export function crashMultiplierX100AtMs(elapsedMs: number): number {
  const m = crashMultiplierAtMs(elapsedMs);
  return Math.min(CRASH_RESULT_CAP_X100, Math.max(100, Math.floor(m * 100)));
}

/** Flight milliseconds until the multiplier reaches `x100` (inverse curve). */
export function crashMsUntilX100(x100: number): number {
  if (!Number.isFinite(x100) || x100 <= 100) return 0;
  const L = Math.log(x100 / 100);
  if (L <= CURVE_RATE * CURVE_ACCEL_AFTER_S) return (L / CURVE_RATE) * 1000;
  const u =
    (-CURVE_RATE +
      Math.sqrt(CURVE_RATE * CURVE_RATE - 4 * CURVE_ACCEL * (CURVE_RATE * CURVE_ACCEL_AFTER_S - L))) /
    (2 * CURVE_ACCEL);
  return (CURVE_ACCEL_AFTER_S + u) * 1000;
}
