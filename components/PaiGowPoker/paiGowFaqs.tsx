import type { ReactNode } from 'react';
import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';
const hl = (text: ReactNode) => <span style={{ color: ACCENT }}>{text}</span>;

export const paiGowFaqs: FaqItem[] = [
  provablyFairFaq(
    'Pai Gow Poker',
    <>
      The deck is a Fisher-Yates shuffle of that byte stream, fixed when you bet and sealed behind the
      hash — your seven cards are cards 1–7, the dealer&apos;s are cards 8–14, all set before you split, and
      the dealer&apos;s hands re-derive from the fixed house way.
    </>,
    ACCENT,
  ),
  {
    q: 'How does Pai Gow Poker work?',
    a: (
      <>
        <p>
          You and the dealer each get {hl('seven cards')} from a standard 52-card deck. You split yours
          into a {hl('5-card high hand')} and a {hl('2-card low hand')} — and your high hand must outrank
          your low hand, or the set is a foul. The dealer splits by a fixed, published house way.
        </p>
        <p>
          Both high hands are compared, both low hands are compared. Win {hl('both')} and you&apos;re paid
          1:1 minus a 5% commission. Win one and lose one, it&apos;s a {hl('push')}. Lose both and the bet is
          gone.
        </p>
      </>
    ),
  },
  {
    q: 'Is there a joker?',
    a: (
      <>
        <p>
          Not in this variant — we deal a clean {hl('standard 52-card deck')}. Classic casino pai gow adds
          a semi-wild joker (aces, straights, flushes), which also makes &quot;five aces&quot; possible;
          without it the odds are slightly cleaner to reason about and the deck matches every other table
          here. The house way and settlement rules are otherwise the standard ones.
        </p>
      </>
    ),
  },
  {
    q: 'How does the 5% commission work?',
    a: (
      <>
        <p>
          Commission is charged only on hands you {hl('win outright')} (both hands). Bet 1,000 and win
          both: you get your 1,000 back plus <span className="arc-mono">950</span> profit instead of 1,000
          — the house keeps 5% of the win. Pushes and losses pay no commission.
        </p>
        <p>
          That commission plus the copy rule is where the roughly {hl('2.7% effective house edge')} lives
          when you set your hands sensibly (the house way is close to optimal).
        </p>
      </>
    ),
  },
  {
    q: 'Why do so many hands push?',
    a: (
      <>
        <p>
          Because you need to win {hl('two separate comparisons')} to get paid, and lose both to lose.
          Splitting one-each happens on roughly {hl('41% of hands')} — that&apos;s the charm of pai gow:
          long sessions, low variance, lots of &quot;nothing happens&quot;. It&apos;s the slow-burn table,
          not the adrenaline one.
        </p>
      </>
    ),
  },
  {
    q: 'What are copies?',
    a: (
      <>
        <p>
          A {hl('copy')} is an exact tie on one of the comparisons — say both low hands are A-Q, or both
          high hands are the identical straight. Copies go to the {hl('dealer')}. It sounds minor, but
          it&apos;s a meaningful chunk of the house edge, which is why the banker seat is coveted in live
          pai gow.
        </p>
      </>
    ),
  },
  {
    q: 'What is the house way?',
    a: (
      <>
        <p>
          A fixed recipe for splitting seven cards, used by the dealer every hand — and available to you
          via the {hl('House way')} button. In short: no pair → 2nd and 3rd highest cards low; one pair →
          pair high, top kickers low; two pair → split (unless both are small and an ace can guard the
          low); trips → keep high (three aces split); full house → split; quads → split unless a pair
          rides along; straights and flushes stay intact when a decent low remains.
        </p>
        <p>
          Setting your own hands is legal and sometimes better — the house way is a strong default, not a
          cage.
        </p>
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
