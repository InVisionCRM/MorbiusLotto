/**
 * cascadeOdds — odds-tab data for /cascade. Cascade is a cluster-pays chain
 * reaction, so there's no single payout table; instead each volatility is a
 * distribution with a known long-run RTP (tuned by server-side Monte-Carlo to
 * ≈ 97%). We surface, per mode, the win-frequency ("a chain ignited") and a
 * representative top multiplier so players can compare risk profiles. Mirrors
 * the RTP / hit-rate numbers reported by server/scripts/cascade-rtp-mc.ts and
 * the payScales in server/src/services/arcade-cascade.ts.
 */

import type { GameOdds } from '@/components/arcade2/ArcadeOddsTab'

// RTP ≈ 97% on every mode — see CASCADE_VOLATILITIES payScale tuning.
const RTP_PCT = 97

export const cascadeOdds: GameOdds = {
  blurb:
    'One drop fills a 6×6 grid; clusters of matching gems pop, the grid tumbles and refills, and a combo multiplier climbs with every chain link. There is no fixed paytable — each drop is a chain reaction whose payout is the sum of every link, times your bet. Volatility reshapes how often a chain ignites and how high the combo can climb, while keeping the same long-run return.',
  variants: [
    {
      id: 'calm',
      label: 'Calm',
      edgePct: 100 - RTP_PCT,
      rtpPct: RTP_PCT,
      headers: ['Outcome', 'Frequency'],
      rows: [
        { outcome: 'A chain ignites', chance: '≈ 90%', bar: 90, tone: 'cyan' },
        { outcome: 'No cluster (fizzle)', chance: '≈ 10%', bar: 10, tone: 'muted' },
        { outcome: 'Avg chain length', chance: '≈ 2.6 links', bar: 26, tone: 'slate' },
        { outcome: 'Top seen (1M drops)', chance: '≈ 35×', bar: 35, tone: 'amber' },
      ],
      note: 'Low volatility: clusters of 4+ ignite often with a gentle combo (×1 → ×5). Frequent small-to-medium wins.',
    },
    {
      id: 'standard',
      label: 'Standard',
      edgePct: 100 - RTP_PCT,
      rtpPct: RTP_PCT,
      headers: ['Outcome', 'Frequency'],
      rows: [
        { outcome: 'A chain ignites', chance: '≈ 91%', bar: 91, tone: 'cyan' },
        { outcome: 'No cluster (fizzle)', chance: '≈ 9%', bar: 9, tone: 'muted' },
        { outcome: 'Avg chain length', chance: '≈ 2.8 links', bar: 28, tone: 'slate' },
        { outcome: 'Top seen (1M drops)', chance: '≈ 45×', bar: 45, tone: 'amber' },
      ],
      note: 'Balanced: clusters of 4+ with a steeper combo (×1 → ×12). The middle ground between Calm and Frenzy.',
    },
    {
      id: 'frenzy',
      label: 'Frenzy',
      edgePct: 100 - RTP_PCT,
      rtpPct: RTP_PCT,
      headers: ['Outcome', 'Frequency'],
      rows: [
        { outcome: 'A chain ignites', chance: '≈ 72%', bar: 72, tone: 'cyan' },
        { outcome: 'No cluster (fizzle)', chance: '≈ 28%', bar: 28, tone: 'muted' },
        { outcome: 'Avg chain length', chance: '≈ 1.4 links', bar: 14, tone: 'slate' },
        { outcome: 'Top seen (1M drops)', chance: '≈ 185×', bar: 100, tone: 'amber' },
      ],
      note: 'High volatility: needs bigger clusters of 5+ so it fizzles more, but the combo can rocket (×1 → ×30) on a long chain — where the top wins live.',
    },
  ],
}
