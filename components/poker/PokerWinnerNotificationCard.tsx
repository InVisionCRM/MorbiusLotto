'use client';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

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

const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const CARD_SUITS = ['\u2663', '\u2666', '\u2665', '\u2660'];

/*
 * Known-good constraints:
 * - Overlay uses pointer-events-none, so card layout must never depend on scrolling.
 * - Community cards always render as a 5-column grid (no horizontal overflow path).
 * - Card face stays simple: white background + rank/suit + winner glow.
 */
function WinnerPreviewCard({
  cardIndex,
  isWinningCard,
  size,
}: {
  cardIndex: number | null;
  isWinningCard: boolean;
  size: 'hole' | 'board';
}) {
  const isFaceUp = typeof cardIndex === 'number' && cardIndex >= 0 && cardIndex <= 51;
  const cardShellClass =
    size === 'hole'
      ? 'relative w-[clamp(42px,8vw,60px)] aspect-[5/7] rounded-lg overflow-hidden'
      : 'relative w-full aspect-[5/7] rounded-lg overflow-hidden';

  if (!isFaceUp) {
    return (
      <div
        className={`${cardShellClass} border border-white/10`}
        style={{
          background: 'linear-gradient(145deg, rgba(15,23,42,0.55), rgba(15,23,42,0.25))',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.35)',
          opacity: 0.25,
        }}
      />
    );
  }

  const rank = CARD_RANKS[cardIndex % 13];
  const suitIndex = Math.floor(cardIndex / 13);
  const suit = CARD_SUITS[suitIndex];
  const textColor = '#111827';

  return (
    <div
      className={`${cardShellClass} border border-slate-300/90`}
      style={{
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 92%)',
        boxShadow: isWinningCard
          ? '0 10px 24px rgba(0,0,0,0.55), 0 0 0 3px rgba(34, 211, 238, 0.9), 0 0 22px rgba(34, 211, 238, 0.45)'
          : '0 2px 8px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)',
      }}
    >
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(0,0,0,0.08)' }} />

      <div className="absolute top-1 left-1.5 text-[10px] sm:text-[11px] font-semibold leading-none" style={{ color: textColor }}>
        {rank}{suit}
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={`font-extrabold tracking-tight leading-none ${size === 'hole' ? 'text-[18px] sm:text-[22px] md:text-[26px]' : 'text-[14px] sm:text-[16px] md:text-[18px]'}`}
          style={{ color: textColor }}
        >
          {rank}{suit}
        </span>
      </div>

      {isWinningCard && (
        <div
          className="absolute inset-0 rounded-md pointer-events-none"
          style={{ boxShadow: 'inset 0 0 0 2px rgba(34, 211, 238, 0.55)' }}
        />
      )}
    </div>
  );
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

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen}>
      <DialogContent
        className="z-[120] w-auto max-w-none border-0 bg-transparent p-0 shadow-none overflow-visible [&>button]:hidden"
      >
        <DialogTitle className="sr-only">Poker winner notification</DialogTitle>
        <DialogDescription className="sr-only">
          Displays the winner, payout amount, and winning cards for the last poker hand.
        </DialogDescription>
        <div
          key="poker-winner-notification-card"
          data-testid="poker-winner-banner"
          data-card="poker-winner-notification-card"
          className="relative w-full max-w-[640px] rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
            boxShadow:
              'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5), 0 14px 34px rgba(0, 0, 0, 0.5)',
            border: '1px inset rgba(60, 60, 60, 0.5)',
            width: 'min(94vw, 640px)',
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.3),transparent_70%)]" />

          <div className="relative z-[1] h-full flex flex-col px-2.5 sm:px-4 pt-2.5 sm:pt-4 pb-4 sm:pb-5 gap-2 sm:gap-3">
          <div className="text-center">
            <div className="text-[11px] sm:text-[12px] font-extrabold uppercase tracking-[0.2em] text-cyan-200">
              WINNER
            </div>

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

          <div className="rounded-xl bg-black/50 border border-cyan-500/30 p-2 sm:p-3">
            <div className="text-center text-cyan-300/90 text-[9px] sm:text-[10px] uppercase tracking-[0.18em] font-semibold">
              Player Cards
            </div>
            <div className="mt-1.5 sm:mt-2 flex items-center justify-center gap-3 sm:gap-4 md:gap-5">
              {hole.map((cardIndex, i) => (
                <div key={`winner-hole-${i}`} className="flex-none">
                  <WinnerPreviewCard
                    cardIndex={cardIndex}
                    size="hole"
                    isWinningCard={typeof cardIndex === 'number' && highlightSet.has(cardIndex)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-black/50 border border-cyan-500/30 p-2 sm:p-3 mb-1 sm:mb-2">
            <div className="text-center text-cyan-300/90 text-[9px] sm:text-[10px] uppercase tracking-[0.18em] font-semibold">
              Community Cards
            </div>
            <div className="mt-1.5 sm:mt-2 mx-auto w-full max-w-[430px] grid grid-cols-5 gap-1.5 sm:gap-2">
              {board.map((cardIndex, i) => (
                <div key={`winner-board-${i}-${cardIndex ?? 'empty'}`} className="min-w-0">
                  <WinnerPreviewCard cardIndex={cardIndex} size="board" isWinningCard={highlightSet.has(cardIndex)} />
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
            <div className="h-2 sm:h-3 shrink-0" />
          )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
