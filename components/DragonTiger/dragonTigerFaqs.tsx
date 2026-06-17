import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const dragonTigerFaqs: FaqItem[] = [
  provablyFairFaq(
    'Dragon Tiger',
    <>
      For each round the shuffled deck&apos;s first card goes to Dragon and the second to Tiger, both
      fixed before you bet.
    </>,
    ACCENT,
  ),
  {
    q: 'How does Dragon Tiger work?',
    a: (
      <>
        One card goes to <span style={{ color: ACCENT }}>Dragon</span>, one to{' '}
        <span style={{ color: ACCENT }}>Tiger</span> — the higher rank wins, and you bet which side
        that&apos;ll be (or bet the Tie). Suits don&apos;t matter and{' '}
        <span style={{ color: ACCENT }}>Ace is the lowest card</span>, so a King is the strongest.
        It&apos;s the quickest game on the floor: one bet, two cards, done.
      </>
    ),
  },
  {
    q: 'What happens on a tie?',
    a: (
      <>
        If both cards are the same rank it&apos;s a Tie. The{' '}
        <span style={{ color: ACCENT }}>Tie bet pays 11:1</span>; Dragon and Tiger bets{' '}
        <span style={{ color: ACCENT }}>lose half</span> their stake (you get half back). Ties land
        about once every 17 rounds.
      </>
    ),
  },
  {
    q: 'How is the payout worked out?',
    a: (
      <>
        A winning <span style={{ color: ACCENT }}>Dragon</span> or{' '}
        <span style={{ color: ACCENT }}>Tiger</span> bet pays even money (1:1), so you get your stake
        back plus the same again. A winning <span style={{ color: ACCENT }}>Tie</span> bet pays{' '}
        <span className="arc-mono">11:1</span>. On a tie outcome, Dragon and Tiger bets return half
        their stake.
      </>
    ),
  },
  {
    q: 'Does a losing streak make a win "due"?',
    a: (
      <>
        No. Every round is dealt fresh from the seeds and a new shuffle — earlier rounds have zero
        effect on the next. Nothing is ever &quot;due&quot;.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
