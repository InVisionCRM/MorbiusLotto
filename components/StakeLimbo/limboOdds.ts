/**
 * limboOdds — odds-tab data for /limbo2. Limbo is a formula game: you pick a
 * target and the payout IS that target, won whenever the random multiplier lands
 * at or above it. Win probability and edge come straight from the server math.
 *
 * P(win) = (10000 − LIMBO_HOUSE_EDGE_BP) / targetX100 = 99 / target.
 * Mirrors LIMBO_HOUSE_EDGE_BP in server/src/services/arcade-limbo.ts (100 bp = 1%).
 */

import type { GameOdds, OddsRow } from '@/components/arcade2/ArcadeOddsTab'

const EDGE_BP = 100
const TARGETS = [100, 50, 25, 10, 5, 3, 2, 1.5] // a representative spread (1.01×–100×)

const rows: OddsRow[] = TARGETS.map((t, i) => {
  const winPct = (10_000 - EDGE_BP) / (t * 100) // = 99 / t
  return {
    outcome: `${t.toFixed(2)}×`,
    chance: `${winPct.toFixed(2)}%`,
    bar: winPct,
    tone: i < 2 ? 'amber' : t >= 3 ? 'cyan' : 'slate',
  }
})

export const limboOdds: GameOdds = {
  blurb:
    'Pick a target from 1.01× to 100×. A random multiplier is rolled; you win — and are paid your full target — whenever it lands at or above your pick. The bigger your target, the rarer the win.',
  variants: [
    {
      id: 'limbo',
      label: 'Standard',
      edgePct: EDGE_BP / 100,
      rtpPct: 100 - EDGE_BP / 100,
      rows,
      headers: ['Target', 'Win chance'],
      note: 'House edge is a flat 1.00% at every target — only your risk-to-reward balance changes.',
    },
  ],
}
