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
    q: 'How do I fund my balance to play?',
    a: (
      <p>
        {hl('MORBIUS')} is the currency you play with. Open the {hl('Deposit')} menu and send MORBIUS
        (or PLS) from your wallet — instant, gasless, and {hl('no fee')}, ready to play right away.
        {hl('Withdraw')} back to your wallet any time.
      </p>
    ),
  },
  {
    q: 'What are the fees?',
    a: (
      <p>
        This game takes {hl('no per-bet or per-payout fee')} — it keeps a small built-in house
        edge in its odds. Depositing and withdrawing MORBIUS is free.
      </p>
    ),
  },
];
