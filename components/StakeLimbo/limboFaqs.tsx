import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const limboFaqs: FaqItem[] = [
  provablyFairFaq(
    'Limbo',
    <>The result multiplier is that byte stream reduced to a number from 1.00× upward — your target only decides where you win, never the result.</>,
    ACCENT,
  ),
  {
    q: 'What’s the highest target I can set?',
    a: (
      <>
        Up to <span style={{ color: ACCENT }}>1000×</span>. The higher you aim, the rarer the hit — and the bigger
        the payout when it lands.
      </>
    ),
  },
  {
    q: 'How is my win chance calculated?',
    a: (
      <>
        Roughly <span className="arc-mono">99 ÷ target</span>: a 2× target wins about 49% of the time, 10× about
        10%, 100× about 1% — minus the small house edge.
      </>
    ),
  },
  {
    q: 'Is there a maximum win?',
    a: <>Your payout is bet × target, so the cap is set by the highest target and the server&apos;s max-win limit.</>,
  },
  {
    q: 'Are rounds independent?',
    a: (
      <>
        Completely. Each result is drawn fresh from a new nonce — a run of low results doesn&apos;t make a high one
        any likelier.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
