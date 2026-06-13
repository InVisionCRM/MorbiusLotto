import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const diceFaqs: FaqItem[] = [
  provablyFairFaq(
    'Dice',
    <>For each roll, the first four bytes of that stream become your number from 0.00 to 99.99.</>,
    ACCENT,
  ),
  {
    q: 'Is it roll-under only?',
    a: (
      <>
        Yes. You set a target and win when the roll lands <span style={{ color: ACCENT }}>strictly under</span> it
        — there&apos;s no separate over/under toggle in this build. Lower target, rarer win, bigger payout.
      </>
    ),
  },
  {
    q: 'Why did I lose when the roll equalled my target?',
    a: (
      <>
        You win only when the roll is <span style={{ color: ACCENT }}>below</span> your target, not equal to it.
        A target of 50.00 wins on 0.00–49.99 — that&apos;s 50% of the time, and the equals-case is part of the
        small house edge.
      </>
    ),
  },
  {
    q: 'How is the payout worked out?',
    a: (
      <>
        Payout ≈ <span className="arc-mono">99 ÷ win-chance%</span>. Since your win chance equals your target, a
        50 target pays about 1.98×, a 25 target about 3.96×, and a 2 target about 49×. The exact figure uses the
        server&apos;s house-edge setting.
      </>
    ),
  },
  {
    q: 'Does a losing streak make a win "due"?',
    a: (
      <>
        No. Every roll is independent and derived fresh from the seeds and a new nonce — earlier rolls have zero
        effect on the next. Nothing is ever &quot;due&quot;.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
