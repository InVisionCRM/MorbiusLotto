/**
 * plinkoOdds — odds-tab data for /plinko2, derived (not hand-copied) from the
 * contract multiplier tables in PLINKO_CONSTANTS so it can never drift from what
 * the game actually pays.
 *
 * A 16-row board is a binomial walk: bucket k is reached with probability
 * C(16,k) / 2^16. We group buckets that share a multiplier, sum their weight,
 * and compute house edge / RTP straight from sum(p·multiplier).
 */

import PLINKO_CONSTANTS from '@/lib/plinko-constants'
import type { GameOdds, OddsRow, OddsVariant } from '@/components/arcade2/ArcadeOddsTab'

const ROWS = 16
const TOTAL = 2 ** ROWS // 65536 equally-likely peg paths

function binom(n: number, k: number): number {
  let c = 1
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1)
  return Math.round(c)
}

const WEIGHTS = Array.from({ length: ROWS + 1 }, (_, k) => binom(ROWS, k))

function fmtPct(p: number): string {
  const pct = p * 100
  return `${pct < 1 ? pct.toFixed(3) : pct.toFixed(2)}%`
}

function buildVariant(id: string, label: string, mult: number[]): OddsVariant {
  const weightByMult = new Map<number, number>()
  let rtp = 0
  mult.forEach((m, k) => {
    rtp += (WEIGHTS[k] / TOTAL) * m
    weightByMult.set(m, (weightByMult.get(m) ?? 0) + WEIGHTS[k])
  })

  const rows: OddsRow[] = [...weightByMult.entries()]
    .sort((a, b) => b[0] - a[0]) // biggest payout on top
    .map(([m, weight], i) => {
      const p = weight / TOTAL
      const tone: OddsRow['tone'] = i < 2 ? 'amber' : m >= 1.5 ? 'cyan' : m >= 1 ? 'slate' : 'muted'
      return { outcome: `${m}×`, chance: fmtPct(p), bar: p, tone }
    })

  return { id, label, edgePct: (1 - rtp) * 100, rtpPct: rtp * 100, rows }
}

const M = PLINKO_CONSTANTS.MULTIPLIERS

export const plinkoOdds: GameOdds = {
  blurb:
    'A ball falls through 16 rows of pegs into one of 17 buckets. The outer buckets pay the most but are the hardest to reach; the center is the most likely and pays the least. Raising the risk widens both extremes.',
  variants: [
    buildVariant('low', 'Low', M.GREEN),
    buildVariant('medium', 'Medium', M.YELLOW),
    buildVariant('high', 'High', M.RED),
  ],
}
