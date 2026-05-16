'use client';

import React, { useEffect, useState } from 'react';

export interface PokerBustOutModalProps {
  isOpen: boolean;
  finalRank?: number | null;
  /** Seconds until the server removes the seat (default 15). */
  countdownSeconds?: number;
  /** Leave the table now — returns to lobby. */
  onLeave: () => void;
  /** Stay as a spectator. Closes the modal; the page falls back to spectator view once the seat is removed. */
  onStay: () => void;
}

function finishOrdinal(rank: number): string {
  const j = rank % 10;
  const k = rank % 100;
  if (j === 1 && k !== 11) return `${rank}st`;
  if (j === 2 && k !== 12) return `${rank}nd`;
  if (j === 3 && k !== 13) return `${rank}rd`;
  return `${rank}th`;
}

export function PokerBustOutModal({
  isOpen,
  finalRank,
  countdownSeconds = 15,
  onLeave,
  onStay,
}: PokerBustOutModalProps) {
  const [remaining, setRemaining] = useState(countdownSeconds);

  useEffect(() => {
    if (!isOpen) return;
    setRemaining(countdownSeconds);
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const next = Math.max(0, countdownSeconds - elapsed);
      setRemaining(next);
      if (next <= 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [isOpen, countdownSeconds]);

  useEffect(() => {
    if (!isOpen) return;
    if (remaining > 0) return;
    onStay();
  }, [isOpen, remaining, onStay]);

  if (!isOpen) return null;

  const rankLabel =
    finalRank && finalRank > 0
      ? `You finished ${finishOrdinal(finalRank)}`
      : 'You are out of chips';

  const progress = Math.max(0, Math.min(1, remaining / countdownSeconds));
  const ringSize = 56;
  const ringStroke = 4;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - progress);

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div
        className="relative w-full max-w-sm flex flex-col overflow-hidden border border-white/10 font-jost"
        style={{
          background: 'rgba(6,8,12,0.96)',
          boxShadow:
            'inset 0 3px 6px rgba(0,0,0,0.78), inset 0 -2px 5px rgba(255,255,255,0.04), 0 20px 60px rgba(0,0,0,0.75)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="poker-bust-out-title"
      >
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(244,63,94,0.10),transparent_55%)]" />

        <div className="relative px-5 pt-5 pb-3 border-b border-white/10 flex items-center gap-4">
          <div className="relative shrink-0" style={{ width: ringSize, height: ringSize }}>
            <svg width={ringSize} height={ringSize} className="-rotate-90">
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth={ringStroke}
                fill="none"
              />
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                stroke="rgba(244,63,94,0.85)"
                strokeWidth={ringStroke}
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                fill="none"
                style={{ transition: 'stroke-dashoffset 250ms linear' }}
              />
            </svg>
            <div
              className="absolute inset-0 flex items-center justify-center font-jost tabular-nums"
              style={{ fontSize: 18, color: 'rgba(255,255,255,0.95)' }}
            >
              {remaining}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="poker-bust-out-title"
              className="font-jost uppercase leading-[1] break-words"
              style={{ fontSize: 18, color: 'rgba(255,255,255,0.98)', letterSpacing: '-0.01em' }}
            >
              Busted out
            </h2>
            <p
              className="mt-1 font-jost-normal text-[11px] tracking-[0.14em] uppercase"
              style={{ color: 'rgba(255,255,255,0.55)' }}
            >
              {rankLabel}
            </p>
          </div>
        </div>

        <div className="relative px-5 py-4">
          <p
            className="font-jost-normal text-[12px] leading-relaxed text-center"
            style={{ color: 'rgba(255,255,255,0.75)' }}
          >
            Stay and watch the rest of the tournament, or head back to the lobby now.
          </p>
          <p
            className="mt-2 font-jost-normal text-[10px] text-center tracking-[0.14em] uppercase"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            Defaults to spectating in <span className="tabular-nums">{remaining}s</span>
          </p>
        </div>

        <div className="relative shrink-0 px-5 py-4 border-t border-white/10 bg-black/30 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onLeave}
            className="font-jost text-sm font-medium tracking-wide py-3 rounded-md border border-white/10 bg-white/[0.04] text-white/85 hover:bg-white/[0.08] transition-colors"
          >
            Leave now
          </button>
          <button
            type="button"
            onClick={onStay}
            className="font-jost text-sm font-medium tracking-wide py-3 rounded-md border border-cyan-500/35 bg-gradient-to-r from-cyan-600/25 to-blue-600/20 text-white hover:from-cyan-600/35 hover:to-blue-600/30 transition-colors"
          >
            Stay & watch
          </button>
        </div>
      </div>
    </div>
  );
}
