'use client';

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { formatChips } from '@/lib/format-poker-chips';
import { motion, AnimatePresence } from 'framer-motion';
import { PokerSeat, PokerChipStack } from './PokerSeat';
import { PokerBoard } from './PokerBoard';
import { CardDisplay } from './CardDisplay';
import type { PokerTableState as TableState } from '@/lib/websocket-client';
import { BackgroundBeams, type BeamColorPalette } from '@/components/ui/background-beams';
import { usePokerTableEffect } from '@/hooks/use-poker-table-effect';
import { PokerWinnerNotificationCard } from './PokerWinnerNotificationCard';
import { bestHand, handRankToName, evaluateHoleCards } from '@/lib/poker-hand-eval';
import confetti from 'canvas-confetti';

const BEAM_PALETTES: BeamColorPalette[] = [
  { primary: '#18CCFC', accent: '#6344F5', tail: '#AE48FF' }, // cyan → purple → magenta
  { primary: '#F59E0B', accent: '#DC2626', tail: '#9333EA' }, // gold → red → purple
  { primary: '#10B981', accent: '#06B6D4', tail: '#3B82F6' }, // emerald → cyan → blue
  { primary: '#F43F5E', accent: '#EC4899', tail: '#A855F7' }, // rose → pink → violet
  { primary: '#D4A82A', accent: '#B08820', tail: '#8A6010' }, // gold trim tones (matches table)
];

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const POT_ANCHOR = { fx: 0.50, fy: 0.51 };
const ADJACENT_SEAT_VERTICAL_NUDGE_PX = 30;
const SECOND_ADJACENT_SEAT_VERTICAL_NUDGE_PX = 30;
const HERO_SEAT_VERTICAL_NUDGE_PX = 38;
const TOP_ADJACENT_SEAT_HORIZONTAL_NUDGE_PX = 40;
const TOP_ADJACENT_SEAT_VERTICAL_NUDGE_PX = -30;
const TOP_CENTER_SEAT_VERTICAL_NUDGE_PX = -10;
const RIGHT_ADJACENT_SEAT_HORIZONTAL_NUDGE_PX = -30;
const LEFT_ADJACENT_SEAT_HORIZONTAL_NUDGE_PX = 30;
// Per-server-position pixel nudges (applied on top of the ellipse + display-slot nudges).
// Key = state.seats[idx].position value.
const SEAT_POSITION_NUDGE_PX: Record<number, { x: number; y: number }> = {
  1: { x: 30, y: 10 },
  2: { x: 0, y: 60 },
  4: { x: 30, y: 0 },
  3: { x: 0, y: -30 },
  6: { x: -30, y: 0 },
  7: { x: 0, y: -30 },
  8: { x: 0, y: 60 },
  9: { x: -30, y: 10 },
};

// Per-server-position pixel nudges for chip stacks (applied on top of the computed chip position).
const CHIP_POSITION_NUDGE_PX: Record<number, { x: number; y: number }> = {
  0: { x: 0, y: -60 },
  1: { x: 0, y: -60 },
  2: { x: 90, y: 0 },
  3: { x: 90, y: 0 },
  4: { x: 0, y: 60 },
  5: { x: 0, y: 60 },
  6: { x: 0, y: 60 },
  7: { x: -90, y: 0 },
  8: { x: -90, y: 0 },
  9: { x: 0, y: -60 },
};

const SHOWDOWN_CARD_PULL_RATIO = 0.18;
const SHOWDOWN_CARD_PULL_MAX_PX = 70;
const BET_CHIP_INWARD_DISTANCE_PX = 64;

