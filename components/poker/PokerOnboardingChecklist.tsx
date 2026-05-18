'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import type { PokerOnboardingStep } from '@/hooks/use-poker-onboarding';

export interface PokerOnboardingChecklistProps {
  /** Current step from usePokerOnboarding. Hidden when complete or dismissed. */
  step: PokerOnboardingStep;
  isConnected: boolean;
  dismissed: boolean;
  /** Open the wizard at the appropriate step. */
  onResume: () => void;
  /** Hide for this session (writes to localStorage). */
  onDismiss: () => void;
}

type RowState = 'done' | 'active' | 'todo';
interface Row {
  /** Short tag shown in the brutalist label strip. */
  tag: string;
  state: RowState;
}

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four'] as const;

function rowsForStep(step: PokerOnboardingStep, isConnected: boolean): Row[] {
  const get = (idx: 1 | 2 | 3 | 4): RowState => {
    if (step === 5) return 'done';
    if (idx === 1) return isConnected ? 'done' : 'active';
    if (idx === 2) {
      if (step >= 2) return 'done';
      if (step === 1) return 'active';
      return 'todo';
    }
    if (idx === 3) {
      if (step >= 4) return 'done';
      if (step === 2 || step === 3) return 'active';
      return 'todo';
    }
    if (step === 4) return 'active';
    return 'todo';
  };
  return [
    { tag: 'Wallet', state: get(1) },
    { tag: 'MORBIUS', state: get(2) },
    { tag: 'Chips', state: get(3) },
    { tag: 'Sit', state: get(4) },
  ];
}

function subtitleFor(step: PokerOnboardingStep, isConnected: boolean): string {
  if (!isConnected) {
    return 'Connect your wallet up top to start. Four quick steps and you’re at the table.';
  }
  if (step === 1) return 'First up: grab some MORBIUS on PulseX and we’ll walk you through the rest.';
  if (step === 2) return 'MORBIUS is in your wallet. Deposit it to your play balance next.';
  if (step === 3) return 'Funded. One more swap to chips and you’re sitting down.';
  if (step === 4) return 'You’ve connected, funded, and stacked your chips. Pick any open seat below and you’re in.';
  return 'Almost there — we’ll walk you through each step.';
}

function ctaLabelFor(step: PokerOnboardingStep): string {
  if (step === 0) return 'Connect wallet';
  if (step === 1) return 'Get MORBIUS';
  if (step === 2) return 'Deposit MORBIUS';
  if (step === 3) return 'Get chips';
  if (step === 4) return 'Pick a table';
  return 'Continue setup';
}

export function PokerOnboardingChecklist({
  step,
  isConnected,
  dismissed,
  onResume,
  onDismiss,
}: PokerOnboardingChecklistProps) {
  const visible = step < 5 && !dismissed;

  const rows = useMemo(() => rowsForStep(step, isConnected), [step, isConnected]);
  const done = rows.filter((r) => r.state === 'done').length;
  const remaining = rows.length - done;
  const remainingWord = NUMBER_WORDS[remaining] ?? String(remaining);
  const remainingNoun = remaining === 1 ? 'Step left' : 'Steps left';
  const subtitle = subtitleFor(step, isConnected);
  const ctaLabel = ctaLabelFor(step);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
          className="relative rounded-2xl overflow-hidden border border-cyan-500/25"
          style={{
            background: 'linear-gradient(135deg, #0c1929 0%, #050a14 100%)',
          }}
        >
          {/* Cyan glow on the right */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 90% 50%, rgba(6,182,212,0.18), transparent 60%)',
            }}
            aria-hidden
          />
          {/* Top accent line */}
          <div
            className="absolute inset-x-0 top-0 h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(34,211,238,0.55), transparent)',
            }}
            aria-hidden
          />

          {/* Dismiss */}
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-3 right-3 z-10 rounded-full p-1.5 text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Hide getting-started checklist"
          >
            <X size={14} />
          </button>

          {/* Content */}
          <div className="relative grid items-center gap-6 px-6 py-7 sm:gap-8 sm:px-9 sm:py-8 lg:grid-cols-[1fr_auto]">
            {/* Left column */}
            <div className="min-w-0">
              <div
                className="text-[11px] font-bold uppercase text-cyan-400"
                style={{ letterSpacing: '0.3em' }}
              >
                Getting started
              </div>

              <h2
                className="mt-2 text-white"
                style={{
                  fontFamily: '"Mitr", sans-serif',
                  fontWeight: 700,
                  fontSize: 'clamp(32px, 5vw, 56px)',
                  lineHeight: 0.95,
                  letterSpacing: '-0.02em',
                }}
              >
                {remainingWord} {remaining === 1 ? 'step' : 'steps'}{' '}
                <span style={{ color: '#06b6d4', fontStyle: 'italic' }}>
                  to your<br className="hidden sm:inline" /> first hand
                </span>
              </h2>

              <p className="mt-4 max-w-[460px] text-sm leading-relaxed text-slate-400 sm:text-[15px]">
                {subtitle}
              </p>

              {/* Segmented progress bar */}
              <div className="mt-6 flex gap-1.5" aria-hidden>
                {rows.map((row, i) => (
                  <div
                    key={i}
                    className="h-1.5 flex-1 overflow-hidden rounded-full"
                    style={{
                      background:
                        row.state === 'done'
                          ? '#06b6d4'
                          : row.state === 'active'
                            ? 'linear-gradient(90deg, #06b6d4 50%, rgba(6,182,212,0.2) 50%)'
                            : 'rgba(148,163,184,0.15)',
                      animation:
                        row.state === 'active'
                          ? 'morblotto-onboard-flash 1.8s ease-in-out infinite'
                          : undefined,
                    }}
                  />
                ))}
              </div>

              {/* Step tags */}
              <div className="mt-2.5 flex gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em]">
                {rows.map((row) => (
                  <div
                    key={row.tag}
                    className="flex-1"
                    style={{
                      color:
                        row.state === 'done'
                          ? '#06b6d4'
                          : row.state === 'active'
                            ? '#ffffff'
                            : '#475569',
                    }}
                  >
                    {row.tag}
                  </div>
                ))}
              </div>
            </div>

            {/* Right column — giant number + CTA */}
            <div className="flex flex-row items-end gap-5 lg:flex-col lg:items-end lg:gap-5">
              <div className="text-right">
                <div
                  className="text-white tabular-nums"
                  style={{
                    fontFamily: '"Mitr", sans-serif',
                    fontWeight: 700,
                    fontSize: 'clamp(80px, 14vw, 140px)',
                    lineHeight: 0.85,
                    letterSpacing: '-0.05em',
                  }}
                >
                  {remaining}
                </div>
                <div
                  className="mt-1 text-[11px] font-bold uppercase text-cyan-400"
                  style={{ letterSpacing: '0.2em' }}
                >
                  {remainingNoun}
                </div>
              </div>

              <button
                type="button"
                onClick={onResume}
                className="rounded-xl px-6 py-3.5 text-sm font-bold text-white transition-transform hover:scale-[1.02] sm:text-[15px] lg:w-full"
                style={{
                  background: 'linear-gradient(135deg, #0891b2, #2563eb)',
                  boxShadow:
                    '0 8px 28px -8px rgba(6,182,212,0.55), 0 0 0 1px rgba(34,211,238,0.2)',
                }}
              >
                <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap">
                  {ctaLabel}
                  <ArrowRight size={15} />
                </span>
              </button>
            </div>
          </div>

          <style jsx>{`
            @keyframes morblotto-onboard-flash {
              0%, 100% {
                opacity: 1;
              }
              50% {
                opacity: 0.55;
              }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
