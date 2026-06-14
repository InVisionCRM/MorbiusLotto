/**
 * baccaratOdds — odds-tab data for /baccarat. The game deals a fresh single
 * 52-card deck each hand (see arcade-baccarat.ts header + the in-game note), so
 * these are SINGLE-DECK figures, not the usual 8-deck ones:
 *   • P(Banker/Player/Tie) — 12M-hand Monte-Carlo of the implemented punto-banco rules
 *   • P(pair)              — exact, 3/51 = 5.88%
 *   • edges                — derived from those vs the gross multipliers in the service
 *
 * NB: the code's BACC_HOUSE_EDGE_*_BP constants are standard 8-deck values and do
 * not match single-deck play — the Tie (≈15.8% vs 14.36%) and especially the
 * Pair bets (≈29.4% vs 10.36%) are materially worse than those constants imply.
 */

import type { GameOdds, OddsRow } from '@/components/arcade2/ArcadeOddsTab'

const rows: OddsRow[] = [
  { outcome: 'Banker · 1.95×', chance: '45.97%', extra: '1.00%', tone: 'cyan' },
  { outcome: 'Player · 2.00×', chance: '44.67%', extra: '1.30%', tone: 'cyan' },
  { outcome: 'Tie · 9.00×', chance: '9.36%', extra: '15.76%', tone: 'amber' },
  { outcome: 'Player pair · 12.00×', chance: '5.88%', extra: '29.41%', tone: 'amber' },
  { outcome: 'Banker pair · 12.00×', chance: '5.88%', extra: '29.41%', tone: 'amber' },
]

export const baccaratOdds: GameOdds = {
  blurb:
    'Bet on the Banker, the Player, or a Tie. Banker wins slightly more often, so it pays 0.95× (a 5% commission). Side bets on a starting pair pay 11:1 but carry a steep edge.',
  variants: [
    {
      id: 'baccarat',
      label: 'All bets',
      edgePct: 1.0,
      rtpPct: 99.0,
      rows,
      headers: ['Bet · pays', 'Win chance', 'Edge'],
      note: 'Edge varies sharply by bet — Banker is best (~1%); Tie and the Pair side bets are far worse. Figures are for the game’s single 52-card deck (a 12M-hand simulation; pairs exact at 3/51), so they differ from the usual 8-deck numbers.',
    },
  ],
}
