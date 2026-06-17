/**
 * pachinkoOdds — odds-tab data for /pachinko. One variant per risk level; each
 * row is a distinct pocket multiplier with its hit chance (summing symmetric
 * pockets, since the table is mirror-symmetric about the center jackpot).
 *
 * Mirrors PACHINKO_RISKS in server/src/services/arcade-pachinko.ts. RTP is the
 * weighted mean of multX100 (≈96% per risk, verified by Monte-Carlo). The exact
 * tables are also served by /api/arcade/pachinko/info, but this static copy keeps
 * the Odds tab readable without a network call.
 */

import type { GameOdds, OddsRow, OddsVariant } from '@/components/arcade2/ArcadeOddsTab'

interface RiskTable {
  multX100: number[]
  weights: number[]
}

// Verbatim from the server tables.
const TABLES: Record<'low' | 'medium' | 'high', RiskTable> = {
  low: { multX100: [149, 108, 76, 46, 505, 46, 76, 108, 149], weights: [4, 9, 14, 17, 4, 17, 14, 9, 4] },
  medium: { multX100: [200, 120, 60, 30, 1300, 30, 60, 120, 200], weights: [3, 8, 14, 18, 2, 18, 14, 8, 3] },
  high: { multX100: [405, 150, 38, 15, 3000, 15, 38, 150, 405], weights: [2, 6, 12, 21, 1, 21, 12, 6, 2] },
}

const CENTER = 4

/** RTP % = Σ (w_i/total) × (m_i/100) × 100. */
function rtpPct(t: RiskTable): number {
  const total = t.weights.reduce((a, b) => a + b, 0)
  let e = 0
  for (let i = 0; i < t.multX100.length; i++) e += (t.weights[i] / total) * (t.multX100[i] / 100)
  return e * 100
}

/** Collapse mirror-symmetric pockets into distinct multiplier rows, high → low. */
function rowsFor(t: RiskTable): OddsRow[] {
  const total = t.weights.reduce((a, b) => a + b, 0)
  const byMult = new Map<number, number>() // multX100 → summed weight
  for (let i = 0; i < t.multX100.length; i++) {
    byMult.set(t.multX100[i], (byMult.get(t.multX100[i]) ?? 0) + t.weights[i])
  }
  return Array.from(byMult.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([m, w]) => {
      const chance = (w / total) * 100
      const isJackpot = m === t.multX100[CENTER]
      return {
        outcome: `${(m / 100).toFixed(2)}×`,
        chance: `${chance.toFixed(2)}%`,
        extra: isJackpot ? 'Jackpot gate' : m / 100 > 1 ? 'win' : 'loss',
        tone: isJackpot ? 'amber' : m / 100 >= 1 ? 'cyan' : 'muted',
      } as OddsRow
    })
}

function variant(id: 'low' | 'medium' | 'high', label: string): OddsVariant {
  const t = TABLES[id]
  const rtp = rtpPct(t)
  return {
    id,
    label,
    edgePct: 100 - rtp,
    rtpPct: rtp,
    rows: rowsFor(t),
    headers: ['Pocket pays', 'Hit chance', 'Result'],
    note: 'Pockets are mirror-symmetric about the center gate; equal-paying pockets are summed here. The bounce only reveals which pocket the seed already chose.',
  }
}

export const pachinkoOdds: GameOdds = {
  blurb:
    'The ball drops through the pins into one of nine pockets, drawn from a weighted table. Outer pockets pay the most, the near-center pockets least, and the rare center gate is the jackpot. Risk level reshapes the pocket payouts — the long-run return stays ~96% on every level, only the swings change.',
  variants: [variant('low', 'Low'), variant('medium', 'Med'), variant('high', 'High')],
}
