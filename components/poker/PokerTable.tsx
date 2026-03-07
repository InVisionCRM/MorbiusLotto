'use client';

import React from 'react';
import { formatEther } from 'viem';
import { PokerSeat } from './PokerSeat';
import { PokerBoard } from './PokerBoard';
import type { PokerTableState as TableState } from '@/lib/websocket-client';
import type { PokerLayout } from '@/lib/poker-layout';
import { getTableRect, getSeatRect, getCommunityRect } from '@/lib/poker-layout';

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

export interface PokerTableProps {
  layout: PokerLayout;
  state: TableState;
  currentPlayerAddress: string | null;
  onLeave: () => void;
}

export function PokerTable({
  layout,
  state,
  currentPlayerAddress,
  onLeave,
}: PokerTableProps) {
  const hand = state.currentHand;
  const mySeatIndex = state.seats.findIndex((s) => s.playerAddress === currentPlayerAddress);

  const tableRect = getTableRect(layout);
  const communityRect = getCommunityRect(layout);

  return (
    <div className="absolute inset-0">
      {/* Top bar: blinds, leave */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-1.5 py-1 sm:px-2 sm:py-1.5 z-10">
        <div className="w-10 sm:w-16" />
        <span className="text-[var(--poker-accent)] font-medium text-[10px] sm:text-xs md:text-sm">
          {formatChips(state.smallBlind)}/{formatChips(state.bigBlind)} · {state.seats.filter((s) => s.playerAddress).length}/{state.maxSeats} seats
        </span>
        <button
          type="button"
          onClick={onLeave}
          className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded border border-[var(--poker-danger)] text-[var(--poker-danger)] hover:opacity-80 text-[10px] sm:text-xs md:text-sm"
        >
          Leave
        </button>
      </div>

      {/* Oval table (layout %) */}
      {tableRect && (
        <div
          className="absolute rounded-[50%] overflow-visible border-2"
          style={{
            left: `${tableRect.x}%`,
            top: `${tableRect.y}%`,
            width: `${tableRect.width}%`,
            height: `${tableRect.height}%`,
            background: 'var(--poker-table-bg)',
            borderColor: 'var(--poker-table-border)',
            boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.5), 0 0 50px rgba(0,255,170,0.1)',
          }}
        >
          <div
            className="absolute inset-[15%] rounded-[50%] border border-dashed pointer-events-none"
            style={{ borderColor: 'var(--poker-table-inner)' }}
          />
        </div>
      )}

      {/* Community cards + pot (layout %) */}
      {communityRect && hand && (
        <div
          className="absolute flex flex-col items-center justify-center gap-0.5 min-h-0"
          style={{
            left: `${communityRect.x}%`,
            top: `${communityRect.y}%`,
            width: `${communityRect.width}%`,
            height: `${communityRect.height}%`,
          }}
        >
          <PokerBoard communityCards={hand.communityCards} pot={hand.pot} />
        </div>
      )}

      {/* Seats (layout %: seat0 = index 0, seat1 = index 1, …) */}
      {state.seats.map((seat, idx) => {
        const rect = getSeatRect(layout, idx);
        const inHand = !!hand && seat.playerAddress && !seat.folded;
        if (!rect) return null;
        return (
          <div
            key={idx}
            className="absolute flex items-center justify-center min-h-0"
            style={{
              left: `${rect.x}%`,
              top: `${rect.y}%`,
              width: `${rect.width}%`,
              height: `${rect.height}%`,
            }}
          >
            <PokerSeat
              seat={seat}
              index={idx}
              holeCards={mySeatIndex === idx ? state.myHoleCards ?? undefined : undefined}
              isCurrentPlayer={idx === mySeatIndex}
              showCardBacks={inHand && idx !== mySeatIndex}
              lastAction={hand?.lastAction?.position === idx ? { action: hand.lastAction.action, amount: hand.lastAction.amount } : null}
            />
          </div>
        );
      })}
    </div>
  );
}
