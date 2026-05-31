/**
 * arcade-crash.ts — MORBIUS Arcade: Crash (stateful real-time version).
 *
 * The multiplier starts at 1.00× the moment a round begins and grows
 * exponentially until it crashes. The player watches the live counter and
 * hits "Cash Out" at any moment — the server computes the multiplier from
 * elapsed wall-clock time when the cashout request arrives.
 *
 * Growth formula (shared between server and client, must stay in sync):
 *   multiplierX100(ms) = max(100, floor(100 × exp(k × ms / 1000)))
 *   k = ln(2) / 3  ≈ 0.2310  →  doubles every 3 seconds
 *
 * Representative milestones:
 *   0s → 1.00×    3s → 2.00×    6s → 4.00×
 *   9s → 8.00×   12s → 16.0×   20s → ~102×
 *
 * Crash-point distribution (provably fair):
 *   crashX100 = max(100, floor((1 − houseEdge) / r × 100))
 *   r ∈ (0,1) from HMAC-SHA256 byte stream.
 *   P(crash ≥ x) = (1 − houseEdge) / x  →  99% RTP at every cashout target.
 *
 * The server commits sha256(serverSeed) at /start and reveals the plain seed
 * at finalize so anyone can recompute the crash point independently. The
 * crash point stays hidden (in crash_x100 column) until status != 'active'.
 */

/** House edge in basis points (100 = 1%). */
export const CRASH_HOUSE_EDGE_BP = 100;

export const CRASH_MIN_BET = 10;
export const CRASH_MAX_BET = 2000;

/** Auto-cashout bounds ×100. Below 1.01× there is no meaningful gain. */
export const CRASH_MIN_CASHOUT_X100 = 101;
export const CRASH_MAX_CASHOUT_X100 = 1_000_000; // 10,000×

/**
 * Growth constant k for the multiplier curve.
 * multiplierX100(ms) = floor(100 × exp(k × ms / 1000))
 * k = ln(2)/3 → doubles every 3 seconds.
 * Keep this value identical on the server and in MiniAppCrash.tsx.
 */
export const CRASH_GROWTH_K = Math.LN2 / 3; // ≈ 0.23105

/**
 * Provably-fair crash point from a float r ∈ (0,1).
 * crashX100 = max(100, floor((1 − houseEdge) / r × 100))
 */
export function crashPointFromFloat(r: number): number {
  if (!Number.isFinite(r) || r <= 0) throw new Error('Crash float must be in (0,1)');
  const safe = Math.max(r, 1e-12);
  const houseFactor = 1 - CRASH_HOUSE_EDGE_BP / 10_000;
  const raw = houseFactor / safe;
  return Math.max(100, Math.floor(raw * 100));
}

/**
 * Multiplier ×100 at a given elapsed time.
 * This is the canonical formula — the same one used in MiniAppCrash.tsx.
 */
export function multiplierX100AtMs(elapsedMs: number): number {
  if (elapsedMs <= 0) return 100;
  return Math.max(100, Math.floor(100 * Math.exp(CRASH_GROWTH_K * elapsedMs / 1000)));
}

/**
 * Minimum elapsed ms before the counter reaches targetX100.
 * Used to cap the round server-side and for display hints.
 */
export function msToReachX100(targetX100: number): number {
  if (targetX100 <= 100) return 0;
  return Math.ceil((Math.log(targetX100 / 100) / CRASH_GROWTH_K) * 1000);
}

/**
 * Payout in chips for a cash-out at multiplierX100.
 * bet × multiplierX100 / 100, floored to whole chips.
 */
export function crashPayout(bet: number, multiplierX100: number): number {
  if (!Number.isInteger(bet) || bet < CRASH_MIN_BET || bet > CRASH_MAX_BET) {
    throw new Error('Crash bet out of range');
  }
  if (!Number.isInteger(multiplierX100) || multiplierX100 < 100) {
    throw new Error('Crash multiplier out of range');
  }
  return Math.floor((bet * multiplierX100) / 100);
}
