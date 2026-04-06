'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CardDisplay } from './CardDisplay';

const SHOWDOWN_DURATION_S = 15;

export interface PokerWinnerNotificationCardProps {
  isOpen: boolean;
  handId?: string | null;
  winnerName: string;
  winnerAmount: string;
  winnerHandName?: string;
  winnerAddress?: string;
  winnerAvatarUrl?: string | null;
  winnerHoleCards?: number[];
  communityCards?: number[];
  winningCardIndices?: number[];
  splitLabel?: string;
  splitAmount?: string;
  formatChips: (wei: string | number) => string;
}

export function PokerWinnerNotificationCard({
  isOpen,
  handId,
  winnerName,
  winnerAmount,
  winnerHandName,
  winnerHoleCards = [],
  communityCards = [],
  winningCardIndices = [],
  splitLabel,
  splitAmount,
  formatChips,
}: PokerWinnerNotificationCardProps) {
  const highlightSet = new Set(winningCardIndices);
  const hole = [winnerHoleCards[0] ?? null, winnerHoleCards[1] ?? null];
  const board = Array.from({ length: 5 }, (_, i) => communityCards[i] ?? null);

  const [countdown, setCountdown] = useState(SHOWDOWN_DURATION_S);

  useEffect(() => {
    if (!isOpen) {
      setCountdown(SHOWDOWN_DURATION_S);
      return;
    }
    setCountdown(SHOWDOWN_DURATION_S);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key={`poker-winner-notification-card-${handId ?? 'unknown'}`}
          data-testid="poker-winner-banner"
          data-card="poker-winner-notification-card"
          className="fixed inset-0 z-[120] pointer-events-none flex items-center justify-center px-2 sm:px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative rounded-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{
              type: 'spring',
              stiffness: 220,
              damping: 22,
            }}
            style={{
              background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
              boxShadow:
                'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5), 0 14px 34px rgba(0, 0, 0, 0.5)',
              border: '1px inset rgba(60, 60, 60, 0.5)',
              width: 'min(40vw, 380px)',
              maxHeight: '80vh',
            }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.3),transparent_70%)]" />

            <div className="relative z-[1] flex flex-col overflow-y-auto" style={{ maxHeight: '70vh' }}>

              {/* ── Top: 3-column header (Amount | Winner | Hand Rank) ── */}
              <div className="flex items-stretch" style={{ minHeight: '60%' }}>

                {/* Left column — Amount won */}
                <div className="flex-1 flex flex-col items-center justify-center p-2 sm:p-3 min-w-0">
                  <div className="text-[12px] text-white uppercase tracking-wider font-semibold mb-1">Won</div>
                  <div className="text-white text-[clamp(13px,2.2vw,20px)] font-extrabold leading-tight tabular-nums text-center">
                    +{formatChips(winnerAmount)}
                  </div>
                  <img
                    src="/morbius/MorbiusLogo%20(3).png"
                    alt=""
                    aria-hidden
                    className="mt-4"
                    style={{ height: '1.2em', width: 'auto' }}
                  />
                </div>

                {/* Divider */}
                <div className="w-px self-stretch" style={{ background: 'rgba(34, 211, 238, 0.5)' }} />

                {/* Center column — Winner + name */}
                <div className="flex-[1.3] flex flex-col items-center justify-center p-2 sm:p-3 min-w-0">
                  <span className="text-[12px] font-extrabold uppercase tracking-[0.2em] text-white">
                    WINNER
                  </span>
                  <h3 className="mt-0.5 text-cyan-500 text-[clamp(13px,2vw,18px)] leading-tight font-extrabold tracking-[-0.01em] truncate max-w-full text-center">
                    {winnerName}
                  </h3>
                </div>

                {/* Divider */}
                <div className="w-px self-stretch" style={{ background: 'rgba(34, 211, 238, 0.35)' }} />

                {/* Right column — Hand Rank */}
                <div className="flex-1 flex flex-col items-center justify-center p-2 sm:p-3 min-w-0">
                  <div className="text-[8px] sm:text-[8px] text-white uppercase text-wrap tracking-wider font-semibold mb-1">Hand Rank</div>
                  <div className="text-cyan-500 text-[clamp(10px,1.5vw,13px)] font-bold leading-tight text-center break-words max-w-full">
                    {winnerHandName || '—'}
                  </div>
                </div>
              </div>

              {/* Horizontal divider */}
              <div className="h-px w-full" style={{ background: 'rgba(34, 211, 238, 0.33)' }} />

              {/* ── Bottom: Cards + countdown ── */}
              <div className="flex flex-col p-2 sm:p-3 gap-2">

                {/* Cards: hole + community */}
                <div className="rounded-sm bg-black/50 border border-cyan-500/30 px-2 py-3 sm:px-2 sm:py-2 flex flex-col gap-2 sm:gap-3 min-h-[8rem] sm:min-h-[8rem]">
                  <div className="flex items-center justify-center gap-1">
                    {hole.map((cardIndex, i) => (
                      <div key={`winner-hole-${i}`} className="flex-none">
                        <CardDisplay
                          cardIndex={cardIndex}
                          small
                          isWinningCard={typeof cardIndex === 'number' && highlightSet.has(cardIndex)}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-1 items-center justify-center gap-1 overflow-visible py-2 min-h-[6.5rem] sm:min-h-[6.5rem]">
                    {board.map((cardIndex, i) => (
                      <CardDisplay key={`winner-board-${i}-${cardIndex ?? 'empty'}`} cardIndex={cardIndex} small isWinningCard={highlightSet.has(cardIndex)} />
                    ))}
                  </div>
                </div>

                {/* Split pot */}
                {splitLabel && splitAmount && (
                  <div className="rounded-lg bg-black/50 border border-cyan-500/30 px-2.5 py-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-white">{splitLabel}</span>
                      <span className="text-[12px] font-bold text-cyan-500">{splitAmount}</span>
                    </div>
                  </div>
                )}

                {/* Countdown timer */}
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] text-white uppercase tracking-wider font-medium">
                    Next hand in {countdown}s
                  </span>
                  <div
                    className="w-full h-1 rounded-full overflow-hidden"
                    style={{ background: 'rgba(83, 233, 13, 0.85)' }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: 'linear-gradient(90deg, #06b6d4, #22d3ee)' }}
                      initial={{ width: '100%' }}
                      animate={{ width: '0%' }}
                      transition={{ duration: SHOWDOWN_DURATION_S, ease: 'linear' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
