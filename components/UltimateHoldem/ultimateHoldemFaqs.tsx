import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#A78BFA';

/**
 * The point of these is to say the things a player would otherwise only learn
 * by losing: that the Ante pushes rather than pays when the dealer misses, that
 * waiting costs you bet size, and that Trips is a separate bet that survives a
 * fold.
 */
export const ultimateHoldemFaqs: FaqItem[] = [
  provablyFairFaq(
    "Ultimate Texas Hold'em",
    <>
      The deck is a Fisher-Yates shuffle of that byte stream, fixed the moment you post the ante and
      sealed behind the hash — your two cards, the five board cards and the dealer&apos;s two are all
      dealt from it before you make a single decision. Nothing is drawn in response to how you bet.
    </>,
    ACCENT,
  ),
  {
    q: "How do I play Ultimate Texas Hold'em?",
    a: (
      <>
        <p>
          You post an <span style={{ color: ACCENT }}>Ante</span> and an equal{' '}
          <span style={{ color: ACCENT }}>Blind</span>, then get one — and only one — chance to back
          your hand with the <span style={{ color: ACCENT }}>Play</span> bet.
        </p>
        <p>
          You can bet Play before the flop at <span style={{ color: ACCENT }}>4×</span> or{' '}
          <span style={{ color: ACCENT }}>3×</span> your ante, after the flop at{' '}
          <span style={{ color: ACCENT }}>2×</span>, or at the river for{' '}
          <span style={{ color: ACCENT }}>1×</span>. Checking costs nothing — but it permanently
          shrinks what you are allowed to bet later. If you reach the river and still don&apos;t bet,
          you fold and lose the Ante and Blind.
        </p>
      </>
    ),
  },
  {
    q: 'Why did I beat the dealer but only get my Ante back?',
    a: (
      <>
        <p>
          Because the dealer didn&apos;t <span style={{ color: ACCENT }}>qualify</span>. The dealer
          needs at least a pair. If they don&apos;t have one, your{' '}
          <span style={{ color: ACCENT }}>Ante pushes</span> — it comes back, it does not pay — even
          though you won the hand.
        </p>
        <p>
          Your Play bet still pays 1:1 and the Blind still pays on its own scale, so a win is a win.
          But the Ante is the one bucket the dealer&apos;s qualification touches, and this catches
          people out constantly. It is worth reading the settlement breakdown after a hand: it shows
          each bet separately for exactly this reason.
        </p>
      </>
    ),
  },
  {
    q: 'What does the Blind pay?',
    a: (
      <>
        <p>
          The Blind only pays when you beat the dealer <em>and</em> your hand is a straight or
          better. Anything less and it pushes — you don&apos;t lose it, but it doesn&apos;t pay.
        </p>
        <p>
          It scales steeply: a straight pays 1:1, a flush 3:2, a full house 3:1, quads 10:1, a
          straight flush 50:1, and a{' '}
          <span style={{ color: ACCENT }}>royal flush 500:1</span>. That top end is why this
          game&apos;s table maximum is set lower than the other table games.
        </p>
      </>
    ),
  },
  {
    q: 'What is the Trips bet?',
    a: (
      <>
        <p>
          An optional side bet, paid purely on your own five-card hand — it does not care what the
          dealer has, or whether you won.
        </p>
        <p>
          It pays from three of a kind upward. Importantly, it{' '}
          <span style={{ color: ACCENT }}>stays in action even if you fold</span>: if you throw away
          a hand that turns out to contain trips, the Trips bet still pays. Folding surrenders the
          Ante and Blind, not this.
        </p>
      </>
    ),
  },
  {
    q: 'Should I always bet 4× pre-flop?',
    a: (
      <>
        <p>
          No — but you should bet 4× far more often than instinct suggests. The bet you are allowed
          to make only ever gets smaller, so a hand worth playing is usually worth playing at full
          size.
        </p>
        <p>
          We deliberately show what betting costs right now next to what checking drops it to, so the
          trade is visible on the button rather than something you have to remember.
        </p>
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
