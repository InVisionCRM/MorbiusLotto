'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { X, LifeBuoy, Send } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const TELEGRAM_HANDLE = '@Morbius_cash'
const TELEGRAM_URL = 'https://t.me/Morbius_cash'

type QA = { q: string; a: React.ReactNode }

const SIMPLE: QA[] = [
  {
    q: 'How do I deposit?',
    a: 'Connect your wallet, then use the Deposit / Withdraw button. Deposit PLS or MORBIUS and it lands in your MORBIUS balance instantly — one signature, no on-chain swap. It auto-converts in the background, so it’s ready to play right away.',
  },
  {
    q: 'What is MORBIUS?',
    a: 'MORBIUS is the in-game currency you play with everywhere on the site. Deposit MORBIUS (or PLS) from the wallet menu and your balance is ready to play instantly — gameplay is fast and gasless, and you can withdraw to your wallet any time.',
  },
  {
    q: 'How do I withdraw?',
    a: 'Open Deposit / Withdraw and switch to the Withdraw tab. Your MORBIUS balance is sent straight to your connected wallet.',
  },
  {
    q: 'How do I play?',
    a: 'Pick a game from the lobby, set your bet, and play — every game is played in MORBIUS. Wins are credited straight to your balance, no separate claim.',
  },
  {
    q: 'Are the games fair?',
    a: (
      <>
        Yes — every round is provably fair. On your <b className="text-white/90">Activity</b> tab, click{' '}
        <b className="text-cyan-300">Verify</b> on any round to see the server seed, client seed, nonce and the
        derivation recipe, and confirm it matches the hash committed before the round.
      </>
    ),
  },
]

const ADVANCED: QA[] = [
  {
    q: 'How does provably-fair verification actually work?',
    a: 'Before each round the server publishes a SHA-256 hash of a secret server seed (the commitment). After the round it reveals the seed; you combine it with your client seed and the nonce using the published recipe to independently recompute the outcome. Because the revealed seed must hash to the pre-committed value, the result couldn’t have been changed after you bet.',
  },
  {
    q: 'What network is this on?',
    a: 'PulseChain (chain ID 369), an EVM-compatible network where PLS behaves like ETH. Make sure your wallet is connected to PulseChain.',
  },
  {
    q: 'My wallet didn’t pop up / a transaction failed — what do I do?',
    a: 'Confirm your wallet is connected and on PulseChain, then retry the action from a fresh click (signing prompts need a direct tap). If you’re in a wallet’s in-app browser, re-open the connect flow. Still stuck? Reach out on Telegram below.',
  },
  {
    q: 'Where can I see my full history?',
    a: 'Right here on your dashboard: Activity (every bet and win), Poker (cash sessions + tournaments), and Transactions (deposits/withdrawals) — each exportable to CSV.',
  },
]

function Section({ title, items, prefix }: { title: string; items: QA[]; prefix: string }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/40">{title}</div>
      <Accordion type="single" collapsible className="w-full">
        {items.map((item, i) => (
          <AccordionItem key={`${prefix}-${i}`} value={`${prefix}-${i}`} className="border-white/10">
            <AccordionTrigger className="text-left text-[14px] text-white/90 hover:no-underline">
              {item.q}
            </AccordionTrigger>
            <AccordionContent className="text-[13px] leading-relaxed text-white/65">{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}

export function HelpFaqModal({ onClose }: { onClose: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: 'rgba(2,6,12,0.72)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl"
        style={{
          background: 'linear-gradient(rgba(255,255,255,0.04), rgba(255,255,255,0) 22%), rgba(8,20,31,0.96)',
          border: '1px solid rgba(34,211,238,0.18)',
          boxShadow: '0 24px 60px -24px rgba(0,0,0,0.9)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-4.5 w-4.5 text-cyan-400" />
            <span className="arc-display text-[15px] font-bold uppercase tracking-wide text-white">Help &amp; FAQ</span>
          </div>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-5">
          <Section title="Getting started" items={SIMPLE} prefix="s" />
          <Section title="Advanced" items={ADVANCED} prefix="a" />

          <div
            className="rounded-xl p-4"
            style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)' }}
          >
            <div className="text-[14px] font-semibold text-white">Having an issue that’s not listed?</div>
            <p className="mt-1 text-[13px] text-white/65">
              Reach us on Telegram for the fastest support:
            </p>
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 inline-flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3.5 py-2 text-[13.5px] font-bold text-cyan-300 transition-colors hover:bg-cyan-400/20"
            >
              <Send className="h-4 w-4" />
              {TELEGRAM_HANDLE}
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default HelpFaqModal
