/**
 * towersOdds — odds-tab data for /towers, derived from the server step formula:
 *
 *   next_x100 = max(100, floor( prev_x100 · tiles · (10000 − edgeBp) / (10000 · (tiles − bombs)) ))
 *   clear chance to floor f = ((tiles − bombs) / tiles)^f
 *
 * Mirrors TOWERS_DIFFICULTIES and TOWERS_HOUSE_EDGE_BP (100 = 1%) in
 * server/src/services/arcade-towers.ts. Every floor hides exactly one bomb.
 */

import type { GameOdds, OddsRow, OddsVariant } from '@/components/arcade2/ArcadeOddsTab'

const FLOORS = 8
const EDGE_BP = 100
const HOUSE_NUM = 10_000 - EDGE_BP // 9900

const DIFFICULTIES: { id: string; label: string; tiles: number; bombs: number }[] = [
  { id: 'easy', label: 'Easy', tiles: 4, bombs: 1 },
  { id: 'medium', label: 'Medium', tiles: 3, bombs: 1 },
  { id: 'hard', label: 'Hard', tiles: 2, bombs: 1 },
]

function fmtPct(p: number): string {
  const pct = p * 100
  return `${pct < 1 ? pct.toFixed(3) : pct.toFixed(2)}%`
}

function buildVariant(d: (typeof DIFFICULTIES)[number]): OddsVariant {
  const safe = d.tiles - d.bombs
  const pSafe = safe / d.tiles
  let x100 = 100
  const rows: OddsRow[] = []
  for (let f = 1; f <= FLOORS; f++) {
    x100 = Math.max(100, Math.floor((x100 * d.tiles * HOUSE_NUM) / (10_000 * safe)))
    const mult = x100 / 100
    rows.push({
      outcome: `Floor ${f}`,
      chance: `${mult.toFixed(2)}×`,
      extra: fmtPct(Math.pow(pSafe, f)),
      tone: f >= FLOORS - 1 ? 'amber' : mult >= 2 ? 'cyan' : 'slate',
    })
  }
  return {
    id: d.id,
    label: `${d.label} · ${d.tiles - d.bombs}/${d.tiles}`,
    edgePct: EDGE_BP / 100,
    rtpPct: 100 - EDGE_BP / 100,
    rows,
    headers: ['Climb', 'Pays', 'Clear chance'],
    note: `Each floor hides 1 bomb among ${d.tiles} tiles, so each step is a ${(pSafe * 100).toFixed(0)}% pick. Cash out any floor; clear all ${FLOORS} for the top multiplier. Flat 1.00% edge.`,
  }
}

export const towersOdds: GameOdds = {
  blurb:
    'Climb an 8-floor tower, picking a safe tile on each floor. Fewer safe tiles (higher difficulty) means each step pays more but is reached less often.',
  variants: DIFFICULTIES.map(buildVariant),
}
