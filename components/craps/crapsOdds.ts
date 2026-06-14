/**
 * crapsOdds — odds-tab data for /craps. Payouts are exactly the bets this table
 * implements (server/src/services/arcade-craps.ts + CrapsRulesModal.PAYOUTS):
 * Pass / Don't Pass, Field, Place 4-10, Any 7, Any craps. There is NO edge
 * constant in the code, so the per-bet house edges are standard craps math
 * (the two-dice sum distribution), keyed to these exact payouts.
 */

import type { GameOdds, OddsRow } from '@/components/arcade2/ArcadeOddsTab'

const rows: OddsRow[] = [
  { outcome: 'Pass line', chance: '1 : 1', extra: '1.41%', tone: 'cyan' },
  { outcome: "Don't pass", chance: '1 : 1', extra: '1.36%', tone: 'cyan' },
  { outcome: 'Field', chance: '1 : 1 / 2 : 1', extra: '5.56%', tone: 'slate' },
  { outcome: 'Place 6 / 8', chance: '7 : 6', extra: '1.52%', tone: 'cyan' },
  { outcome: 'Place 5 / 9', chance: '7 : 5', extra: '4.00%', tone: 'slate' },
  { outcome: 'Place 4 / 10', chance: '9 : 5', extra: '6.67%', tone: 'slate' },
  { outcome: 'Any seven', chance: '4 : 1', extra: '16.67%', tone: 'amber' },
  { outcome: 'Any craps', chance: '7 : 1', extra: '11.11%', tone: 'amber' },
]

export const crapsOdds: GameOdds = {
  blurb:
    'Back the line and chase your point, or scatter chips on place and one-roll bets. The line bets give the house the slimmest edge; the flashy one-roll props give it the most.',
  variants: [
    {
      id: 'craps',
      label: 'All bets',
      edgePct: 1.41,
      rtpPct: 98.59,
      rows,
      headers: ['Bet', 'Pays', 'House edge'],
      note: 'Edge varies sharply by bet: Pass / Don’t Pass (~1.4%) are the smartest; the Field (2:1 on the 2 and 12, 1:1 otherwise) is 5.56%, and Any 7 / Any craps are sucker bets. Standard craps math for the bets this table offers.',
    },
  ],
}
