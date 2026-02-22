'use client';

import React from 'react';
import { PokerSeat } from './PokerSeat';
import { PokerBoard } from './PokerBoard';
import { PokerActions } from './PokerActions';
import type { PokerTableState as TableState } from '@/lib/websocket-client';
import type { PokerLayout } from '@/lib/poker-layout';
import { getTableRect, getSeatRect, getCommunityRect, getActionBarRect } from '@/lib/poker-layout';

export interface PokerTableProps {
  layout: PokerLayout;
  state: TableState;
  currentPlayerAddress: string | null;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onBet: (amount: string) => void;
  onRaise: (amount: string) => void;
  onLeave: () => void;
}

export function PokerTable({
  layout,
  state,
  currentPlayerAddress,
  onFold,
  onCheck,
  onCall,
  onBet,
  onRaise,
  onLeave,
}: PokerTableProps) {
  const hand = state.currentHand;
  const mySeatIndex = state.seats.findIndex((s) => s.playerAddress === currentPlayerAddress);
  const mySeat = mySeatIndex >= 0 ? state.seats[mySeatIndex] : null;
  const canAct =
    !!hand &&
    hand.actingPosition != null &&
    mySeat &&
    state.seats[hand.actingPosition]?.playerAddress === currentPlayerAddress &&
    !mySeat.folded;
  const canCheck = hand?.toCall === '0' || hand?.toCall === '';
  const callAmount = hand?.toCall ?? '0';

  const tableRect = getTableRect(layout);
  const communityRect = getCommunityRect(layout);
  const actionBarRect = getActionBarRect(layout);

  return (
    <div className="absolute inset-0">
      {/* Top bar: blinds, leave */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-2 py-1.5 z-10">
        <div className="w-16" />
        <span className="text-cyan-400 font-medium text-xs md:text-sm">
          {state.smallBlind}/{state.bigBlind} · {state.seats.filter((s) => s.playerAddress).length}/{state.maxSeats} seats
        </span>
        <button
          type="button"
          onClick={onLeave}
          className="px-2 py-1 rounded border border-red-500/50 text-red-400 hover:bg-red-500/20 text-xs md:text-sm"
        >
          Leave
        </button>
      </div>

      {/* Oval table (layout %) */}
      {tableRect && (
        <div
          className="absolute rounded-[50%] overflow-hidden border-2 border-black/50"
          style={{
            left: `${tableRect.x}%`,
            top: `${tableRect.y}%`,
            width: `${tableRect.width}%`,
            height: `${tableRect.height}%`,
            background: 'linear-gradient(160deg, #0d5c2e 0%, #0a4d26 50%, #083d1e 100%)',
            boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <div className="absolute inset-[15%] rounded-[50%] border border-black/20 pointer-events-none" />
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
            />
          </div>
        );
      })}

      {/* Action bar (layout %) */}
      {hand && actionBarRect && (
        <div
          className="absolute flex items-center justify-center min-h-0"
          style={{
            left: `${actionBarRect.x}%`,
            top: `${actionBarRect.y}%`,
            width: `${actionBarRect.width}%`,
            height: `${actionBarRect.height}%`,
          }}
        >
          <PokerActions
            canAct={!!canAct}
            canCheck={canCheck}
            minRaise={hand.minRaise}
            stack={mySeat?.stack ?? '0'}
            callAmount={callAmount}
            onFold={onFold}
            onCheck={onCheck}
            onCall={onCall}
            onBet={onBet}
            onRaise={onRaise}
          />
        </div>
      )}
    </div>
  );
}
