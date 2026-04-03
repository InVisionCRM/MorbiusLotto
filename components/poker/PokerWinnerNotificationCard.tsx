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
  const board = communityCards.slice(0, 5);
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="poker-winner-notification-card"
          data-testid="poker-winner-banner"
          data-card="poker-winner-notification-card"
          className="fixed inset-0 z-[120] pointer-events-none flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative w-[min(94vw,340px)] rounded-[20px] px-3 pt-4 pb-2.5 text-center"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{
              type: 'spring',
              stiffness: 240,
              damping: 24,
            }}
            style={{
              background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.98), rgba(40, 40, 40, 0.96))',
              boxShadow:
                'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.71), 0 1px 3px rgba(0, 0, 0, 0.83), 0 14px 34px rgba(7, 7, 7, 0.84)',
              border: '1px inset rgba(60, 60, 60, 0.5)',
            }}
          >
            <div className="absolute inset-0 rounded-[20px] bg-[radial-gradient(circle_at_50%_30%,rgba(34,211,238,0.12),transparent_70%)]" />

            <div className="relative z-[1]">
              <SparklesText
                className="text-[13px] font-extrabold uppercase tracking-[0.2em] text-cyan-200"
                sparklesCount={3}
                colors={{ first: '#67e8f9', second: '#a5f3fc' }}
              >
                WINNER
              </SparklesText>

              <h3 className="mt-0.5 text-white text-[20px] leading-none font-bold tracking-[-0.01em]">{winnerName}</h3>

              {winnerHandName ? (
                <div className="mt-1 inline-flex items-center rounded-full bg-white/10 border border-white/10 px-2.5 py-0.5">
                  <span className="text-white text-[10px] font-medium">{winnerHandName}</span>
                </div>
              ) : null}

              <div className="mt-2">
                <div className="text-cyan-300/95 text-[9px] uppercase tracking-[0.2em] font-semibold">MORBIUS</div>
                <div className="text-white text-[28px] sm:text-[30px] font-extrabold leading-none tabular-nums mt-1">
                  {formatChips(winnerAmount)}
                </div>
              </div>

              <div className="mt-2 rounded-md bg-black/75 border border-white/10 px-2 py-1.5">
                <div className="flex justify-center gap-1">
                  {hole.map((cardIndex, i) => (
                    <div key={`winner-hole-${i}`} className="[perspective:1000px]">
                      <CardDisplay
                        cardIndex={cardIndex}
                        small
                        isWinningCard={typeof cardIndex === 'number' && highlightSet.has(cardIndex)}
                        className={i === 0 ? '[transform:rotateY(-8deg)]' : '[transform:rotateY(8deg)]'}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-1.5 rounded-xl bg-black/75 border border-white/10 px-2 py-1.5">
                <div className="grid grid-cols-5 justify-items-center gap-0.5">
                  {board.map((cardIndex, i) => (
                    <div key={`winner-board-${i}-${cardIndex}`} className="scale-[0.78] origin-center">
                      <CardDisplay cardIndex={cardIndex} small isWinningCard={highlightSet.has(cardIndex)} />
                    </div>
                  ))}
                </div>
              </div>

              {splitLabel && splitAmount ? (
                <div className="mt-1.5 rounded-2xl bg-black/75 border border-white/10 px-2 py-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/65">{splitLabel}</span>
                    <span className="text-[10px] font-bold text-emerald-400">{splitAmount}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
