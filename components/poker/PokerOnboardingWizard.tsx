'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ArrowRight, ArrowLeft, ExternalLink, Coins, Check, PartyPopper } from 'lucide-react';
import { WalletIcon } from '@/components/shared/WalletIcon';
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import { formatChips } from '@/lib/format-poker-chips';
import type { PokerOnboardingStep } from '@/hooks/use-poker-onboarding';

const PULSEX_SWAP_URL = `https://app.pulsex.com/swap?outputCurrency=${MORBIUS_TOKEN_ADDRESS}`;
const MORBIUS_LOGO = '/morbius/MorbiusLogo-2.svg';

// Switch.Win embedded swap widget. PLS (0xeee… sentinel) → MORBIUS, themed to match
// the lobby. partnerAddress is the MORBlotto fee/referral address so we earn a cut
// of swaps users make through this widget.
const SWITCH_WIN_PARTNER = '0xAd68d9aB6a8dc413133573BEAE2B1b9Fa4a5b03E';
const SWITCH_WIN_WIDGET_URL = (() => {
  const params = new URLSearchParams({
    network: 'pulsechain',
    background_color: '050a12',
    font_color: 'ffffff',
    secondary_font_color: '7a7a7a',
    border_color: '22d3ee',
    backdrop_color: 'transparent',
    from: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    to: MORBIUS_TOKEN_ADDRESS,
    partnerAddress: SWITCH_WIN_PARTNER,
  });
  return `https://switch.win/widget?${params.toString()}`;
})();

export interface PokerOnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  /** Computed step from usePokerOnboarding. The wizard auto-shows the right view. */
  step: PokerOnboardingStep;
  isConnected: boolean;
  walletMorbiusWei: bigint;
  playBalanceWei: bigint;
  chipsBn: bigint;
  /** Opens the deposit modal (GameWalletModal). */
  onOpenDeposit: () => void;
  /** Opens the chip exchange modal. */
  onOpenExchange: () => void;
  /** Optional callback when the user clicks the final "I'll pick a table" CTA. */
  onPickTable?: () => void;
}

function StepDots({ active }: { active: 1 | 2 | 3 | 4 }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-1">
      {[1, 2, 3, 4].map((n) => {
        const done = n < active;
        const current = n === active;
        return (
          <div
            key={n}
            className={`h-1.5 rounded-full transition-all ${
              current ? 'w-8 bg-cyan-400' : done ? 'w-4 bg-cyan-500/60' : 'w-4 bg-white/15'
            }`}
            aria-hidden
          />
        );
      })}
    </div>
  );
}

