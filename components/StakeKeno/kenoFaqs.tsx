import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const kenoFaqs: FaqItem[] = [
  provablyFairFaq(
    'Keno',
    <>The 10 drawn tiles come from that byte stream via a Fisher–Yates shuffle of the 40-tile board — your picks never touch the draw.</>,
    ACCENT,
  ),
  {
    q: 'How many tiles can I pick?',
    a: (
      <>
        Anywhere from <span style={{ color: ACCENT }}>1 to 10</span> out of 40. The server always draws 10, and
        your matches are your &quot;hits&quot;.
      </>
    ),
  },
  {
    q: 'What do the risk modes change?',
    a: (
      <>
        The <span style={{ color: ACCENT }}>paytable</span>, not the draw. Higher risk pays big for many hits but
        nothing for low hit-counts; lower risk pays smaller amounts more often. The board and draw are identical
        either way.
      </>
    ),
  },
  {
    q: 'What’s the biggest possible payout?',
    a: (
      <>
        The top of the High paytable — a 10-pick with all 10 hit, the jackpot row. The exact multipliers show in
        the payout strip as you pick.
      </>
    ),
  },
  {
    q: 'Do the tiles I didn’t pick matter?',
    a: (
      <>
        No. Only overlaps between your picks and the 10 drawn tiles count; every other tile is ignored.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
