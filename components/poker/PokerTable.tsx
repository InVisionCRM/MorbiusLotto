'use client';

import React, { useRef, useState, useEffect } from 'react';
import { formatEther } from 'viem';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { motion, AnimatePresence } from 'framer-motion';
import { PokerSeat, PokerChipStack } from './PokerSeat';
import { PokerBoard } from './PokerBoard';
import { CardDisplay } from './CardDisplay';
import type { PokerTableState as TableState } from '@/lib/websocket-client';
import { PokerTournamentHUD } from './tournament/PokerTournamentHUD';
import type { PokerTournamentState } from '@/hooks/use-poker-tournament';

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatChips(wei: string | number): string {
  try {
    const num = Number(formatEther(toBigIntSafe(wei)));
    return Number.isInteger(num)
      ? num.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return String(wei);
  }
}

const POT_ANCHOR = { fx: 0.50, fy: 0.47 };

// Compute evenly-spaced seat positions around the table oval for any seat count.
// Seat 0 is always bottom-center (current player); seats go clockwise.
function computeSeatAnchors(n: number): Array<{ fx: number; fy: number }> {
  const cx = 0.50, cy = 0.45;
  const rx = 0.44, ry = 0.36;
  return Array.from({ length: n }, (_, i) => {
    const theta = Math.PI / 2 - (i / n) * 2 * Math.PI;
    return {
      fx: parseFloat((cx + rx * Math.cos(theta)).toFixed(4)),
      fy: parseFloat((cy + ry * Math.sin(theta)).toFixed(4)),
    };
  });
}

export interface PokerTableProps {
  state: TableState;
  currentPlayerAddress: string | null;
  onLeave?: () => void;
  timeLeft?: number;
  /** Chat bubble text to show above each seat (key = seat index). Cleared after ~5s by parent. */
  chatBubbleBySeatIndex?: Record<number, string>;
  /** Called when current player clicks re-up (+). Opens deposit/re-up modal when provided. */
  onReUpClick?: () => void;
  /** Called when current player clicks the hamburger menu button on the nametag. */
  onMenuClick?: () => void;
  /** Per-seat quick reaction (emoji or phrase) to show above seat; key = seat index. */
  reactionBySeatIndex?: Record<number, { type: 'emoji' | 'phrase'; value: string }>;
  /** Per-seat avatar emotion broadcast to table (so all players see the same animation). */
  broadcastEmotionBySeatIndex?: Record<number, import('@/components/poker/avatar/AvatarPreview').Emotion>;
  /** Called when current player selects an emoji reaction (broadcast to table). */
  onEmojiReaction?: (emoji: string) => void;
  /** Called when current player selects a phrase reaction (broadcast to table). */
  onPhraseReaction?: (phrase: string) => void;
  /** Called when current player selects an avatar emotion (broadcast to table). */
  onAnimationReaction?: (emotion: import('@/components/poker/avatar/AvatarPreview').Emotion) => void;
  /** Called when any player clicks an opponent's avatar. */
  onOpponentClick?: (address: string) => void;
  /** When set, renders the tournament HUD overlay in the top-left corner. */
  tournamentHUD?: {
    state: PokerTournamentState;
    myAddress: string;
  };
  /** QuickChat phrase list (from useQuickChatPhrases). When provided with setQuickChatPhrases and onOpenEditQuickChat, Edit QuickChat can be opened from header Settings. */
  quickChatPhrases?: string[];
  setQuickChatPhrases?: (phrases: string[]) => void;
  /** Called when user wants to open Edit QuickChat (e.g. from seat picker or header Settings). */
  onOpenEditQuickChat?: () => void;
}

