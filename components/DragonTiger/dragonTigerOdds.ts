/**
 * dragonTigerOdds — odds-tab data for /dragon-tiger.
 *
 * Single-deck Dragon Tiger with the standard "Dragon/Tiger lose half on a tie"
 * rule. With 52 cards, the chance the two cards tie is 3/51 ≈ 5.88%, so each
 * side wins the remaining (1 − 5.88%) / 2 ≈ 47.06% of the time, loses the same,
 * and pushes-half on the ~5.88% tie. That gives:
 *   • Dragon/Tiger (1:1, half-loss on tie) → house edge ≈ 2.94%
 *   • Tie (11:1)                            → house edge ≈ 29.41%
 * Mirrors DT_HOUSE_EDGE_*_BP in server/src/services/arcade-dragon-tiger.ts.
 */

import type { GameOdds } from '@/components/arcade2/ArcadeOddsTab'

export const dragonTigerOdds: GameOdds = {
  blurb:
    'One card each: Dragon vs Tiger, higher rank wins (Ace is low, suits don’t matter). Bet a side for even money, or the Tie for 11:1. When the two cards match it’s a Tie — the Tie bet pays, and Dragon/Tiger bets give back half their stake.',
  variants: [
    {
      id: 'dragon-tiger',
      label: 'Standard',
      edgePct: 2.94,
      rtpPct: 97.06,
      rows: [
        { outcome: 'Dragon', chance: '1:1', extra: '47.06%', tone: 'cyan' },
        { outcome: 'Tiger', chance: '1:1', extra: '47.06%', tone: 'cyan' },
        { outcome: 'Tie', chance: '11:1', extra: '5.88%', tone: 'amber' },
      ],
      headers: ['Bet', 'Pays', 'Win chance'],
      note: 'Dragon/Tiger edge ≈ 2.94% (they lose only half on a tie). The Tie bet pays 11:1 but carries a ≈ 29.41% edge — fun, not value.',
    },
  ],
}
