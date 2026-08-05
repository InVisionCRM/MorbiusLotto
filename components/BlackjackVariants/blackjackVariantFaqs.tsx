import type { ReactNode } from 'react';
import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';
import type { BjVariant } from '@/lib/blackjack-variants-client';

const ACCENT = '#22D3EE';

const hl = (text: ReactNode) => <span style={{ color: ACCENT }}>{text}</span>;

/**
 * Every one of these games sells a rule that sounds like a gift, and pays for
 * it somewhere else. The FAQ names both halves — the giveaway and the charge —
 * because a player who only hears the first half has been misled by omission.
 *
 * The single-deck note is repeated for each variant rather than tucked away
 * once: published house edges for Spanish 21 and Free Bet assume six or eight
 * decks, so quoting them here would be quoting a number this game doesn't have.
 */

const SINGLE_DECK: FaqItem = {
  q: 'How many decks are used?',
  a: (
    <>
      <p>
        {hl('One')}, reshuffled every hand — the same as every other card game on the site.
      </p>
      <p>
        This matters more than it sounds. The house edges you will find published for these variants
        assume six or eight decks, so those numbers do not transfer here. Single-deck changes the
        maths of pairs, of drawing to a total, and of how often the dealer breaks. We would rather
        say that than quote you a return this game does not actually have.
      </p>
    </>
  ),
};

const NAME: Record<BjVariant, string> = {
  spanish21: 'Spanish 21',
  double_exposure: 'Double Exposure',
  pontoon: 'Pontoon',
  free_bet: 'Free Bet Blackjack',
  switch: 'Blackjack Switch',
};

const PER_VARIANT: Record<BjVariant, FaqItem[]> = {
  spanish21: [
    {
      q: 'What makes Spanish 21 different?',
      a: (
        <>
          <p>
            Two things pulling in opposite directions. In your favour: {hl('your 21 always wins')} —
            it never pushes against a dealer 21 — and there are bonuses for reaching 21 the hard way,
            plus 6-7-8 and 7-7-7.
          </p>
          <p>
            Against you: the deck has {hl('all four tens removed')}, leaving 48 cards. Tens are the
            card you most want when doubling and the card that most often breaks the dealer, so
            taking them out is a real cost, not a cosmetic one. That removal is what pays for
            everything generous about the game.
          </p>
        </>
      ),
    },
    {
      q: 'Why is there no Match the Dealer side bet?',
      a: (
        <>
          <p>
            Because a suited match needs a duplicate card, and a single deck cannot produce one. The
            bet would be structurally impossible to win at its top tier.
          </p>
          <p>
            We left it out rather than ship a version that looks like Match the Dealer but quietly
            cannot pay what it advertises.
          </p>
        </>
      ),
    },
  ],
  double_exposure: [
    {
      q: 'Both dealer cards are face up. Where is the catch?',
      a: (
        <>
          <p>
            Seeing the dealer&apos;s hand is worth a great deal, so the game charges for it twice.
          </p>
          <p>
            First, {hl('the dealer wins every tie')} — except a tied blackjack, where you win.
            Second, {hl('your blackjack pays even money')} rather than 3:2. Losing every push is the
            expensive one: pushes are common, and here they are all losses.
          </p>
        </>
      ),
    },
  ],
  pontoon: [
    {
      q: 'How is Pontoon different from blackjack?',
      a: (
        <>
          <p>
            {hl('Both dealer cards are face down')} — you see nothing at all, which is the opposite
            trade to Double Exposure. In return the game gives you the{' '}
            {hl('five-card trick')}: any five cards totalling 21 or less beats everything, including
            a dealer 21.
          </p>
          <p>
            The vocabulary is its own too: you {hl('twist')} instead of hit and {hl('stick')} instead
            of stand. And you {hl("can't stick below 15")} — with a low total you are forced to keep
            drawing.
          </p>
        </>
      ),
    },
  ],
  free_bet: [
    {
      q: 'What exactly is "free" about Free Bet?',
      a: (
        <>
          <p>
            The house puts up the chips for your {hl('doubles on 9, 10 or 11')} and for{' '}
            {hl('every split')}. You keep any winnings those bets make and you never risk the money —
            the house&apos;s stake is not returned to you, only the winnings on it.
          </p>
          <p>
            The charge is the {hl('dealer 22')}: if the dealer finishes on exactly 22, the hand is a
            push instead of a dealer bust. That single rule is what pays for all the free chips, and
            it takes back more than most players expect, because 22 is a common way to break.
          </p>
        </>
      ),
    },
  ],
  switch: [
    {
      q: 'How does switching work?',
      a: (
        <>
          <p>
            You play {hl('two hands')} and may {hl('trade the second card')} of one for the second
            card of the other — once, before you act on either. It turns two mediocre hands into one
            strong hand surprisingly often.
          </p>
          <p>
            The charges: a {hl('dealer 22 pushes')} rather than busting, and a{' '}
            {hl('switched 21 counts as an ordinary 21')}, not a blackjack — so it pays even money and
            can be tied.
          </p>
        </>
      ),
    },
    {
      q: 'What is Super Match?',
      a: (
        <>
          <p>
            An optional side bet on the {hl('four cards you are dealt')}, paying for a pair, two
            pair, three of a kind or four of a kind among them.
          </p>
          <p>
            It is scored on the opening deal, before any switch, and settles on its own terms
            regardless of how the hands themselves finish.
          </p>
        </>
      ),
    },
  ],
};

export function blackjackVariantFaqs(variant: BjVariant): FaqItem[] {
  const name = NAME[variant];
  return [
    provablyFairFaq(
      name,
      <>
        The deck is a Fisher-Yates shuffle of that byte stream, fixed the moment you bet and sealed
        behind the hash. Every card the hand will ever use — yours, the dealer&apos;s, and each card
        either of you draws — comes off that shuffled deck in order. Nothing is chosen in response to
        how you play.
      </>,
      ACCENT,
    ),
    ...PER_VARIANT[variant],
    SINGLE_DECK,
    {
      q: 'Does basic strategy still work here?',
      a: (
        <>
          <p>
            Not unchanged. Each of these games alters the rules basic strategy was derived from —
            removed tens, a pushing 22, a dealer taking ties, a forced minimum stand — so the correct
            play genuinely differs from ordinary blackjack in specific spots.
          </p>
          <p>
            Playing ordinary basic strategy will not hurt you badly, but it is not optimal for any of
            these five. And single decks shift it again on top.
          </p>
        </>
      ),
    },
    ...commonFaqs(ACCENT),
  ];
}
