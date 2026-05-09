'use client';

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { motion, AnimatePresence } from 'framer-motion';
import { PokerSeat, PokerChipStack } from './PokerSeat';
import { PokerBoard } from './PokerBoard';
import { CardDisplay } from './CardDisplay';
import type { PokerTableState as TableState } from '@/lib/websocket-client';
import { BackgroundBeams, type BeamColorPalette } from '@/components/ui/background-beams';
import { usePokerTableEffect } from '@/hooks/use-poker-table-effect';
import { bestHand, handRankToName, evaluateHoleCards } from '@/lib/poker-hand-eval';
import {
  authoredSeatAnchors,
  betChipAnchorForDisplaySlot,
  cardAnchorForDisplaySlot,
  dealerButtonAnchorForDisplaySlot,
  POKER_POT_ANCHOR,
  playerTagAnchorForDisplaySlot,
  ringIndexForDisplaySlot,
  winningPotChipAnchorForDisplaySlot,
} from '@/lib/poker-seat-layout';
import confetti from 'canvas-confetti';
import { FloatingTableLogo } from './FloatingTableLogo';
import { PokerRailActingHighlight } from './PokerRailActingHighlight';
import { DealerButton } from './DealerButton';
import {
  POKER_BETWEEN_HANDS_DELAY_MS,
} from '@/lib/poker-between-hands-delay';
import { POKER_UI_CQW } from '@/lib/poker-table-cqw';

const MORBIUS_DEFAULT_FELT_LOGO = '/morbius/MorbiusLogo-2.svg';

const BEAM_PALETTES: BeamColorPalette[] = [
  { primary: '#18CCFC', accent: '#6344F5', tail: '#AE48FF' }, // cyan → purple → magenta
  { primary: '#F59E0B', accent: '#DC2626', tail: '#9333EA' }, // gold → red → purple
  { primary: '#10B981', accent: '#06B6D4', tail: '#3B82F6' }, // emerald → cyan → blue
  { primary: '#F43F5E', accent: '#EC4899', tail: '#A855F7' }, // rose → pink → violet
  { primary: '#D4A82A', accent: '#B08820', tail: '#8A6010' }, // gold trim tones (matches table)
];

const POT_ANCHOR = POKER_POT_ANCHOR;
const SHOWDOWN_CARD_PULL_RATIO = 0.18;
const SHOWDOWN_CARD_PULL_MAX_PX = 70;

// Staged showdown reveal — community run-out can be stepped; hole cards flip
// together, then a short beat before the winner medallion.
const REVEAL_COMMUNITY_STEP_MS = 2000;  // gap between each community card during all-in runout
const REVEAL_BEFORE_HANDS_MS = 600;     // beat after final community card before all hole cards flip
const REVEAL_BEFORE_MEDALLION_MS = 700; // beat after hole cards before medallion appears

// Seat base geometry: `lib/poker-seat-layout.ts` (SEAT_ANCHOR_RING + authoredSeatAnchors).

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
  /**
   * When true, draws a faint marker at every display-slot dealer anchor (see `DEALER_BUTTON_RING`)
   * so you can tune `lib/poker-seat-layout.ts` without guessing. The real dealer disc still renders
   * only on the active dealer seat.
   */
  showDealerAnchorGuides?: boolean;
}

