/**
 * andarBaharOdds — odds-tab data for /andar-bahar.
 *
 * A joker is cut, then cards are dealt alternately onto Andar (first) and Bahar
 * until one matches the joker's rank. Because Andar receives the first card it
 * wins slightly more often (~50.9%), so it pays a touch under even money (0.9:1)
 * while Bahar pays 1:1 — leaving roughly a 3.5% house edge on both, matching
 * AB_PAY_ANDAR / AB_PAY_BAHAR / AB_HOUSE_EDGE_BP in
 * server/src/services/arcade-andar-bahar.ts.
 */

import type { GameOdds } from '@/components/arcade2/ArcadeOddsTab'

export const andarBaharOdds: GameOdds = {
  blurb:
    'Cut a joker, then deal alternately onto Andar (first) and Bahar until a card matches the joker’s rank — that side wins. Andar is dealt first so it wins a little more often, which is why it pays just under even money. Only the rank matters; suits are ignored.',
  variants: [
    {
      id: 'andar-bahar',
      label: 'Standard',
      edgePct: 3.5,
      rtpPct: 96.5,
      rows: [
        { outcome: 'Andar (deals first)', chance: '0.9:1', extra: '≈ 50.9%', tone: 'cyan' },
        { outcome: 'Bahar', chance: '1:1', extra: '≈ 49.1%', tone: 'amber' },
      ],
      headers: ['Bet', 'Pays', 'Win chance'],
      note: 'Andar pays 0.9:1 because it’s dealt first and wins a little more often; Bahar pays even money. Both carry roughly a 3.5% house edge.',
    },
  ],
}
