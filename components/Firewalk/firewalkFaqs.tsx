import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const firewalkFaqs: FaqItem[] = [
  provablyFairFaq(
    'Firewalk',
    <>
      Which stones crumble is fixed by that byte stream when the round starts and sealed behind the
      hash — stepping onto a stone just looks one up.
    </>,
    ACCENT,
  ),
  {
    q: 'What does the pace change?',
    a: (
      <>
        How many stones you commit to in one move — <span style={{ color: ACCENT }}>hop one</span>,
        leap two, or bound three. Leaping covers more ground (a bigger multiplier jump) but reveals
        several stones at once: any of them crumbling ends the walk. Each stone carries the same small
        house edge, so pace is purely your <span style={{ color: ACCENT }}>risk appetite</span>, not a
        way to beat the math.
      </>
    ),
  },
  {
    q: 'Can the coals change after I start?',
    a: (
      <>
        No. The moment you bet, every stone is set solid-or-crumbling and{' '}
        <span style={{ color: ACCENT }}>sealed behind the commitment hash</span>. You choose how far
        to walk and at what pace, but the coals can&apos;t shift under you.
      </>
    ),
  },
  {
    q: 'What if I refresh mid-round?',
    a: (
      <>
        Your active round <span style={{ color: ACCENT }}>resumes</span> — the server keeps one open
        round per wallet, so a reload picks up exactly where you left off, position and multiplier
        intact.
      </>
    ),
  },
  {
    q: 'What do the heat levels do?',
    a: (
      <>
        Hotter coals crumble more often (Low 8%, Med 17%, High 30% per stone), so every safe step
        jumps the multiplier more. High heat busts fast but climbs fastest.
      </>
    ),
  },
  {
    q: 'Can I fall on my very first step?',
    a: (
      <>
        Yes — if the first stone in your leap crumbles, the round ends. You can only cash out once
        you&apos;ve safely crossed at least one stone.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
