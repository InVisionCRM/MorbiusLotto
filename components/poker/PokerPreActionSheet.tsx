'use client';

/**
 * Small bottom sheet for selecting a pre-action on mobile landscape.
 *
 * Replaces the three always-visible checkboxes (Check/Fold · Check · Call
 * Any) that used to live in a fixed-width column on the left of the
 * action bar. On the new mobile layout, those collapse behind a single
 * "AUTO" toggle in the bottom-left of the action bar; tapping it opens
 * this sheet.
 *
 * Active selection is reflected externally by a teal dot on the AUTO
 * toggle (handled by the caller).
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { PreActionOption } from './PokerActions';

export interface PokerPreActionSheetProps {
  open: boolean;
  onClose: () => void;
  /** Current selection (null when nothing is queued). */
  value: PreActionOption;
  /** Fires with the new selection (null to clear). */
  onChange: (next: PreActionOption) => void;
  /** Whether the "Check" pre-action is even possible right now. */
  canCheck: boolean;
}

const OPTIONS: ReadonlyArray<{
  key: Exclude<PreActionOption, null>;
  label: string;
  hint: string;
}> = [
  {
    key: 'check_fold',
    label: 'Check / Fold',
    hint: 'Check when free, fold when facing a bet.',
  },
  {
    key: 'check',
    label: 'Check',
    hint: 'Auto-check on your turn (only when checking is free).',
  },
  {
    key: 'call_any',
    label: 'Call any',
    hint: 'Match whatever bet is in front of you.',
  },
];

export function PokerPreActionSheet({
  open,
  onClose,
  value,
  onChange,
  canCheck,
}: PokerPreActionSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pre-actions"
      className="fixed inset-0 z-[60] flex items-end justify-center"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div
        className="
          relative w-full max-w-[26rem] mx-2 mb-2
          rounded-2xl border border-white/15
          bg-gradient-to-b from-[#181b2a] to-[#0a0c14]
          p-3
          shadow-[0_-20px_50px_rgba(0,0,0,0.6)]
        "
        style={{
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))',
        }}
      >
        <div aria-hidden className="mx-auto mb-2 h-1 w-9 rounded-full bg-white/20" />

        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">
            Auto action <span className="text-white/45 font-normal">(before your turn)</span>
          </h3>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-[11px] font-medium text-white/55 underline-offset-2 hover:text-white hover:underline"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          {OPTIONS.map((opt) => {
            const selected = value === opt.key;
            const disabled = opt.key === 'check' && !canCheck;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onChange(selected ? null : opt.key)}
                disabled={disabled}
                aria-pressed={selected}
                className={[
                  'flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  selected
                    ? 'border-teal-400 bg-teal-400/10'
                    : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]',
                  disabled ? 'opacity-40 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className={[
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border',
                    selected
                      ? 'border-teal-400 bg-teal-400 text-[#0a0c14]'
                      : 'border-white/30 bg-transparent',
                  ].join(' ')}
                >
                  {selected ? (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6 5 8.5 9.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">
                    {opt.label}
                  </span>
                  <span className="block text-[11px] text-white/55 leading-snug">
                    {opt.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="
            mt-3 h-9 w-full rounded-md border border-white/10 bg-white/[0.06]
            text-sm font-bold text-white hover:bg-white/10 active:scale-95 transition-all
          "
        >
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default PokerPreActionSheet;
