/**
 * arcade-cascade.ts — MORBIUS Arcade: Cascade (cluster-pays chain reaction).
 *
 * Single-shot, server-resolved, provably-fair. One drop fills a 6×6 grid; any
 * cluster of >= threshold connected matching gems pays and pops, the grid
 * tumbles + refills from the top, and the chain repeats — a combo multiplier
 * climbing each link — until no more clusters form. The whole cascade is a
 * deterministic function of a float stream, so it animates live on the client
 * AND re-derives byte-for-byte in /verify.
 *
 * This is a faithful TS port of the prototype engine in public/cascade-lab.html
 * (resolveRound / findClusters / clusterPayX100). The ONLY change from the lab is
 * the randomness source: where the lab pulls each gem from an in-page mulberry32
 * RNG (`nextGem(rng, weights, total)` using `rng()*total`), we pull each gem from
 * the platform's provably-fair HMAC float stream — one float per gem, in a fixed
 * order (opening fill row-major, then per-tumble refill column-by-column,
 * bottom-up). `floatStream()` MUST return successive floats in [0,1) from
 * ProvablyFairService.hmacByteStream(...) + bytesToFloat(...), cursor += 4 per
 * call (same convention as drawPlinkoPath / deriveChickenBumpers). Verify replays
 * the same stream from the same seed to reproduce every gem.
 *
 * Money path: multipliers are integers ×100 (combo ×100, cluster value ×100, the
 * round total ×100). Total payout = floor(bet × totalMultiplierX100 / 100) on the
 * BigInt money path in the route. payScale per volatility is tuned by Monte-Carlo
 * so each mode's RTP ≈ 97% (the prototype target).
 */

export const CASCADE_MIN_BET = 100;
export const CASCADE_MAX_BET = 100_000;

export const CASCADE_COLS = 6;
export const CASCADE_ROWS = 6;

export type CascadeVolatility = 'calm' | 'standard' | 'frenzy';

export interface CascadeVolatilityConfig {
  label: string;
  /** Minimum connected matching gems to form a paying cluster. */
  threshold: number;
  /** Per-gem rarity weights (index 0 common → 4 rare). Sum is the selection range. */
  weights: number[];
  /** Combo multiplier ×100 by chain link (index 0 = link 1). Clamped to the last. */
  combo: number[];
  /** Base cluster value ×100 by gem index (ascending by gem rarity). */
  pay: number[];
  /** Extra per-gem bonus above threshold: value × (1 + sizeBonus × (size - threshold)). */
  sizeBonus: number;
  /** RTP-tuning scalar applied to every cluster value. Set by Monte-Carlo. */
  payScale: number;
}

/**
 * Volatility configs — names + grid shape + combo curve + paytable mirror the
 * prototype (public/cascade-lab.html VOLS). `payScale` is re-tuned here so each
 * mode's RTP ≈ 97% under the HMAC float source (see the Monte-Carlo script /
 * report). Everything else is identical to the lab so the outcome distribution
 * matches the approved design.
 */
export const CASCADE_VOLATILITIES: Record<CascadeVolatility, CascadeVolatilityConfig> = {
  calm: {
    label: 'Calm',
    threshold: 4,
    weights: [32, 26, 20, 14, 8],
    combo: [100, 150, 200, 300, 400, 500],
    pay: [9, 16, 28, 52, 105],
    sizeBonus: 0.45,
    payScale: 0.4472,
  },
  standard: {
    label: 'Standard',
    threshold: 4,
    weights: [33, 26, 20, 14, 7],
    combo: [100, 200, 300, 500, 800, 1200],
    pay: [7, 13, 24, 46, 98],
    sizeBonus: 0.45,
    payScale: 0.2929,
  },
  frenzy: {
    label: 'Frenzy',
    threshold: 5,
    weights: [34, 26, 19, 13, 8],
    combo: [100, 200, 400, 800, 1600, 3000],
    pay: [8, 15, 30, 62, 135],
    sizeBonus: 0.5,
    payScale: 0.7573,
  },
};

