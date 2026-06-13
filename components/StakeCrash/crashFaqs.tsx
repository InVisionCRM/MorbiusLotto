import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#00ffa3';

export const crashFaqs: FaqItem[] = [
  provablyFairFaq(
    'Crash',
    <>The crash point is computed as <span className="arc-mono">0.99 ÷ r</span>, where r comes from that byte stream — so it&apos;s locked in the instant you bet, before the rocket moves.</>,
    ACCENT,
  ),
  {
    q: 'Is the crash point decided before I bet?',
    a: (
      <>
        Yes. It&apos;s derived from the committed server seed the moment your round starts — the rocket is just an
        animation of a number that&apos;s <span style={{ color: ACCENT }}>already fixed</span>. The house can&apos;t
        extend or cut your flight in reaction to you.
      </>
    ),
  },
  {
    q: 'What happens if I disconnect mid-flight?',
    a: (
      <>
        Your <span style={{ color: ACCENT }}>auto-cashout</span> protects you — the server settles your round at
        your target on its own. With no target set, a disconnect can cost the bet, so set one if your connection
        is shaky.
      </>
    ),
  },
  {
    q: 'Is the curve the same for everyone?',
    a: <>Yes — every player in a round rides the identical curve. Only your cash-out timing is yours.</>,
  },
  {
    q: 'What’s the most I can win?',
    a: (
      <>
        Cash-out is capped at <span style={{ color: ACCENT }}>100×</span>. Fly past it with no cash-out and your
        win auto-banks at 100×.
      </>
    ),
  },
  {
    q: 'Can the house see my auto-cashout target?',
    a: (
      <>
        It wouldn&apos;t help if it could — the crash point is already fixed by the committed seed before your
        target is read, so it can&apos;t be nudged to beat you.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
