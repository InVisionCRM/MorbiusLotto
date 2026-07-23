/**
 * /mechanics-lab — the slot mechanics showcase.
 *
 * A visual/animation prototype of slot systems (reel & grid layouts, symbol
 * mechanics, cascades, bonus rounds, meta systems) built on the shared
 * SlotEngine. NOT a gambling game: no bets, wallet, payments or real-money
 * features — demo units only. Theme: Deep-Sea Neon.
 */

import type { Metadata } from 'next';
import { Chakra_Petch, JetBrains_Mono } from 'next/font/google';
import MechanicsLab from '@/components/MechanicsLab/MechanicsLab';

const arcDisplay = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-arc-display',
});
const arcMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arc-mono',
});

export const metadata: Metadata = {
  title: 'Mechanics Lab — Slot Systems Showcase',
  description: 'Interactive demos of slot machine mechanics: grids, cascades, wilds, bonus rounds and meta systems.',
};

export default function MechanicsLabPage() {
  return (
    <div className={`${arcDisplay.variable} ${arcMono.variable} min-h-screen bg-[#04080d]`}>
      <MechanicsLab />
    </div>
  );
}
