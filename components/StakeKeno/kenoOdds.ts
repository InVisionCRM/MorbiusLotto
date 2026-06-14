/**
 * kenoOdds — odds-tab data for /keno2. 40 tiles, 10 drawn, pick up to 10. The
 * hit distribution is hypergeometric: P(k hits) = C(10,k)·C(30,10−k)/C(40,10)
 * for a 10-spot ticket. Edge/RTP are computed from that against each mode's
 * paytable, so the numbers match server/src/services/keno.ts exactly.
 *
 * Shown for a 10-spot ticket (the headline 100×/1000× tickets); other pick
 * counts use their own paytables. The OLD 80/20 tables in lib/keno-constants.ts
 * and components/CryptoKeno/keno-logic.md are a different, retired game — unused.
 */

import type { GameOdds, OddsRow, OddsVariant } from '@/components/arcade2/ArcadeOddsTab'

const TILES = 40
const DRAW = 10
const SPOTS = 10

// 10-spot paytables (× bet) keyed by hits 0..10 — verbatim from keno.ts.
const TABLES: { id: string; label: string; pay: number[] }[] = [
  { id: 'classic', label: 'Classic', pay: [0, 0, 0, 1.4, 2.25, 4.5, 8, 17, 50, 80, 100] },
  { id: 'low', label: 'Low', pay: [0, 0, 1.1, 1.2, 1.3, 1.8, 3.5, 13, 50, 250, 1000] },
  { id: 'medium', label: 'Medium', pay: [0, 0, 0, 1.6, 2, 4, 7, 26, 100, 500, 1000] },
  { id: 'high', label: 'High', pay: [0, 0, 0, 0, 3.5, 8, 13, 63, 500, 800, 1000] },
]

function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  k = Math.min(k, n - k)
  let c = 1
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1)
  return c
}

const DENOM = comb(TILES, DRAW)
const PROBS = Array.from({ length: SPOTS + 1 }, (_, k) => (comb(SPOTS, k) * comb(TILES - SPOTS, DRAW - k)) / DENOM)

function fmtMult(m: number): string {
  return `${Number.isInteger(m) ? m : m.toFixed(2)}×`
}

function fmtPct(p: number): string {
  const pct = p * 100
  if (pct === 0) return '0%'
  if (pct < 0.001) return '<0.001%'
  if (pct < 0.01) return `${pct.toFixed(4)}%`
  return pct < 1 ? `${pct.toFixed(3)}%` : `${pct.toFixed(2)}%`
}

function buildVariant(t: (typeof TABLES)[number]): OddsVariant {
  let rtp = 0
  let losePct = 0
  for (let k = 0; k <= SPOTS; k++) {
    rtp += PROBS[k] * t.pay[k]
    if (t.pay[k] === 0) losePct += PROBS[k]
  }
  const rows: OddsRow[] = []
  for (let k = SPOTS; k >= 0; k--) {
    if (t.pay[k] > 0) {
      rows.push({
        outcome: `${k} / 10`,
        chance: fmtMult(t.pay[k]),
        extra: fmtPct(PROBS[k]),
        tone: t.pay[k] >= 100 ? 'amber' : t.pay[k] >= 5 ? 'cyan' : 'slate',
      })
    }
  }
  return {
    id: t.id,
    label: t.label,
    edgePct: (1 - rtp) * 100,
    rtpPct: rtp * 100,
    rows,
    headers: ['Hits', 'Pays', 'Chance'],
    note: `Shown for a 10-spot ticket; fewer than the lowest paying hits returns nothing (${(losePct * 100).toFixed(1)}% of tickets). Picking 1–9 tiles uses that mode's own, gentler paytable.`,
  }
}

export const kenoOdds: GameOdds = {
  blurb:
    'Pick up to 10 of 40 tiles; the server draws 10. The more of your picks it hits, the more you win. Higher risk modes pay enormous multipliers for many hits but nothing for few.',
  variants: TABLES.map(buildVariant),
}
