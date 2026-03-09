'use client';

import React from 'react';
import { formatEther } from 'viem';
import { PokerSeat } from './PokerSeat';
import { PokerBoard } from './PokerBoard';
import type { PokerTableState as TableState } from '@/lib/websocket-client';
import type { PokerLayout } from '@/lib/poker-layout';
import { getSeatRect, getCommunityRect } from '@/lib/poker-layout';

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

/**
 * Portrait-optimised seat positions (% of container).
 * Slot 0 = current player (always bottom-center after rotation).
 * Slots 1–5 = opponents, clockwise from bottom-right.
 *
 *   4 ──── 3 ──── 2
 *   │   [FELT]   │
 *   5           1
 *        0
 */
const MOBILE_SEAT_POS: Record<number, React.CSSProperties> = {
  0: { left: '50%',  top: '67%', transform: 'translateX(-50%)' },
  1: { right: '1%',  top: '37%', transform: 'translateY(-50%)' },
  2: { right: '3%',  top: '1%'  },
  3: { left: '50%',  top: '0%',  transform: 'translateX(-50%)' },
  4: { left: '3%',   top: '1%'  },
  5: { left: '1%',   top: '37%', transform: 'translateY(-50%)' },
};

// Felt oval bounds (% of container)
const FELT = { left: 5, top: 17, width: 90, height: 58 };
// Community cards area (% of container), centered on felt
const BOARD = { left: 18, top: 28, width: 64, height: 32 };

export function PokerTable({ layout, state, currentPlayerAddress, onLeave }: PokerTableProps) {
  const hand = state.currentHand;
  const mySeatIndex = state.seats.findIndex((s) => s.playerAddress === currentPlayerAddress);
  const communityRect = getCommunityRect(layout);

  /** Render seat props shared between mobile and desktop */
  const seatProps = (idx: number) => {
    const seat = state.seats[idx];
    const inHand = !!hand && seat.playerAddress && !seat.folded;
    return {
      seat,
      index: idx,
      holeCards:
        mySeatIndex === idx
          ? (state.myHoleCards ?? hand?.showdownHands?.[seat.playerAddress!] ?? undefined)
          : (hand?.showdownHands?.[seat.playerAddress!] ?? undefined),
      isCurrentPlayer: idx === mySeatIndex,
      showCardBacks: !!(inHand && idx !== mySeatIndex && !hand?.showdownHands?.[seat.playerAddress!]),
      lastAction:
        hand?.lastAction?.position === idx
          ? { action: hand.lastAction.action, amount: hand.lastAction.amount }
          : null,
    };
  };

  return (
    <div className="absolute inset-0">

      {/* ── MOBILE LAYOUT (< sm) ──────────────────────────────────────────── */}
      <div className="sm:hidden absolute inset-0">

        {/* Felt oval — pure CSS, no image dependency */}
        <div
          className="absolute"
          style={{
            left:   `${FELT.left}%`,
            top:    `${FELT.top}%`,
            width:  `${FELT.width}%`,
            height: `${FELT.height}%`,
            borderRadius: '50%',
            background:
              'radial-gradient(ellipse at 50% 40%, rgb(26,96,42) 0%, rgb(14,62,26) 55%, rgb(9,44,18) 100%)',
            boxShadow:
              '0 0 0 3px rgba(255,255,255,0.06), ' +
              '0 8px 48px rgba(0,0,0,0.75), ' +
              'inset 0 2px 32px rgba(0,0,0,0.4)',
          }}
        />

        {/* Community cards + pot */}
        <div
          className="absolute flex flex-col items-center justify-center z-10"
          style={{
            left:   `${BOARD.left}%`,
            top:    `${BOARD.top}%`,
            width:  `${BOARD.width}%`,
            height: `${BOARD.height}%`,
          }}
        >
          {hand ? (
            <PokerBoard communityCards={hand.communityCards} pot={hand.pot} />
          ) : (
            <span
              className="text-xl font-bold tracking-[0.25em] uppercase select-none"
              style={{ color: 'rgba(255,255,255,0.07)' }}
            >
              Morbius
            </span>
          )}
        </div>

        {/* Seats */}
        {state.seats.map((_, idx) => {
          const displaySlot =
            mySeatIndex >= 0
              ? (idx - mySeatIndex + state.seats.length) % state.seats.length
              : idx;
          const pos = MOBILE_SEAT_POS[displaySlot];
          if (pos === undefined) return null;
          return (
            <div key={idx} className="absolute z-20" style={pos}>
              <PokerSeat key={idx} {...seatProps(idx)} />
            </div>
          );
        })}
      </div>

      {/* ── DESKTOP LAYOUT (≥ sm) ─────────────────────────────────────────── */}
      <div className="hidden sm:block absolute inset-0">

        {/* Top bar: blinds, leave */}
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-1.5 py-1 sm:px-2 sm:py-1.5 z-10">
          <div className="w-10 sm:w-16" />
          <span className="text-[var(--poker-accent)] font-medium text-[10px] sm:text-xs md:text-sm">
            {formatChips(state.smallBlind)}/{formatChips(state.bigBlind)} · {state.seats.filter((s) => s.playerAddress).length}/{state.maxSeats} seats
          </span>
          <button
            type="button"
            onClick={onLeave}
            className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded border border-[var(--poker-danger)] text-[var(--poker-danger)] hover:opacity-80 active:scale-95 active:brightness-90 transition-all text-[10px] sm:text-xs md:text-sm"
          >
            Leave
          </button>
        </div>

        {/* Community cards + pot */}
        {communityRect && hand && (
          <div
            className="absolute flex flex-col items-center justify-center gap-0.5 min-h-0"
            style={{
              left:   `${communityRect.x}%`,
              top:    `${communityRect.y}%`,
              width:  `${communityRect.width}%`,
              height: `${communityRect.height}%`,
            }}
          >
            <PokerBoard communityCards={hand.communityCards} pot={hand.pot} />
          </div>
        )}

        {/* Seats */}
        {state.seats.map((_, idx) => {
          const displaySlot =
            mySeatIndex >= 0
              ? (idx - mySeatIndex + state.seats.length) % state.seats.length
              : idx;
          const rect = getSeatRect(layout, displaySlot);
          if (!rect) return null;
          return (
            <div
              key={idx}
              className="absolute flex items-center justify-center min-h-0"
              style={{
                left:   `${rect.x}%`,
                top:    `${rect.y}%`,
                width:  `${rect.width}%`,
                height: `${rect.height}%`,
              }}
            >
              <PokerSeat {...seatProps(idx)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
