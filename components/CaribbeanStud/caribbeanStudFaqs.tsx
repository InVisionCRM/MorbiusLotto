import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#38BDF8';

/**
 * Caribbean Stud's whole character is the qualification rule, and it is the
 * thing players most often feel cheated by. These say it plainly rather than
 * letting someone discover it holding a flush.
 */
export const caribbeanStudFaqs: FaqItem[] = [
  provablyFairFaq(
    'Caribbean Stud',
    <>
      The deck is a Fisher-Yates shuffle of that byte stream, fixed when you ante and sealed behind
      the hash — your five cards are cards 1–5 and the dealer&apos;s are cards 6–10, all set before
      you choose to call or fold. The dealer&apos;s up card is simply the first of theirs.
    </>,
    ACCENT,
  ),
  {
    q: 'How do I play Caribbean Stud?',
    a: (
      <>
        <p>
          You post an <span style={{ color: ACCENT }}>Ante</span> and get five cards. The dealer gets
          five too, with one face up. Then you either{' '}
          <span style={{ color: ACCENT }}>Call</span> — putting up a bet worth{' '}
          <span style={{ color: ACCENT }}>twice your ante</span> — or{' '}
          <span style={{ color: ACCENT }}>Fold</span> and forfeit the ante.
        </p>
        <p>There is exactly one decision in the game, and no drawing. That is the whole hand.</p>
      </>
    ),
  },
  {
    q: 'I had a flush and barely got paid. What happened?',
    a: (
      <>
        <p>
          The dealer failed to <span style={{ color: ACCENT }}>qualify</span>. To qualify they need
          Ace-King high or better. When they miss it, your Ante pays 1:1 and your Call —{' '}
          <span style={{ color: ACCENT }}>the bet twice the size</span> — is simply returned.
        </p>
        <p>
          It does not matter how big your hand is. A royal flush against an unqualified dealer pays
          exactly one ante, the same as a pair of twos would. This is the single most important thing
          to understand about the game, and it is why the settlement breakdown lists each bet
          separately instead of showing you one net number that hides it.
        </p>
      </>
    ),
  },
  {
    q: 'What does the Call bet pay when the dealer does qualify?',
    a: (
      <>
        <p>
          Then the hand is a straight contest and the Call pays on your hand&apos;s strength: 1:1 for
          a pair or less, 2:1 two pair, 3:1 trips, 4:1 a straight, 5:1 a flush, 7:1 a full house,
          20:1 quads, 50:1 a straight flush and{' '}
          <span style={{ color: ACCENT }}>100:1 for a royal</span>. The Ante pays 1:1 on top.
        </p>
        <p>If the dealer qualifies and beats you, you lose both bets.</p>
      </>
    ),
  },
  {
    q: 'What is the 5+1 Bonus?',
    a: (
      <>
        <p>
          An optional side bet on the best five-card hand you can make from{' '}
          <span style={{ color: ACCENT }}>your five cards plus the dealer&apos;s up card</span> — six
          cards to choose from.
        </p>
        <p>
          It is settled entirely on its own terms: it does not care whether the dealer qualified, or
          whether you won, or whether you folded the main hand.
        </p>
      </>
    ),
  },
  {
    q: 'When should I fold?',
    a: (
      <>
        <p>
          Much less often than feels comfortable. Folding costs you the ante for certain, while
          calling risks two more units for a real chance at both.
        </p>
        <p>
          The widely used rule of thumb is to call with any pair or better, and to fold hands weaker
          than Ace-King. This is a guideline, not advice — the house keeps an edge either way.
        </p>
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
