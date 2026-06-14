import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const diceX2Faqs: FaqItem[] = [
  provablyFairFaq(
    'Dice x2',
    <>For each roll, the first four bytes of that stream become your number from 0.00 to 99.99.</>,
    ACCENT,
  ),
  {
    q: 'How is this different from regular Dice?',
    a: (
      <>
        Regular Dice picks a single roll-under line. Dice x2 lets you pick a{' '}
        <span style={{ color: ACCENT }}>band</span> with two handles — you win when the roll lands{' '}
        <span style={{ color: ACCENT }}>inside</span> it. Your win chance is the band&apos;s width;
        sliding it left or right doesn&apos;t change the odds.
      </>
    ),
  },
  {
    q: 'Does where I place the band matter?',
    a: (
      <>
        No — only the <span style={{ color: ACCENT }}>width</span> sets your odds and payout. A
        25-wide band pays the same whether it sits at 0–25, 25–50, or 75–100. Position is purely
        taste.
      </>
    ),
  },
  {
    q: 'How is the payout worked out?',
    a: (
      <>
        Payout ≈ <span className="arc-mono">99 ÷ win-chance%</span>, and your win chance equals the
        band width. A 50-wide band pays about 1.98×, a 25-wide about 3.96×, and a 2-wide about 49×.
        The exact figure uses the server&apos;s house-edge setting.
      </>
    ),
  },
  {
    q: 'Why did I lose when the roll equalled the top edge?',
    a: (
      <>
        The lower edge counts as a win, the upper edge does not — the band is{' '}
        <span style={{ color: ACCENT }}>[low, high)</span>. A 25.00–75.00 band wins on
        25.00–74.99, which is exactly 50% of the time.
      </>
    ),
  },
  {
    q: 'Does a losing streak make a win "due"?',
    a: (
      <>
        No. Every roll is independent and derived fresh from the seeds and a new nonce — earlier
        rolls have zero effect on the next. Nothing is ever &quot;due&quot;.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
