'use client';

import React, { useRef, useState, useEffect } from 'react';
import { formatEther } from 'viem';
import { motion, AnimatePresence } from 'framer-motion';
import { PokerSeat, PokerChipStack } from './PokerSeat';
import { PokerBoard } from './PokerBoard';
import { CardDisplay } from './CardDisplay';
import type { PokerTableState as TableState } from '@/lib/websocket-client';

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

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

// 10-seat oval positions as fractions of table container (seat 0 raised so player tag stays above action bar)
const SEAT_ANCHORS = [
  { fx: 0.50, fy: 0.78 }, // 0 — bottom center (current player), raised so badge is visible above controls
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
  /** Chat bubble text to show above each seat (key = seat index). Cleared after ~5s by parent. */
  chatBubbleBySeatIndex?: Record<number, string>;
}

export function PokerTable({ state, currentPlayerAddress, timeLeft, chatBubbleBySeatIndex }: PokerTableProps) {
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
  const isShowdownWithWinners = hand?.street === 'showdown' && hand?.winners?.length;
  const winnerSeatIndices = isShowdownWithWinners
    ? (hand!.winners!.map((w) => state.seats.findIndex((s) => s.playerAddress === w.address)).filter((i) => i >= 0) as number[])
    : [];
  const winnerDisplaySlots = winnerSeatIndices.map(
    (idx) => (mySeatIndex >= 0 ? (idx - mySeatIndex + state.seats.length) % state.seats.length : idx)
  );
  const firstWinnerAnchor = winnerDisplaySlots.length > 0 ? SEAT_ANCHORS[winnerDisplaySlots[0]] : null;
  const firstWinner = isShowdownWithWinners ? hand!.winners![0] : null;
  const firstWinnerAddr = firstWinner?.address ?? null;
  const isCurrentPlayerWinner = firstWinnerAddr && currentPlayerAddress && firstWinnerAddr === currentPlayerAddress.toLowerCase();
  const firstWinnerSeat = firstWinnerAddr ? state.seats.find((s) => s.playerAddress === firstWinnerAddr) : null;
  const winnerStack = firstWinnerSeat?.stack ?? '0';
  const winnerAmount = firstWinner?.amount ?? hand?.pot ?? '0';
  const winnerHandName = firstWinner?.handName;

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
      chatBubble: chatBubbleBySeatIndex?.[idx] ?? null,
    };
  };

  return (
    <div ref={tableRef} className="absolute inset-0" style={{ overflow: 'visible' }}>

      {/* CSS poker table — outer drop shadow */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: '3%', top: '3%', width: '94%', height: '92%',
          borderRadius: '50%',
          boxShadow: '0 24px 80px rgba(0,0,0,0.9), 0 8px 32px rgba(0,0,0,0.7)',
        }}
      >
        {/* Wood rim */}
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at 50% 30%, #6b3a1f 0%, #3d1f0a 55%, #1e0e04 100%)',
          boxShadow: 'inset 0 4px 12px rgba(255,200,120,0.12), inset 0 -6px 18px rgba(0,0,0,0.6)',
        }} />
        {/* Rail cushion (inner ring) */}
        <div style={{
          position: 'absolute', inset: '5%',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at 50% 30%, #7c2d12 0%, #450e00 60%, #2a0800 100%)',
          boxShadow: 'inset 0 3px 10px rgba(255,180,80,0.1), inset 0 -4px 14px rgba(0,0,0,0.7), 0 0 0 2px rgba(0,0,0,0.4)',
        }} />
        {/* Felt surface */}
        <div style={{
          position: 'absolute', inset: '12%',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at 50% 38%, #1a5c2a 0%, #0f3d1a 45%, #082610 80%, #041509 100%)',
          boxShadow: 'inset 0 6px 30px rgba(0,0,0,0.5), inset 0 -4px 20px rgba(0,0,0,0.4), inset 0 0 60px rgba(0,0,0,0.25)',
        }} />
        {/* Felt sheen highlight */}
        <div style={{
          position: 'absolute', inset: '12%',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at 50% 20%, rgba(255,255,255,0.06) 0%, transparent 55%)',
          pointerEvents: 'none',
        }} />
      </div>

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

      {/* Winner announcement — centered on table, community cards + details */}
      <AnimatePresence>
        {isShowdownWithWinners && firstWinnerAddr && hand && (
          <motion.div
            key="winner-panel"
            className="absolute z-40 flex items-center justify-center pointer-events-none"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
            initial={{ opacity: 0, scale: 0.92, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <div
              className="rounded-lg overflow-hidden min-w-[240px] max-w-[min(94vw, 360px)]"
              style={{
                background: 'rgba(10,10,10,0.96)',
                border: '1px solid rgba(255,255,255,0.07)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              {/* Header */}
              <div
                className="px-4 py-2.5 text-center border-b border-white/[0.07]"
                style={{
                  background: 'linear-gradient(180deg, rgba(192,57,43,0.35) 0%, rgba(139,26,26,0.25) 100%)',
                  color: '#fff',
                  fontSize: 'clamp(13px, 2.5vw, 16px)',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                }}
              >
                {isCurrentPlayerWinner ? 'You win!' : `${shortAddr(firstWinnerAddr)} wins`}
              </div>
              {/* Community cards */}
              {hand.communityCards && hand.communityCards.length > 0 && (
                <div className="px-3 py-2 border-b border-white/[0.07] flex justify-center gap-1">
                  {hand.communityCards.map((cardIdx, i) => (
                    <CardDisplay key={i} cardIndex={cardIdx} small />
                  ))}
                </div>
              )}
              {/* Winner hole cards (if showdown) */}
              {hand.showdownHands?.[firstWinnerAddr] && hand.showdownHands[firstWinnerAddr].length >= 2 && (
                <div className="px-3 py-1.5 border-b border-white/[0.07] flex justify-center gap-1">
                  <span className="text-[10px] uppercase text-white/50 mr-1 self-center">Winning hand:</span>
                  {hand.showdownHands[firstWinnerAddr].map((cardIdx, i) => (
                    <CardDisplay key={i} cardIndex={cardIdx} small />
                  ))}
                </div>
              )}
              {/* Details */}
              <div className="px-4 py-3 space-y-2">
                {winnerHandName && (
                  <div className="flex justify-between items-center gap-4 text-sm">
                    <span style={{ color: 'rgba(255,255,255,0.55)' }}>Hand</span>
                    <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{winnerHandName}</span>
                  </div>
                )}
                <div className="flex justify-between items-center gap-4 text-sm">
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>Pot</span>
                  <span style={{ color: '#fbbf24', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatChips(hand.pot ?? '0')}</span>
                </div>
                <div className="flex justify-between items-center gap-4 text-sm">
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>Won</span>
                  <span style={{ color: '#22c55e', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatChips(winnerAmount)}</span>
                </div>
                <div className="flex justify-between items-center gap-4 text-sm border-t border-white/[0.07] pt-2">
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>New stack</span>
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatChips(winnerStack)}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chips sliding from pot to winner at showdown */}
      <AnimatePresence>
        {isShowdownWithWinners && hand?.pot && firstWinnerAnchor && (
          <motion.div
            key={`chips-to-winner-${hand.handId}`}
            className="absolute z-30 pointer-events-none"
            style={{ transform: 'translate(-50%, -50%)' }}
            initial={{
              left: `${POT_ANCHOR.fx * 100}%`,
              top: `${POT_ANCHOR.fy * 100}%`,
            }}
            animate={{
              left: `${firstWinnerAnchor.fx * 100}%`,
              top: `${firstWinnerAnchor.fy * 100}%`,
            }}
            exit={{ opacity: 0 }}
            transition={{
              type: 'spring',
              stiffness: 80,
              damping: 18,
              delay: 0.4,
            }}
          >
            <PokerChipStack weiAmount={hand.pot} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chip stacks — between each seat and pot (hidden at showdown so only sliding pot shows) */}
      {!isShowdownWithWinners && (
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
      )}

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
