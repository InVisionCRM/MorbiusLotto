import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const plinkoFaqs: FaqItem[] = [
  provablyFairFaq(
    'Plinko',
    <>The landing bucket is chosen from that byte stream; the ball you watch is a deterministic replay into that exact slot.</>,
    ACCENT,
  ),
  {
    q: 'Are the bucket multipliers fixed?',
    a: (
      <>
        Yes — each risk level has a published multiplier table from the server, and the ball&apos;s bucket is
        <span style={{ color: ACCENT }}> committed before it drops</span>. The physics is just a replay into the
        pre-decided slot.
      </>
    ),
  },
  {
    q: 'Does risk change the odds or just the spread?',
    a: (
      <>
        The spread. Higher risk thins the common centre buckets and fattens the rare edge multipliers; lower risk
        is flatter and steadier. It&apos;s still 16 rows into 17 buckets either way.
      </>
    ),
  },
  {
    q: 'Why did the centre pay less than 1×?',
    a: (
      <>
        Centre buckets are the most likely landing spots, so they pay below your bet — the trade-off for the big,
        rare edges, and where the house edge lives.
      </>
    ),
  },
  {
    q: 'Can a ball miss a bucket?',
    a: <>No. Every drop resolves into exactly one of the 17 buckets, decided before the animation begins.</>,
  },
  ...commonFaqs(ACCENT),
];
