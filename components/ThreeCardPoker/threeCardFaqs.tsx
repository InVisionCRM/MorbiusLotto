import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const threeCardFaqs: FaqItem[] = [
  provablyFairFaq(
    'Three Card Poker',
    <>
      The deck is a Fisher-Yates shuffle of that byte stream, fixed when you ante and sealed behind
      the hash — your three cards are cards 1–3, the dealer&apos;s are cards 4–6, all set before you act.
    </>,
    ACCENT,
  ),
  {
    q: 'How do I win at Three Card Poker?',
    a: (
      <>
        <p>
          You and the dealer each get three cards. After seeing yours, you either{' '}
          <span style={{ color: ACCENT }}>Play</span> (matching your ante) or{' '}
          <span style={{ color: ACCENT }}>Fold</span> (forfeiting it). The dealer then reveals — and
          must <span style={{ color: ACCENT }}>qualify</span> with Queen-high or better.
        </p>
        <p>
          If the dealer doesn&apos;t qualify, your ante pays 1:1 and your Play bet pushes. If they
          qualify, the higher three-card hand wins both bets. With only three cards the order differs
          from normal poker: a <span style={{ color: ACCENT }}>straight beats a flush</span>.
        </p>
      </>
    ),
  },
  {
    q: 'What is Pair Plus?',
    a: (
      <>
        An optional side bet that pays purely on{' '}
        <span style={{ color: ACCENT }}>your own hand</span>, win or lose against the dealer — a pair
        pays 1:1 up to 40:1 for a straight flush (see the Odds tab). It requires you to{' '}
        <span style={{ color: ACCENT }}>Play</span>; folding forfeits it.
      </>
    ),
  },
  {
    q: 'What is the ante bonus?',
    a: (
      <>
        A bonus paid on your ante for premium hands{' '}
        <span style={{ color: ACCENT }}>regardless of the dealer</span> — straight 1:1, three of a
        kind 4:1, straight flush 5:1. It&apos;s automatic, no extra bet, and pays even when the dealer
        doesn&apos;t qualify.
      </>
    ),
  },
  {
    q: 'Can my decision change the cards?',
    a: (
      <>
        No. Play or fold only decides whether you contest the hand — all six cards were sealed by the
        commitment hash the moment you anted. Your choice never alters the deal, and a refresh between
        the deal and your decision <span style={{ color: ACCENT }}>resumes</span> the same hand.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
