/**
 * arcade-pachinko.ts — MORBIUS Arcade: Pachinko.
 *
 * Plinko-family drop with a *custom* pocket distribution (not the binomial
 * Plinko already on the site). The ball falls through a triangular pin field
 * into one of nine pockets; each pocket pays a fixed multiplier, the outer
 * pockets pay the most, the near-center ones least, and the rare CENTER gate
 * (pocket 4) is the jackpot. Three risk levels (Low / Med / High) reshape the
 * pocket multipliers, but every level is tuned to ≈96% RTP — same long-run
 * return, very different swings. This is a port of public/pachinko-lab.html.
 *
 * Pure RNG, provably fair: the landing pocket is a single weighted draw from
 * the platform's HMAC-SHA256 float stream (the same primitive as the poker
 * shuffle, the lottery 6-of-55 draw, Plinko and Chicken). The bounce the player
 * sees is purely a *reveal animation* — re-derived on the client from the same
 * seed (a cosmetic L/R peg walk) and discarded; only the pocket decides money.
 *
 * Recipe (also published verbatim in /verify):
 *   • pocket draw: float f0 = bytesToFloat(hmacByteStream(serverSeed, clientSeed,
 *     nonce, 0)); walk the cumulative weight table for the risk and pick the
 *     first pocket whose running weight exceeds f0 × totalWeight.
 *   • bounce path (cosmetic): for row R in [0..ROWS-1], step R = floor(
 *     bytesToFloat(hmacByteStream(..., (R + 1) × 4)) × 2) (0 = left, 1 = right).
 *     The path is stored for the replay but never changes the pocket.
 *
 * All money math is integer ×100. multiplier_x100 is the pocket multiplier ×100
 * (e.g. 1.52× ↔ 152, jackpot 5.05× ↔ 505); payout = floor(bet × m / 100).
 */

/** Number of pockets across the bottom of the board. */
export const PACHINKO_POCKETS = 9;

/** Index of the rare center jackpot pocket. */
export const PACHINKO_CENTER = 4;

/** Triangular pin rows the cosmetic bounce walks through. */
export const PACHINKO_ROWS = 10;

export const PACHINKO_MIN_BET = 10;
export const PACHINKO_MAX_BET = 100_000;

export type PachinkoRisk = 'low' | 'medium' | 'high';

export interface PachinkoRiskConfig {
  /** Pocket multipliers ×100, left → right (index 4 is the jackpot). */
  multX100: number[];
  /** Integer weights for the weighted pocket draw, left → right. */
  weights: number[];
}

/**
 * Per-risk pocket tables — multipliers ×100 + integer draw weights. Symmetric
 * about the center jackpot. Re-tuned (vs. the lab) so the per-risk RTP lands in
 * the 95–96.5% target band; verified with a 1,000,000-draw Monte-Carlo per risk
 * (see scripts/pachinko-rtp.ts). Final measured RTP:
 *   low ≈ 96.17%   medium ≈ 96.36%   high ≈ 95.93%
 */
export const PACHINKO_RISKS: Record<PachinkoRisk, PachinkoRiskConfig> = {
  // Flat & steady, small ~5× jackpot. weights sum = 92.
  low: {
    multX100: [149, 108, 76, 46, 505, 46, 76, 108, 149],
    weights: [4, 9, 14, 17, 4, 17, 14, 9, 4],
  },
  // Punchier outers, 13× jackpot. weights sum = 90.
  medium: {
    multX100: [200, 120, 60, 30, 1300, 30, 60, 120, 200],
    weights: [3, 8, 14, 18, 2, 18, 14, 8, 3],
  },
  // Big outers + 30× jackpot, near-center pays almost nothing. weights sum = 82.
  high: {
    multX100: [405, 150, 38, 15, 3000, 15, 38, 150, 405],
    weights: [2, 6, 12, 21, 1, 21, 12, 6, 2],
  },
};

export function isPachinkoRisk(value: unknown): value is PachinkoRisk {
  return value === 'low' || value === 'medium' || value === 'high';
}

/**
 * Derive the landing pocket (0..8) from a single provably-fair float in [0,1).
 * Weighted cumulative selection over the risk's `weights` — the first pocket
 * whose running weight strictly exceeds f × total. Deterministic: the same float
 * always yields the same pocket, so the verifier re-derives it exactly.
 */
export function derivePachinkoPocket(risk: PachinkoRisk, f: number): number {
  if (!Number.isFinite(f) || f < 0 || f >= 1) {
    throw new Error('Pachinko float must be in [0,1)');
  }
  const { weights } = PACHINKO_RISKS[risk];
  const total = weights.reduce((a, b) => a + b, 0);
  const threshold = f * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (threshold < acc) return i;
  }
  return weights.length - 1;
}

/**
 * Derive the cosmetic bounce path — PACHINKO_ROWS L/R peg decisions (0 = left,
 * 1 = right) from the float stream. This is purely the reveal animation; it does
 * NOT decide the pocket. Floats are read at cursor (row + 1) × 4 so the pocket
 * draw (cursor 0) and the path never overlap.
 */
export function derivePachinkoPath(
  hmacByteStream: (cursor: number) => Buffer | Uint8Array,
  bytesToFloat: (bytes: Buffer | Uint8Array) => number,
): number[] {
  const path: number[] = [];
  for (let row = 0; row < PACHINKO_ROWS; row++) {
    const f = bytesToFloat(hmacByteStream((row + 1) * 4));
    path.push(f < 0.5 ? 0 : 1);
  }
  return path;
}

export interface PachinkoResult {
  /** Landing pocket 0..8 (4 = jackpot). */
  pocket: number;
  /** Cosmetic L/R bounce path the client replays. */
  path: number[];
  /** Pocket multiplier ×100. */
  multiplierX100: number;
  /** A "win" is any payout strictly greater than the bet (net positive). */
  won: boolean;
  /** Chips returned to the player (bet × m / 100, floored). */
  payout: number;
}

/**
 * Resolve a single Pachinko drop. The pocket comes from the weighted draw; the
 * path is cosmetic. Both are derived from the same HMAC float stream passed in.
 *
 * @param risk  Low / Medium / High pocket table
 * @param bet   bet in chips (must be in bounds)
 * @param hmacByteStream cursor → 4 bytes of the HMAC stream
 * @param bytesToFloat   4 bytes → float in [0,1)
 */
export function resolvePachinko(
  risk: PachinkoRisk,
  bet: number,
  hmacByteStream: (cursor: number) => Buffer | Uint8Array,
  bytesToFloat: (bytes: Buffer | Uint8Array) => number,
): PachinkoResult {
  if (!isPachinkoRisk(risk)) {
    throw new Error('Pachinko risk must be low, medium or high');
  }
  if (!Number.isInteger(bet) || bet < PACHINKO_MIN_BET || bet > PACHINKO_MAX_BET) {
    throw new Error('Pachinko bet out of range');
  }
  const { multX100 } = PACHINKO_RISKS[risk];

  const f0 = bytesToFloat(hmacByteStream(0));
  const pocket = derivePachinkoPocket(risk, f0);
  const path = derivePachinkoPath(hmacByteStream, bytesToFloat);

  const multiplierX100 = multX100[pocket];
  const payout = Math.floor((bet * multiplierX100) / 100);
  const won = payout > bet;

  return { pocket, path, multiplierX100, won, payout };
}
