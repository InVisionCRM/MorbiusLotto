import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const greedDiceFaqs: FaqItem[] = [
  provablyFairFaq(
    'Greed Dice',
    <>
      Every die face — the opening roll and every reroll — is drawn from that byte stream in order, so
      replaying the turn from the seed reproduces it die-for-die.
    </>,
    ACCENT,
  ),
  {
    q: 'How does Greed Dice pay out?',
    a: (
      <>
        <p>
          You roll the dice and every <span style={{ color: ACCENT }}>scoring die</span> is banked
          automatically — a 1 is worth 100, a 5 is worth 50, and three-or-more of a kind pay big
          (three 1s = 1000, other triples = face ×100, with four/five/six of a kind multiplying that
          by 2 / 4 / 8). Your running points convert straight to a{' '}
          <span style={{ color: ACCENT }}>multiplier</span> on your bet.
        </p>
        <p>
          After each roll you choose: <span style={{ color: ACCENT }}>Bank</span> to lock the
          multiplier and win, or roll the leftover dice for more. Clear every die and it&apos;s{' '}
          <span style={{ color: ACCENT }}>hot dice</span> — you roll the whole set again with your
          points intact.
        </p>
      </>
    ),
  },
  {
    q: 'What is a farkle?',
    a: (
      <>
        If a roll produces <span style={{ color: ACCENT }}>no scoring dice at all</span>, you farkle —
        the entire turn&apos;s points are lost and your bet is gone. The more dice you&apos;ve set
        aside, the fewer remain, and the easier it is to farkle. Bank a good run or risk it for a great
        one.
      </>
    ),
  },
  {
    q: 'Can good bank/push decisions beat the house?',
    a: (
      <>
        Knowing when to bank is real skill and it improves your results. But the points→multiplier
        scale is tuned so that even <span style={{ color: ACCENT }}>optimal</span> stopping returns
        just under your stake on average — a small built-in house edge, the same way blackjack stays
        profitable against perfect basic strategy.
      </>
    ),
  },
  {
    q: 'What does the dice count change?',
    a: (
      <>
        It sets your volatility. <span style={{ color: ACCENT }}>5 dice</span> farkle more often
        (higher variance, swingier); <span style={{ color: ACCENT }}>7 dice</span> are safer and grind
        steadier; 6 is the classic middle. The long-run return is tuned to be the same across all
        three.
      </>
    ),
  },
  {
    q: 'What if I refresh mid-turn?',
    a: (
      <>
        Your active turn <span style={{ color: ACCENT }}>resumes</span> — the server keeps one open
        round per wallet, so a reload picks up exactly where you left off, points and remaining dice
        intact.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
