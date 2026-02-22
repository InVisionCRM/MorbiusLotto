'use client';

import React from 'react';
import { PokerSeat } from './PokerSeat';
import { PokerBoard } from './PokerBoard';
import { PokerActions } from './PokerActions';
import type { PokerTableState as TableState } from '@/lib/websocket-client';

export interface PokerTableProps {
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

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-cyan-400 font-medium">
          {state.smallBlind}/{state.bigBlind} · {state.seats.filter((s) => s.playerAddress).length}/{state.maxSeats} seats
        </h2>
        <button
          type="button"
          onClick={onLeave}
          className="px-3 py-1.5 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/20 text-sm"
        >
          Leave table
        </button>
      </div>

      <div className="flex flex-wrap gap-3 justify-center">
        {state.seats.map((seat, idx) => (
          <PokerSeat
            key={idx}
            seat={seat}
            index={idx}
            holeCards={mySeatIndex === idx ? state.myHoleCards ?? undefined : undefined}
            isCurrentPlayer={idx === mySeatIndex}
          />
        ))}
      </div>

      {hand && (
        <>
          <PokerBoard communityCards={hand.communityCards} pot={hand.pot} />
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
        </>
      )}
    </div>
  );
}