function VisualRow({ label, value, hint }: { label: string; value: React.ReactNode; hint?: 'good' | 'muted' }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0 border-b border-white/[0.06] last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span
        className={`font-mono text-sm tabular-nums ${
          hint === 'good' ? 'text-emerald-300' : hint === 'muted' ? 'text-slate-500' : 'text-white'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function MorbiusBadge({ size = 16 }: { size?: number }) {
  return <img src={MORBIUS_LOGO} alt="" className="inline-block object-contain" style={{ width: size, height: size }} />;
}

export function PokerOnboardingWizard({
  isOpen,
  onClose,
  step,
  isConnected,
  walletMorbiusWei,
  playBalanceWei,
  chipsBn,
  onOpenDeposit,
  onOpenExchange,
  onPickTable,
}: PokerOnboardingWizardProps) {
  // Clamp display step to 1-4 (the wizard only renders these). If onboarding is complete (step 5),
  // show step 4 as a celebration screen.
  const displayStep: 1 | 2 | 3 | 4 = useMemo(() => {
    if (step <= 1) return 1;
    if (step === 2) return 2;
    if (step === 3) return 3;
    return 4;
  }, [step]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Auto-close 1.2s after reaching the "ready" screen if the user is just watching.
  const wasReady = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      wasReady.current = false;
      return;
    }
    if (displayStep === 4 && !wasReady.current) {
      wasReady.current = true;
    }
  }, [isOpen, displayStep]);

  if (typeof document === 'undefined') return null;

  const formatMorb = (wei: bigint) => formatMorbiusFloor(wei.toString());

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[40] bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <div className="fixed inset-0 z-[40] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              key="card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="poker-onboarding-title"
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="pointer-events-auto relative w-full max-w-lg rounded-2xl overflow-hidden border-2 border-cyan-500/30 shadow-2xl shadow-cyan-500/10 max-h-[calc(100vh-2rem)] flex flex-col"
              style={{
                background: 'linear-gradient(155deg, #0c1929 0%, #0a0f1a 50%, #0d1117 100%)',
              }}
            >
              {/* Header */}
              <div className="relative px-5 pt-5 pb-3">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" aria-hidden />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-400/80 font-bold">
                      Get ready to play · Step {displayStep} of 4
                    </div>
                    <h2 id="poker-onboarding-title" className="mt-1 text-lg font-bold text-white">
                      {displayStep === 1 && 'Get some MORBIUS'}
                      {displayStep === 2 && 'Deposit MORBIUS'}
                      {displayStep === 3 && 'Convert MORBIUS to chips'}
                      {displayStep === 4 && (step === 5 ? "You're all set" : 'Ready to sit down')}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
                <StepDots active={displayStep} />
              </div>

              {/* Body */}
              <div className="px-5 pb-5 pt-2 overflow-y-auto flex-1">
                {displayStep === 1 && (
                  <Step1GetMorbius
                    isConnected={isConnected}
                    walletMorbiusWei={walletMorbiusWei}
                    formatMorb={formatMorb}
                  />
                )}
                {displayStep === 2 && (
                  <Step2Deposit
                    walletMorbiusWei={walletMorbiusWei}
                    playBalanceWei={playBalanceWei}
                    onOpenDeposit={onOpenDeposit}
                    formatMorb={formatMorb}
                  />
                )}
                {displayStep === 3 && (
                  <Step3Convert
                    playBalanceWei={playBalanceWei}
                    chipsBn={chipsBn}
                    onOpenExchange={onOpenExchange}
                    formatMorb={formatMorb}
                  />
                )}
                {displayStep === 4 && (
                  <Step4Ready
                    chipsBn={chipsBn}
                    onPickTable={() => {
                      onPickTable?.();
                      onClose();
                    }}
                  />
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Step 1 — Get MORBIUS
// ───────────────────────────────────────────────────────────────────────────────
function Step1GetMorbius({
  isConnected,
  walletMorbiusWei,
  formatMorb,
}: {
  isConnected: boolean;
  walletMorbiusWei: bigint;
  formatMorb: (wei: bigint) => string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300 leading-relaxed">
        Swap PLS (PulseChain&apos;s native coin) for MORBIUS right here. $20–$50 worth is plenty to start.
      </p>

      {/* Switch.Win embedded swap widget — themed dark/cyan to match the wizard. */}
      <div className="rounded-xl overflow-hidden border border-cyan-500/25 bg-[#050a12]">
        <iframe
          src={SWITCH_WIN_WIDGET_URL}
          title="Switch.Win — swap PLS to MORBIUS"
          allow="clipboard-read; clipboard-write"
          className="block w-full"
          style={{ height: 580, border: 0 }}
        />
      </div>

      <div className="rounded-xl bg-slate-900/60 border border-white/[0.06] p-3 text-xs">
        <VisualRow
          label="Wallet"
          value={
            isConnected ? (
              <span className="inline-flex items-center gap-1.5">
                <MorbiusBadge /> {formatMorb(walletMorbiusWei)}
              </span>
            ) : (
              <span className="text-amber-300">Not connected</span>
            )
          }
          hint={walletMorbiusWei > 0n ? 'good' : 'muted'}
        />
      </div>

      <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
        <span>Once MORBIUS lands in your wallet, this window auto-advances.</span>
        <a
          href={PULSEX_SWAP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-slate-400 hover:text-cyan-300 transition-colors shrink-0"
        >
          PulseX <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Step 2 — Deposit
// ───────────────────────────────────────────────────────────────────────────────
function Step2Deposit({
  walletMorbiusWei,
  playBalanceWei,
  onOpenDeposit,
  formatMorb,
}: {
  walletMorbiusWei: bigint;
  playBalanceWei: bigint;
  onOpenDeposit: () => void;
  formatMorb: (wei: bigint) => string;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300 leading-relaxed">
        Deposit MORBIUS from your wallet into your <span className="text-cyan-300 font-semibold">play balance</span>. One
        transaction, then you&apos;re ready to convert it into poker chips.
      </p>

      <div className="rounded-xl bg-slate-900/60 border border-white/[0.06] p-3 text-xs">
        <VisualRow
          label="In your wallet"
          value={
            <span className="inline-flex items-center gap-1.5">
              <MorbiusBadge /> {formatMorb(walletMorbiusWei)}
            </span>
          }
          hint={walletMorbiusWei > 0n ? 'good' : 'muted'}
        />
        <VisualRow
          label="Play balance"
          value={
            <span className="inline-flex items-center gap-1.5">
              <MorbiusBadge /> {formatMorb(playBalanceWei)}
            </span>
          }
          hint={playBalanceWei > 0n ? 'good' : 'muted'}
        />
      </div>

      <button
        type="button"
        onClick={onOpenDeposit}
        className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.01]"
        style={{
          background: 'linear-gradient(135deg, #0891b2, #2563eb)',
          boxShadow: '0 8px 32px rgba(6, 182, 212, 0.25), 0 0 0 1px rgba(34, 211, 238, 0.2)',
        }}
      >
        <span className="inline-flex items-center gap-2">
          <WalletIcon size={16} /> Open deposit
        </span>
      </button>

      <p className="text-xs text-slate-500 text-center">
        After you deposit, come back here — the next step unlocks automatically.
      </p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Step 3 — Convert MORBIUS → chips
// ───────────────────────────────────────────────────────────────────────────────
function Step3Convert({
  playBalanceWei,
  chipsBn,
  onOpenExchange,
  formatMorb,
}: {
  playBalanceWei: bigint;
  chipsBn: bigint;
  onOpenExchange: () => void;
  formatMorb: (wei: bigint) => string;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300 leading-relaxed">
        Chips are what you bet at the poker table. They convert <span className="text-cyan-300 font-semibold">1:1</span> with
        MORBIUS — and you can cash them out back to MORBIUS any time.
      </p>

      <div className="rounded-xl bg-slate-900/60 border border-white/[0.06] p-3 text-xs">
        <VisualRow
          label="Play balance"
          value={
            <span className="inline-flex items-center gap-1.5">
              <MorbiusBadge /> {formatMorb(playBalanceWei)}
            </span>
          }
          hint={playBalanceWei > 0n ? 'good' : 'muted'}
        />
        <VisualRow
          label="Poker chips"
          value={
            <span className="inline-flex items-center gap-1.5">
              <Coins size={12} className="text-cyan-300" /> {formatChips(chipsBn)}
            </span>
          }
          hint={chipsBn > 0n ? 'good' : 'muted'}
        />
      </div>

      <button
        type="button"
        onClick={onOpenExchange}
        className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.01]"
        style={{
          background: 'linear-gradient(135deg, #0891b2, #2563eb)',
          boxShadow: '0 8px 32px rgba(6, 182, 212, 0.25), 0 0 0 1px rgba(34, 211, 238, 0.2)',
        }}
      >
        <span className="inline-flex items-center gap-2">
          <Coins size={16} /> Open chip exchange
        </span>
      </button>

      <p className="text-xs text-slate-500 text-center">
        We&apos;ll pre-fill the max amount for you in the exchange.
      </p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Step 4 — Ready to sit
// ───────────────────────────────────────────────────────────────────────────────
function Step4Ready({ chipsBn, onPickTable }: { chipsBn: bigint; onPickTable: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <div
        className="mx-auto w-14 h-14 rounded-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(6,182,212,0.15))',
          border: '1px solid rgba(16,185,129,0.4)',
          boxShadow: '0 0 32px rgba(16,185,129,0.25)',
        }}
      >
        <PartyPopper className="w-7 h-7 text-emerald-300" />
      </div>

      <div>
        <p className="text-sm text-slate-300 leading-relaxed">
          You&apos;ve got <span className="text-emerald-300 font-bold tabular-nums">{formatChips(chipsBn)}</span> chips at the
          table. Pick a cash game or jump into a Sit &amp; Go tournament — the buttons below the lobby header will work now.
        </p>
      </div>

      <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-400/20 p-3 text-left text-xs space-y-1.5">
        <div className="flex items-center gap-2 text-emerald-300">
          <Check size={14} /> Wallet connected
        </div>
        <div className="flex items-center gap-2 text-emerald-300">
          <Check size={14} /> MORBIUS in wallet
        </div>
        <div className="flex items-center gap-2 text-emerald-300">
          <Check size={14} /> Deposited &amp; converted to chips
        </div>
      </div>

      <button
        type="button"
        onClick={onPickTable}
        className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.01]"
        style={{
          background: 'linear-gradient(135deg, #10b981, #06b6d4)',
          boxShadow: '0 8px 32px rgba(16, 185, 129, 0.25), 0 0 0 1px rgba(16, 185, 129, 0.3)',
        }}
      >
        <span className="inline-flex items-center gap-2 justify-center">
          Pick a table <ArrowRight size={16} />
        </span>
      </button>
    </div>
  );
}
