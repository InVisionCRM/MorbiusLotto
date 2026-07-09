// Shared FAQ content used across every arcade game. The site-wide answers
// (MORBIUS, wallet sign-in, fees) are identical everywhere; the
// provably-fair entry is parameterised per game. `accent` tints highlighted
// terms so each entry matches its game's palette.

import type { ReactNode } from 'react';
import type { FaqItem } from './ArcadeFAQ';

const MORBIUS_CONTRACT = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
const MORBIUS_EXPLORER = 'https://scan.pulsechain.com/token/0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';

/** Provably-fair entry — `derivation` is the one-line, game-specific sentence
 *  describing how the HMAC byte stream becomes this game's outcome. */
export function provablyFairFaq(game: string, derivation: ReactNode, accent: string): FaqItem {
  const hl = (text: ReactNode) => <span style={{ color: accent }}>{text}</span>;
  return {
    q: `Is ${game} really fair?`,
    a: (
      <>
        <p>
          Yes — and you can prove it yourself, no trust required. Before you bet, the server picks a
          secret {hl('server seed')} and shows you only its SHA-256 hash. That hash is a public
          commitment: the server can&apos;t swap the seed afterward without the hash no longer matching.
        </p>
        <p>
          Each outcome is then derived by HMAC-SHA256 from that server seed, {hl('your own client seed')},
          and a per-bet nonce — so you influence every result and no one can predict or steer it. {derivation}
        </p>
        <p>
          Rotate the seed (or close the session) and the plaintext server seed is revealed. Hit{' '}
          {hl('Verify')} and anyone can re-derive every round and confirm that{' '}
          <span className="arc-mono">SHA-256(serverSeed)</span> equals the hash you were shown up front.
          If one byte had been changed, it wouldn&apos;t.
        </p>
      </>
    ),
  };
}

/** Site-wide answers shared by every game. */
export function commonFaqs(accent: string): FaqItem[] {
  const hl = (text: ReactNode) => <span style={{ color: accent }}>{text}</span>;
  return [
    {
      q: 'How do I fund my balance to play?',
      a: (
        <>
          <p>
            {hl('MORBIUS')} is the currency you play with. Open the {hl('Deposit')} menu, send MORBIUS
            (or PLS) from your wallet, and your balance is ready to play instantly — one signature, no
            on-chain swap.
          </p>
          <p>
            Your play balance is held off-chain, so deposits are instant and gasless, with{' '}
            {hl('no fee')} to fund or cash out. {hl('Withdraw')} MORBIUS back to your wallet any time.
          </p>
        </>
      ),
    },
    {
      q: 'How do I get MORBIUS?',
      a: (
        <>
          <p>
            MORBIUS is the project&apos;s token on {hl('PulseChain')} (chain&nbsp;ID 369). You buy it on{' '}
            {hl('PulseX')}, the main PulseChain DEX, by swapping PLS or WPLS for MORBIUS — then deposit it
            to your play balance and you&apos;re ready to play.
          </p>
          <p className="arc-mono text-[11px]">
            Contract:{' '}
            <a href={MORBIUS_EXPLORER} target="_blank" rel="noopener noreferrer" style={{ color: accent }} className="underline underline-offset-2 break-all">
              {MORBIUS_CONTRACT}
            </a>
          </p>
          <p>Always confirm the contract address before swapping — never trust a ticker alone.</p>
        </>
      ),
    },
    {
      q: 'Why do I have to sign a message in my wallet?',
      a: (
        <>
          <p>
            It&apos;s a {hl('Sign-In with Ethereum')} (SIWE) signature — an off-chain message, <em>not</em> a
            transaction. It costs no gas, moves no funds, and grants no token approvals. It only proves you
            control your address so we can open a login session for you.
          </p>
          <div
            className="arc-mono rounded-md p-2.5 text-[11px] leading-relaxed"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}
          >
            <div style={{ color: '#cbd5e1' }}>morbius.io wants you to sign in with your Ethereum account:</div>
            <div style={{ color: accent }}>0xYour…Wallet</div>
            <div className="my-1.5" style={{ color: '#cbd5e1' }}>Sign in to MORBIUS. This proves you own this wallet. No funds will move.</div>
            <div>URI: https://morbius.io</div>
            <div>Version: 1</div>
            <div>Chain ID: 369</div>
            <div>Nonce: a1b2c3…</div>
            <div>Issued At: 2026-06-13T07:33:00Z</div>
          </div>
          <p>Line by line:</p>
          <ul className="space-y-1.5 pl-1">
            <li><span style={{ color: accent }}>Domain</span> — who&apos;s asking (morbius.io). Your wallet shows it so a look-alike site can&apos;t phish your sign-in.</li>
            <li><span style={{ color: accent }}>Address</span> — the account you&apos;re signing in as.</li>
            <li><span style={{ color: accent }}>Statement</span> — the plain-English purpose; it spells out that no funds will move.</li>
            <li><span style={{ color: accent }}>URI / Version</span> — the SIWE standard (EIP-4361) and the site origin.</li>
            <li><span style={{ color: accent }}>Chain ID</span> — 369, PulseChain.</li>
            <li><span style={{ color: accent }}>Nonce</span> — a one-time random value. The server issues it, accepts it once, and expires it in ten minutes, so a captured signature can never be replayed.</li>
            <li><span style={{ color: accent }}>Issued At</span> — when it was created.</li>
          </ul>
          <p>
            SIWE is the web3 standard for exactly this: it replaces passwords with a gasless signature
            that&apos;s phishing-resistant (domain-bound), replay-proof (the nonce), and never exposes your
            private key or touches your funds. A signature is not a transaction.
          </p>
        </>
      ),
    },
    {
      q: 'Can signing in or playing drain my wallet?',
      a: (
        <>
          <p>
            No. Signing in is an off-chain message — it can&apos;t spend, move, or approve anything on-chain.
            We never ask for a token approval to play.
          </p>
          <p>
            Your play balance is held off-chain, so the only thing you can ever lose is the {hl('MORBIUS you choose to bet')}.
            The rest of your wallet is untouched.
          </p>
        </>
      ),
    },
    {
      q: 'What are the fees?',
      a: (
        <>
          <p>
            These games take {hl('no per-bet or per-payout fee')}. Instead each game keeps a small
            built-in house edge in its odds — for example crash and dice return about 99% over time (a ~1%
            edge). Depositing and withdrawing MORBIUS is free.
          </p>
          <p className="text-slate-500">
            (Poker is the one exception — it takes a small rake from each pot, the standard way poker works.)
          </p>
        </>
      ),
    },
    {
      q: 'Which network do I need?',
      a: (
        <p>
          {hl('PulseChain')} — chain ID {hl('369')}. Add it to your wallet and make sure you&apos;re connected
          to it; MORBIUS and your balances live there. Most wallets will offer to switch networks for you.
        </p>
      ),
    },
    {
      q: 'Why was I signed out, or asked to sign again?',
      a: (
        <p>
          Your session lasts about {hl('7 days')}, and every sign-in nonce is single-use. When the session
          expires — or you clear cookies, or switch wallet/account — you&apos;ll sign a fresh message. It&apos;s
          still gasless and free.
        </p>
      ),
    },
  ];
}
