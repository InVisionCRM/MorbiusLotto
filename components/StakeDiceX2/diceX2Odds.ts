/**
 * diceX2Odds — odds-tab data for /dicex2. Dice x2 is a pure formula game: the
 * multiplier is fixed by your band *width* (= win chance), with a flat house
 * edge, so we compute a representative ladder straight from the server formula.
 *
 * multiplierX100 = floor((10000 − EDGE_BP) × 100 / widthX100), where
 * widthX100 = winChance% × 100. Mirrors DICEX2_HOUSE_EDGE_BP in
 * server/src/services/arcade-dicex2.ts (100 bp = 1% edge → 99% RTP at every width).
 * The band's *position* doesn't change the odds — only how wide it is.
 */

import type { GameOdds, OddsRow } from '@/components/arcade2/ArcadeOddsTab'

const EDGE_BP = 100 // mirrors server DICEX2_HOUSE_EDGE_BP
const WIN_CHANCES = [95, 75, 50, 25, 10, 5, 2] // % — a representative spread

function multX100(winPct: number): number {
  const widthX100 = winPct * 100
  return Math.floor(((10_000 - EDGE_BP) * 100) / widthX100)
}

const rows: OddsRow[] = WIN_CHANCES.map((win) => ({ win, mult: multX100(win) / 100 }))
  .sort((a, b) => b.mult - a.mult)
  .map(({ win, mult }, i) => ({
    outcome: `${mult.toFixed(2)}×`,
    chance: `${win.toFixed(2)}%`,
    bar: win / 100,
    tone: i < 2 ? 'amber' : mult >= 1.5 ? 'cyan' : mult >= 1 ? 'slate' : 'muted',
  }))

export const diceX2Odds: GameOdds = {
  blurb:
    'Pick a band on the 0.00–99.99 scale; the server rolls a number and you win when it lands inside your band. Your multiplier is fixed by how wide the band is — payout = (100 − 1% house edge) ÷ win chance — so a wide band wins often for little, a narrow band rarely for a lot. Sliding the band left or right doesn’t change the odds, only its width does.',
  variants: [
    {
      id: 'dicex2',
      label: 'Standard',
      edgePct: EDGE_BP / 100,
      rtpPct: 100 - EDGE_BP / 100,
      rows,
      headers: ['Payout', 'Win chance'],
      note: 'House edge is a flat 1.00% at every band width — only your risk-to-reward balance changes.',
    },
  ],
}
