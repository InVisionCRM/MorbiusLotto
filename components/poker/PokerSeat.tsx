'use client';

import React from 'react';
import { CardDisplay } from './CardDisplay';
import type { PokerSeatState as SeatState } from '@/lib/websocket-client';

export interface PokerSeatProps {
  seat: SeatState;
  /** Index for layout (e.g. position around table) */
  index: number;
  /** Show hole cards (only for current player when visible) */
  holeCards?: number[];
  isCurrentPlayer?: boolean;
  /** Show two card backs for opponents in the hand (do not reveal their cards) */
  showCardBacks?: boolean;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function SeatBadge({ children, variant }: { children: React.ReactNode; variant: 'dealer' | 'blind' | 'you' }) {
  const base =
    'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide border backdrop-blur-md';
  if (variant === 'dealer') {
    return (
      <span
        className={`${base} bg-amber-300/15 text-amber-100 border-amber-300/30 shadow-[0_8px_18px_rgba(0,0,0,0.35)]`}
        title="Dealer"
      >
        {children}
      </span>
    );
  }
  if (variant === 'you') {
    return (
      <span className={`${base} bg-cyan-400/10 text-cyan-100 border-cyan-400/25`} title="You">
        {children}
      </span>
    );
  }
  return (
    <span className={`${base} bg-slate-400/10 text-amber-100 border-amber-400/25`} title="Blind">
      {children}
    </span>
  );
}

export function PokerSeat({ seat, holeCards, isCurrentPlayer, showCardBacks }: PokerSeatProps) {
  const empty = !seat.playerAddress;
  const showMyCards = holeCards && holeCards.length > 0 && isCurrentPlayer;
  const showBacks = showCardBacks && !showMyCards && !empty && !seat.folded;

  const isActing = !!seat.isActing && !empty && !seat.folded;
  const isFolded = !!seat.folded && !empty;

  return (
    <div
      className={`relative rounded-2xl border p-3 min-w-[120px] select-none transition ${
        empty ? 'border-dashed border-slate-500/60 bg-slate-950/25' : 'border-cyan-500/20 bg-slate-950/40'
      } ${isFolded ? 'opacity-60' : 'opacity-100'} ${
        isActing ? 'border-cyan-300/70 ring-2 ring-cyan-300/35' : ''
      }`}
      style={{
        boxShadow: isActing
          ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(34,211,238,0.2), 0 18px 40px rgba(0,0,0,0.55)'
          : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 14px 36px rgba(0,0,0,0.55)',
      }}
      aria-label={empty ? 'Empty seat' : `Seat ${shortAddr(seat.playerAddress!)}`}
    >
      {isActing && (
        <div
          className="pointer-events-none absolute -inset-2 rounded-[22px] blur-md opacity-70"
          style={{
            background:
              'radial-gradient(circle at 50% 45%, rgba(34,211,238,0.55), rgba(34,211,238,0.0) 70%)',
          }}
          aria-hidden
        />
      )}

      <div className="relative flex flex-col items-center gap-1.5">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {seat.isDealer && <SeatBadge variant="dealer">DEALER</SeatBadge>}
          {seat.isSmallBlind && <SeatBadge variant="blind">SB</SeatBadge>}
          {seat.isBigBlind && <SeatBadge variant="blind">BB</SeatBadge>}
          {isCurrentPlayer && !empty && <SeatBadge variant="you">YOU</SeatBadge>}
        </div>

        <div className="flex flex-col items-center leading-tight">
          <span className={`text-sm font-medium max-w-full truncate ${empty ? 'text-slate-400' : 'text-slate-100'}`}>
            {empty ? 'Empty Seat' : shortAddr(seat.playerAddress!)}
          </span>
          {!empty && (
            <span className="text-cyan-200 text-[13px] font-semibold tabular-nums">{seat.stack}</span>
          )}
        </div>

        {isFolded && <span className="text-[11px] text-red-200/80">Folded</span>}

        {(showMyCards || showBacks) && (
          <div className={`flex gap-1 mt-1 ${isFolded ? 'grayscale opacity-70' : ''}`}>
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
        /* Subtle acting pulse without affecting layout */
        div[aria-label] {
          transform: translateZ(0);
        }
        div[aria-label].acting {
          animation: seatPulse 1.25s ease-in-out infinite;
        }
        @keyframes seatPulse {
          0%,
          100% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(1.08);
          }
        }
      `}</style>
    </div>
  );
}
