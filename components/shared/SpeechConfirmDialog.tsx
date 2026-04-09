'use client';

import { useEffect, useRef } from 'react';

interface SpeechConfirmDialogProps {
  /** The action label, e.g. "Bet 5,000 MORBIUS?" */
  label: string;
  onYes: () => void;
  onNo: () => void;
  /** Auto-cancel timeout in ms. Default 8000. */
  timeoutMs?: number;
}

/**
 * Minimal dark confirm overlay for voice-triggered actions that need
 * explicit confirmation before firing (bet, raise, all-in).
 *
 * - Matches the blackjack/poker dark gradient theme
 * - Auto-cancels after timeoutMs (default 8s)
 * - Accepts voice yes/no via parent (hook handles that); buttons here
 *   are for fallback mouse/touch
 */
export function SpeechConfirmDialog({
  label,
  onYes,
  onNo,
  timeoutMs = 8000,
}: SpeechConfirmDialogProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef(Date.now());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, 1 - elapsed / timeoutMs);
      if (barRef.current) barRef.current.style.width = `${remaining * 100}%`;
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    timerRef.current = setTimeout(() => onNo(), timeoutMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [onNo, timeoutMs]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center pb-28 px-4 pointer-events-none"
      aria-modal="true"
      role="dialog"
    >
      <div
        className="pointer-events-auto w-full max-w-xs rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(15,23,32,0.97), rgba(8,12,18,0.97))',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
        }}
      >
        {/* Countdown bar */}
        <div className="h-0.5 w-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            ref={barRef}
            className="h-full transition-none"
            style={{
              width: '100%',
              background: 'linear-gradient(90deg, #06b6d4, #a855f7)',
            }}
          />
        </div>

        <div className="px-5 py-4">
          {/* Mic icon + label */}
          <div className="flex items-center gap-2 mb-4">
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="shrink-0"
            >
              <rect x="9" y="2" width="6" height="11" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <span className="text-white font-semibold text-sm tracking-wide">{label}</span>
          </div>

          {/* Voice hint */}
          <p className="text-slate-500 text-xs mb-4">Say <span className="text-slate-300">"yes"</span> or <span className="text-slate-300">"no"</span></p>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={onNo}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors text-gray-400 hover:text-white"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              No
            </button>
            <button
              onClick={onYes}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all text-white"
              style={{
                background: 'linear-gradient(135deg, rgba(6,182,212,0.25), rgba(168,85,247,0.25))',
                border: '1px solid rgba(6,182,212,0.4)',
              }}
            >
              Yes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
