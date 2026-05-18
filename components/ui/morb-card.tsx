'use client';

/**
 * Shared visual primitives matching the EscrowBuyInJoinPanel look:
 *   - cyan-rimmed slate-950 card with an outer glow
 *   - optional BackgroundBeams + radial top sheen
 *   - cyan→blue→violet gradient CTAs with hover glow
 *   - secondary slate button
 *   - hero amount block (uppercase label / big mono amount / ticker)
 *
 * Used by the poker tournament creator, the cash game creator, and any other
 * Morb-themed modal so they share the same brand chrome. Keep additions here
 * minimal — anything that drifts away from EscrowBuyInJoinPanel's look should
 * stay local to the consuming component rather than land in this file.
 */

import React from 'react';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { cn } from '@/lib/utils';

/**
 * Outer card shell — cyan-rimmed slate-950 panel with optional animated beams
 * and a soft cyan/violet top glow. Children render above both effects.
 *
 * `beams` defaults to true; pass `beams={false}` for dense forms where the
 * animation competes with content scanning.
 *
 * `glowIntensity` swaps the cyan halo size: 'soft' (40px) for small/inline
 * cards, 'normal' (60px) for primary modals.
 */
export function MorbCard({
  children,
  className,
  beams = true,
  glowIntensity = 'normal',
}: {
  children: React.ReactNode;
  className?: string;
  beams?: boolean;
  glowIntensity?: 'soft' | 'normal';
}) {
  const glowClass =
    glowIntensity === 'soft'
      ? 'shadow-[0_0_40px_-18px_rgba(34,211,238,0.30)]'
      : 'shadow-[0_0_60px_-15px_rgba(34,211,238,0.35)]';
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-950',
        glowClass,
        className,
      )}
    >
      {beams ? (
        <div className="pointer-events-none absolute inset-0 z-0 opacity-60">
          <BackgroundBeams palette={{ primary: '#3B82F6', accent: '#A855F7', tail: '#EC4899' }} />
        </div>
      ) : null}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-40"
        style={{
          background:
            'radial-gradient(60% 100% at 50% 0%, rgba(34,211,238,0.18) 0%, rgba(99,68,245,0.10) 45%, transparent 80%)',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * Primary CTA — cyan→blue→violet gradient with hover glow lift. Includes a
 * pulse-overlay when `loading` so users see the button is working even when
 * the underlying transaction is mid-flight.
 *
 * Drop-in for `<button type="button">` everywhere a Morb modal needs an action.
 */
export const MorbGradientButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }
>(function MorbGradientButton({ className, children, loading, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      {...props}
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden rounded-xl',
        'bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500',
        'px-4 py-3 text-sm font-semibold text-white',
        'shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {loading ? (
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
      ) : null}
      <span className="relative z-[1]">{children}</span>
    </button>
  );
});

/**
 * Secondary / cancel button — outlined slate, hover lifts to a subtle white wash.
 * Matches the Cancel button in EscrowBuyInJoinPanel.
 */
export const MorbSecondaryButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(function MorbSecondaryButton({ className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      {...props}
      className={cn(
        'inline-flex items-center justify-center rounded-xl',
        'border border-slate-500/40 bg-slate-900/60 px-4 py-3 text-sm text-slate-300',
        'transition-colors hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  );
});

/**
 * Centered hero amount block: uppercase tracking label, big mono amount,
 * subtle ticker. Mirrors EscrowBuyInJoinPanel's "TOURNAMENT BUY-IN · 1000 Morbius".
 */
export function MorbHeroAmount({
  label,
  amount,
  ticker,
  secondary,
}: {
  label: string;
  amount: React.ReactNode;
  ticker?: string;
  /** Optional small line under the amount (token name / context note). */
  secondary?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center pt-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">{label}</div>
      <div className="mt-1 flex items-baseline justify-center gap-2">
        <span className="font-mono tabular-nums text-3xl font-bold text-white">{amount}</span>
        {ticker ? <span className="text-sm font-semibold text-cyan-200/90">{ticker}</span> : null}
      </div>
      {secondary ? (
        <div className="mt-1 text-xs text-slate-400 truncate max-w-full">{secondary}</div>
      ) : null}
    </div>
  );
}

/**
 * Form input matching the cash game / EscrowBuyInJoinPanel slate look.
 * Keeps the dark bg + subtle white-25 ring + cyan-focus accent consistent.
 */
export const MorbInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function MorbInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={cn(
        'w-full rounded-lg bg-slate-900/70 border border-white/15 px-3 py-2 text-sm text-white',
        'placeholder:text-white/30 transition-colors',
        'focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/30',
        'disabled:opacity-50',
        className,
      )}
    />
  );
});
