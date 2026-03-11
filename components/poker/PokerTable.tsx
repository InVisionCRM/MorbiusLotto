'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PokerSeat, PokerChipStack } from './PokerSeat';
import { PokerBoard } from './PokerBoard';
import type { PokerTableState as TableState } from '@/lib/websocket-client';

// 10-seat oval positions as fractions of table container
const SEAT_ANCHORS = [
  { fx: 0.50, fy: 0.90 }, // 0 — bottom center (current player)
  { fx: 0.72, fy: 0.83 }, // 1
  { fx: 0.89, fy: 0.63 }, // 2
  { fx: 0.89, fy: 0.36 }, // 3
  { fx: 0.72, fy: 0.13 }, // 4
  { fx: 0.50, fy: 0.06 }, // 5
  { fx: 0.28, fy: 0.13 }, // 6
  { fx: 0.11, fy: 0.36 }, // 7
  { fx: 0.11, fy: 0.63 }, // 8
  { fx: 0.28, fy: 0.83 }, // 9
];

const POT_ANCHOR = { fx: 0.50, fy: 0.50 };

export interface PokerTableProps {
  state: TableState;
  currentPlayerAddress: string | null;
  onLeave?: () => void;
  timeLeft?: number;
}

export function PokerTable({ state, currentPlayerAddress, timeLeft }: PokerTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [, setDims] = useState({ w: 640, h: 500 });

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const update = () => setDims({ w: el.offsetWidth, h: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hand = state.currentHand;
  const mySeatIndex = state.seats.findIndex(s => s.playerAddress === currentPlayerAddress);
  const actingPosition = hand?.actingPosition ?? null;

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
      timeLeft: actingPosition === idx ? timeLeft : undefined,
    };
  };

  return (
    <div ref={tableRef} className="absolute inset-0" style={{ overflow: 'visible' }}>

      {/* Felt oval */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: '4%', top: '5%', width: '92%', height: '88%',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at 50% 38%, rgb(30,110,50) 0%, rgb(15,72,30) 48%, rgb(9,50,20) 100%)',
          boxShadow:
            '0 0 0 5px rgba(255,255,255,0.04), ' +
            '0 0 0 10px rgba(0,0,0,0.3), ' +
            '0 16px 80px rgba(0,0,0,0.85), ' +
            'inset 0 2px 50px rgba(0,0,0,0.5)',
        }}
      />
      {/* Rail groove */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: '3%', top: '3%', width: '94%', height: '92%',
          borderRadius: '50%',
          border: '4px solid rgba(60,30,5,0.65)',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
        }}
      />

      {/* Community board — center of felt */}
      <div
        className="absolute flex items-center justify-center"
        style={{ left: '20%', top: '37%', width: '60%', height: '24%', zIndex: 10 }}
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

      {/* Chip stacks — between each seat and pot */}
      <AnimatePresence>
        {SEAT_ANCHORS.map((anchor, displaySlot) => {
          const actualIdx = mySeatIndex >= 0
            ? (mySeatIndex + displaySlot) % state.seats.length
            : displaySlot;
          if (actualIdx >= state.seats.length) return null;
          const seat = state.seats[actualIdx];
          const hasBet = (() => { try { return BigInt(seat.currentBet || '0') > 0n; } catch { return false; } })();
          if (!hasBet) return null;

          const frac = displaySlot === 0 ? 0.57 : 0.28;
          const cfx = anchor.fx + (POT_ANCHOR.fx - anchor.fx) * frac;
          const cfy = anchor.fy + (POT_ANCHOR.fy - anchor.fy) * frac;

          return (
            <motion.div
              key={`chips-${actualIdx}`}
              className="absolute pointer-events-none"
              style={{
                left: `${cfx * 100}%`,
                top:  `${cfy * 100}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 25,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            >
              <PokerChipStack weiAmount={seat.currentBet} />
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Seats */}
      {state.seats.map((_, idx) => {
        const displaySlot = mySeatIndex >= 0
          ? (idx - mySeatIndex + state.seats.length) % state.seats.length
          : idx;
        const anchor = SEAT_ANCHORS[displaySlot];
        if (!anchor) return null;
        return (
          <div
            key={idx}
            className="absolute z-20"
            style={{
              left: `${anchor.fx * 100}%`,
              top:  `${anchor.fy * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <PokerSeat {...seatProps(idx)} />
          </div>
        );
      })}
    </div>
  );
}