export function isCascadeVolatility(value: unknown): value is CascadeVolatility {
  return value === 'calm' || value === 'standard' || value === 'frenzy';
}

/** A single matching cluster found on the grid: its gem index + member cells. */
export interface CascadeCluster {
  sym: number;
  cells: Array<[number, number]>;
}

/**
 * One chain link (tumble) of the cascade — everything the client needs to
 * replay this frame, in the prototype's shape:
 *   • board    — the grid BEFORE this link's winners pop (row-major, gem index or null)
 *   • clusters — the paying clusters on that board
 *   • chain    — 1-based chain link index
 *   • comboX100 — combo multiplier ×100 applied to this link
 *   • winX100   — this link's win ×100 (base × combo / 100)
 *   • runningX100 — cumulative total ×100 after this link
 */
export interface CascadeStep {
  board: Array<Array<number | null>>;
  clusters: CascadeCluster[];
  chain: number;
  comboX100: number;
  winX100: number;
  runningX100: number;
}

/** Compact per-link summary persisted in the DB + surfaced in verify. */
export interface CascadeChainEntry {
  chain: number;
  comboX100: number;
  winX100: number;
}

export interface CascadeResult {
  /** Ordered replay sequence; empty when the drop fizzled (no cluster). */
  steps: CascadeStep[];
  /** The opening 6×6 board (so the client can render the initial fill before any pop). */
  initialBoard: Array<Array<number | null>>;
  /** The settled board after the last tumble (no clusters remain). */
  finalBoard: Array<Array<number | null>>;
  /** TOTAL round multiplier ×100 (sum of every chain link). */
  totalMultiplierX100: number;
  /** Number of paying chain links. */
  clusters: number;
  /** Compact chain summary for the DB / verify. */
  chainLog: CascadeChainEntry[];
}

type FloatStream = () => number;

/** Draw the next gem index from the weighted table using one stream float. */
function nextGem(rng: FloatStream, weights: number[], total: number): number {
  const r = rng() * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (r < acc) return i;
  }
  return weights.length - 1;
}

/** Cluster value ×100 — base pay grows with cluster size above threshold. */
function clusterPayX100(sym: number, size: number, v: CascadeVolatilityConfig): number {
  return Math.round(v.pay[sym] * (1 + v.sizeBonus * (size - v.threshold)) * v.payScale);
}