export function PokerTable({ state, currentPlayerAddress, timeLeft, chatBubbleBySeatIndex, onReUpClick, onMenuClick, reactionBySeatIndex, broadcastEmotionBySeatIndex, onPhraseReaction, onAnimationReaction, onOpponentClick, onOpponentRadialAction, quickChatPhrases, setQuickChatPhrases, onOpenEditQuickChat, onLeave, onRequestMobileActivity, onSitOut, onSitBack, tutorialTargets, dataTutorialTargetPot, showDealerAnchorGuides = false }: PokerTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 640, h: 500 });
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
  // Feature flag retained for the seat-radial-only layout experiment. Kept off
  // until the layout is reintroduced; refs at lines ~476/481/541 read it.
  const hideSeatAvatars = false;
  const seatAnchors = useMemo(() => authoredSeatAnchors(state.seats.length), [state.seats.length]);
  const toDisplaySlot = (seatIdx: number) => (mySeatIndex >= 0 ? (seatIdx - mySeatIndex + state.seats.length) % state.seats.length : seatIdx);

  const getRenderedSeatAnchor = (displaySlot: number, _serverPos: number) => {
    const anchor = seatAnchors[displaySlot];
    if (!anchor) return null;
    return { fx: anchor.fx, fy: anchor.fy };
  };

  const actingPosition = hand?.actingPosition ?? null;
  const actingDisplaySlot =
    actingPosition != null &&
    actingPosition >= 0 &&
    actingPosition < state.seats.length
      ? toDisplaySlot(actingPosition)
      : null;
  const actingRingIndex =
    actingDisplaySlot != null && state.seats.length > 0
      ? ringIndexForDisplaySlot(actingDisplaySlot, state.seats.length)
      : null;
  const showRailActingHighlight =
    !!hand &&
    hand.street !== 'showdown' &&
    actingPosition != null &&
    actingRingIndex != null;
  const isShowdownWithWinners = hand?.street === 'showdown' && hand?.winners?.length;
  const winnerPotChipTargets = useMemo(() => {
    if (!isShowdownWithWinners || !hand?.winners?.length) return [] as { key: string; amount: string; fx: number; fy: number }[];
    const targets: { key: string; amount: string; fx: number; fy: number }[] = [];
    for (const w of hand.winners) {
      let amountStr = w.amount ?? '0';
      let amountBi = toBigIntSafe(amountStr);
      if (amountBi <= 0n && hand.winners.length === 1 && hand.pot) {
        amountBi = toBigIntSafe(hand.pot);
        amountStr = hand.pot;
      }
      if (amountBi <= 0n) continue;
      const seatIdx = state.seats.findIndex(
        (s) => (s.playerAddress ?? '').toLowerCase() === w.address.toLowerCase(),
      );
      if (seatIdx < 0) continue;
      const displaySlot =
        mySeatIndex >= 0
          ? (seatIdx - mySeatIndex + state.seats.length) % state.seats.length
          : seatIdx;
      const { fx, fy } = winningPotChipAnchorForDisplaySlot(state.seats.length, displaySlot);
      targets.push({ key: w.address.toLowerCase(), amount: amountStr, fx, fy });
    }
    return targets;
  }, [isShowdownWithWinners, hand, mySeatIndex, state.seats]);
  const firstWinner = isShowdownWithWinners ? hand!.winners![0] : null;
  const firstWinnerAddr = firstWinner?.address ?? null;
  const isCurrentPlayerWinner = firstWinnerAddr && currentPlayerAddress && firstWinnerAddr === currentPlayerAddress.toLowerCase();
  // Combined winning card indices across all winners (split pots): every card
  // that contributed to *any* winning hand should highlight bright.
  const winningCardIndices = useMemo(() => {
    if (!isShowdownWithWinners) return [] as number[];
    const set = new Set<number>();
    for (const w of hand!.winners ?? []) {
      for (const c of w.winningCardIndices ?? []) set.add(c);
    }
    return Array.from(set);
  }, [isShowdownWithWinners, hand?.winners]);
  const winnerAddressSet = new Set((isShowdownWithWinners ? hand!.winners! : []).map((w) => w.address.toLowerCase()));

  // ── Staged showdown reveal ──────────────────────────────────────────────
  // The server can flip straight to `street === 'showdown'` with the full
  // board + every hand revealed (especially on all-in run-outs where chevtek
  // auto-resolves all remaining streets in a single tick). Replay it here as
  // a cinematic sequence: missing community cards → all hole cards at once
  // → winner medallion. On reconnect mid-showdown, jump to
  // the final state instead of replaying.
  const preShowdownCommunityCountRef = useRef(0);
  useEffect(() => {
    if (hand && hand.street !== 'showdown') {
      preShowdownCommunityCountRef.current = hand.communityCards?.length ?? 0;
    }
  }, [hand?.handId, hand?.street, hand?.communityCards?.length]);

  const totalCommunityCount = hand?.communityCards?.length ?? 0;
  /** Stable across object reference churn from WS — used only to re-run showdown scheduling when content changes. */
  const showdownRevealScheduleKey = useMemo(() => {
    if (!hand?.showdownHands) return '';
    return Object.keys(hand.showdownHands)
      .map((a) => a.toLowerCase())
      .sort()
      .join('|');
  }, [hand?.showdownHands]);
  const winnersRevealScheduleKey = useMemo(() => {
    if (!hand?.winners?.length) return '';
    return hand.winners
      .map((w) => w.address.toLowerCase())
      .sort()
      .join('|');
  }, [hand?.winners]);

  const [revealedCommunityCount, setRevealedCommunityCount] = useState(0);
  const [revealedHandAddrs, setRevealedHandAddrs] = useState<Set<string>>(new Set());
  const [medallionReady, setMedallionReady] = useState(false);
  const revealHandIdRef = useRef<string | null>(null);
  /** Dedupes effect re-runs for the same hand when only object references changed (avoids clearing timeouts then bailing). */
  const revealScheduleSigRef = useRef<string | null>(null);
  /** Read inside timeouts so Strict Mode / dedupe rescue never reads a stale medallion flag. */
  const medallionReadyRef = useRef(false);
  medallionReadyRef.current = medallionReady;

  useEffect(() => {
    if (!isShowdownWithWinners || !hand?.handId) {
      // Reset whenever we leave the showdown state (new hand, etc).
      if (revealHandIdRef.current !== null) {
        revealHandIdRef.current = null;
        revealScheduleSigRef.current = null;
        setRevealedCommunityCount(0);
        setRevealedHandAddrs(new Set());
        setMedallionReady(false);
      }
      return;
    }

    const scheduleSig = `${hand.handId}\u0001${showdownRevealScheduleKey}\u0001${winnersRevealScheduleKey}\u0001${totalCommunityCount}`;

    // Same signature as the last scheduled run.
    if (revealScheduleSigRef.current === scheduleSig) {
      if (medallionReadyRef.current) return;
      // React Strict Mode (or a churned effect) can clear timeouts then re-enter with the
      // same sig before Stage 3 fires — recover instead of leaving the table stuck with no dim.
      if (!showdownRevealScheduleKey) {
        setRevealedCommunityCount(totalCommunityCount);
        setRevealedHandAddrs(new Set());
        setMedallionReady(true);
        return;
      }
      // Real showdown: allow a full reschedule (do not skip hole-card beats).
      revealScheduleSigRef.current = null;
    }

    if (revealScheduleSigRef.current === scheduleSig) return;
    revealScheduleSigRef.current = scheduleSig;

    const isFirstObservation = revealHandIdRef.current === null;
    revealHandIdRef.current = hand.handId;

    const showdownKeys = hand.showdownHands ? Object.keys(hand.showdownHands) : [];
    const showdownAddrsAll = [...showdownKeys].sort((a, b) => {
      const ia = state.seats.findIndex((s) => s.playerAddress?.toLowerCase() === a.toLowerCase());
      const ib = state.seats.findIndex((s) => s.playerAddress?.toLowerCase() === b.toLowerCase());
      if (ia >= 0 && ib >= 0 && ia !== ib) return ia - ib;
      if (ia >= 0 && ib < 0) return -1;
      if (ia < 0 && ib >= 0) return 1;
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    const skipHoleReveal = showdownAddrsAll.length === 0;
    // Reconnect heuristic: if this is the very first hand we're seeing and it
    // arrives already in showdown, we likely joined mid-resolve — jump to end.
    const isReconnect = isFirstObservation && preShowdownCommunityCountRef.current === 0;
    if (isReconnect) {
      setRevealedCommunityCount(totalCommunityCount);
      setRevealedHandAddrs(new Set(showdownAddrsAll.map((a) => a.toLowerCase())));
      setMedallionReady(true);
      return;
    }

    const startCommunity = Math.min(preShowdownCommunityCountRef.current, totalCommunityCount);

    // Fold-out (or any end state with winners but no public hole cards): no card-flip step.
    // When the board is already fully dealt, jump straight to winner dim / highlight.
    if (skipHoleReveal && startCommunity >= totalCommunityCount) {
      setRevealedCommunityCount(totalCommunityCount);
      setRevealedHandAddrs(new Set());
      setMedallionReady(true);
      return;
    }

    setRevealedCommunityCount(startCommunity);
    setRevealedHandAddrs(new Set());
    setMedallionReady(false);

    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let cursor = 0;
    const allShowdownLower = showdownAddrsAll.map((a) => a.toLowerCase());

    if (skipHoleReveal) {
      // Fold-out / no hole cards to show: run out the board, then winner visuals.
      for (let n = startCommunity + 1; n <= totalCommunityCount; n += 1) {
        cursor += REVEAL_COMMUNITY_STEP_MS;
        const target = n;
        timeouts.push(setTimeout(() => setRevealedCommunityCount(target), cursor));
      }
      cursor += REVEAL_BEFORE_MEDALLION_MS;
      timeouts.push(setTimeout(() => setMedallionReady(true), cursor));
    } else {
      // All-in showdown: hole cards flip first, then board runs out, then winner.
      // Stage 1: reveal all hole cards immediately.
      cursor += REVEAL_BEFORE_HANDS_MS;
      timeouts.push(
        setTimeout(() => {
          setRevealedHandAddrs(new Set(allShowdownLower));
        }, cursor),
      );

      // Stage 2: deal remaining community cards one at a time.
      for (let n = startCommunity + 1; n <= totalCommunityCount; n += 1) {
        cursor += REVEAL_COMMUNITY_STEP_MS;
        const target = n;
        timeouts.push(setTimeout(() => setRevealedCommunityCount(target), cursor));
      }

      // Stage 3: brief beat, then mount the winner medallion.
      cursor += REVEAL_BEFORE_MEDALLION_MS;
      timeouts.push(setTimeout(() => setMedallionReady(true), cursor));
    }

    return () => {
      for (const t of timeouts) clearTimeout(t);
    };
  }, [
    isShowdownWithWinners,
    hand?.handId,
    totalCommunityCount,
    showdownRevealScheduleKey,
    winnersRevealScheduleKey,
  ]);

  // What the rest of the component should treat as "the medallion moment".
  const showFinalShowdownVisuals = !!isShowdownWithWinners && medallionReady;

  /** Server deadline for auto next hand (ISO). Omitted on older backends. */
  const serverNextHandMs = useMemo(() => {
    const iso = hand?.nextHandAt;
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
  }, [hand?.nextHandAt]);

  /**
   * If `nextHandAt` is missing, approximate the 15s window from medallion time so the
   * intermission UI still appears (matches common "only Time to act after next hand" report).
   */
  const [clientIntermissionEndMs, setClientIntermissionEndMs] = useState<number | null>(null);
  useEffect(() => {
    if (!isShowdownWithWinners || !hand?.handId) {
      setClientIntermissionEndMs(null);
      return;
    }
    if (hand.nextHandAt) {
      setClientIntermissionEndMs(null);
      return;
    }
    if (medallionReady) {
      setClientIntermissionEndMs((prev) => prev ?? Date.now() + POKER_BETWEEN_HANDS_DELAY_MS);
    }
  }, [isShowdownWithWinners, hand?.handId, hand?.nextHandAt, medallionReady]);

  const intermissionEndMs =
    isShowdownWithWinners && hand ? (serverNextHandMs ?? clientIntermissionEndMs) : null;
  // Don't render the inter-hand countdown until the medallion mounts — the
  // absolute deadline (`nextHandAt`) is still set immediately by the server,
  // so the bar simply appears partway through its progress once the runout
  // reveal finishes. This stops the timer from showing while the cards are
  // still flipping.
  const showBetweenHandsTimer = intermissionEndMs != null && medallionReady;

  useEffect(() => {
    if (!showFinalShowdownVisuals || !isCurrentPlayerWinner || !hand?.handId) return;
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
  }, [showFinalShowdownVisuals, isCurrentPlayerWinner, hand?.handId]);

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
        const from = idx === mySeatIndex
          ? getRenderedSeatAnchor(displaySlot, serverPos)
          : cardAnchorForDisplaySlot(state.seats.length, displaySlot);
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

  const floatingTableLogoSrc = useMemo(() => {
    // Active sponsorship: render the sponsored token's DexScreener logo.
    if (state.tableLogoSponsoredUntil && state.tableLogoTokenLogoUrl) {
      return state.tableLogoTokenLogoUrl;
    }
    // Idle: always default to the MORBIUS logo.
    return MORBIUS_DEFAULT_FELT_LOGO;
  }, [state.tableLogoSponsoredUntil, state.tableLogoTokenLogoUrl]);

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
    const isHandWinnerSeat = !!seat.playerAddress && showFinalShowdownVisuals && winnerAddressSet.has(seat.playerAddress.toLowerCase());
    // Winner pill: surface as soon as the server publishes street='showdown'
    // with winners — including fold-out wins where the cinematic medallion
    // reveal would otherwise gate the display behind the staged community
    // run-out. `winnerAddressSet` is already empty when not in a showdown
    // state, so this is implicitly gated on `isShowdownWithWinners`.
    const isShowdownWinnerSeat = !!seat.playerAddress && winnerAddressSet.has(seat.playerAddress.toLowerCase());
    // For splits each winner highlights its own winning cards.
    const seatWinnerEntry = seat.playerAddress
      ? hand?.winners?.find((w) => w.address.toLowerCase() === seat.playerAddress!.toLowerCase())
      : undefined;
    const seatWinningCardIndices = seatWinnerEntry?.winningCardIndices ?? [];
    // Gate showdown hole cards until the timed reveal step (all non-folded
    // showdown hands flip together).
    const seatAddrLower = seat.playerAddress?.toLowerCase();
    const isSeatRevealed = !!seatAddrLower && revealedHandAddrs.has(seatAddrLower);
    const showdownCardsForSeat =
      hand?.street === 'showdown' && !!seat.playerAddress && !seat.folded && isSeatRevealed
        ? hand?.showdownHands?.[seat.playerAddress]
        : undefined;
    const seatShowdownCards = !!showdownCardsForSeat?.length;
    const displaySlot = toDisplaySlot(idx);
    const serverPos = seat.position ?? idx;
    const anchorFrac = getRenderedSeatAnchor(displaySlot, serverPos);
    const playerTagAnchor = playerTagAnchorForDisplaySlot(state.seats.length, displaySlot);
    const playerTagOffset = anchorFrac
      ? {
          x: (playerTagAnchor.fx - anchorFrac.fx) * dims.w,
          y: (playerTagAnchor.fy - anchorFrac.fy) * dims.h,
        }
      : undefined;
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
          ? (state.myHoleCards ?? showdownCardsForSeat ?? undefined)
          : (showdownCardsForSeat ?? undefined),
      isCurrentPlayer: idx === mySeatIndex,
      showCardBacks: !!(inHand && idx !== mySeatIndex && !showdownCardsForSeat),
      winningCardIndices: isHandWinnerSeat ? seatWinningCardIndices : undefined,
      isHandWinner: isShowdownWinnerSeat,
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
      playerTagOffset,
      showdownCardOffset,
      handName:
        idx === mySeatIndex && selfHandName
          ? selfHandName
          : (isSeatRevealed && seat.playerAddress && showdownHandNames[seat.playerAddress]) || undefined,
      cardDealFromOffset: anchorFrac
        ? { dx: (POT_ANCHOR.fx - anchorFrac.fx) * dims.w, dy: (POT_ANCHOR.fy - anchorFrac.fy) * dims.h }
        : undefined,
      cardBackSrc: floatingTableLogoSrc,
    };
  };

  return (
    <div
      ref={tableRef}
      data-testid="poker-table-root"
      className="absolute inset-0"
      style={{ overflow: 'visible', containerType: 'inline-size' }}
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
                {/* Floating table logo — paid sponsorship or default Morbius */}
                {floatingTableLogoSrc && (
                  <FloatingTableLogo
                    src={floatingTableLogoSrc}
                    opacity={state.tableLogoOpacity ?? 0.12}
                  />
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

      <PokerRailActingHighlight
        visible={showRailActingHighlight}
        activeRingIndex={actingRingIndex}
      />

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

      {/* Community board — center of felt. At showdown, lift above the dim
          wash so winning cards (which carry their own brightness boost) and
          dimmed non-winning cards are stacked above the overlay. */}
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{
          left: '20%',
          top: '41%',
          width: '60%',
          minHeight: '22%',
          zIndex: showFinalShowdownVisuals ? 29 : 25,
        }}
        {...(tutorialTargets ? { 'data-tutorial-target': 'community-cards' } : {})}
      >
        {hand ? (
          <>
            <PokerBoard
              communityCards={
                isShowdownWithWinners
                  ? hand.communityCards.slice(0, revealedCommunityCount)
                  : hand.communityCards
              }
              pot={hand.pot}
              winningCardIndices={showFinalShowdownVisuals ? winningCardIndices : []}
              dimNonWinning={showFinalShowdownVisuals}
              suppressCommunityEntryMotion={!!isShowdownWithWinners}
              dataTutorialTargetPot={dataTutorialTargetPot}
              betweenHandsNextHandAtIso={
                showBetweenHandsTimer && intermissionEndMs != null
                  ? new Date(intermissionEndMs).toISOString()
                  : null
              }
            />
          </>
        ) : (
          <span
            className="text-xl font-bold tracking-[0.25em] uppercase select-none"
            style={{ color: 'rgba(255,255,255,0.07)' }}
          >
            Morbius
          </span>
        )}
      </div>

      {/* Showdown spotlight — dim wash that the winning seat(s) and the
          winning community + hole cards punch through via higher z-index. */}
      <AnimatePresence>
        {showFinalShowdownVisuals && (
          <motion.div
            key="showdown-dim"
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 28, background: 'rgba(0,0,0,0.55)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Chips sliding from pot to winner at showdown */}
      <AnimatePresence>
        {showFinalShowdownVisuals &&
          winnerPotChipTargets.map((t, i) => (
            <motion.div
              key={`chips-to-winner-${hand!.handId}-${t.key}`}
              className="absolute z-[35] pointer-events-none"
              style={{ transform: 'translate(-50%, -50%)' }}
              initial={{
                left: `${POT_ANCHOR.fx * 100}%`,
                top: `${POT_ANCHOR.fy * 100}%`,
              }}
              animate={{
                left: `${t.fx * 100}%`,
                top: `${t.fy * 100}%`,
              }}
              exit={{ opacity: 0 }}
              transition={{
                type: 'spring',
                stiffness: 80,
                damping: 18,
                delay: 0.4 + i * 0.09,
              }}
            >
              <PokerChipStack weiAmount={t.amount} />
            </motion.div>
          ))}
      </AnimatePresence>

      {/* Chip stacks — between each seat and pot (hidden at showdown so only sliding pot shows) */}
      {!isShowdownWithWinners && (
      <AnimatePresence>
        {/* Iterate over seat count only — do not iterate a fixed 10; empty seats would still get chip % positions */}
        {Array.from({ length: state.seats.length }, (_, displaySlot) => {
          const actualIdx = mySeatIndex >= 0
            ? (mySeatIndex + displaySlot) % state.seats.length
            : displaySlot;
          const seat = state.seats[actualIdx];
          const hasBet = toBigIntSafe(seat.currentBet ?? 0) > 0n;
          if (!hasBet) return null;

          const { fx: cfx, fy: cfy } = betChipAnchorForDisplaySlot(state.seats.length, displaySlot);

          return (
            <motion.div
              key={`chips-${actualIdx}`}
              className="absolute pointer-events-none"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              style={{
                left: `${cfx * 100}%`,
                top: `${cfy * 100}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 27,
              }}
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
                    : <CardDisplay cardIndex={null} small faceDown={!flyout.holeCards?.length || flyout.showBacks} cardBackSrc={floatingTableLogoSrc} />}
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Opponent hole cards — positioned by `CARD_ANCHOR_RING` so they can be moved independently of seats. */}
      {state.seats.map((seat, idx) => {
        if (idx === mySeatIndex) return null;
        if (!seat.playerAddress || seat.folded) return null;
        const inHand = !!hand;
        const seatLower = seat.playerAddress.toLowerCase();
        const seatRevealed = revealedHandAddrs.has(seatLower);
        const showdownCards =
          seatRevealed ? hand?.showdownHands?.[seat.playerAddress] ?? null : null;
        const showBacks = inHand && !showdownCards;
        if (!showBacks && !showdownCards?.length) return null;
        const displaySlot = toDisplaySlot(idx);
        const { fx, fy } = cardAnchorForDisplaySlot(state.seats.length, displaySlot);
        const faceDown = !showdownCards?.length;
        const dealFromOffset = {
          dx: (POT_ANCHOR.fx - fx) * dims.w,
          dy: (POT_ANCHOR.fy - fy) * dims.h,
        };
        const seatLowerForZ = seat.playerAddress.toLowerCase();
        const isWinnerHoleCards =
          showFinalShowdownVisuals && winnerAddressSet.has(seatLowerForZ);
        return (
          <div
            key={`cards-${idx}`}
            data-testid={`poker-seat-cards-${idx}`}
            className="absolute pointer-events-none"
            style={{
              left: `${fx * 100}%`,
              top: `${fy * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: POKER_UI_CQW.flyoutRowW,
              height: POKER_UI_CQW.flyoutRowH,
              zIndex: isWinnerHoleCards ? 30 : 10,
            }}
          >
            {[0, 1].map((ci) => (
              <div
                key={ci}
                className="absolute"
                style={{
                  bottom: 0,
                  left: ci === 0 ? 0 : POKER_UI_CQW.flyoutCardLeft,
                  width: POKER_UI_CQW.flyoutCardW,
                  height: POKER_UI_CQW.flyoutCardH,
                  transform: `rotate(${ci === 0 ? -12 : 12}deg)`,
                  transformOrigin: 'bottom center',
                  borderRadius: 8,
                  zIndex: ci,
                }}
              >
                {faceDown
                  ? <CardDisplay cardIndex={null} small faceDown variant="hole" dealDelay={ci * 0.12} dealFromOffset={dealFromOffset} cardBackSrc={floatingTableLogoSrc} />
                  : (
                      <CardDisplay
                        cardIndex={showdownCards![ci] ?? null}
                        variant="hole"
                        dealDelay={ci * 0.12}
                        dealFromOffset={dealFromOffset}
                        suppressEntryMotion
                      />
                    )}
              </div>
            ))}
          </div>
        );
      })}

      {/* Optional: one faint marker per display-slot dealer anchor (layout tuning). */}
      {showDealerAnchorGuides &&
        Array.from({ length: state.seats.length }, (_, displaySlot) => {
          const { fx, fy } = dealerButtonAnchorForDisplaySlot(state.seats.length, displaySlot);
          return (
            <div
              key={`dealer-anchor-guide-${displaySlot}`}
              className="absolute pointer-events-none z-[31]"
              style={{
                left: `${fx * 100}%`,
                top: `${fy * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
              aria-hidden
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 9999,
                  border: '1px dashed rgba(212, 175, 55, 0.55)',
                  background: 'rgba(25, 22, 14, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  fontWeight: 800,
                  color: 'rgba(251, 191, 136, 0.85)',
                  letterSpacing: '-0.02em',
                }}
              >
                d{displaySlot}
              </div>
            </div>
          );
        })}

      {/* Dealer button — single physical disc on the active dealer seat (real poker). */}
      {(() => {
        const dealerIdx = state.seats.findIndex((s) => s.isDealer);
        if (dealerIdx < 0) return null;
        const displaySlot =
          mySeatIndex >= 0
            ? (dealerIdx - mySeatIndex + state.seats.length) % state.seats.length
            : dealerIdx;
        const { fx, fy } = dealerButtonAnchorForDisplaySlot(state.seats.length, displaySlot);
        return <DealerButton fx={fx} fy={fy} />;
      })()}

      {/* Seats */}
      {state.seats.map((_, idx) => {
        const displaySlot = mySeatIndex >= 0
          ? (idx - mySeatIndex + state.seats.length) % state.seats.length
          : idx;
        const serverPos = state.seats[idx]?.position ?? idx;
        const rendered = getRenderedSeatAnchor(displaySlot, serverPos);
        if (!rendered) return null;
        const seat = state.seats[idx];
        const isWinnerSeatPunchThrough =
          showFinalShowdownVisuals &&
          !!seat?.playerAddress &&
          winnerAddressSet.has(seat.playerAddress.toLowerCase());
        return (
          <div
            key={idx}
            className="absolute"
            data-seat-slot={displaySlot}
            data-seat-position={serverPos}
            style={{
              left: `${rendered.fx * 100}%`,
              top:  `${rendered.fy * 100}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: isWinnerSeatPunchThrough ? 30 : 20,
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
