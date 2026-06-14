/**
 * videoPokerOdds — odds-tab data for /video-poker. Pay table is the 9/6 Jacks or
 * Better table from server/src/services/video-poker.ts (pays are total return
 * "for 1" — the bet is taken up front, so Jacks-or-Better at 1× is a push).
 *
 * Hand frequencies are the standard published optimal-strategy figures for 9/6
 * JoB (~99.54% return) — the repo has no strategy engine, so these come from
 * game math, not a code constant.
 */

import type { GameOdds, OddsRow } from '@/components/arcade2/ArcadeOddsTab'

const HANDS: { name: string; pay: number; freq: number; tone: OddsRow['tone'] }[] = [
  { name: 'Royal flush', pay: 800, freq: 0.0000247, tone: 'amber' },
  { name: 'Straight flush', pay: 50, freq: 0.0001109, tone: 'amber' },
  { name: 'Four of a kind', pay: 25, freq: 0.0023625, tone: 'amber' },
  { name: 'Full house', pay: 9, freq: 0.0115124, tone: 'cyan' },
  { name: 'Flush', pay: 6, freq: 0.0110235, tone: 'cyan' },
  { name: 'Straight', pay: 4, freq: 0.0112294, tone: 'cyan' },
  { name: 'Three of a kind', pay: 3, freq: 0.0744495, tone: 'cyan' },
  { name: 'Two pair', pay: 2, freq: 0.1292517, tone: 'slate' },
  { name: 'Jacks or better', pay: 1, freq: 0.2145862, tone: 'slate' },
  { name: 'No win', pay: 0, freq: 0.5454447, tone: 'muted' },
]

const rows: OddsRow[] = HANDS.map((h) => ({
  outcome: h.name,
  chance: h.pay > 0 ? `${h.pay}×` : '—',
  extra: `${(h.freq * 100).toFixed(h.freq < 0.001 ? 4 : 2)}%`,
  tone: h.tone,
}))

export const videoPokerOdds: GameOdds = {
  blurb:
    'You’re dealt five cards, hold any, and draw once. A pair of Jacks or better returns your stake; stronger hands pay more, up to 800× for a royal flush.',
  variants: [
    {
      id: 'jacksorbetter',
      label: '9/6 Jacks or Better',
      edgePct: 0.46,
      rtpPct: 99.54,
      rows,
      headers: ['Hand', 'Pays', 'Frequency'],
      note: 'Pays are total return per 1 staked, so Jacks-or-Better (1×) is a push. Frequencies assume optimal strategy (~99.54% return) and are standard published figures.',
    },
  ],
}
