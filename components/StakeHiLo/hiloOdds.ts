/**
 * hiloOdds — odds-tab data for /hilo. The step multiplier depends on the current
 * card's rank, so the natural odds view is "for each starting card, what does the
 * next correct pick pay, and how likely is it?"
 *
 *   P(higher-or-same | rank c) = (14 − c) / 13   (ties pay as higher)
 *   P(lower         | rank c) = (c − 1) / 13
 *   step multiplier from base = max(1.00, floor(100 · 13 · 9900 / (10000 · denom)) / 100)
 *                             = max(1.00, floor(1287 / denom) / 100)
 *
 * Mirrors HILO_DECK_SIZE (52) and HILO_HOUSE_EDGE_BP (100 = 1%) in
 * server/src/services/arcade-hilo.ts.
 */

import type { GameOdds, OddsRow, OddsVariant } from '@/components/arcade2/ArcadeOddsTab'

const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

function stepMultiplier(denom: number): number {
  // base 100 → floor(100 * 13 * 9900 / (10000 * denom)) = floor(1287 / denom)
  return Math.max(100, Math.floor(1287 / denom)) / 100
}

function row(rankIndex: number, denom: number): OddsRow {
  const winPct = (denom / 13) * 100
  const mult = stepMultiplier(denom)
  return {
    outcome: RANK_LABELS[rankIndex],
    chance: `${mult.toFixed(2)}×`,
    extra: `${winPct.toFixed(2)}%`,
    tone: mult >= 6 ? 'amber' : mult >= 2 ? 'cyan' : 'slate',
  }
}

const higherRows: OddsRow[] = RANK_LABELS.map((_, i) => {
  const c = i + 1 // rank 1..13
  return row(i, 14 - c) // denom for higher-or-same
})

const lowerRows: OddsRow[] = RANK_LABELS.map((_, i) => i + 1)
  .filter((c) => c - 1 > 0) // lower is impossible from an Ace
  .map((c) => row(c - 1, c - 1)) // denom for lower

function variant(id: string, label: string, rows: OddsRow[]): OddsVariant {
  return {
    id,
    label,
    edgePct: 1,
    rtpPct: 99,
    rows,
    headers: ['From card', 'Next pays', 'Win chance'],
    note: 'Shown is the multiplier for one correct pick from each card; it compounds every round you keep going. Ties count as higher. Lower is impossible from an Ace.',
  }
}

export const hiloOdds: GameOdds = {
  blurb:
    'Guess whether the next card is higher (or the same) or lower than the current one. Rarer calls pay more: each correct pick multiplies by the inverse of its odds, minus a flat 1% edge.',
  variants: [variant('higher', 'Higher / same', higherRows), variant('lower', 'Lower', lowerRows)],
}
