/**
 * minesOdds — odds-tab data for /mines2, derived from the server multiplier
 * formula so it can't drift. With M mines on a 25-tile grid, after k safe picks:
 *
 *   reach chance  P(k) = C(25−M, k) / C(25, k) = Π_{i<k} (25−M−i)/(25−i)
 *   multiplier    = max(1.00, floor( (1−edge) · Π_{i<k} (25−i)/(25−M−i) · 100 ) / 100)
 *
 * Mirrors MINES_TOTAL_CELLS (25) and MINES_HOUSE_EDGE_BP (100 = 1%) in
 * server/src/services/arcade-mines.ts. Edge is a flat 1% for every (mines, k).
 */

import type { GameOdds, OddsRow, OddsVariant } from '@/components/arcade2/ArcadeOddsTab'

const CELLS = 25
const EDGE_BP = 100
const HOUSE = 1 - EDGE_BP / 10_000 // 0.99

function reachChance(mines: number, k: number): number {
  let p = 1
  for (let i = 0; i < k; i++) p *= (CELLS - mines - i) / (CELLS - i)
  return p
}

function multiplierX100(mines: number, k: number): number {
  let m = HOUSE
  for (let i = 0; i < k; i++) m *= (CELLS - i) / (CELLS - mines - i)
  return Math.max(100, Math.floor(m * 100))
}

function fmtPct(p: number): string {
  const pct = p * 100
  if (pct === 0) return '0%'
  if (pct < 0.001) return '<0.001%'
  if (pct < 1) return `${pct.toFixed(3)}%`
  return `${pct.toFixed(2)}%`
}

function fmtMult(m: number): string {
  if (m >= 1e6) return `${(m / 1e6).toFixed(2)}M×`
  if (m >= 1e3) return `${Math.round(m).toLocaleString()}×`
  return `${m.toFixed(2)}×`
}

function buildVariant(mines: number): OddsVariant {
  const maxSafe = CELLS - mines
  const steps = [...new Set([1, 2, 3, 5, maxSafe])].filter((k) => k >= 1 && k <= maxSafe).sort((a, b) => a - b)
  const rows: OddsRow[] = steps.map((k) => {
    const mult = multiplierX100(mines, k) / 100
    return {
      outcome: `${k} gem${k === 1 ? '' : 's'}`,
      chance: fmtMult(mult),
      extra: fmtPct(reachChance(mines, k)),
      tone: mult >= 10 ? 'amber' : mult >= 2 ? 'cyan' : 'slate',
    }
  })
  return {
    id: `m${mines}`,
    label: `${mines} mine${mines === 1 ? '' : 's'}`,
    edgePct: EDGE_BP / 100,
    rtpPct: 100 - EDGE_BP / 100,
    rows,
    headers: ['Safe picks', 'Pays', 'Reach chance'],
    note: 'Each safe pick compounds your multiplier; cash out any time. Hit a mine and the round is lost. "Reach chance" is the odds of getting that many safe picks in a row.',
  }
}

export const minesOdds: GameOdds = {
  blurb:
    'Reveal tiles on a 5×5 grid without hitting a mine. The more mines you brave and the more gems you uncover, the higher your multiplier climbs — but the odds of surviving each pick fall.',
  variants: [1, 3, 5, 10, 24].map(buildVariant),
}
