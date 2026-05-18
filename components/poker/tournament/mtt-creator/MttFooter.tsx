'use client';

import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useMttCreator } from './MttCreatorContext';

/**
 * Sticky-feeling action bar at the bottom of each wizard step.
 *
 * Disabled `Continue` covers any per-step validation (each step decides when its
 * inputs are valid and passes `canContinue` down). `Back` always works, including
 * stepping back to the template picker from step 1.
 */
export interface MttFooterProps {
  canContinue: boolean;
  /** Optional override label for the primary CTA. Defaults to "Continue". */
  continueLabel?: string;
  /** Called on click of Continue. Defaults to `ctx.next()`. Used by Review to fire publish. */
  onContinue?: () => void;
  /** Hide the Back button (e.g. on the template picker entry). */
  hideBack?: boolean;
}

export function MttFooter({ canContinue, continueLabel = 'Continue', onContinue, hideBack }: MttFooterProps) {
  const { back, next } = useMttCreator();
  return (
    <div className="mt-8 flex items-center justify-between gap-4">
      {hideBack ? (
        <span aria-hidden />
      ) : (
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-white/20 hover:bg-white/10"
        >
          <ArrowLeft size={15} /> Back
        </button>
      )}
      <button
        type="button"
        disabled={!canContinue}
        onClick={() => (onContinue ? onContinue() : next())}
        className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold text-white transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 sm:text-[15px]"
        style={{
          background: 'linear-gradient(135deg, #0891b2, #2563eb)',
          boxShadow: '0 8px 28px -8px rgba(6,182,212,0.55), 0 0 0 1px rgba(34,211,238,0.2)',
        }}
      >
        {continueLabel} <ArrowRight size={15} />
      </button>
    </div>
  );
}

/**
 * Shared card frame used by every step body. Matches the OnboardingWizard inner-card style:
 * subtle navy gradient background, soft cyan border, rounded-2xl, comfortable padding.
 *
 * `title` is the H3-level question. `subtitle` is the lead-in paragraph. Children render
 * the actual form controls beneath.
 */
export function MttStepCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-cyan-500/20 p-6 sm:p-8"
      style={{
        background: 'linear-gradient(155deg, #0c1929 0%, #0a0f1a 50%, #0d1117 100%)',
        boxShadow: '0 24px 60px -28px rgba(6,182,212,0.25)',
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.55), transparent)',
        }}
        aria-hidden
      />
      <h3
        className="text-white"
        style={{
          fontFamily: '"Mitr", sans-serif',
          fontWeight: 700,
          fontSize: 'clamp(22px, 3vw, 28px)',
          lineHeight: 1.05,
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h3>
      {subtitle && (
        <p className="mt-2 text-sm leading-relaxed text-slate-400 sm:text-[15px]">{subtitle}</p>
      )}
      <div className="mt-6">{children}</div>
    </div>
  );
}
