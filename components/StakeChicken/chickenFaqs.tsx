import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const chickenFaqs: FaqItem[] = [
  provablyFairFaq(
    'Chicken',
    <>
      The bumper lanes are fixed by that byte stream when the round starts and sealed behind the
      hash — stepping into a lane just looks one up.
    </>,
    ACCENT,
  ),
  {
    q: 'Can the road change after I start?',
    a: (
      <>
        No. The moment you bet, the bumpers are placed and{' '}
        <span style={{ color: ACCENT }}>sealed behind the commitment hash</span>. You choose how far
        to walk, but the traffic can&apos;t shift under you.
      </>
    ),
  },
  {
    q: 'What if I refresh mid-round?',
    a: (
      <>
        Your active round <span style={{ color: ACCENT }}>resumes</span> — the server keeps one open
        round per wallet, so a reload picks up exactly where you left off, lane and multiplier intact.
      </>
    ),
  },
  {
    q: 'How does the multiplier grow?',
    a: (
      <>
        Each lane you clear compounds your return. A higher difficulty means a bigger chance of a
        bumper per lane, so every safe step jumps the multiplier more — Hard climbs fastest, Easy the
        gentlest.
      </>
    ),
  },
  {
    q: 'Can I get clipped on my very first step?',
    a: (
      <>
        Yes — if the first lane hides a bumper, the round ends. You can only cash out once you&apos;ve
        safely crossed at least one lane.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