// Compute evenly-spaced seat positions around the table oval for any seat count.
// Seat 0 is always bottom-center (current player); action then moves to the left,
// which matches standard clockwise Hold'em flow from the hero seat.
// When `mobileNudge` is true, seat 0 (bottom-center) is pushed down so it
// sits just above the betting controls on narrow viewports.
//
// LANDSCAPE NOTE: `aspectRatio` (container w/h) adjusts the ellipse so seats
// spread wider horizontally and tighter vertically in landscape. Do NOT
// hard-code rx/ry — they must stay aspect-responsive or landscape breaks.
function computeSeatAnchors(n: number, mobileNudge = false, aspectRatio = 1.28): Array<{ fx: number; fy: number }> {
  const cx = 0.50, cy = 0.46;
  const baseRx = 0.46, baseRy = 0.40;
  const arFactor = Math.min(1.15, Math.max(0.85, aspectRatio / 1.28));
  const rx = Math.min(0.48, baseRx * arFactor);
  const ry = Math.max(0.28, baseRy / arFactor);
  return Array.from({ length: n }, (_, i) => {
    const theta = Math.PI / 2 + (i / n) * 2 * Math.PI;
    let fy = parseFloat((cy + ry * Math.sin(theta)).toFixed(4));
    if (i === 0 && mobileNudge) fy = Math.min(0.92, fy + 0.10);
    return {
      fx: parseFloat((cx + rx * Math.cos(theta)).toFixed(4)),
      fy,
    };
  });
}

export interface PokerTableProps {
  state: TableState;
  currentPlayerAddress: string | null;
  /** Leave table (e.g. opens confirm); wired from seat radial and header. */
  onLeave?: () => void;
  timeLeft?: number;
  /** Chat bubble text to show above each seat (key = seat index). Cleared after ~5s by parent. */
  chatBubbleBySeatIndex?: Record<number, string>;
  /** Called when current player clicks re-up (+). Opens deposit/re-up modal when provided. */
  onReUpClick?: () => void;
  /** Avatar creator / profile editor; opened from current player seat radial. */
  onMenuClick?: () => void;
  /** Per-seat QuickChat phrase to show above seat; key = seat index. */
  reactionBySeatIndex?: Record<number, string>;
  /** Per-seat avatar emotion broadcast to table (so all players see the same animation). */
  broadcastEmotionBySeatIndex?: Record<number, import('@/components/avatar').Emotion>;
  /** Called when current player selects a QuickChat phrase (broadcast to table). */
  onPhraseReaction?: (phrase: string) => void;
  /** Called when current player selects an avatar emotion (broadcast to table). */
  onAnimationReaction?: (emotion: import('@/components/avatar').Emotion) => void;
  /** Called when any player clicks an opponent's avatar. */
  onOpponentClick?: (address: string) => void;
  /** Right-click radial on opponent (profile / follow / gift). */
  onOpponentRadialAction?: (action: 'profile' | 'follow' | 'gift', address: string) => void;
  /** QuickChat phrase list (from useQuickChatPhrases). When provided with setQuickChatPhrases and onOpenEditQuickChat, Edit QuickChat can be opened from header Settings. */
  quickChatPhrases?: string[];
  setQuickChatPhrases?: (phrases: string[]) => void;
  /** Called when user wants to open Edit QuickChat (e.g. from seat picker or header Settings). */
  onOpenEditQuickChat?: () => void;
  /** Open Activity drawer on mobile (narrow viewport); parent bumps `PokerActivityFeed` serial. */
  onRequestMobileActivity?: () => void;
  /** Voluntarily sit out of future hands (player radial). */
  onSitOut?: () => void;
  /** Return from sitting out (player radial). */
  onSitBack?: () => void;
  /** Add `data-tutorial-target` on table, board, seats (for poker tutorial overlay). */
  tutorialTargets?: boolean;
  /** Wrap pot for tutorial spotlight (forwarded to `PokerBoard`). */
  dataTutorialTargetPot?: boolean;
}

