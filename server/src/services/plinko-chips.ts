/**
 * plinko-chips.ts — server-side Plinko (chips, provably fair) rules & math.
 *
 * Game shape (identical to the on-chain Plinko board the client already renders):
 *   • 16 rows of pegs → 17 buckets (0..16).
 *   • One ball per play. The ball's path is 16 independent left/right steps;
 *     bucket = number of rights. That gives the exact binomial distribution
 *     C(16,k)/2^16 the physics simulation (and the contract's weighted
 *     thresholds) are built around.
 *   • Payout = bet × multiplier(risk, bucket).
 *   • Three risk levels — low/medium/high on the wire, rendered as the
 *     GREEN/YELLOW/RED boards client-side.
 *
 * Multipliers are the live contract's tables, already in ×100 basis points
 * (1600 ↔ 16x), so chip payouts stay exact integer math. The path itself is
 * drawn in ProvablyFairService.drawPlinkoPath — this module only scores it.
 */

export const PLINKO_ROWS = 16;
export const PLINKO_BUCKETS = PLINKO_ROWS + 1;

export const PLINKO_MIN_BET = 1;
// Capped so the worst-case single-ball liability (max bet × 200× top
// multiplier = 200k chips) stays survivable. Raise deliberately — never by
// accident.
export const PLINKO_MAX_BET = 1_000;

export type PlinkoRisk = 'low' | 'medium' | 'high';
export const PLINKO_RISKS: readonly PlinkoRisk[] = ['low', 'medium', 'high'] as const;

/**
 * Contract-verbatim multiplier tables (basis points = ×100), indexed by bucket
 * 0..16. Symmetric around the center bucket (8). Source:
 * contracts/contracts/Plinko.sol constructor — LOW/MEDIUM/HIGH_RISK_MULTIPLIERS.
 */
const LOW: readonly number[] = [
  1600, 900, 200, 140, 140, 120, 110, 100, 40, 100, 110, 120, 140, 140, 200, 900, 1600,
];
const MEDIUM: readonly number[] = [
  11000, 4100, 1000, 500, 300, 150, 100, 50, 20, 50, 100, 150, 300, 500, 1000, 4100, 11000,
];
const HIGH: readonly number[] = [
  20000, 12000, 2500, 1000, 400, 200, 20, 20, 20, 20, 20, 200, 400, 1000, 2500, 12000, 20000,
];

export const PLINKO_MULTIPLIERS_X100: Record<PlinkoRisk, readonly number[]> = {
  low: LOW,
  medium: MEDIUM,
  high: HIGH,
};

export function isPlinkoRisk(value: unknown): value is PlinkoRisk {
  return typeof value === 'string' && (PLINKO_RISKS as readonly string[]).includes(value);
}

/** Multiplier ×100 for a (risk, bucket) cell. Throws on an impossible bucket. */
export function plinkoMultiplierX100(risk: PlinkoRisk, bucket: number): number {
  if (!Number.isInteger(bucket) || bucket < 0 || bucket >= PLINKO_BUCKETS) {
    throw new Error('Plinko bucket out of range');
  }
  return PLINKO_MULTIPLIERS_X100[risk][bucket];
}

/** Bucket index from a 16-step path of 0 (left) / 1 (right): count of rights. */
export function plinkoBucketFromPath(path: readonly number[]): number {
  if (path.length !== PLINKO_ROWS) throw new Error('Plinko path must have 16 steps');
  let bucket = 0;
  for (const step of path) {
    if (step !== 0 && step !== 1) throw new Error('Plinko path steps must be 0 or 1');
    bucket += step;
  }
  return bucket;
}

export interface PlinkoResult {
  /** Bucket the ball landed in (0..16). */
  bucket: number;
  /** Multiplier ×100 applied to the bet. */
  multiplierX100: number;
  /** Chips returned to the player. */
  payout: number;
}

/**
 * Score a Plinko ball. `path` must be the 16 left/right steps the server drew.
 * Pure integer math — no floats on the money path.
 */
export function resolvePlinko(risk: PlinkoRisk, bet: number, path: readonly number[]): PlinkoResult {
  if (!Number.isInteger(bet) || bet < PLINKO_MIN_BET || bet > PLINKO_MAX_BET) {
    throw new Error('Plinko bet out of range');
  }
  const bucket = plinkoBucketFromPath(path);
  const multiplierX100 = plinkoMultiplierX100(risk, bucket);
  const payout = Math.floor((bet * multiplierX100) / 100);
  return { bucket, multiplierX100, payout };
}

// ---------------------------------------------------------------------------
// Theoretical RTP — used by tests to confirm every table keeps a house edge.
// Not on any request path.
// ---------------------------------------------------------------------------

/** C(n, k) as a float (n = 16 here, exact within double precision). */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

/** Binomial P(bucket = k) for a fair 16-row board: C(16,k) / 2^16. */
export function plinkoBucketProbability(bucket: number): number {
  return choose(PLINKO_ROWS, bucket) / 2 ** PLINKO_ROWS;
}

/** Theoretical return-to-player (1.0 = break-even) for a risk table. */
export function plinkoRtp(risk: PlinkoRisk): number {
  let rtp = 0;
  for (let bucket = 0; bucket < PLINKO_BUCKETS; bucket++) {
    rtp += plinkoBucketProbability(bucket) * (plinkoMultiplierX100(risk, bucket) / 100);
  }
  return rtp;
}
