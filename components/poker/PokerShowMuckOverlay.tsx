'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PokerShowMuckOverlayProps {
  /** Server-published ISO. Component drives the countdown from this. */
  expiresAtIso: string;
  pending: boolean;
  onShow: () => void;
  onMuck: () => void;
}

export function PokerShowMuckOverlay({
  expiresAtIso,
  pending,
  onShow,
  onMuck,
}: PokerShowMuckOverlayProps) {
  const expiresAtMs = Date.parse(expiresAtIso);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(expiresAtMs)) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [expiresAtMs]);

  if (!Number.isFinite(expiresAtMs)) return null;
  // Window duration must match `FOLD_OUT_SHOW_WINDOW_MS` on the server.
  const WINDOW_MS = 8_000;
  const remainingMs = Math.max(0, expiresAtMs - now);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progress = Math.max(0, Math.min(1, remainingMs / WINDOW_MS));
  const visible = pending && remainingMs > 0;

  const handle = (fn: () => void) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      fn();
    } finally {
      // Re-enable in case server rejects so the player can retry; the
      // broadcast usually closes the overlay before this fires.
      setTimeout(() => setBusy(false), 400);
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="show-muck-overlay"
          className="absolute left-1/2 z-[60] -translate-x-1/2 pointer-events-auto"
          style={{ top: 'calc(50% + 12cqw)', minWidth: 'min(280px, 60vw)' }}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <div
            className="rounded-xl border px-3 py-2.5 shadow-2xl"
            style={{
              background: 'linear-gradient(180deg, rgba(20,22,30,0.95) 0%, rgba(12,14,20,0.96) 100%)',
              borderColor: 'rgba(212,168,42,0.55)',
              boxShadow: '0 12px 36px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/90">
                Show your hand?
              </span>
              <span
                className="text-[11px] font-mono tabular-nums text-amber-100/70"
                aria-live="polite"
              >
                {remainingSec}s
              </span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handle(onMuck)}
                disabled={busy}
                className="flex-1 rounded-md px-3 py-1.5 text-xs font-bold tracking-wide transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.78)',
                  border: '1px solid rgba(255,255,255,0.14)',
                }}
              >
                Muck
              </button>
              <button
                type="button"
                onClick={handle(onShow)}
                disabled={busy}
                className="flex-1 rounded-md px-3 py-1.5 text-xs font-bold tracking-wide transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(180deg, #d4a82a 0%, #b88a1a 100%)',
                  color: '#1a120a',
                  border: '1px solid rgba(212,168,42,0.75)',
                  boxShadow: '0 2px 8px rgba(212,168,42,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
                }}
              >
                Show
              </button>
            </div>

            <div
              className="mt-2 h-[3px] rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.08)' }}
              aria-hidden
            >
              <div
                className="h-full"
                style={{
                  width: `${progress * 100}%`,
                  background: 'linear-gradient(90deg, #d4a82a 0%, #f0c75a 100%)',
                  transition: 'width 100ms linear',
                }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
