/**
 * diceOdds — odds-tab data for /dice2. Dice is a pure formula game: the
 * multiplier is fixed by your chosen win chance, with a flat house edge, so we
 * compute a representative ladder straight from the server's own formula.
 *
 * multiplierX100 = floor((10000 − EDGE_BP) × 100 / targetX100), where
 * targetX100 = winChance% × 100. Mirrors DICE_HOUSE_EDGE_BP in
 * server/src/services/arcade-dice.ts (100 bp = 1% edge → 99% RTP at every target).
 */

import type { GameOdds, OddsRow } from '@/components/arcade2/ArcadeOddsTab'

const EDGE_BP = 100 // mirrors server DICE_HOUSE_EDGE_BP
const WIN_CHANCES = [95, 75, 50, 25, 10, 5, 2] // % — a representative spread

function multX100(winPct: number): number {
  const targetX100 = winPct * 100
  return Math.floor(((10_000 - EDGE_BP) * 100) / targetX100)
}

const rows: OddsRow[] = WIN_CHANCES.map((win) => ({ win, mult: multX100(win) / 100 }))
  .sort((a, b) => b.mult - a.mult)
  .map(({ win, mult }, i) => ({
    outcome: `${mult.toFixed(2)}×`,
    chance: `${win.toFixed(2)}%`,
    bar: win / 100,
    tone: i < 2 ? 'amber' : mult >= 1.5 ? 'cyan' : mult >= 1 ? 'slate' : 'muted',
  }))

export const diceOdds: GameOdds = {
  blurb:
    'Pick a target; the server rolls 0.00–99.99 and you win when the roll lands under it. Your multiplier is fixed by your odds — payout = (100 − 1% house edge) ÷ win chance — so safer bets pay less and longshots pay more.',
  variants: [
    {
      id: 'dice',
      label: 'Standard',
      edgePct: EDGE_BP / 100,
      rtpPct: 100 - EDGE_BP / 100,
      rows,
      headers: ['Payout', 'Win chance'],
      note: 'House edge is a flat 1.00% at every target — only your risk-to-reward balance changes.',
    },
  ],
}
