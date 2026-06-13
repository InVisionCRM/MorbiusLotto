import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const minesFaqs: FaqItem[] = [
  provablyFairFaq(
    'Mines',
    <>The bomb positions are fixed by that byte stream when the round starts and sealed behind the hash — revealing a cell just looks one up.</>,
    ACCENT,
  ),
  {
    q: 'Can I change the board after I start?',
    a: (
      <>
        No. The moment you bet, the bombs are placed and <span style={{ color: ACCENT }}>sealed behind the
        commitment hash</span>. You choose which cells to open, but the layout can&apos;t shift under you.
      </>
    ),
  },
  {
    q: 'What if I refresh mid-round?',
    a: (
      <>
        Your active round <span style={{ color: ACCENT }}>resumes</span> — the server keeps one open round per
        wallet, so a reload picks up exactly where you left off, gems and multiplier intact.
      </>
    ),
  },
  {
    q: 'How does the multiplier grow?',
    a: (
      <>
        Each safe pick raises your return based on how many safe cells are left — more bombs mean fewer safe
        cells, so every pick jumps more. With 24 bombs, the single safe cell pays around 24×.
      </>
    ),
  },
  {
    q: 'Can I lose on my very first pick?',
    a: (
      <>
        Yes — if your first cell is a bomb, the round ends. You can only cash out once you&apos;ve revealed at
        least one gem.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
