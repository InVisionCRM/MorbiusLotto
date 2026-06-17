/**
 * threeCardOdds — odds-tab data for /three-card-poker. Two paytables, exactly as
 * the lab posts them: the Pair Plus side bet (pays on your own hand) and the
 * Ante bonus (premium hands, regardless of the dealer). House edges mirror
 * server/src/services/arcade-three-card-poker.ts.
 */

import type { GameOdds } from '@/components/arcade2/ArcadeOddsTab';

export const threeCardOdds: GameOdds = {
  blurb:
    'You and the dealer each get three cards; the dealer qualifies on Queen-high or better. With three cards, a straight beats a flush. Two paytables sit on top of the main Ante/Play game: Pair Plus pays purely on your own hand, and the Ante bonus pays on your ante for premium hands no matter what the dealer holds.',
  variants: [
    {
      id: 'pairplus',
      label: 'Pair Plus',
      edgePct: 7.28,
      rtpPct: 92.72,
      headers: ['Hand', 'Pays', 'Odds'],
      rows: [
        { outcome: 'Straight flush', chance: '40:1', extra: '40 ×', tone: 'amber' },
        { outcome: 'Three of a kind', chance: '30:1', extra: '30 ×', tone: 'amber' },
        { outcome: 'Straight', chance: '6:1', extra: '6 ×', tone: 'cyan' },
        { outcome: 'Flush', chance: '3:1', extra: '3 ×', tone: 'cyan' },
        { outcome: 'Pair', chance: '1:1', extra: '1 ×', tone: 'slate' },
      ],
      note: 'Pays on your three cards alone, win or lose vs the dealer. Requires Play — folding forfeits it.',
    },
    {
      id: 'antebonus',
      label: 'Ante bonus',
      edgePct: 3.37,
      rtpPct: 96.63,
      headers: ['Hand', 'Pays', 'Odds'],
      rows: [
        { outcome: 'Straight flush', chance: '5:1', extra: '5 ×', tone: 'amber' },
        { outcome: 'Three of a kind', chance: '4:1', extra: '4 ×', tone: 'amber' },
        { outcome: 'Straight', chance: '1:1', extra: '1 ×', tone: 'cyan' },
      ],
      note: 'Paid on your ante for premium hands regardless of the dealer — automatic, no extra bet. The 3.37% edge is for the Ante/Play game overall with optimal Q-6-4 play strategy.',
    },
  ],
};
