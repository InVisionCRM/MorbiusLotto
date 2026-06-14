/**
 * crashOdds — odds-tab data for /crash. The bust point follows the survival
 * function P(reach x) = (1 − houseEdge) / x = 0.99 / x, so cashing out at a
 * higher multiplier is reached less often but pays more.
 *
 * Mirrors CRASH_HOUSE_EDGE_BP in server/src/services/arcade-crash.ts (100 bp = 1%).
 */

import type { GameOdds, OddsRow } from '@/components/arcade2/ArcadeOddsTab'

const EDGE_BP = 100
const TARGETS = [100, 50, 25, 10, 5, 3, 2, 1.5] // 1.01×–100× cashout range

const rows: OddsRow[] = TARGETS.map((x, i) => {
  const reachPct = (10_000 - EDGE_BP) / (x * 100) // = 99 / x
  return {
    outcome: `${x.toFixed(2)}×`,
    chance: `${reachPct.toFixed(2)}%`,
    bar: reachPct,
    tone: i < 2 ? 'amber' : x >= 3 ? 'cyan' : 'slate',
  }
})

export const crashOdds: GameOdds = {
  blurb:
    'Cash out before the rocket busts. The bust point is drawn so that P(reach x) = 0.99 ÷ x — every extra bit of multiplier is exponentially harder to reach, but pays proportionally more.',
  variants: [
    {
      id: 'crash',
      label: 'Standard',
      edgePct: EDGE_BP / 100,
      rtpPct: 100 - EDGE_BP / 100,
      rows,
      headers: ['Cashout', 'Reach chance'],
      note: 'Flat 1.00% edge: 99% of every bet is returned across all targets. Bust before your cashout and the bet is lost.',
    },
  ],
}
