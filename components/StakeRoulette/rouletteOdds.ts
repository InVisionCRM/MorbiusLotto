/**
 * rouletteOdds — odds-tab data for /roulette2. European single-zero wheel:
 * 37 pockets (0–36), one green zero. Payouts are gross (stake included) from
 * roulettePayoutMultiplier in server/src/services/arcade-roulette.ts. Every bet
 * pays true-pocket odds as if the zero weren't there, so the house edge is a
 * uniform 1/37 = 2.70% on all of them (a structural edge — no code constant).
 */

import type { GameOdds, OddsRow } from '@/components/arcade2/ArcadeOddsTab'

const POCKETS = 37
const EDGE_PCT = (1 / POCKETS) * 100 // 2.7027… %

interface Bet {
  name: string
  mult: number
  covers: number
  tone: OddsRow['tone']
}

const BETS: Bet[] = [
  { name: 'Straight', mult: 36, covers: 1, tone: 'amber' },
  { name: 'Split', mult: 18, covers: 2, tone: 'amber' },
  { name: 'Street', mult: 12, covers: 3, tone: 'cyan' },
  { name: 'Corner', mult: 9, covers: 4, tone: 'cyan' },
  { name: 'Six line', mult: 6, covers: 6, tone: 'cyan' },
  { name: 'Dozen / Column', mult: 3, covers: 12, tone: 'slate' },
  { name: 'Red/Black · Odd/Even · 1-18/19-36', mult: 2, covers: 18, tone: 'slate' },
]

const rows: OddsRow[] = BETS.map((b) => ({
  outcome: `${b.name} · ${b.mult}×`,
  chance: `${((b.covers / POCKETS) * 100).toFixed(2)}%`,
  extra: `${EDGE_PCT.toFixed(2)}%`,
  tone: b.tone,
}))

export const rouletteOdds: GameOdds = {
  blurb:
    'A European single-zero wheel — 37 pockets (0–36). The lone green zero is the whole house edge: every bet pays as if it weren’t there, leaving a flat 2.70% edge on all of them.',
  variants: [
    {
      id: 'roulette',
      label: 'All bets',
      edgePct: EDGE_PCT,
      rtpPct: 100 - EDGE_PCT,
      rows,
      headers: ['Bet · pays', 'Win chance', 'Edge'],
      note: 'Multipliers are gross (stake included): a 36× straight returns 36 chips for 1 — i.e. 35:1 profit. Zero loses every bet except a straight bet on 0.',
    },
  ],
}
