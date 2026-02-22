'use client';

import React from 'react';
import { PokerSeat } from './PokerSeat';
import { PokerBoard } from './PokerBoard';
import { PokerActions } from './PokerActions';
import type { PokerTableState as TableState } from '@/lib/websocket-client';

/** Place 6 seats around a horizontal oval. Position 0 = bottom center (current player), then clockwise. */
const OVAL_POSITIONS = [
  { x: 50, y: 90 },   // 0 bottom center (you)
  { x: 82, y: 70 },   // 1 bottom-right
  { x: 92, y: 50 },   // 2 right
  { x: 82, y: 30 },   // 3 top-right
  { x: 50, y: 10 },   // 4 top center
  { x: 18, y: 30 },   // 5 top-left
  { x: 8, y: 50 },    // 6 left (fallback)
];

function getSeatPosition(seatIndex: number, mySeatIndex: number, maxSeats: number) {
  const p = (seatIndex - mySeatIndex + maxSeats) % maxSeats;
  return OVAL_POSITIONS[p] ?? OVAL_POSITIONS[0];
}

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
  const maxSeats = state.maxSeats;

  return (
    <div className="relative w-full min-h-[80vh] flex flex-col">
      {/* Top bar: blinds, leave */}
      <div className="flex items-center justify-between px-2 py-2 z-10">
        <div className="w-20" />
        <span className="text-cyan-400 font-medium text-sm">
          {state.smallBlind}/{state.bigBlind} · {state.seats.filter((s) => s.playerAddress).length}/{maxSeats} seats
        </span>
        <button
          type="button"
          onClick={onLeave}
          className="px-3 py-1.5 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/20 text-sm w-20"
        >
          Leave
        </button>
      </div>

      {/* Oval table surface + seats */}
      <div className="relative flex-1 min-h-[420px] w-full max-w-4xl mx-auto">
        {/* Horizontal oval table (green felt) */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] max-w-2xl aspect-[2.2/1] rounded-[50%] overflow-hidden border-4 border-black/60 shadow-2xl"
          style={{
            background: 'linear-gradient(160deg, #0d5c2e 0%, #0a4d26 50%, #083d1e 100%)',
            boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {/* Inner oval line */}
          <div className="absolute inset-4 rounded-[50%] border border-black/20 pointer-events-none" />
          {/* Center: community cards + pot */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 w-full px-4">
            {hand && (
              <>
                <PokerBoard communityCards={hand.communityCards} pot={hand.pot} />
              </>
            )}
          </div>
        </div>

        {/* Seats around the oval */}
        {state.seats.map((seat, idx) => {
          const pos = getSeatPosition(idx, mySeatIndex >= 0 ? mySeatIndex : 0, maxSeats);
          const inHand = !!hand && seat.playerAddress && !seat.folded;
          return (
            <div
              key={idx}
              className="absolute transform -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
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
      </div>

      {/* Action bar at bottom */}
      {hand && (
        <div className="mt-4 flex justify-center">
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