/** Flood-fill every connected same-gem region; keep those >= threshold. */
function findClusters(grid: Array<Array<number | null>>, threshold: number): CascadeCluster[] {
  const seen: boolean[][] = [];
  for (let r = 0; r < CASCADE_ROWS; r++) seen.push(new Array(CASCADE_COLS).fill(false));
  const out: CascadeCluster[] = [];
  for (let r = 0; r < CASCADE_ROWS; r++) {
    for (let c = 0; c < CASCADE_COLS; c++) {
      if (seen[r][c] || grid[r][c] == null) continue;
      const sym = grid[r][c];
      const stack: Array<[number, number]> = [[r, c]];
      const cells: Array<[number, number]> = [];
      seen[r][c] = true;
      while (stack.length) {
        const p = stack.pop() as [number, number];
        cells.push(p);
        const [pr, pc] = p;
        const nb: Array<[number, number]> = [
          [pr - 1, pc],
          [pr + 1, pc],
          [pr, pc - 1],
          [pr, pc + 1],
        ];
        for (let k = 0; k < 4; k++) {
          const [nr, nc] = nb[k];
          if (
            nr >= 0 &&
            nr < CASCADE_ROWS &&
            nc >= 0 &&
            nc < CASCADE_COLS &&
            !seen[nr][nc] &&
            grid[nr][nc] === sym
          ) {
            seen[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      if (cells.length >= threshold) out.push({ sym: sym as number, cells });
    }
  }
  return out;
}

function cloneGrid(g: Array<Array<number | null>>): Array<Array<number | null>> {
  return g.map((row) => row.slice());
}

/**
 * Resolve a full Cascade round from a provably-fair float stream.
 *
 * Faithful port of the prototype's resolveRound: fill the grid, then repeatedly
 * find clusters → pay (base × combo) → pop → gravity → refill, until no clusters
 * remain. Gem draws come from `floatStream` in this fixed order so verify
 * re-derives identically:
 *   1. opening fill: row 0..ROWS-1, col 0..COLS-1 (row-major)
 *   2. each tumble's refill: col 0..COLS-1, and within a column the empty slots
 *      from the BOTTOM up (rr2 = ROWS-1 .. 0), one draw per refilled empty slot.
 *
 * Returns the replay steps + the total multiplier ×100. Bet/payout integer math
 * lives in the route (BigInt money path).
 */
export function resolveCascade(
  volatility: CascadeVolatility,
  floatStream: FloatStream,
): CascadeResult {
  const v = CASCADE_VOLATILITIES[volatility];
  let total = 0;
  for (let i = 0; i < v.weights.length; i++) total += v.weights[i];

  // 1) Opening fill, row-major.
  const grid: Array<Array<number | null>> = [];
  for (let r = 0; r < CASCADE_ROWS; r++) {
    const row: Array<number | null> = [];
    for (let c = 0; c < CASCADE_COLS; c++) row.push(nextGem(floatStream, v.weights, total));
    grid.push(row);
  }
  const initialBoard = cloneGrid(grid);

  const steps: CascadeStep[] = [];
  const chainLog: CascadeChainEntry[] = [];
  let totalX100 = 0;
  let chain = 0;

  // 2) Chain reaction.
  for (;;) {
    const clusters = findClusters(grid, v.threshold);
    if (!clusters.length) break;
    chain++;
    const comboX100 = v.combo[Math.min(chain - 1, v.combo.length - 1)];
    let base = 0;
    for (const cl of clusters) base += clusterPayX100(cl.sym, cl.cells.length, v);
    const winX100 = Math.round((base * comboX100) / 100);
    totalX100 += winX100;

    steps.push({
      board: cloneGrid(grid),
      clusters: clusters.map((cl) => ({ sym: cl.sym, cells: cl.cells.map((p) => [p[0], p[1]] as [number, number]) })),
      chain,
      comboX100,
      winX100,
      runningX100: totalX100,
    });
    chainLog.push({ chain, comboX100, winX100 });

    // Clear winners.
    for (const cl of clusters) for (const p of cl.cells) grid[p[0]][p[1]] = null;

    // Gravity + refill, per column. Surviving gems fall to the bottom; empty
    // slots above refill from the stream (bottom-up draw order).
    for (let col = 0; col < CASCADE_COLS; col++) {
      const keep: Array<number | null> = [];
      for (let rr = CASCADE_ROWS - 1; rr >= 0; rr--) {
        if (grid[rr][col] != null) keep.push(grid[rr][col]);
      }
      let ki = 0;
      for (let rr2 = CASCADE_ROWS - 1; rr2 >= 0; rr2--) {
        if (ki < keep.length) {
          grid[rr2][col] = keep[ki++];
        } else {
          grid[rr2][col] = nextGem(floatStream, v.weights, total);
        }
      }
    }
  }

  return {
    steps,
    initialBoard,
    finalBoard: grid,
    totalMultiplierX100: totalX100,
    clusters: chain,
    chainLog,
  };
}

/** Payout in chips for a settled round — floor(bet × totalMultiplierX100 / 100). */
export function cascadePayout(bet: number, totalMultiplierX100: number): number {
  if (!Number.isInteger(bet) || bet < CASCADE_MIN_BET || bet > CASCADE_MAX_BET) {
    throw new Error('Cascade bet out of range');
  }
  if (!Number.isInteger(totalMultiplierX100) || totalMultiplierX100 < 0) {
    throw new Error('Cascade multiplier out of range');
  }
  return Math.floor((bet * totalMultiplierX100) / 100);
}
