'use client';

/**
 * Bottom sheet for choosing a bet / raise size on mobile landscape.
 *
 * Opens when the player taps the Raise (or Bet) button on the compact
 * mobile action bar. The desktop / tablet experience continues to use the
 * inline slider strip in `PokerActions.tsx`.
 *
 * Contents (top to bottom):
 *   1. Drag handle
 *   2. Amount + pot odds row
 *   3. Slider
 *   4. Preset chips (Min · ½ Pot · Pot · All-in)
 *   5. Cancel / Confirm row
 *
 * State is fully controlled by the parent so the bet amount stays in sync
 * with the shared `customAmount` reducer that the desktop layout already
 * drives. The parent owns:
 *   - the live amount (`amount`)
 *   - the clamp bounds (`minRaise`, `stack`)
 *   - the pot + call context (for the odds readout)
 *   - the commit handlers
 *
 * This component is rendered into a portal so it overlays everything on
 * the table (not constrained by ancestor `overflow:hidden`).
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface PokerBetSheetPreset {
  label: string;
  /** Already-clamped amount as a chip string ("1234"). */
  value: string;
}

export interface PokerBetSheetProps {
  open: boolean;
  onClose: () => void;
  /** Verb shown on the confirm button. "Raise" when facing a bet, else "Bet". */
  verb: 'Bet' | 'Raise';

  /** Current proposed amount as a chip string (formatted, e.g. "1,234"). */
  amount: string;
  /** Parsed integer chips, used to compute pot odds + display bb. */
  amountChips: number;
  /** Big blind in chips (for bb conversion). */
  bigBlind: number;
  /** Pot size in chips. */
  potChips: number;
  /** Outstanding call amount in chips (0 if no bet to call). */
  callChips: number;

  /** Slider config — chips. */
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
  /** Slider raw value (chips, NOT offset). */
  sliderValueChips: number;
  /** Fires with the new chip count (absolute, not offset). */
  onSliderChange: (chipsAbs: number) => void;

  /** Presets shown as the row above the action buttons. */
  presets: PokerBetSheetPreset[];
  /** Currently-selected preset label (if any), used for highlight. */
  activePresetLabel?: string | null;
  onPresetClick: (preset: PokerBetSheetPreset) => void;

  /** Fires when user hits the big Confirm button. */
  onConfirm: () => void;
  /** Disable confirm when amount is out of range / stack is 0. */
  canConfirm: boolean;
}

export function PokerBetSheet({
  open,
  onClose,
  verb,
  amount,
  amountChips,
  bigBlind,
  potChips,
  callChips,
  sliderMin,
  sliderMax,
  sliderStep,
  sliderValueChips,
  onSliderChange,
  presets,
  activePresetLabel,
  onPresetClick,
  onConfirm,
  canConfirm,
}: PokerBetSheetProps) {
  // ── Esc closes ──
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

  const bbDisplay = bigBlind > 0 ? (amountChips / bigBlind).toFixed(1) : null;
  // Pot odds when facing a bet: ratio of (pot after our call) : our call.
  const potOddsDisplay =
    callChips > 0
      ? `${((potChips + callChips) / callChips).toFixed(1)} : 1`
      : null;

  const sliderPct =
    sliderMax > sliderMin
      ? ((sliderValueChips - sliderMin) / (sliderMax - sliderMin)) * 100
      : 0;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${verb} size`}
      className="fixed inset-0 z-[60] flex items-end justify-center"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Cancel"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div
        className="
          relative w-full max-w-[28rem] mx-2 mb-2
          rounded-2xl border border-white/15
          bg-gradient-to-b from-[#181b2a] to-[#0a0c14]
          p-3
          shadow-[0_-20px_50px_rgba(0,0,0,0.6)]
        "
        style={{
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))',
        }}
      >
        {/* Drag handle */}
        <div
          aria-hidden
          className="mx-auto mb-2 h-1 w-9 rounded-full bg-white/20"
        />

        {/* Amount row */}
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-medium uppercase tracking-widest text-white/55">
              {verb} to
            </div>
            <div className="font-mono text-2xl font-extrabold leading-none text-amber-300">
              {amount}
            </div>
            {bbDisplay && (
              <div className="mt-1 font-mono text-[10px] text-white/55">
                {bbDisplay} bb
              </div>
            )}
          </div>
          {potOddsDisplay && (
            <div className="text-right">
              <div className="text-[10px] text-white/55">Pot odds</div>
              <div className="font-mono text-sm font-semibold text-white">
                {potOddsDisplay}
              </div>
            </div>
          )}
        </div>

        {/* Slider */}
        <div className="relative mb-2 h-7 rounded-md border border-white/10 bg-white/[0.04] p-1">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1 top-1 bottom-1 rounded-sm bg-gradient-to-r from-teal-700 to-teal-400"
            style={{ width: `calc(${sliderPct}% - 4px)` }}
          />
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={sliderStep}
            value={sliderValueChips}
            onChange={(e) => onSliderChange(parseInt(e.target.value, 10))}
            aria-label={`${verb} amount slider`}
            className="poker-slider poker-slider-mobile absolute inset-0 h-full w-full opacity-0 cursor-pointer"
            style={{ opacity: 0.001 /* keep interactivity but invisible */ }}
          />
        </div>

        {/* Presets */}
        <div
          className="mb-2.5 grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${presets.length}, minmax(0, 1fr))` }}
        >
          {presets.map((p) => {
            const active = activePresetLabel === p.label;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onPresetClick(p)}
                className={[
                  'h-7 rounded-md text-[11px] font-semibold transition-colors',
                  active
                    ? 'border border-amber-400 bg-amber-400/15 text-amber-300'
                    : 'border border-white/10 bg-white/[0.05] text-white/85 hover:bg-white/10',
                ].join(' ')}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Cancel / Confirm */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="
              h-9 flex-[0.6] rounded-md border border-white/10 bg-white/[0.06]
              text-sm font-bold text-white hover:bg-white/10 active:scale-95 transition-all
            "
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className={[
              'h-9 flex-1 rounded-md text-sm font-extrabold transition-all active:scale-[0.97]',
              canConfirm
                ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-[#1a1208] shadow-[0_4px_12px_rgba(245,158,11,0.3)]'
                : 'cursor-not-allowed bg-white/10 text-white/40',
            ].join(' ')}
          >
            {verb} {amount}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default PokerBetSheet;
