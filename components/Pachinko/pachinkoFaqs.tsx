import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const pachinkoFaqs: FaqItem[] = [
  provablyFairFaq(
    'Pachinko',
    <>The first four bytes of that stream pick your landing pocket from the risk level&apos;s weighted table, fixed before the ball ever moves.</>,
    ACCENT,
  ),
  {
    q: 'How does Pachinko pay out?',
    a: (
      <>
        You drop a ball and it bounces down through the pins into one of nine{' '}
        <span style={{ color: ACCENT }}>pockets</span>. Each pocket pays its multiplier times your
        bet — the outer pockets pay the most, the near-center ones least, and the rare{' '}
        <span style={{ color: ACCENT }}>center gate</span> is the jackpot. Pick a risk level and
        drop; there are no decisions after that.
      </>
    ),
  },
  {
    q: 'How is this different from Plinko?',
    a: (
      <>
        Plinko&apos;s ball spreads on a bell curve, so the center is common and pays little.
        Pachinko uses a <span style={{ color: ACCENT }}>custom pocket distribution</span> with a
        genuine rare <span style={{ color: ACCENT }}>jackpot gate</span> dead center — a different
        outcome shape and a different chase.
      </>
    ),
  },
  {
    q: 'Is the bounce real, or just for show?',
    a: (
      <>
        The bounce is the <span style={{ color: ACCENT }}>reveal animation</span>. The landing
        pocket is fixed the instant you bet — drawn from the server seed, your client seed and a
        nonce — and the ball is then animated into that pocket. The path replays the same seed, so
        Verify can re-derive both the pocket and the bounce.
      </>
    ),
  },
  {
    q: 'What do the risk levels change?',
    a: (
      <>
        The pocket multipliers. <span style={{ color: ACCENT }}>Low</span> is flat and steady with a
        small jackpot; <span style={{ color: ACCENT }}>High</span> makes the outer pockets and the
        center jackpot much bigger but the near-center pockets pay almost nothing. Same long-run
        return (~96%), very different swings.
      </>
    ),
  },
  {
    q: 'Does a losing streak make the jackpot "due"?',
    a: (
      <>
        No. Every drop is independent and derived fresh from the seeds and a new nonce — earlier
        drops have zero effect on the next. The center gate is exactly as likely on your first drop
        as your hundredth.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
