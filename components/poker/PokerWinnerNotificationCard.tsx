'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { SparklesText } from '@/components/ui/sparkles-text';
import { CardDisplay } from './CardDisplay';

export interface PokerWinnerNotificationCardProps {
  isOpen: boolean;
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="poker-winner-notification-card"
          data-testid="poker-winner-banner"
          data-card="poker-winner-notification-card"
          className="fixed inset-0 z-[120] pointer-events-none flex items-center justify-center px-2 sm:px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative aspect-[3/2] rounded-2xl overflow-hidden"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
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
              width: 'min(96vw, calc((100vh - 1.5rem) * 1.5), 760px)',
              maxHeight: 'calc(100vh - 1.5rem)',
            }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.3),transparent_70%)]" />

            <div className="relative z-[1] h-full grid grid-rows-[auto_auto_1fr_auto] p-2.5 sm:p-4 gap-2 sm:gap-3">
              <div className="text-center">
                <SparklesText
                  className="text-[11px] sm:text-[12px] font-extrabold uppercase tracking-[0.2em] text-cyan-200"
                  sparklesCount={3}
                  colors={{ first: '#67e8f9', second: '#a5f3fc' }}
                >
                  WINNER
                </SparklesText>

                <h3 className="mt-0.5 text-white text-[clamp(16px,2.4vw,24px)] leading-none font-extrabold tracking-[-0.01em] truncate">
                  {winnerName}
                </h3>

                {winnerHandName ? (
                  <div className="mt-1 inline-flex items-center rounded-full bg-black/40 border border-cyan-500/30 px-2.5 py-0.5">
                    <span className="text-white text-[10px] sm:text-[11px] font-medium">{winnerHandName}</span>
                  </div>
                ) : null}
              </div>

              <div className="text-center">
                <div className="text-cyan-300/95 text-[9px] sm:text-[10px] uppercase tracking-[0.2em] font-semibold">MORBIUS</div>
                <div className="text-white text-[clamp(20px,3.2vw,30px)] font-extrabold leading-none tabular-nums mt-0.5">
                  {formatChips(winnerAmount)}
                </div>
              </div>

              <div className="min-h-0 rounded-xl bg-black/50 border border-cyan-500/30 p-2 sm:p-3 grid grid-rows-[auto_1fr] gap-1.5 sm:gap-2">
                <div className="flex items-center justify-center gap-1.5 sm:gap-3">
                  {hole.map((cardIndex, i) => (
                    <div key={`winner-hole-${i}`} className="flex-none [perspective:1000px]">
                      <CardDisplay
                        cardIndex={cardIndex}
                        small
                        isWinningCard={typeof cardIndex === 'number' && highlightSet.has(cardIndex)}
                        className={i === 0 ? '[transform:rotateY(-8deg)]' : '[transform:rotateY(8deg)]'}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-1 sm:gap-2 overflow-hidden pt-4 sm:pt-5">
                  {board.map((cardIndex, i) => (
                    <div key={`winner-board-${i}-${cardIndex ?? 'empty'}`} className="flex-none">
                      <CardDisplay cardIndex={cardIndex} small isWinningCard={highlightSet.has(cardIndex)} />
                    </div>
                  ))}
                </div>
              </div>

              {splitLabel && splitAmount ? (
                <div className="rounded-xl bg-black/50 border border-cyan-500/30 px-3 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/75">{splitLabel}</span>
                    <span className="text-[11px] font-bold text-emerald-400">{splitAmount}</span>
                  </div>
                </div>
              ) : (
                <div />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
