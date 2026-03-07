'use client';

import React from 'react';
import { formatEther } from 'viem';
import { CardDisplay } from './CardDisplay';
import type { PokerSeatState as SeatState } from '@/lib/websocket-client';

function formatChips(wei: string): string {
  try {
    const num = Number(formatEther(BigInt(wei)));
    return Number.isInteger(num)
      ? num.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return wei;
  }
}

export interface PokerSeatProps {
  seat: SeatState;
  /** Index for layout (e.g. position around table) */
  index: number;
  /** Show hole cards (only for current player when visible) */
  holeCards?: number[];
  isCurrentPlayer?: boolean;
  /** Show two card backs for opponents in the hand (do not reveal their cards) */
  showCardBacks?: boolean;
  /** Last action this player took (e.g. "call", "raise 500") */
  lastAction?: { action: string; amount: string } | null;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function SeatBadge({ children, variant }: { children: React.ReactNode; variant: 'dealer' | 'blind' | 'you' }) {
  const base =
    'inline-flex items-center justify-center rounded-full px-1 py-0.5 sm:px-2 text-[9px] sm:text-[11px] font-semibold border backdrop-blur-md';
  if (variant === 'dealer') {
    return (
      <span
        className={base}
        style={{ color: 'var(--poker-chip)', borderColor: 'var(--poker-chip)', backgroundColor: 'color-mix(in srgb, var(--poker-chip) 15%, transparent)' }}
        title="Dealer"
      >
        {children}
      </span>
    );
  }
  if (variant === 'you') {
    return (
      <span
        className={base}
        style={{ color: 'var(--poker-accent)', borderColor: 'var(--poker-accent-muted)', backgroundColor: 'color-mix(in srgb, var(--poker-accent) 10%, transparent)' }}
        title="You"
      >
        {children}
      </span>
    );
  }
  return (
    <span
      className={base}
      style={{ color: 'var(--poker-chip)', borderColor: 'var(--poker-chip)', backgroundColor: 'color-mix(in srgb, var(--poker-chip) 10%, transparent)' }}
      title="Blind"
    >
      {children}
    </span>
  );
}

function formatLastAction(action: string, amount: string): string {
  const a = action.toLowerCase();
  if (a === 'fold') return 'Fold';
  if (a === 'check') return 'Check';
  if (a === 'call') return 'Call';
  if (a === 'bet') return `Bet ${formatChips(amount)}`;
  if (a === 'raise') return `Raise ${formatChips(amount)}`;
  if (a === 'all-in' || a === 'allin') return 'All-in';
  return action;
}

export function PokerSeat({ seat, holeCards, isCurrentPlayer, showCardBacks, lastAction }: PokerSeatProps) {
  const empty = !seat.playerAddress;
  const showMyCards = holeCards && holeCards.length > 0 && isCurrentPlayer;
  const showBacks = showCardBacks && !showMyCards && !empty && !seat.folded;

  const isActing = !!seat.isActing && !empty && !seat.folded;
  const isFolded = !!seat.folded && !empty;

  const currentBetBig = (() => {
    try {
      return BigInt(seat.currentBet || '0') > 0n;
    } catch {
      return false;
    }
  })();

  return (
    <div
      className={`poker-seat relative rounded-xl sm:rounded-2xl border p-1.5 sm:p-3 min-w-0 w-full max-w-full sm:max-w-none sm:min-w-[120px] select-none transition ${
        empty ? 'border-dashed' : ''
      } ${isFolded ? 'opacity-60' : 'opacity-100'} ${isActing ? 'acting' : ''}`}
      style={{
        borderColor: empty ? 'var(--poker-text-muted)' : (isActing ? 'var(--poker-accent)' : 'var(--poker-card-border)'),
        background: 'var(--poker-bg-elevated)',
        boxShadow: isActing
          ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 2px var(--poker-accent-muted), 0 18px 40px rgba(0,0,0,0.55)'
          : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 14px 36px rgba(0,0,0,0.55)',
      }}
      aria-label={empty ? 'Empty seat' : `Seat ${shortAddr(seat.playerAddress!)}`}
    >
      {isActing && (
        <div
          className="pointer-events-none absolute -inset-2 rounded-[22px] blur-md opacity-70"
          style={{ background: 'radial-gradient(circle at 50% 45%, var(--poker-accent-muted), transparent 70%)' }}
          aria-hidden
        />
      )}

      <div className="relative flex flex-col items-center gap-0.5 sm:gap-1.5">
        <div className="flex flex-wrap items-center justify-center gap-0.5 sm:gap-1.5">
          {seat.isDealer && (
            <SeatBadge variant="dealer">
              <span className="sm:hidden">D</span>
              <span className="hidden sm:inline">DEALER</span>
            </SeatBadge>
          )}
          {seat.isSmallBlind && <SeatBadge variant="blind">SB</SeatBadge>}
          {seat.isBigBlind && <SeatBadge variant="blind">BB</SeatBadge>}
          {isCurrentPlayer && !empty && <SeatBadge variant="you">YOU</SeatBadge>}
        </div>

        <div className="flex flex-col items-center leading-tight">
          <span
            className="text-[10px] sm:text-sm font-medium max-w-full truncate"
            style={{ color: empty ? 'var(--poker-text-muted)' : 'var(--poker-text)' }}
          >
            {empty ? 'Empty' : shortAddr(seat.playerAddress!)}
          </span>
          {!empty && (
            <span className="text-[10px] sm:text-[13px] font-semibold tabular-nums" style={{ color: 'var(--poker-accent)' }}>
              {formatChips(seat.stack)}
            </span>
          )}
        </div>

        {isFolded && <span className="text-[9px] sm:text-[11px]" style={{ color: 'var(--poker-danger)' }}>Folded</span>}

        {lastAction && !empty && (
          <span className="text-[9px] sm:text-[11px] font-semibold animate-pulse" style={{ color: 'var(--poker-chip)' }}>
            {formatLastAction(lastAction.action, lastAction.amount)}
          </span>
        )}

        {currentBetBig && !empty && (
          <div className="flex items-center gap-0.5 sm:gap-1">
            <div
              className="h-3 w-3 sm:h-4 sm:w-4 rounded-full border"
              style={{ borderColor: 'var(--poker-chip)', backgroundColor: 'color-mix(in srgb, var(--poker-chip) 30%, transparent)' }}
              aria-hidden
            />
            <span className="text-[9px] sm:text-[11px] font-semibold tabular-nums" style={{ color: 'var(--poker-chip)' }}>
              {formatChips(seat.currentBet)}
            </span>
          </div>
        )}

        {(showMyCards || showBacks) && (
          <div className={`flex gap-0.5 sm:gap-1 mt-0.5 sm:mt-1 ${isFolded ? 'grayscale opacity-70' : ''}`}>
            {showMyCards ? (
              <>
                <CardDisplay cardIndex={holeCards![0]} small />
                <CardDisplay cardIndex={holeCards![1]} small />
              </>
            ) : (
              <>
                <CardDisplay cardIndex={null} small faceDown />
                <CardDisplay cardIndex={null} small faceDown />
              </>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .poker-seat.acting {
          animation: seatPulse 1.25s ease-in-out infinite;
        }
        @keyframes seatPulse {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.12); }
        }
      `}</style>
    </div>
  );
}