export function PokerTable({ state, currentPlayerAddress, timeLeft, chatBubbleBySeatIndex, onReUpClick, onMenuClick, reactionBySeatIndex, broadcastEmotionBySeatIndex, onPhraseReaction, onAnimationReaction, onOpponentClick, onOpponentRadialAction, quickChatPhrases, setQuickChatPhrases, onOpenEditQuickChat, onLeave, onRequestMobileActivity, onSitOut, onSitBack, tutorialTargets, dataTutorialTargetPot }: PokerTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 640, h: 500 });
  const hideSeatAvatars = false;
  const { effect: tableEffect, feltGradient, railStyle } = usePokerTableEffect();

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
  const [stickySeatActions, setStickySeatActions] = useState<Record<number, { action: string; amount: string }>>({});
  const stickyActionKeyRef = useRef<string | null>(null);
  const lastKnownCardVisualRef = useRef<Record<number, { holeCards?: number[]; showBacks: boolean }>>({});
  const previousFoldedBySeatRef = useRef<Record<number, boolean>>({});
  const [foldFlyouts, setFoldFlyouts] = useState<Array<{ id: string; from: { fx: number; fy: number }; holeCards?: number[]; showBacks: boolean }>>([]);
  const foldFlyoutTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  // ── Beam color cycling: cross-fade two layers every 5 hands over 15s ─
  // Two permanent beam layers (A/B). `activeBeamLayer` toggles which is
  // visible; the CSS transition handles the 15s fade between them.
  const handCountRef = useRef(0);
  const lastBeamHandIdRef = useRef<string | null>(null);
  const [activeBeamLayer, setActiveBeamLayer] = useState<'A' | 'B'>('A');
  const [paletteA, setPaletteA] = useState<BeamColorPalette>(BEAM_PALETTES[0]);
  const [paletteB, setPaletteB] = useState<BeamColorPalette>(BEAM_PALETTES[1]);

  useEffect(() => {
    const hid = hand?.handId;
    if (!hid || hid === lastBeamHandIdRef.current) return;
    lastBeamHandIdRef.current = hid;
    handCountRef.current += 1;
    if (handCountRef.current % 5 === 0) {
      const nextIdx = (BEAM_PALETTES.indexOf(activeBeamLayer === 'A' ? paletteA : paletteB) + 1) % BEAM_PALETTES.length;
      // Load the next palette into the hidden layer, then swap visibility
      if (activeBeamLayer === 'A') {
        setPaletteB(BEAM_PALETTES[nextIdx]);
        setActiveBeamLayer('B');
      } else {
        setPaletteA(BEAM_PALETTES[nextIdx]);
        setActiveBeamLayer('A');
      }
    }
  }, [hand?.handId]);

  const lastConfettiHandRef = useRef<string | null>(null);

  const mySeatIndex = state.seats.findIndex(s => s.playerAddress === currentPlayerAddress);
  const seatNudgeScale = Math.max(0.62, Math.min(1, dims.w / 1200));
  const seatAnchors = computeSeatAnchors(state.seats.length, hideSeatAvatars, dims.w / Math.max(dims.h, 1));
  const toDisplaySlot = (seatIdx: number) => (mySeatIndex >= 0 ? (seatIdx - mySeatIndex + state.seats.length) % state.seats.length : seatIdx);

  const getSeatNudgePx = (displaySlot: number) => {
    const seatCount = state.seats.length;
    const isLeftAdjacentSeat = displaySlot === 1;
    const isRightAdjacentSeat = displaySlot === seatCount - 1;
    const isLeftSecondAdjacentSeat = displaySlot === 2;
    const isRightSecondAdjacentSeat = displaySlot === seatCount - 2;
    const topCenterSlot = Math.floor(seatCount / 2);
    const isTopCenterSeat = displaySlot === topCenterSlot;
    const isTopLeftAdjacentSeat = displaySlot === topCenterSlot - 1;
    const isTopRightAdjacentSeat = displaySlot === topCenterSlot + 1;
    const isHeroSeat = displaySlot === 0;

    const seatTranslateXBase = isRightAdjacentSeat
      ? RIGHT_ADJACENT_SEAT_HORIZONTAL_NUDGE_PX
      : isLeftAdjacentSeat
        ? LEFT_ADJACENT_SEAT_HORIZONTAL_NUDGE_PX
        : isTopLeftAdjacentSeat
          ? TOP_ADJACENT_SEAT_HORIZONTAL_NUDGE_PX
          : isTopRightAdjacentSeat
            ? -TOP_ADJACENT_SEAT_HORIZONTAL_NUDGE_PX
            : 0;

    const seatTranslateYBase = (isRightAdjacentSeat || isLeftAdjacentSeat)
      ? ADJACENT_SEAT_VERTICAL_NUDGE_PX
      : (isLeftSecondAdjacentSeat || isRightSecondAdjacentSeat)
        ? SECOND_ADJACENT_SEAT_VERTICAL_NUDGE_PX
        : isTopCenterSeat
          ? TOP_CENTER_SEAT_VERTICAL_NUDGE_PX
          : (isTopLeftAdjacentSeat || isTopRightAdjacentSeat)
            ? TOP_ADJACENT_SEAT_VERTICAL_NUDGE_PX
            : isHeroSeat
              ? HERO_SEAT_VERTICAL_NUDGE_PX
              : 0;

    return {
      x: Math.round(seatTranslateXBase * seatNudgeScale),
      y: Math.round(seatTranslateYBase * seatNudgeScale),
    };
  };

  /** Full on-screen seat center (fractions 0–1), including display-slot + per-server-position nudges. */
  const getRenderedSeatAnchor = (displaySlot: number, serverPos: number) => {
    const anchor = seatAnchors[displaySlot];
    if (!anchor) return null;
    const nudge = getSeatNudgePx(displaySlot);
    const posNudge = SEAT_POSITION_NUDGE_PX[serverPos] ?? { x: 0, y: 0 };
    return {
      fx: anchor.fx + (nudge.x + posNudge.x) / Math.max(dims.w, 1),
      fy: anchor.fy + (nudge.y + posNudge.y) / Math.max(dims.h, 1),
    };
  };

  const actingPosition = hand?.actingPosition ?? null;
  const isShowdownWithWinners = hand?.street === 'showdown' && hand?.winners?.length;
  const winnerSeatIndices = isShowdownWithWinners
    ? (hand!.winners!.map((w) => state.seats.findIndex((s) => s.playerAddress === w.address)).filter((i) => i >= 0) as number[])
    : [];
  const winnerDisplaySlots = winnerSeatIndices.map(
    (idx) => (mySeatIndex >= 0 ? (idx - mySeatIndex + state.seats.length) % state.seats.length : idx)
  );
  const firstWinnerAnchor =
    winnerSeatIndices.length > 0 && winnerDisplaySlots.length > 0
      ? getRenderedSeatAnchor(
          winnerDisplaySlots[0],
          state.seats[winnerSeatIndices[0]]?.position ?? winnerSeatIndices[0],
        )
      : null;
  const firstWinner = isShowdownWithWinners ? hand!.winners![0] : null;
  const firstWinnerAddr = firstWinner?.address ?? null;
  const isCurrentPlayerWinner = firstWinnerAddr && currentPlayerAddress && firstWinnerAddr === currentPlayerAddress.toLowerCase();
  const firstWinnerSeat = firstWinnerAddr ? state.seats.find((s) => s.playerAddress === firstWinnerAddr) : null;
  const winnerAmount = firstWinner?.amount ?? hand?.pot ?? '0';
  const winnerHandName = firstWinner?.handName;
  const winningCardIndices = firstWinner?.winningCardIndices ?? [];
  const firstWinnerAddrLower = firstWinnerAddr?.toLowerCase() ?? null;
  const winnerHoleCards = firstWinnerAddrLower ? hand?.showdownHands?.[firstWinnerAddrLower] ?? [] : [];
  const splitWinner = isShowdownWithWinners
    ? hand!.winners!.find((w) => w.address.toLowerCase() !== firstWinnerAddrLower)
    : undefined;
  const splitSeat = splitWinner ? state.seats.find((s) => s.playerAddress === splitWinner.address) : null;
  const winnerAddressSet = new Set((isShowdownWithWinners ? hand!.winners! : []).map((w) => w.address.toLowerCase()));
  // Showdown chip destination: land above winner cards (not avatar center).
  const winnerChipYOffsetPx = hideSeatAvatars ? 62 : 86;

  useEffect(() => {
    if (!isCurrentPlayerWinner || !hand?.handId) return;
    if (lastConfettiHandRef.current === hand.handId) return;
    lastConfettiHandRef.current = hand.handId;
    const gold = ['#FFD700', '#FFC107', '#F5D060', '#FFFFFF', '#FFF8DC'];
    const shoot = () => {
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.65 }, colors: gold, startVelocity: 35, zIndex: 200 });
      confetti({ particleCount: 40, spread: 100, origin: { y: 0.7 }, colors: gold, startVelocity: 25, zIndex: 200 });
    };
    shoot();
    const t = setTimeout(shoot, 350);
    return () => clearTimeout(t);
  }, [isCurrentPlayerWinner, hand?.handId]);

  useEffect(() => {
    setStickySeatActions(hand?.streetActions ? { ...hand.streetActions } : {});
    stickyActionKeyRef.current = null;
    setFoldFlyouts([]);
    previousFoldedBySeatRef.current = {};
    lastKnownCardVisualRef.current = {};
    for (const t of foldFlyoutTimeoutsRef.current) clearTimeout(t);
    foldFlyoutTimeoutsRef.current = [];
  }, [hand?.handId]);

  useEffect(() => {
    const lastAction = hand?.lastAction;
    if (!hand || !lastAction || lastAction.action === 'blind') return;
    const key = `${hand.handId}:${hand.street}:${lastAction.position}:${lastAction.action}:${lastAction.amount}`;
    if (key === stickyActionKeyRef.current) return;
    stickyActionKeyRef.current = key;
    setStickySeatActions((prev) => ({
      ...prev,
      [lastAction.position]: { action: lastAction.action, amount: lastAction.amount },
    }));
  }, [hand?.handId, hand?.street, hand?.lastAction]);

  useEffect(() => {
    for (let idx = 0; idx < state.seats.length; idx += 1) {
      const seat = state.seats[idx];
      if (!seat.playerAddress || !hand) continue;
      const showdownCards = hand.showdownHands?.[seat.playerAddress];
      const possibleHoleCards =
        mySeatIndex === idx
          ? (state.myHoleCards ?? showdownCards ?? undefined)
          : (showdownCards ?? undefined);
      const showBacks = !!(idx !== mySeatIndex && !showdownCards);
      if ((possibleHoleCards && possibleHoleCards.length > 0) || showBacks) {
        lastKnownCardVisualRef.current[idx] = { holeCards: possibleHoleCards, showBacks };
      }
    }
  }, [state.seats, state.myHoleCards, hand, mySeatIndex]);

  useEffect(() => {
    if (!hand) return;
    const nextFolded: Record<number, boolean> = {};
    state.seats.forEach((seat, idx) => {
      const nowFolded = !!seat.playerAddress && !!seat.folded;
      const wasFolded = previousFoldedBySeatRef.current[idx] ?? nowFolded;
      if (nowFolded && !wasFolded) {
        const displaySlot = toDisplaySlot(idx);
        const serverPos = state.seats[idx]?.position ?? idx;
        const from = getRenderedSeatAnchor(displaySlot, serverPos);
        const visual = lastKnownCardVisualRef.current[idx] ?? { showBacks: true };
        if (from) {
          const id = `${hand.handId}-fold-${idx}-${Date.now()}`;
          setFoldFlyouts((prev) => [...prev, { id, from, holeCards: visual.holeCards, showBacks: visual.showBacks }]);
          const timeout = setTimeout(() => {
            setFoldFlyouts((prev) => prev.filter((item) => item.id !== id));
          }, 700);
          foldFlyoutTimeoutsRef.current.push(timeout);
        }
      }
      nextFolded[idx] = nowFolded;
    });
    previousFoldedBySeatRef.current = nextFolded;
  }, [state.seats, hand, seatAnchors, mySeatIndex]);

  useEffect(() => () => {
    for (const t of foldFlyoutTimeoutsRef.current) clearTimeout(t);
  }, []);

  const selfHandName = useMemo(() => {
    if (!state.myHoleCards || state.myHoleCards.length < 2) return null;
    const community = hand?.communityCards ?? [];
    const allCards = [...state.myHoleCards, ...community];
    if (allCards.length >= 5) {
      return handRankToName(bestHand(allCards).rank);
    }
    return evaluateHoleCards(state.myHoleCards);
  }, [state.myHoleCards, hand?.communityCards]);

  const showdownHandNames = useMemo(() => {
    if (hand?.street !== 'showdown' || !hand.showdownHands) return {};
    const community = hand.communityCards ?? [];
    const names: Record<string, string> = {};
    for (const [addr, holeCards] of Object.entries(hand.showdownHands)) {
      const winner = hand.winners?.find(w => w.address === addr);
      if (winner?.handName) { names[addr] = winner.handName; continue; }
      const allCards = [...holeCards, ...community];
      if (allCards.length >= 5) {
        names[addr] = handRankToName(bestHand(allCards).rank);
      }
    }
    return names;
  }, [hand?.street, hand?.showdownHands, hand?.communityCards, hand?.winners]);

  const seatProps = (idx: number) => {
    const seat = state.seats[idx];
    const inHand = !!hand && seat.playerAddress && !seat.folded;
    const isWinnerSeat = !!firstWinnerAddr && seat.playerAddress === firstWinnerAddr;
    const isHandWinnerSeat = !!seat.playerAddress && isShowdownWithWinners && winnerAddressSet.has(seat.playerAddress.toLowerCase());
    const seatShowdownCards =
      hand?.street === 'showdown' &&
      !!seat.playerAddress &&
      !seat.folded &&
      !!hand?.showdownHands?.[seat.playerAddress]?.length;
    const displaySlot = toDisplaySlot(idx);
    const serverPos = seat.position ?? idx;
    const anchorFrac = getRenderedSeatAnchor(displaySlot, serverPos);
    let showdownCardOffset: { x: number; y: number } | undefined;
    if (seatShowdownCards && anchorFrac) {
      const deltaX = (POT_ANCHOR.fx - anchorFrac.fx) * dims.w;
      const deltaY = (POT_ANCHOR.fy - anchorFrac.fy) * dims.h;
      const targetX = deltaX * SHOWDOWN_CARD_PULL_RATIO;
      const targetY = deltaY * SHOWDOWN_CARD_PULL_RATIO;
      const magnitude = Math.hypot(targetX, targetY);
      if (magnitude > 0.001) {
        const cap = Math.min(1, SHOWDOWN_CARD_PULL_MAX_PX / magnitude);
        showdownCardOffset = { x: targetX * cap, y: targetY * cap };
      } else {
        showdownCardOffset = { x: 0, y: 0 };
      }
    }

    return {
      seat,
      index: idx,
      holeCards:
        seat.folded
          ? undefined
          : mySeatIndex === idx
          ? (state.myHoleCards ?? hand?.showdownHands?.[seat.playerAddress!] ?? undefined)
          : (hand?.showdownHands?.[seat.playerAddress!] ?? undefined),
      isCurrentPlayer: idx === mySeatIndex,
      showCardBacks: !!(inHand && idx !== mySeatIndex && !hand?.showdownHands?.[seat.playerAddress!]),
      winningCardIndices: isWinnerSeat ? winningCardIndices : undefined,
      isHandWinner: isHandWinnerSeat,
      lastAction: stickySeatActions[idx] ?? null,
      callAmount: actingPosition === idx && hand?.toCall ? hand.toCall : null,
      timeLeft: actingPosition === idx ? timeLeft : undefined,
      chatBubble: chatBubbleBySeatIndex?.[idx] ?? null,
      onReUpClick,
      onMenuClick,
      overlayPhrase: reactionBySeatIndex?.[idx] ?? null,
      overlayEmotion: broadcastEmotionBySeatIndex?.[idx] ?? null,
      onPhraseReaction: onPhraseReaction,
      onAnimationReaction: onAnimationReaction,
      onOpponentClick: onOpponentClick,
      onOpponentRadialAction: onOpponentRadialAction,
      quickChatPhrases,
      setQuickChatPhrases,
      onOpenEditQuickChat,
      hideSeatAvatar: hideSeatAvatars,
      onLeaveTable: onLeave,
      onSitOut,
      onSitBack,
      onRequestMobileActivity,
      includeActivityInPlayerRadial: hideSeatAvatars,
      showdownCardOffset,
      handName:
        idx === mySeatIndex && selfHandName
          ? selfHandName
          : (seat.playerAddress && showdownHandNames[seat.playerAddress]) || undefined,
    };
  };

  return (
    <div
      ref={tableRef}
      data-testid="poker-table-root"
      className="absolute inset-0"
      style={{ overflow: 'visible' }}
      {...(tutorialTargets ? { 'data-tutorial-target': 'table' } : {})}
    >

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
        {/* Outer trim — 8px ring */}
        <div style={{
          flex: 1, borderRadius: '9999px', display: 'flex', padding: '8px',
          background: railStyle.outerRing,
          boxShadow: railStyle.outerGlow,
        }}>
          {/* Dark cushion — 20px ring */}
          <div style={{
            flex: 1, borderRadius: '9999px', display: 'flex', padding: '20px',
            background: railStyle.cushion,
            boxShadow: 'inset 0 4px 16px rgba(0,0,0,0.85), inset 0 -2px 8px rgba(0,0,0,0.6)',
          }}>
            {/* Inner trim — 6px ring */}
            <div style={{
              flex: 1, borderRadius: '9999px', display: 'flex', padding: '6px',
              background: railStyle.innerRing,
              boxShadow: railStyle.innerGlow,
            }}>
              {/* Felt surface — color from user preference */}
              <div style={{
                flex: 1, borderRadius: '9999px', position: 'relative', overflow: 'hidden',
                background: feltGradient,
                boxShadow: 'inset 0 8px 40px rgba(0,0,0,0.55), inset 0 -4px 20px rgba(0,0,0,0.4)',
                outline: '1px dashed rgba(255,255,255,0.08)',
                outlineOffset: '-10px',
              }}>
                {/* Animated effects — PC only (skip on mobile to save GPU) */}
                {!hideSeatAvatars && tableEffect === 'beams' && (
                  <>
                    <div
                      style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none',
                        opacity: activeBeamLayer === 'A' ? 0.12 : 0,
                        mixBlendMode: 'screen',
                        transition: 'opacity 15s ease',
                      }}
                    >
                      <BackgroundBeams palette={paletteA} />
                    </div>
                    <div
                      style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none',
                        opacity: activeBeamLayer === 'B' ? 0.12 : 0,
                        mixBlendMode: 'screen',
                        transition: 'opacity 15s ease',
                      }}
                    >
                      <BackgroundBeams palette={paletteB} />
                    </div>
                  </>
                )}
                {/* Marketing logo — admin-set, rendered centered on felt */}
                {state.tableLogo && (
                  <div
                    style={{
                      position: 'absolute', inset: 0, pointerEvents: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: state.tableLogoOpacity ?? 0.12,
                    }}
                  >
                    <img
                      src={`/Marketing /LOGOS/${state.tableLogo}`}
                      alt=""
                      draggable={false}
                      style={{
                        maxWidth: '38%',
                        maxHeight: '44%',
                        objectFit: 'contain',
                        filter: 'grayscale(0.15)',
                        userSelect: 'none',
                      }}
                    />
                  </div>
                )}
                {/* Felt sheen — sits above effects to preserve the 3D depth / shadow */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'radial-gradient(ellipse at 50% 18%, rgba(255,255,255,0.05) 0%, transparent 55%)',
                  pointerEvents: 'none',
                }} />
                {/* Felt inner shadow overlay — keeps the inset depth on top of effects */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  boxShadow: 'inset 0 8px 40px rgba(0,0,0,0.45), inset 0 -4px 20px rgba(0,0,0,0.35)',
                  borderRadius: '9999px',
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
        style={{ left: '20%', top: '41%', width: '60%', height: '22%', zIndex: 25 }}
        {...(tutorialTargets ? { 'data-tutorial-target': 'community-cards' } : {})}
      >
        {hand ? (
          <PokerBoard
            communityCards={hand.communityCards}
            pot={hand.pot}
            winningCardIndices={winningCardIndices}
            dataTutorialTargetPot={dataTutorialTargetPot}
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

      <PokerWinnerNotificationCard
        isOpen={process.env.NODE_ENV === 'development' || !!(isShowdownWithWinners && firstWinnerAddr && hand)}
        handId={hand?.handId ?? 'debug-hand'}
        winnerName={firstWinnerSeat?.displayName || (isCurrentPlayerWinner ? 'You' : shortAddr(firstWinnerAddr ?? '')) || 'DebugPlayer'}
        winnerAmount={winnerAmount || '1000000000000000000000'}
        winnerHandName={winnerHandName || 'Full House'}
        winnerAddress={firstWinnerAddr ?? undefined}
        winnerAvatarUrl={firstWinnerSeat?.profileImageUrl}
        winnerHoleCards={winnerHoleCards.length ? winnerHoleCards : [0, 1]}
        communityCards={hand?.communityCards?.length ? hand.communityCards : [2, 3, 4, 5, 6]}
        winningCardIndices={winningCardIndices.length ? winningCardIndices : [0, 1, 2]}
        splitLabel={splitWinner ? `Split: ${splitSeat?.displayName || shortAddr(splitWinner.address)}` : undefined}
        splitAmount={splitWinner ? `+${formatChips(splitWinner.amount)}` : undefined}
        formatChips={formatChips}
      />

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
              top: `calc(${firstWinnerAnchor.fy * 100}% - ${winnerChipYOffsetPx}px)`,
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

          const renderedSeatAnchor = getRenderedSeatAnchor(displaySlot, seat.position ?? actualIdx) ?? anchor;
          const seatPx = { x: renderedSeatAnchor.fx * dims.w, y: renderedSeatAnchor.fy * dims.h };
          const potPx = { x: POT_ANCHOR.fx * dims.w, y: POT_ANCHOR.fy * dims.h };
          const towardPot = { x: potPx.x - seatPx.x, y: potPx.y - seatPx.y };
          const towardPotLen = Math.hypot(towardPot.x, towardPot.y) || 1;
          const step = Math.min(BET_CHIP_INWARD_DISTANCE_PX, towardPotLen * 0.85);
          const chipNudge = CHIP_POSITION_NUDGE_PX[seat.position ?? actualIdx] ?? { x: 0, y: 0 };
          const chipPx = {
            x: seatPx.x + (towardPot.x / towardPotLen) * step + chipNudge.x,
            y: seatPx.y + (towardPot.y / towardPotLen) * step + chipNudge.y,
          };
          const cfx = chipPx.x / Math.max(dims.w, 1);
          const cfy = chipPx.y / Math.max(dims.h, 1);

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

      {/* Folded cards: fly from seat to center, then vanish */}
      <AnimatePresence>
        {foldFlyouts.map((flyout) => (
          <motion.div
            key={flyout.id}
            className="absolute z-40 pointer-events-none"
            style={{
              left: `${flyout.from.fx * 100}%`,
              top: `${flyout.from.fy * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
            initial={{ opacity: 1, scale: 1 }}
            animate={{
              left: `${POT_ANCHOR.fx * 100}%`,
              top: `${POT_ANCHOR.fy * 100}%`,
              opacity: 0,
              scale: 0.78,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeInOut' }}
          >
            <div
              className="relative"
              style={{
                width: flyout.holeCards?.length ? '74px' : '52px',
                height: flyout.holeCards?.length ? '92px' : '66px',
              }}
            >
              {[0, 1].map((ci) => (
                <div
                  key={`${flyout.id}-${ci}`}
                  className="absolute"
                  style={{
                    left: ci === 0 ? 0 : '18px',
                    bottom: 0,
                    transform: `rotate(${ci === 0 ? -12 : 12}deg)`,
                    transformOrigin: 'bottom center',
                    width: flyout.holeCards?.length ? '56px' : '40px',
                    height: flyout.holeCards?.length ? '74px' : '50px',
                  }}
                >
                  {flyout.holeCards?.length
                    ? <CardDisplay cardIndex={flyout.holeCards[ci] ?? null} />
                    : <CardDisplay cardIndex={null} small faceDown={!flyout.holeCards?.length || flyout.showBacks} />}
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Seats */}
      {state.seats.map((_, idx) => {
        const displaySlot = mySeatIndex >= 0
          ? (idx - mySeatIndex + state.seats.length) % state.seats.length
          : idx;
        const serverPos = state.seats[idx]?.position ?? idx;
        const rendered = getRenderedSeatAnchor(displaySlot, serverPos);
        if (!rendered) return null;
        return (
          <div
            key={idx}
            className="absolute z-20"
            data-seat-slot={displaySlot}
            data-seat-position={serverPos}
            style={{
              left: `${rendered.fx * 100}%`,
              top:  `${rendered.fy * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
            {...(tutorialTargets ? { 'data-tutorial-target': `seat-${displaySlot}` } : {})}
          >
            <PokerSeat {...seatProps(idx)} />
          </div>
        );
      })}

    </div>
  );
}
