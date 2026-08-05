import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#86EFAC';

/**
 * A shared felt raises questions a solo game never does — whose dice are these,
 * why did everyone lose at once, what happens if the shooter walks away. These
 * answer those, and are explicit that one throw settles every seat separately.
 */
export const crapsMultiFaqs: FaqItem[] = [
  provablyFairFaq(
    'multiplayer Craps',
    <>
      Each throw is derived from the table&apos;s sealed server seed mixed with the{' '}
      <span style={{ color: ACCENT }}>shooter&apos;s own client seed</span> and a roll number that
      only ever counts up. Holding the dice genuinely changes what they land on — it is not
      decoration — and anyone can replay the sequence once a seed is published.
    </>,
    ACCENT,
  ),
  {
    q: 'How is this different from playing craps alone?',
    a: (
      <>
        <p>
          One shooter throws for the whole table. Everybody bets on the same felt, and a single throw
          settles <span style={{ color: ACCENT }}>every seat at once</span> — which is the entire
          point of craps and the thing the solo game cannot give you.
        </p>
        <p>
          Your chips are still yours: each seat is settled independently against the same dice, so
          your payout depends only on what you had down. What you share is the roll, the point, and
          the moment.
        </p>
      </>
    ),
  },
  {
    q: 'Who gets to roll the dice?',
    a: (
      <>
        <p>
          One seat holds the dice at a time. The dice{' '}
          <span style={{ color: ACCENT }}>pass to the next player when the shooter sevens out</span>{' '}
          — not when they make their point. A shooter who keeps hitting numbers keeps shooting, which
          is what a hot roll is.
        </p>
        <p>
          If the shooter takes too long, the box throws for them so the table isn&apos;t held up. If
          they leave, the dice move on to the next seat.
        </p>
      </>
    ),
  },
  {
    q: 'Why did the whole table lose at the same time?',
    a: (
      <>
        <p>
          A <span style={{ color: ACCENT }}>seven-out</span>. Once a point is established, a 7 ends
          the shooter&apos;s hand: Pass Line bets lose and all Place bets come down at once. Since
          most of the rail is usually backing the shooter, most of the rail loses together.
        </p>
        <p>
          Don&apos;t Pass bettors win on that same roll — betting against the table is legal here,
          just lonely.
        </p>
      </>
    ),
  },
  {
    q: 'When can I put chips down?',
    a: (
      <>
        <p>
          During the betting window between throws. The window has a clock, and{' '}
          <span style={{ color: ACCENT }}>the shooter can close it early by throwing</span> — dice
          out means no more bets, exactly as at a real table.
        </p>
        <p>
          Pass and Don&apos;t Pass lock once a point is on. Place bets and the one-roll bets can go
          down or come back up any time the window is open.
        </p>
      </>
    ),
  },
  {
    q: 'Are my chips at risk while they sit on the felt?',
    a: (
      <>
        <p>
          Yes — chips are debited the moment you place them, not when the dice land. That is not a
          shortcut: a Place bet legitimately rides across many throws, so the money genuinely leaves
          you when it hits the felt.
        </p>
        <p>
          If you pick a bet back up during an open window, or leave the table, anything still resting
          is returned to you.
        </p>
      </>
    ),
  },
  {
    q: 'What is the table maximum on?',
    a: (
      <>
        <p>
          The maximum applies to the{' '}
          <span style={{ color: ACCENT }}>total resting on any one zone</span>, not to a single
          click. Craps bets accumulate, so a per-click limit would be no limit at all.
        </p>
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
