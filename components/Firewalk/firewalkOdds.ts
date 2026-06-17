/**
 * firewalkOdds — odds-tab data for /firewalk, derived from the server constants:
 *
 *   P(safe step)  = safe / outcomes      (per heat)
 *   ladder[N]x100 = floor((10000 − edgeBp) · outcomes^N / (100 · safe^N))   (N ≥ 1)
 *   reach chance N = P(safe step)^N
 *   EV(cash at N)  = reach(N) · ladder[N] = (1 − edge)  →  FLAT edge at every rung
 *
 * Mirrors FIREWALK_HEATS, FIREWALK_STONES and FIREWALK_HOUSE_EDGE_BP (200 = 2%
 * → ~98% RTP) in server/src/services/arcade-firewalk.ts. The full ladder runs 14
 * stones; the table shows representative rungs so the climb stays legible.
 */

import type { GameOdds, OddsRow, OddsVariant } from '@/components/arcade2/ArcadeOddsTab';

const EDGE_BP = 200;
const HOUSE_NUM = 10_000 - EDGE_BP; // 9800
const STONES = 14;

/** Rungs to surface in the table — the full ladder is 14 stones deep. */
const SHOWN_STONES = [1, 2, 3, 5, 8, 11, 14];

const HEATS: { id: string; label: string; outcomes: number; safe: number }[] = [
  { id: 'low', label: 'Low', outcomes: 25, safe: 23 }, // 8% crumble
  { id: 'med', label: 'Med', outcomes: 100, safe: 83 }, // 17% crumble
  { id: 'high', label: 'High', outcomes: 10, safe: 7 }, // 30% crumble
];

/** Exact ×100 ladder rung after N crossed stones — matches firewalkMultiplierX100. */
function ladderX100(outcomes: number, safe: number, n: number): number {
  if (n === 0) return 100;
  const num = BigInt(HOUSE_NUM) * BigInt(outcomes) ** BigInt(n);
  const den = 100n * BigInt(safe) ** BigInt(n);
  return Math.max(101, Number(num / den));
}

function fmtPct(p: number): string {
  const pct = p * 100;
  return `${pct < 1 ? pct.toFixed(3) : pct.toFixed(2)}%`;
}

function buildVariant(h: (typeof HEATS)[number]): OddsVariant {
  const pSafe = h.safe / h.outcomes;
  const crumblePct = Math.round((1 - pSafe) * 100);
  const rows: OddsRow[] = SHOWN_STONES.map((n) => {
    const mult = ladderX100(h.outcomes, h.safe, n) / 100;
    return {
      outcome: `${n} stone${n === 1 ? '' : 's'}`,
      chance: `${mult.toFixed(2)}×`,
      extra: fmtPct(Math.pow(pSafe, n)),
      tone: n >= STONES - 1 ? 'amber' : mult >= 2 ? 'cyan' : 'slate',
    };
  });
  return {
    id: h.id,
    label: `${h.label} · ${crumblePct}%`,
    edgePct: EDGE_BP / 100,
    rtpPct: 100 - EDGE_BP / 100,
    rows,
    headers: ['Crossed', 'Pays', 'Reach chance'],
    note: `Each stone crumbles ${crumblePct}% of the time, so crossing it is a ${(pSafe * 100).toFixed(0)}% step. Cash out after any stone; clear all ${STONES} for the top ${(ladderX100(h.outcomes, h.safe, STONES) / 100).toFixed(2)}×. Pace (hop/leap/bound) only changes variance — the flat 2.00% edge is the same at every rung.`,
  };
}

export const firewalkOdds: GameOdds = {
  blurb:
    'Cross a row of stones over the coals — each stone you clear compounds your multiplier. Hotter heats crumble far more often per stone but pay a much steeper ladder. The 2% edge is applied once to the whole ladder, so it is flat no matter how far you go or which pace you take.',
  variants: HEATS.map(buildVariant),
};
