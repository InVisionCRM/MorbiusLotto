import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const rouletteFaqs: FaqItem[] = [
  provablyFairFaq(
    'Roulette',
    <>The winning pocket is that byte stream reduced to one of 37 pockets (0–36); the wheel animation just lands on the number already chosen.</>,
    ACCENT,
  ),
  {
    q: 'Single or double zero?',
    a: (
      <>
        Single zero — a <span style={{ color: ACCENT }}>European</span> wheel, 37 pockets (0–36). That&apos;s the
        player-friendly version: a 2.70% house edge versus 5.26% on a double-zero wheel.
      </>
    ),
  },
  {
    q: 'What happens when 0 hits?',
    a: (
      <>
        Straight-up and inside bets covering 0 still win; the even-money bets (red/black, even/odd, 1–18/19–36)
        and the dozens and columns all lose. That single green pocket is the house edge.
      </>
    ),
  },
  {
    q: 'Is there a max bet per spin?',
    a: <>Yes — up to 20 placed zones and 5,000 chips total across the felt per spin.</>,
  },
  {
    q: 'Can I rebet my last layout?',
    a: (
      <>
        Yes — <span style={{ color: ACCENT }}>Rebet</span> restores your previous chip layout, and Undo and Clear
        let you adjust before spinning.
      </>
    ),
  },
  {
    q: 'Are spins independent?',
    a: (
      <>
        Yes. Each spin draws a fresh pocket from a new nonce — the wheel has no memory of the last result, hot or
        cold.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
