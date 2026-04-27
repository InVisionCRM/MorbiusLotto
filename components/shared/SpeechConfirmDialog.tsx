'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const RING_R = 22;
const RING_CIRC = 2 * Math.PI * RING_R;

interface SpeechConfirmDialogProps {
  /** The action label, e.g. "Bet 5,000 MORBIUS?" */
  label: string;
  onYes: () => void;
  onNo: () => void;
  /** Auto-cancel timeout in ms. Default 8000. */
  timeoutMs?: number;
}

/**
 * Voice-triggered action confirmation. Non-blocking scrim (pointer-events
 * on card only) matches poker/blackjack: rest of the table stays interactive
 * to avoid trapping users during voice flows.
 * Uses Jost (see globals.css) and a calm, system-style layout.
 */
export function SpeechConfirmDialog({
  label,
  onYes,
  onNo,
  timeoutMs = 8000,
}: SpeechConfirmDialogProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringRef = useRef<SVGCircleElement | null>(null);
  const startRef = useRef(Date.now());
  const rafRef = useRef<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(1, Math.ceil(timeoutMs / 1000)));
  const ringGradId = useId();
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    startRef.current = Date.now();
    setSecondsLeft(Math.max(1, Math.ceil(timeoutMs / 1000)));

    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const t = Math.max(0, 1 - elapsed / timeoutMs);
      if (ringRef.current) {
        const offset = RING_CIRC * (1 - t);
        ringRef.current.style.strokeDashoffset = String(offset);
      }
      if (t > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    const tickSec = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    timerRef.current = setTimeout(() => onNo(), timeoutMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearInterval(tickSec);
    };
  }, [onNo, timeoutMs]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center pointer-events-none px-4 pb-28 pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:pb-6 sm:pt-6"
      aria-modal="true"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      {/* Visual scrim only — does not capture pointer events */}
      <motion.div
        className="pointer-events-none absolute inset-0 bg-black/55"
        style={{ backdropFilter: 'saturate(1.1) blur(20px)', WebkitBackdropFilter: 'saturate(1.1) blur(20px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
      />

      <motion.div
        className="pointer-events-auto relative w-full max-w-[min(100%,22rem)]"
        initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.85 }}
      >
        <div
          className="relative overflow-hidden rounded-[1.25rem] border border-white/[0.10] text-center shadow-[0_0_0_0.5px_rgba(255,255,255,0.04)_inset,0_32px_64px_-12px_rgba(0,0,0,0.55),0_0_1px_0_rgba(0,0,0,0.4)]"
          style={{
            background:
              'linear-gradient(165deg, rgba(38,38,40,0.82) 0%, rgba(22,22,24,0.92) 45%, rgba(18,18,20,0.96) 100%)',
            backdropFilter: 'blur(24px) saturate(1.2)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(10,132,255,0.12),transparent)]"
            aria-hidden
          />

          <div className="relative px-6 pt-7 pb-5 sm:px-7 sm:pt-8 sm:pb-6">
            {/* Mic + progress ring */}
            <div className="mx-auto mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center" aria-hidden>
              <div className="relative flex h-14 w-14 items-center justify-center">
                <svg
                  className="absolute h-[3.5rem] w-[3.5rem] -rotate-90"
                  viewBox="0 0 48 48"
                  aria-hidden
                >
                  <defs>
                    <linearGradient id={ringGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="rgba(90, 200, 250, 0.95)" />
                      <stop offset="100%" stopColor="rgba(10, 132, 255, 0.9)" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="24"
                    cy="24"
                    r={RING_R}
                    fill="none"
                    stroke="rgba(255,255,255,0.09)"
                    strokeWidth="2.5"
                  />
                  <circle
                    ref={ringRef}
                    cx="24"
                    cy="24"
                    r={RING_R}
                    fill="none"
                    stroke={`url(#${ringGradId})`}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRC}
                    strokeDashoffset="0"
                    className="transition-none"
                  />
                </svg>
                <svg
                  className="relative h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <rect
                    x="9"
                    y="3"
                    width="6"
                    height="11"
                    rx="3"
                    fill="currentColor"
                    className="text-white/90"
                  />
                  <path
                    d="M5 10a7 7 0 0 0 14 0"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    className="text-white/50"
                    fill="none"
                  />
                  <path
                    d="M8 20h8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    className="text-white/45"
                  />
                </svg>
              </div>
            </div>

            <p className="font-jost-normal text-[0.6875rem] uppercase tracking-[0.26em] text-white/42 mb-2.5">
              Voice confirm
            </p>

            <p
              id={titleId}
              className="font-jost text-[1.0625rem] sm:text-lg leading-[1.35] tracking-[-0.015em] text-white/95 [text-wrap:balance] px-0.5"
            >
              {label}
            </p>

            <p
              className="font-jost-normal mt-3.5 text-[0.8125rem] leading-relaxed text-white/50"
              id={descId}
            >
              <span className="text-white/28">“</span>
              <span className="text-white/70">yes</span>
              <span className="text-white/40"> or </span>
              <span className="text-white/70">no</span>
              <span className="text-white/28">”</span>
              <span className="text-white/35"> · </span>
              <span className="tabular-nums text-white/38">{secondsLeft}s</span>
            </p>

            <div className="mt-7 flex gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={onNo}
                className="font-jost-normal min-h-[3rem] flex-1 rounded-[0.875rem] text-[0.9375rem] tracking-wide text-white/72 transition duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1c1e] hover:bg-white/[0.08] active:scale-[0.98] active:bg-white/[0.06] border border-white/[0.10] bg-white/[0.04]"
                style={{ fontWeight: 500 }}
              >
                No
              </button>
              <button
                type="button"
                onClick={onYes}
                className="font-jost min-h-[3rem] flex-1 rounded-[0.875rem] text-[0.9375rem] text-white transition duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#5ac8fa]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1c1e] active:scale-[0.98] border border-[#3d9cf0]/35 shadow-[0_1px_0_0_rgba(255,255,255,0.12)_inset,0_6px_20px_rgba(10,132,255,0.22)]"
                style={{
                  fontWeight: 600,
                  background: 'linear-gradient(180deg, #47a3ff 0%, #0a84ff 100%)',
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
