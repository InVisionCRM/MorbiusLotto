/**
 * paiGowOdds — odds-tab data for /pai-gow-poker. One settlement paytable, plus
 * the house-way / copy rules that shape the ~2.7% effective edge. Numbers mirror
 * server/src/services/arcade-pai-gow-poker.ts (5% commission on outright wins,
 * copies to the dealer).
 */

import type { GameOdds } from '@/components/arcade2/ArcadeOddsTab';

export const paiGowOdds: GameOdds = {
  blurb:
    'You and the dealer each get seven cards from a standard 52-card deck (no joker). You split yours into a 5-card high hand and a 2-card low hand — the high hand must outrank the low hand or the set fouls. Both high hands and both low hands are compared: win both to be paid, win one to push, lose both to lose. Copies (exact ties) go to the dealer, and outright wins pay a 5% commission — together that is where the ~2.7% effective edge lives.',
  variants: [
    {
      id: 'settlement',
      label: 'Settlement',
      edgePct: 2.7,
      rtpPct: 97.3,
      headers: ['Result', 'Pays', 'Frequency'],
      rows: [
        { outcome: 'Win both hands', chance: '1:1 − 5%', extra: '≈ 29%', tone: 'amber' },
        { outcome: 'Win one / split', chance: 'push', extra: '≈ 41%', tone: 'cyan' },
        { outcome: 'Lose both hands', chance: 'bet lost', extra: '≈ 30%', tone: 'slate' },
      ],
      note: 'Win both comparisons and you are paid 1:1 minus a 5% commission (bet 1,000, win 950). Splitting one-each pushes; losing both loses the bet. Frequencies are approximate for house-way play.',
    },
    {
      id: 'rules',
      label: 'House rules',
      edgePct: 2.7,
      rtpPct: 97.3,
      headers: ['Rule', 'Detail', ''],
      rows: [
        { outcome: 'Copies (exact ties)', chance: '→ dealer', extra: '', tone: 'slate' },
        { outcome: 'High must beat low', chance: 'or foul', extra: '', tone: 'cyan' },
        { outcome: 'Standard 52-card deck', chance: 'no joker', extra: '', tone: 'slate' },
        { outcome: 'Dealer sets by', chance: 'house way', extra: '', tone: 'cyan' },
        { outcome: 'Commission on wins', chance: '5%', extra: '', tone: 'amber' },
      ],
      note: 'The dealer always sets by the fixed, published house way — available to you via the House way button. Setting your own hands is allowed and sometimes better.',
    },
  ],
};
