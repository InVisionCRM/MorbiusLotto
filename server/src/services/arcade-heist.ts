/**
 * arcade-heist.ts — MORBIUS Arcade: Heist.
 *
 * Push-your-luck pick-a-door (Mines/Towers family) themed as a vault heist. The
 * player bets, then breaks into a fixed sequence of vault rooms one at a time.
 * Each room shows several vault doors; one (or more, on Daring) is wired to the
 * alarm. Opening a safe door compounds the round multiplier and unlocks the next
 * room; tripping an alarm busts the round and forfeits the bet. The player may
 * escape (cash out) after any cleared room; clearing the last room auto-settles
 * at the top of the ladder.
 *
 * Difficulty modes (matching the approved lab, public/heist-lab.html):
 *   Sneaky   = 4 doors, 1 alarm, 8 rooms (safe 3/4 each room)
 *   Standard = 3 doors, 1 alarm, 8 rooms (safe 2/3 each room)
 *   Daring   = 3 doors, 2 alarms, 6 rooms (safe 1/3 each room)
 *
 * Provably fair: the alarm door(s) for every room are derived up front from the
 * platform's HMAC-SHA256 byte stream (the same primitive as the poker shuffle,
 * the lottery 6-of-55 draw, Mines, Towers and Chicken). The server commits to
 * `serverSeedHash` at round start and reveals `serverSeed` only when the round
 * settles, so anyone with the public payload can recompute every room and
 * confirm the vault was fixed before the first pick and never moved.
 *
 * Math (per room, with `alarms` alarm doors among `doors` doors):
 *   P(safe pick) = (doors - alarms) / doors
 *   step factor  = (1 - houseEdge) / P(safe pick)
 *
 * Multipliers are stored × 100 as integers (so 1.30× ↔ 130) — the wallet path
 * never compares floats. Each step is computed as
 *   next_x100 = floor(prev_x100 × doors × (10_000 - houseEdgeBp)
 *                     / (10_000 × (doors - alarms)))
 * which floors *toward the house* a fraction of a chip per room. That's the
 * same rounding convention as `arcade-towers.towersStepMultiplierX100` — the
 * published ladder is always honored as a minimum in chips on cash-out.
 */

/** House edge, in basis points (1 bp = 0.01%). 200 = 2% — matches the lab EDGE. */
export const HEIST_HOUSE_EDGE_BP = 200;

export const HEIST_MIN_BET = 10;
export const HEIST_MAX_BET = 2000;

export type HeistDifficulty = 'sneaky' | 'standard' | 'daring';

export interface HeistDifficultyConfig {
  /** Vault doors shown per room. */
  doors: number;
  /** Doors wired to the alarm per room (a safe pick is one of doors - alarms). */
  alarms: number;
  /** Total rooms to crack — clear them all and the round auto-settles as a win. */
  rooms: number;
}

export const HEIST_DIFFICULTIES: Record<HeistDifficulty, HeistDifficultyConfig> = {
  sneaky: { doors: 4, alarms: 1, rooms: 8 }, // safe 3/4 → top ≈ 8×
  standard: { doors: 3, alarms: 1, rooms: 8 }, // safe 2/3 → top ≈ 21×
  daring: { doors: 3, alarms: 2, rooms: 6 }, // safe 1/3 → top ≈ 580×
};

export function isHeistDifficulty(value: unknown): value is HeistDifficulty {
  return value === 'sneaky' || value === 'standard' || value === 'daring';
}

/**
 * Derive the alarm door(s) for every room of the heist.
 *
 * Uses the shared HMAC byte stream + bytesToFloat primitives so the verifier can
 * recompute it from the published seeds with WebCrypto. For each room we run a
 * partial Fisher-Yates over the door indices [0, doors): `alarms` draws fix the
 * first `alarms` slots as a uniform sample of alarm doors. One 4-byte slice is
 * consumed per draw, advancing a global cursor across all rooms, so the byte
 * layout is unambiguous and order-stable. The returned room arrays are sorted
 * for stable display/equality.
 *
 * Returns an array of HEIST_DIFFICULTIES[difficulty].rooms entries; entry r is
 * the sorted alarm-door indices for room r.
 */
export function deriveAlarmDoors(
  hmacByteStream: (cursor: number) => Buffer | Uint8Array,
  bytesToFloat: (bytes: Buffer | Uint8Array) => number,
  difficulty: HeistDifficulty,
): number[][] {
  const { doors, alarms, rooms } = HEIST_DIFFICULTIES[difficulty];
  const out: number[][] = new Array(rooms);
  let cursor = 0;
  for (let r = 0; r < rooms; r++) {
    const idx: number[] = Array.from({ length: doors }, (_, k) => k);
    for (let b = 0; b < alarms; b++) {
      const float = bytesToFloat(hmacByteStream(cursor));
      cursor += 4;
      // float < 1 always, so b + floor(float × (doors - b)) ≤ doors - 1.
      const j = b + Math.min(doors - 1 - b, Math.floor(float * (doors - b)));
      const tmp = idx[b];
      idx[b] = idx[j];
      idx[j] = tmp;
    }
    out[r] = idx.slice(0, alarms).sort((a, c) => a - c);
  }
  return out;
}

/**
 * Advance the round multiplier (× 100) after one cleared room. Floors the result
 * toward the house — see file comment for the rounding contract.
 */
export function heistStepMultiplierX100(
  prevX100: number,
  difficulty: HeistDifficulty,
): number {
  if (!Number.isInteger(prevX100) || prevX100 < 100) {
    throw new Error('Heist prevX100 must be >= 100');
  }
  const { doors, alarms } = HEIST_DIFFICULTIES[difficulty];
  const houseNum = 10_000 - HEIST_HOUSE_EDGE_BP;
  return Math.max(100, Math.floor((prevX100 * doors * houseNum) / (10_000 * (doors - alarms))));
}

/**
 * Full multiplier ladder for a difficulty. ladder[r] = multiplier × 100 after r
 * cleared rooms, so ladder[0] = 100 and ladder[rooms] = the full-clear
 * multiplier. Built by iterating the step function so the per-pick server math
 * and the published ladder agree to the integer.
 */
export function heistMultiplierLadder(difficulty: HeistDifficulty): number[] {
  const { rooms } = HEIST_DIFFICULTIES[difficulty];
  const out: number[] = new Array(rooms + 1);
  out[0] = 100;
  for (let r = 1; r <= rooms; r++) {
    out[r] = heistStepMultiplierX100(out[r - 1], difficulty);
  }
  return out;
}

/**
 * Payout in chips for an escape (or full clear) at the current multiplier.
 * bet × multiplier_x100 / 100 — floored. Matches the verifier's arithmetic.
 */
export function heistPayout(bet: number, multiplierX100: number): number {
  if (!Number.isInteger(bet) || bet < HEIST_MIN_BET || bet > HEIST_MAX_BET) {
    throw new Error('Heist bet out of range');
  }
  if (!Number.isInteger(multiplierX100) || multiplierX100 < 100) {
    throw new Error('Heist multiplier out of range');
  }
  return Math.floor((bet * multiplierX100) / 100);
}
