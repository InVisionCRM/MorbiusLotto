import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const heistFaqs: FaqItem[] = [
  provablyFairFaq(
    'Heist',
    <>
      Which door in each room is wired to the alarm is fixed by that byte stream when the job starts
      and sealed behind the hash — cracking a door just looks one up.
    </>,
    ACCENT,
  ),
  {
    q: 'How does a Heist work?',
    a: (
      <>
        You break into a vault one room at a time. Each room shows several doors and{' '}
        <span style={{ color: ACCENT }}>one or more is wired to the alarm</span>. Crack a safe door to
        advance to the next room and compound your multiplier; trip the alarm and the job&apos;s over —
        you lose the bet. You choose which door to crack each room.
      </>
    ),
  },
  {
    q: 'How do alarms and difficulty change the odds?',
    a: (
      <>
        Harder targets put <span style={{ color: ACCENT }}>more alarm doors</span> in each room (or
        fewer doors overall), so each crack is a riskier pick — but the multiplier jumps much further
        per room. The same small house edge is baked into every rung, so difficulty is your{' '}
        <span style={{ color: ACCENT }}>risk appetite</span>, not a way to beat the math.
      </>
    ),
  },
  {
    q: 'When can I escape with the loot?',
    a: (
      <>
        After any cleared room you can <span style={{ color: ACCENT }}>escape</span> (cash out) at your
        current multiplier. There&apos;s no escape before you&apos;ve cracked at least one room. Clear
        every room in the target and the job <span style={{ color: ACCENT }}>auto-settles</span> at the
        top of the ladder.
      </>
    ),
  },
  {
    q: 'Can the alarm wiring change after I start?',
    a: (
      <>
        No. The moment you bet, every room&apos;s alarm door is set and{' '}
        <span style={{ color: ACCENT }}>sealed behind the commitment hash</span>. You decide which door
        to crack and when to escape, but the wiring can&apos;t shift under you.
      </>
    ),
  },
  {
    q: 'Is Heist provably fair?',
    a: (
      <>
        Yes. Before you bet, the server commits to a hashed server seed; the alarm layout is derived
        from that seed plus your client seed. When the round settles the plaintext seed is revealed, so
        anyone can hit <span style={{ color: ACCENT }}>Verify</span> on a finished job and re-derive
        every room to confirm the wiring was fixed up front and never moved.
      </>
    ),
  },
  {
    q: 'What if I refresh mid-job?',
    a: (
      <>
        Your active job <span style={{ color: ACCENT }}>resumes</span> — the server keeps one open round
        per wallet, so a reload picks up exactly where you left off, room and multiplier intact.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
