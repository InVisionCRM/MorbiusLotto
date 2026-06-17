import type { FaqItem } from '@/components/arcade2/ArcadeFAQ';
import { provablyFairFaq, commonFaqs } from '@/components/arcade2/arcadeCommonFaqs';

const ACCENT = '#22D3EE';

export const cipherFaqs: FaqItem[] = [
  provablyFairFaq(
    'Cipher',
    <>
      The secret code is derived from that byte stream when the round starts and sealed behind the
      hash — each guess just re-scores against the fixed code.
    </>,
    ACCENT,
  ),
  {
    q: 'How does Cipher pay out?',
    a: (
      <>
        Each round seals a secret code of coloured pegs. Every guess returns two numbers:{' '}
        <span style={{ color: ACCENT }}>exact</span> pegs (right colour in the right slot, shown ●)
        and <span style={{ color: ACCENT }}>partial</span> pegs (right colour, wrong slot, shown ○).
        Crack the whole code and you win the <span style={{ color: ACCENT }}>crack ladder</span> for
        the try you cracked on — cracking on guess 1 pays a jackpot, and the prize decays with every
        guess you spend. Or <span style={{ color: ACCENT }}>bank</span> the secured multiplier your
        best exact-peg count has earned and walk with a guaranteed win.
      </>
    ),
  },
  {
    q: 'Is the code really fair — couldn’t it change as I guess?',
    a: (
      <>
        No. Before you bet, the server picks a secret server seed and shows you only its SHA-256 hash
        — a public commitment it can’t back out of. The code is derived by HMAC from that seed, your
        client seed, and a per-bet nonce, and is{' '}
        <span style={{ color: ACCENT }}>fixed the instant the round starts</span>. When the round
        ends the plaintext server seed is revealed, so anyone can re-derive the exact code and
        re-check every guess’s feedback. A changed code would fail the hash.
      </>
    ),
  },
  {
    q: 'Does skill let me beat the house?',
    a: (
      <>
        Smart deduction absolutely helps you crack faster and bank more — that’s the fun. But the
        crack and secured ladders are tuned so that even optimal play returns just under your stake
        on average (a small built-in <span style={{ color: ACCENT }}>house edge</span>). You’re
        playing for the swing, not a guaranteed grind.
      </>
    ),
  },
  {
    q: 'What happens if I run out of guesses?',
    a: (
      <>
        If you use your last try without cracking the code{' '}
        <span style={{ color: ACCENT }}>and</span> without banking, the round busts and you lose your
        bet. A near-complete code is worth banking, but pushing for the full crack risks it all.
      </>
    ),
  },
  {
    q: 'Are duplicate colours allowed in the code?',
    a: (
      <>
        Yes — the same colour can appear in more than one slot, so don’t assume four pegs means four
        different colours. The feedback counts handle duplicates correctly (a colour is only ever
        credited as many times as it actually appears).
      </>
    ),
  },
  {
    q: 'What if I refresh mid-round?',
    a: (
      <>
        Your active round <span style={{ color: ACCENT }}>resumes</span> — the server keeps one open
        round per wallet, so a reload restores your guesses, feedback and remaining tries exactly
        where you left off.
      </>
    ),
  },
  ...commonFaqs(ACCENT),
];
