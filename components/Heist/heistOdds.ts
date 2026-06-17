/**
 * heistOdds — odds-tab data for /heist, derived from the server step formula:
 *
 *   next_x100 = max(100, floor( prev_x100 · doors · (10000 − edgeBp) / (10000 · (doors − alarms)) ))
 *   clear chance to room r = ((doors − alarms) / doors)^r
 *
 * Mirrors HEIST_DIFFICULTIES and HEIST_HOUSE_EDGE_BP (200 = 2%) in
 * server/src/services/arcade-heist.ts.
 */

import type { GameOdds, OddsRow, OddsVariant } from '@/components/arcade2/ArcadeOddsTab'

const EDGE_BP = 200
const HOUSE_NUM = 10_000 - EDGE_BP // 9800

const DIFFICULTIES: { id: string; label: string; doors: number; alarms: number; rooms: number }[] = [
  { id: 'sneaky', label: 'Sneaky', doors: 4, alarms: 1, rooms: 8 },
  { id: 'standard', label: 'Standard', doors: 3, alarms: 1, rooms: 8 },
  { id: 'daring', label: 'Daring', doors: 3, alarms: 2, rooms: 6 },
]

function fmtPct(p: number): string {
  const pct = p * 100
  return `${pct < 1 ? pct.toFixed(3) : pct.toFixed(2)}%`
}

function buildVariant(d: (typeof DIFFICULTIES)[number]): OddsVariant {
  const safe = d.doors - d.alarms
  const pSafe = safe / d.doors
  let x100 = 100
  const rows: OddsRow[] = []
  for (let r = 1; r <= d.rooms; r++) {
    x100 = Math.max(100, Math.floor((x100 * d.doors * HOUSE_NUM) / (10_000 * safe)))
    const mult = x100 / 100
    rows.push({
      outcome: `Room ${r}`,
      chance: `${mult.toFixed(2)}×`,
      extra: fmtPct(Math.pow(pSafe, r)),
      tone: r >= d.rooms - 1 ? 'amber' : mult >= 2 ? 'cyan' : 'slate',
    })
  }
  return {
    id: d.id,
    label: `${d.label} · ${safe}/${d.doors}`,
    edgePct: EDGE_BP / 100,
    rtpPct: 100 - EDGE_BP / 100,
    rows,
    headers: ['Crack', 'Pays', 'Clear chance'],
    note: `Each room wires ${d.alarms} of ${d.doors} doors to the alarm, so each crack is a ${(pSafe * 100).toFixed(0)}% pick. Escape any room; clear all ${d.rooms} for the top multiplier. Flat 2.00% edge.`,
  }
}

export const heistOdds: GameOdds = {
  blurb:
    'Crack vault rooms one door at a time. More alarm doors (higher difficulty) means each crack pays far more but is reached less often.',
  variants: DIFFICULTIES.map(buildVariant),
}
