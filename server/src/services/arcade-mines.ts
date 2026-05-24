/**
 * arcade-mines.ts — MORBIUS Arcade: Mines.
 *
 * Stake-style 5×5 grid game. The player picks how many bombs are hidden in 25
 * cells, then reveals safe cells one by one. Each safe reveal pushes the
 * round multiplier up; revealing a bomb ends the round and forfeits the bet.
 * The player may cash out after any safe reveal.
 *
 * Provably fair: bomb positions are derived from a Fisher-Yates shuffle of the
 * 25 cell indices driven by HMAC-SHA256 (the same primitive used elsewhere on
 * the platform). The server commits to `serverSeedHash` at round start and
 * reveals `serverSeed` only when the round ends, so anyone with the public
 * payload can recompute the bomb grid and confirm it wasn't moved mid-round.
 *
 * Math:
 *   P(k safe picks in a row | mines = m) = C(25-m, k) / C(25, k)
 *   multiplier(k)                        = (1 - houseEdge) / P(k safe picks)
 *
 * With houseEdge = 0.01 every (mines, k) combination has the same 99% RTP
 * conditional on those k picks. Multipliers are stored × 100 (so 1.05× ↔ 105)
 * to keep the cash-out decision exact — no float comparisons in the wallet
 * path. Floored to a whole chip on payout (the floor falls on the player so
 * the published multiplier is always honored as a *minimum* in chips).
 */

export const MINES_TOTAL_CELLS = 25;
/** House edge in basis points (1 bp = 0.01%). 100 = 1%. */
export const MINES_HOUSE_EDGE_BP = 100;

export const MINES_MIN_BET = 10;
export const MINES_MAX_BET = 2000;

/** Bomb count bounds. With 24 bombs only 1 safe cell remains — a coin flip. */
export const MINES_MIN_BOMBS = 1;
export const MINES_MAX_BOMBS = 24;

/**
 * Derive the deterministic bomb grid for a round.
 *
 * Uses the same HMAC byte stream + bytesToFloat primitives as the poker deck
 * shuffle and the lottery 6-of-55 draw, so the verifier can recompute it from
 * the published seeds with WebCrypto.
 *
 * Partial Fisher-Yates over [0..24]: after `bombs` swaps from the back, the
 * last `bombs` elements form a uniform random sample. We return them sorted
 * so the JSON-stored grid is canonical (easier to diff and verify).
 */
export function deriveBombGrid(
  hmacByteStream: (cursor: number) => Buffer | Uint8Array,
  bytesToFloat: (bytes: Buffer | Uint8Array) => number,
  bombs: number,
): number[] {
  if (!Number.isInteger(bombs) || bombs < MINES_MIN_BOMBS || bombs > MINES_MAX_BOMBS) {
    throw new Error('Mines bombs out of range');
  }
  const pool = Array.from({ length: MINES_TOTAL_CELLS }, (_, i) => i);
  let cursor = 0;
  for (let i = MINES_TOTAL_CELLS - 1; i >= MINES_TOTAL_CELLS - bombs; i--) {
    const bytes = hmacByteStream(cursor);
    cursor += 4;
    const float = bytesToFloat(bytes);
    const j = Math.floor(float * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(MINES_TOTAL_CELLS - bombs).sort((a, b) => a - b);
}

/**
 * Multiplier × 100 after `picks` safe reveals with `bombs` bombs on a 25-cell
 * grid. `picks = 0` always returns 100 (1.00×, before any reveal).
 *
 * Done in pure integer / careful-float terms — we accumulate the rational
 * factor (25-i) / (25-bombs-i) for i in [0..picks-1], multiply by the house
 * factor at the end, then ×100 and floor. The accumulating ratio stays in
 * float space, but at sane (mines, picks) the final integer is exact for our
 * purposes (max value is well within safe int53).
 */
export function minesMultiplierX100(bombs: number, picks: number): number {
  if (!Number.isInteger(bombs) || bombs < MINES_MIN_BOMBS || bombs > MINES_MAX_BOMBS) {
    throw new Error('Mines bombs out of range');
  }
  if (!Number.isInteger(picks) || picks < 0) {
    throw new Error('Mines picks must be a non-negative integer');
  }
  const maxSafe = MINES_TOTAL_CELLS - bombs;
  if (picks > maxSafe) throw new Error('Mines picks exceed available safe cells');
  if (picks === 0) return 100;

  const houseFactor = 1 - MINES_HOUSE_EDGE_BP / 10_000;
  let m = houseFactor;
  for (let i = 0; i < picks; i++) {
    m *= (MINES_TOTAL_CELLS - i) / (maxSafe - i);
  }
  // ×100 and floor; min 100 (one-pick rounds with 24 bombs etc. can still be
  // exactly 100 after rounding, which is fine — that's the table edge for the
  // riskiest hand and the player is informed).
  return Math.max(100, Math.floor(m * 100));
}

/**
 * Full multiplier ladder for a chosen bombs count. ladder[k] = multiplier × 100
 * after k safe picks. ladder.length = (25 - bombs) + 1 so ladder[0] = 100 and
 * ladder[max] = the "all clear" multiplier.
 */
export function minesMultiplierLadder(bombs: number): number[] {
  const safe = MINES_TOTAL_CELLS - bombs;
  const out: number[] = new Array(safe + 1);
  for (let k = 0; k <= safe; k++) out[k] = minesMultiplierX100(bombs, k);
  return out;
}

/**
 * Payout in chips for a cash-out after `picks` safe reveals.
 *
 * bet × multiplier × 100 / 10_000 — floored. We compute against the integer
 * ×100 multiplier directly so the chain of operations matches the verifier.
 */
export function minesPayout(bet: number, bombs: number, picks: number): number {
  if (!Number.isInteger(bet) || bet < MINES_MIN_BET || bet > MINES_MAX_BET) {
    throw new Error('Mines bet out of range');
  }
  const mx100 = minesMultiplierX100(bombs, picks);
  return Math.floor((bet * mx100) / 100);
}
