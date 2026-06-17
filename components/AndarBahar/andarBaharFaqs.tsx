'use client';

/**
 * andarBaharFaqs.tsx — FAQ copy for /andar-bahar, ported verbatim from the
 * approved prototype (public/andar-bahar-lab.html). Shared ArcadeFAQ renders it.
 */

import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';

const hl = (text: string) => <span className="text-cyan-300">{text}</span>;

export const andarBaharFaqs: FaqItem[] = [
  {
    q: 'How does Andar Bahar work?',
    a: (
      <>
        <p>
          A single {hl('joker')} card is cut face-up. Cards are then dealt one at a time,
          alternating between two piles — {hl('Andar')} first, then {hl('Bahar')} — until a card
          appears that matches the joker&apos;s rank. The pile it lands on wins. You just bet which
          side that&apos;ll be.
        </p>
        <p>It&apos;s pure speed and suspense: no decisions, no strategy, often over in a handful of cards.</p>
      </>
    ),
  },
  {
    q: 'Why does Andar pay less than Bahar?',
    a: (
      <p>
        Because Andar is dealt first, it has a slightly higher chance of catching the match, so it
        pays {hl('0.9:1')} while Bahar pays a full {hl('1:1')}. That small asymmetry is where the
        house edge lives — both sides come out a touch in the house&apos;s favour.
      </p>
    ),
  },
  {
    q: 'Is the deal really fair?',
    a: (
      <>
        <p>
          Yes. Before your bet, the server commits to a secret {hl('server seed')} (you see only its
          SHA-256 hash). The deck is a Fisher-Yates shuffle of that seed, {hl('your client seed')},
          and a nonce — so the joker and every card that follows are fixed before you bet.
        </p>
        <p>
          When the round ends the seed is revealed. Hit {hl('Verify')} to re-shuffle the deck and
          confirm the joker, both rows, and the commitment hash.
        </p>
      </>
    ),
  },
  {
    q: 'How many cards can a round take?',
    a: (
      <p>
        Usually just a few, but it can run long if the matching ranks sit deep in the deck —
        occasionally a dozen or more cards per side. The longer it goes, the more the tension builds.
      </p>
    ),
  },
  {
    q: 'How do I get chips?',
    a: (
      <p>
        Chips are the play credits used at every table. Tap {hl('Buy')} next to your balance to swap
        MORBIUS for chips at a fixed {hl('1 chip = 1 MORBIUS')} — instant, gasless, and{' '}
        {hl('no fee')}. Cash back out any time at the same 1:1.
      </p>
    ),
  },
  {
    q: 'Chips vs. MORBIUS — what\'s the difference?',
    a: (
      <p>
        {hl('MORBIUS')} is the real, on-chain token in your wallet. {hl('Chips')} are off-chain 1:1
        credits you play with: faster, gasless, settled instantly. You move between them at 1:1 and
        only ever wager in chips.
      </p>
    ),
  },
  {
    q: 'What are the fees?',
    a: (
      <p>
        This chip game takes {hl('no per-bet or per-payout fee')} — it keeps a small built-in house
        edge in its odds. Buying and cashing chips is free, 1:1.
      </p>
    ),
  },
];