export function PokerTable({ state, currentPlayerAddress, timeLeft, chatBubbleBySeatIndex, onReUpClick, onMenuClick, reactionBySeatIndex, broadcastEmotionBySeatIndex, onEmojiReaction, onPhraseReaction, onAnimationReaction, onOpponentClick, tournamentHUD, quickChatPhrases, setQuickChatPhrases, onOpenEditQuickChat }: PokerTableProps) {
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
  const seatAnchors = computeSeatAnchors(state.seats.length);
  const actingPosition = hand?.actingPosition ?? null;
  const isShowdownWithWinners = hand?.street === 'showdown' && hand?.winners?.length;
  const winnerSeatIndices = isShowdownWithWinners
    ? (hand!.winners!.map((w) => state.seats.findIndex((s) => s.playerAddress === w.address)).filter((i) => i >= 0) as number[])
    : [];
  const winnerDisplaySlots = winnerSeatIndices.map(
    (idx) => (mySeatIndex >= 0 ? (idx - mySeatIndex + state.seats.length) % state.seats.length : idx)
  );
  const firstWinnerAnchor = winnerDisplaySlots.length > 0 ? seatAnchors[winnerDisplaySlots[0]] : null;
  const firstWinner = isShowdownWithWinners ? hand!.winners![0] : null;
  const firstWinnerAddr = firstWinner?.address ?? null;
  const isCurrentPlayerWinner = firstWinnerAddr && currentPlayerAddress && firstWinnerAddr === currentPlayerAddress.toLowerCase();
  const firstWinnerSeat = firstWinnerAddr ? state.seats.find((s) => s.playerAddress === firstWinnerAddr) : null;
  const winnerStack = firstWinnerSeat?.stack ?? '0';
  const winnerAmount = firstWinner?.amount ?? hand?.pot ?? '0';
  const winnerHandName = firstWinner?.handName;
  const winningCardIndices = firstWinner?.winningCardIndices ?? [];

  const seatProps = (idx: number) => {
    const seat = state.seats[idx];
    const inHand = !!hand && seat.playerAddress && !seat.folded;
    const isWinnerSeat = !!firstWinnerAddr && seat.playerAddress === firstWinnerAddr;
    return {
      seat,
      index: idx,
      holeCards:
        mySeatIndex === idx
          ? (state.myHoleCards ?? hand?.showdownHands?.[seat.playerAddress!] ?? undefined)
          : (hand?.showdownHands?.[seat.playerAddress!] ?? undefined),
      isCurrentPlayer: idx === mySeatIndex,
      showCardBacks: !!(inHand && idx !== mySeatIndex && !hand?.showdownHands?.[seat.playerAddress!]),
      winningCardIndices: isWinnerSeat ? winningCardIndices : undefined,
      lastAction:
        hand?.lastAction?.position === idx
          ? { action: hand.lastAction.action, amount: hand.lastAction.amount }
          : null,
      timeLeft: actingPosition === idx ? timeLeft : undefined,
      chatBubble: chatBubbleBySeatIndex?.[idx] ?? null,
      onReUpClick,
      onMenuClick,
      overlayEmoji: reactionBySeatIndex?.[idx]?.type === 'emoji' ? reactionBySeatIndex[idx].value : null,
      overlayPhrase: reactionBySeatIndex?.[idx]?.type === 'phrase' ? reactionBySeatIndex[idx].value : null,
      overlayEmotion: broadcastEmotionBySeatIndex?.[idx] ?? null,
      onEmojiReaction: onEmojiReaction,
      onPhraseReaction: onPhraseReaction,
      onAnimationReaction: onAnimationReaction,
      onOpponentClick: onOpponentClick,
      quickChatPhrases,
      setQuickChatPhrases,
      onOpenEditQuickChat,
    };
  };

  return (
    <div ref={tableRef} className="absolute inset-0" style={{ overflow: 'visible' }}>

      {/* Tournament HUD overlay */}
      {tournamentHUD && (
        <PokerTournamentHUD
          state={tournamentHUD.state}
          myAddress={tournamentHUD.myAddress}
        />
      )}

      {/* CSS poker table — padding-based rings so every ring is equal pixel thickness all around */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: '3%', top: '5%', width: '94%', height: '88%',
          borderRadius: '9999px',
          background: '#07090f',
          padding: '7px',
          display: 'flex',
          boxShadow: '0 32px 100px rgba(0,0,0,0.95), 0 10px 40px rgba(0,0,0,0.8)',
        }}
      >
        {/* Outer gold trim — 8px ring */}
        <div style={{
          flex: 1, borderRadius: '9999px', display: 'flex', padding: '8px',
          background: 'linear-gradient(170deg, #d4a82a 0%, #8a6010 30%, #c89828 50%, #8a6010 70%, #d4a82a 100%)',
          boxShadow: 'inset 0 1px 4px rgba(255,230,120,0.35), inset 0 -1px 4px rgba(0,0,0,0.5)',
        }}>
          {/* Dark wood/leather cushion — 20px ring */}
          <div style={{
            flex: 1, borderRadius: '9999px', display: 'flex', padding: '20px',
            background: 'linear-gradient(180deg, #1c1508 0%, #0e0c04 50%, #181304 100%)',
            boxShadow: 'inset 0 4px 16px rgba(0,0,0,0.85), inset 0 -2px 8px rgba(0,0,0,0.6)',
          }}>
            {/* Inner gold trim — 6px ring */}
            <div style={{
              flex: 1, borderRadius: '9999px', display: 'flex', padding: '6px',
              background: 'linear-gradient(170deg, #b08820 0%, #6a4c0c 30%, #a07818 50%, #6a4c0c 70%, #b08820 100%)',
              boxShadow: 'inset 0 1px 3px rgba(255,210,80,0.3)',
            }}>
              {/* Navy felt surface */}
              <div style={{
                flex: 1, borderRadius: '9999px', position: 'relative', overflow: 'hidden',
                background: 'radial-gradient(ellipse at 50% 35%, #1f2e54 0%, #131e3a 45%, #0c1428 75%, #080e1e 100%)',
                boxShadow: 'inset 0 8px 40px rgba(0,0,0,0.55), inset 0 -4px 20px rgba(0,0,0,0.4)',
                outline: '1px dashed rgba(255,255,255,0.08)',
                outlineOffset: '-10px',
              }}>
                {/* Felt sheen */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'radial-gradient(ellipse at 50% 18%, rgba(255,255,255,0.05) 0%, transparent 55%)',
                  pointerEvents: 'none',
                }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dealer button holder bump — top center */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: '50%', top: 'calc(5% + 4px)',
          transform: 'translateX(-50%)',
          width: 44, height: 24,
          zIndex: 5,
          borderRadius: '5px 5px 7px 7px',
          background: 'linear-gradient(180deg, #261a06 0%, #160f03 60%, #0c0902 100%)',
          boxShadow: '0 3px 10px rgba(0,0,0,0.75), inset 0 1px 2px rgba(200,160,50,0.15)',
          border: '1px solid rgba(160,120,30,0.3)',
        }}
      />

      {/* Community board — center of felt */}
      <div
        className="absolute flex items-center justify-center"
        style={{ left: '20%', top: '38%', width: '60%', height: '22%', zIndex: 10 }}
      >
        {hand ? (
          <PokerBoard
            communityCards={hand.communityCards}
            pot={hand.pot}
            winningCardIndices={winningCardIndices}
          />
        ) : (
          <span
            className="text-xl font-bold tracking-[0.25em] uppercase select-none"
            style={{ color: 'rgba(255,255,255,0.07)' }}
          >
            Morbius
          </span>
        )}
      </div>

      {/* Winner announcement — minimal banner above pot (cards stay visible with cyan highlight) */}
      <AnimatePresence>
        {isShowdownWithWinners && firstWinnerAddr && hand && (
          <motion.div
            key="winner-banner"
            className="absolute left-1/2 pointer-events-none z-40"
            style={{
              top: '9%',
              transform: 'translate(-50%, -50%)',
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <div
              className="px-4 py-2 rounded-xl flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
              style={{
                background: 'linear-gradient(145deg, rgba(16, 26, 35, 0.95), rgba(35, 36, 41, 0.95))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.06), 0 4px 20px rgba(0,0,0,0.6)',
                border: '1px solid rgba(34, 211, 238, 0.35)',
              }}
            >
              <span className="font-bold text-white" style={{ fontSize: 'clamp(13px, 2.2vw, 15px)' }}>
                {isCurrentPlayerWinner ? 'You win!' : `${shortAddr(firstWinnerAddr)} wins`}
              </span>
              <span className="font-semibold tabular-nums" style={{ color: '#22c55e', fontSize: 'clamp(12px, 2vw, 14px)' }}>
                +{formatChips(winnerAmount)}
              </span>
              {winnerHandName && (
                <span className="text-white/70 text-[11px] sm:text-xs uppercase tracking-wide">
                  {winnerHandName}
                </span>
              )}
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
        {/* Iterate over seat count only — iterating SEAT_ANCHORS (10) causes ghost chips via % wrap-around */}
        {Array.from({ length: state.seats.length }, (_, displaySlot) => {
          const anchor = seatAnchors[displaySlot];
          if (!anchor) return null;
          const actualIdx = mySeatIndex >= 0
            ? (mySeatIndex + displaySlot) % state.seats.length
            : displaySlot;
          const seat = state.seats[actualIdx];
          const hasBet = toBigIntSafe(seat.currentBet ?? 0) > 0n;
          if (!hasBet) return null;

          const frac = displaySlot === 0 ? 0.45 : 0.28;
          let cfx = anchor.fx + (POT_ANCHOR.fx - anchor.fx) * frac;
          let cfy = anchor.fy + (POT_ANCHOR.fy - anchor.fy) * frac;

          // Offset bottom player's chips to the right so they don't overlap cards
          if (displaySlot === 0) cfx += 0.10;

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
        const anchor = seatAnchors[displaySlot];
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
