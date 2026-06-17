import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const cascadeFaqs: FaqItem[] = [
  provablyFairFaq(
    'Cascade',
    <>
      Every gem — the opening 6×6 board and all the refills — is drawn in a fixed order from that
      stream, so the whole chain reaction re-runs gem-for-gem when the seed is revealed.
    </>,
    ACCENT,
  ),
  {
    q: 'How does Cascade pay out?',
    a: (
      <>
        <p>
          One drop fills the grid with gems. Any <span style={{ color: ACCENT }}>cluster</span> of
          enough connected matching gems pays and pops; the gems above tumble down and new ones fall
          in from the top. If that creates a fresh cluster, the chain continues — and every link in
          the chain raises a <span style={{ color: ACCENT }}>combo multiplier</span> that scales its
          win.
        </p>
        <p>Your payout is the combined total of every tumble, times your bet.</p>
      </>
    ),
  },
  {
    q: 'Do I make any decisions during a drop?',
    a: (
      <>
        No — once you drop, the cascade resolves on its own. Your choices are the{' '}
        <span style={{ color: ACCENT }}>bet</span> and the{' '}
        <span style={{ color: ACCENT }}>volatility</span>. It&apos;s a watch-it-unfold game, not a
        press-your-luck ladder. The animation you see is just a replay of the result the server
        already computed.
      </>
    ),
  },
  {
    q: 'What does volatility change?',
    a: (
      <>
        It reshapes the combo curve and paytable while keeping the same long-run return.{' '}
        <span style={{ color: ACCENT }}>Calm</span> pays small and often with a gentle combo;{' '}
        <span style={{ color: ACCENT }}>Frenzy</span> needs bigger clusters and pays rarely, but its
        combo can rocket on a long chain. Standard sits between.
      </>
    ),
  },
  {
    q: 'How big can a chain get?',
    a: (
      <>
        As long as each tumble keeps forming new clusters. Most drops settle in a tumble or two, but
        a lucky refill can keep the chain alive — and since the combo multiplier climbs every link, a
        long Frenzy chain is where the top wins come from.
      </>
    ),
  },
  {
    q: 'Does a cold streak make a big chain "due"?',
    a: (
      <>
        No. Every drop is independent and derived fresh from the seeds and a new round — earlier
        drops have zero effect on the next. Nothing is ever &quot;due&quot;.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
