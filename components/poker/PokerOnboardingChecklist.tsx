'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowRight, X } from 'lucide-react';
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

interface Row {
  label: string;
  state: 'done' | 'active' | 'todo';
}

function rowsForStep(step: PokerOnboardingStep, isConnected: boolean): Row[] {
  const get = (idx: 1 | 2 | 3 | 4): 'done' | 'active' | 'todo' => {
    if (step === 5) return 'done';
    // For row 1 (Connect wallet), use isConnected as the source of truth.
    if (idx === 1) return isConnected ? 'done' : 'active';
    // Map "Get MORBIUS" → step >= 2 means we're past it.
    if (idx === 2) {
      if (step >= 2) return 'done';
      if (step === 1) return 'active';
      return 'todo';
    }
    // "Deposit & convert to chips" → step >= 4 means done.
    if (idx === 3) {
      if (step >= 4) return 'done';
      if (step === 2 || step === 3) return 'active';
      return 'todo';
    }
    // "Play your first hand" → only done at step 5.
    if (step === 4) return 'active';
    return 'todo';
  };
  return [
    { label: 'Connect your wallet', state: get(1) },
    { label: 'Get MORBIUS in your wallet', state: get(2) },
    { label: 'Deposit & convert to chips', state: get(3) },
    { label: 'Sit down at a table', state: get(4) },
  ];
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
  const completed = rows.filter((r) => r.state === 'done').length;
  const total = rows.length;
  const pct = Math.round((completed / total) * 100);

  // Friendly call-to-action text per step.
  const ctaLabel = useMemo(() => {
    if (step === 0) return 'Connect wallet to start';
    if (step === 1) return 'Get MORBIUS';
    if (step === 2) return 'Deposit MORBIUS';
    if (step === 3) return 'Get chips';
    if (step === 4) return "I'm ready — pick a table";
    return 'Continue setup';
  }, [step]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
          className="relative rounded-2xl border border-cyan-500/30 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(6,182,212,0.10), rgba(59,130,246,0.05))',
            boxShadow: '0 0 32px rgba(34,211,238,0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          <div className="px-4 py-3 sm:px-5 sm:py-4 flex items-start gap-4 flex-col sm:flex-row">
            <div className="flex-1 min-w-0 w-full">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/90 font-bold">
                    Getting started
                  </span>
                  <span className="text-[11px] text-cyan-200/80 font-semibold tabular-nums">
                    {completed} / {total}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-full p-1 text-slate-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                  aria-label="Hide getting-started checklist"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Progress bar */}
              <div className="mt-2 h-1 rounded-full bg-white/[0.08] overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, #06b6d4, #3b82f6)',
                  }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>

              {/* Rows */}
              <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {rows.map((row) => (
                  <li
                    key={row.label}
                    className={`flex items-center gap-2 text-xs ${
                      row.state === 'done'
                        ? 'text-slate-300'
                        : row.state === 'active'
                          ? 'text-white'
                          : 'text-slate-500'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        row.state === 'done'
                          ? 'bg-emerald-500 text-white'
                          : row.state === 'active'
                            ? 'border-2 border-cyan-400 text-cyan-300 animate-pulse'
                            : 'border-2 border-white/15 text-transparent'
                      }`}
                      aria-hidden
                    >
                      {row.state === 'done' ? <Check size={10} strokeWidth={3} /> : '·'}
                    </span>
                    <span className={row.state === 'done' ? 'line-through opacity-70' : ''}>
                      {row.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="shrink-0 w-full sm:w-auto sm:self-center">
              <button
                type="button"
                onClick={onResume}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:scale-[1.02]"
                style={{
                  background: 'linear-gradient(135deg, #0891b2, #2563eb)',
                  boxShadow: '0 6px 24px rgba(6,182,212,0.25), 0 0 0 1px rgba(34,211,238,0.2)',
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  {ctaLabel}
                  <ArrowRight size={13} />
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
