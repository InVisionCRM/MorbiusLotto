'use client';

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { motion, AnimatePresence } from 'framer-motion';
import { PokerSeat, PokerChipStack } from './PokerSeat';
import { PokerBoard } from './PokerBoard';
import { ProvablyFairBadge } from './ProvablyFairBadge';
import { CardDisplay } from './CardDisplay';
import { ChipDisc } from '@/components/ui/BetChip';
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
import { POKER_DIRECTED_EMOTES, POKER_DIRECTED_EMOTE_FLY_MS, type PokerDirectedEmoteKind } from '@/lib/poker-directed-emotes';
import confetti from 'canvas-confetti';
import { FloatingTableLogo } from './FloatingTableLogo';
import { PokerRailActingHighlight } from './PokerRailActingHighlight';
import { DealerButton } from './DealerButton';
import { PokerShowMuckOverlay } from './PokerShowMuckOverlay';
import {
  POKER_BETWEEN_HANDS_DELAY_MS,
} from '@/lib/poker-between-hands-delay';
import { POKER_UI_CQW } from '@/lib/poker-table-cqw';
import { useIsMobileLandscape } from '@/hooks/use-is-mobile-landscape';

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

// Per-pot payout choreography (showdown). Tuned to give the player time
// to read the winning hand before any chips start moving, then pay each
// pot in sequence with a clear beat between them.
const SHOWDOWN_INITIAL_DELAY_MS = 600;
const CHIP_FLY_DURATION_MS = 700;
const POT_STAGGER_MS = 380;

// ── Showdown chip burst ─────────────────────────────────────────────────────
// Each pot erupts into a spray of individual chips that funnel to the winner
// and pile into a stack (no fade). Counts + jitter are derived deterministically
// (no Math.random) so renders stay stable / SSR-safe.
const BURST_DENOM_CYCLE = [10000, 500, 100, 2500, 50000, 25]; // black·green·red·blue·purple·white — a rich mixed pile

/** Stable pseudo-random in [0,1) from an integer seed. */
function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

interface BurstChip {
  key: string;
  denom: number;
  fromX: number; fromY: number;
  peakX: number; peakY: number;
  slotX: number; slotY: number;
  rot: number;
  delaySec: number;
}

/** Expand one pot→winner flight into N chips that erupt from the pot and stack at the winner. */
function buildPotBurst(
  flight: { key: string; amount: string; fx: number; fy: number; delaySec: number },
  potFx: number,
  potFy: number,
  dims: { w: number; h: number },
  chipW: number,
): BurstChip[] {
  let amtNum = 0;
  try {
    const b = toBigIntSafe(flight.amount);
    amtNum = b <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(b) : Number.MAX_SAFE_INTEGER;
  } catch { /* noop */ }
  // More chips for bigger pots, capped so a whale's pile stays a tidy stack.
  const n = Math.max(5, Math.min(9, Math.round(Math.log10(amtNum + 10) * 2.4)));
  const potX = potFx * dims.w;
  const potY = potFy * dims.h;
  const winX = flight.fx * dims.w;
  const winY = flight.fy * dims.h;
  const step = Math.max(3, chipW * 0.22);
  const seedBase = Array.from(flight.key).reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const out: BurstChip[] = [];
  for (let i = 0; i < n; i++) {
    const u1 = seededUnit(seedBase + i * 2 + 1);
    const u2 = seededUnit(seedBase + i * 2 + 2);
    out.push({
      key: `${flight.key}-${i}`,
      denom: BURST_DENOM_CYCLE[i % BURST_DENOM_CYCLE.length],
      fromX: potX,
      fromY: potY,
      peakX: potX + (u1 - 0.5) * chipW * 2.2,       // tight fountain (was a chaotic wide spray)
      peakY: potY - chipW * (1.0 + u2 * 1.1),       // pop upward
      slotX: winX,
      slotY: winY - i * step,                       // base sits on the anchor, builds straight up
      rot: (u1 - 0.5) * 220,                        // gentle in-flight tumble
      delaySec: flight.delaySec + i * 0.05,         // streamed in, one after another
    });
  }
  return out;
}

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
  /** In-flight directed emotes (player → player); each animates a bubble from sender's seat to the target. */
  directedEmotes?: Array<{ id: string; fromSeatIndex: number; toSeatIndex: number; kind: PokerDirectedEmoteKind }>;
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
  /**
   * Fold-out winner clicked "Show" — reveal hole cards to the table.
   * Only rendered when the current player is the uncalled winner.
   */
  onShowCards?: () => void;
  /** Fold-out winner clicked "Muck" — keep cards hidden. */
  onMuckCards?: () => void;
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

export function PokerTable({ state, currentPlayerAddress, timeLeft, chatBubbleBySeatIndex, onReUpClick, onMenuClick, reactionBySeatIndex, broadcastEmotionBySeatIndex, directedEmotes, onPhraseReaction, onAnimationReaction, onOpponentClick, onOpponentRadialAction, quickChatPhrases, setQuickChatPhrases, onOpenEditQuickChat, onLeave, onRequestMobileActivity, onSitOut, onSitBack, onShowCards, onMuckCards, tutorialTargets, dataTutorialTargetPot, showDealerAnchorGuides = false }: PokerTableProps) {
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

  // Bet-to-pot gather animation state. When the street advances, the
  // server clears every seat's `currentBet` in the same WS update that
  // sets the new street. We capture the *previous* render's bets in
  // `lastBetsRef` and use them to fly chip stacks from each seat into
  // the pot center for ~700ms — replacing the previous in-place vanish.
  type GatherEntry = { key: string; amount: string; fx: number; fy: number };
  const [gatheringBets, setGatheringBets] = useState<GatherEntry[]>([]);
  const lastBetsRef = useRef<Record<number, { amount: string; fx: number; fy: number }>>({});
  const lastStreetRef = useRef<{ handId?: string; street?: string }>({});

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
  // On mobile-landscape we skip the procedural AvatarView per seat — at the
  // ~34px seat tile size the rich SVG isn't readable and the render cost adds
  // up across 9 seats. The seat falls back to the letter-glyph treatment
  // (PokerSeat already supports this path via the same flag, originally added
  // for the seat-radial-only layout experiment). Full AvatarView still renders
  // in the opponent profile card and emote broadcasts.
  const isMobileLandscape = useIsMobileLandscape();
  const hideSeatAvatars = isMobileLandscape;
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

  // ── Per-pot payout choreography ────────────────────────────────────────
  // Each pot pays in sequence: main pot → side pot 1 → side pot 2 → ...
  // For each pot we (a) fly its chips from the pot center to its winners
  // and (b) drain the source pot's displayed amount to zero once chips
  // arrive — so the user can actually watch each pot empty into the seat
  // it belongs to instead of all chips appearing/disappearing at once.
  // Falls back to a single synthesized pot when the server didn't send
  // the structured breakdown (legacy backends).
  const showdownPots = useMemo<{ amount: string; winnerAddresses: string[] }[]>(() => {
    if (!isShowdownWithWinners) return [];
    if (hand?.pots && hand.pots.length > 0) {
      return hand.pots.map((p) => ({
        amount: p.amount,
        winnerAddresses: p.winnerAddresses ?? [],
      }));
    }
    return [
      {
        amount: hand?.pot ?? '0',
        winnerAddresses: (hand?.winners ?? []).map((w) => w.address.toLowerCase()),
      },
    ];
  }, [isShowdownWithWinners, hand?.pots, hand?.pot, hand?.winners]);

  const perPotChipFlights = useMemo(() => {
    if (!isShowdownWithWinners || showdownPots.length === 0) {
      return [] as { key: string; amount: string; fx: number; fy: number; delaySec: number }[];
    }
    const out: { key: string; amount: string; fx: number; fy: number; delaySec: number }[] = [];
    for (let pi = 0; pi < showdownPots.length; pi++) {
      const p = showdownPots[pi];
      const potAmount = toBigIntSafe(p.amount);
      if (potAmount <= 0n) continue;
      const addrs = p.winnerAddresses.filter((a) => !!a);
      if (addrs.length === 0) continue;
      // Even split with remainder distributed to leading shares — same
      // rule the server uses (`splitBigIntEqually`), kept inline so we
      // don't have to plumb chip-int math into the client.
      const n = BigInt(addrs.length);
      const per = potAmount / n;
      const remainder = potAmount - per * n;
      const baseDelaySec =
        (SHOWDOWN_INITIAL_DELAY_MS + pi * (CHIP_FLY_DURATION_MS + POT_STAGGER_MS)) / 1000;
      for (let wi = 0; wi < addrs.length; wi++) {
        const share = per + (BigInt(wi) < remainder ? 1n : 0n);
        const seatIdx = state.seats.findIndex(
          (s) => (s.playerAddress ?? '').toLowerCase() === addrs[wi],
        );
        if (seatIdx < 0) continue;
        const displaySlot =
          mySeatIndex >= 0
            ? (seatIdx - mySeatIndex + state.seats.length) % state.seats.length
            : seatIdx;
        const { fx, fy } = winningPotChipAnchorForDisplaySlot(state.seats.length, displaySlot);
        out.push({
          key: `pot${pi}-${addrs[wi]}`,
          amount: share.toString(),
          fx,
          fy,
          delaySec: baseDelaySec,
        });
      }
    }
    return out;
  }, [isShowdownWithWinners, showdownPots, state.seats, mySeatIndex]);

  // Chip diameter for the burst, scaled to the table (≈ the bet-chip size).
  const burstChipW = Math.max(24, Math.min(46, Math.round(dims.w * 0.028)));
  // Expand each pot→winner flight into its spray of individual chips.
  const perPotBurstChips = useMemo(
    () => perPotChipFlights.flatMap((t) => buildPotBurst(t, POT_ANCHOR.fx, POT_ANCHOR.fy, dims, burstChipW)),
    [perPotChipFlights, dims, burstChipW],
  );

  // Drain the source pots as chips arrive at the seats. Each pot reaches
  // zero one fly-duration after its launch delay.
  const [paidPotIndex, setPaidPotIndex] = useState(-1);
  useEffect(() => {
    if (!isShowdownWithWinners || !hand?.handId || showdownPots.length === 0) {
      setPaidPotIndex(-1);
      return;
    }
    setPaidPotIndex(-1);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < showdownPots.length; i++) {
      const arrivalMs =
        SHOWDOWN_INITIAL_DELAY_MS +
        i * (CHIP_FLY_DURATION_MS + POT_STAGGER_MS) +
        CHIP_FLY_DURATION_MS;
      timers.push(setTimeout(() => setPaidPotIndex(i), arrivalMs));
    }
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [isShowdownWithWinners, hand?.handId, showdownPots.length]);

  const displayedPots = useMemo(() => {
    if (!hand?.pots) return undefined;
    if (!isShowdownWithWinners) return hand.pots;
    return hand.pots.map((p, i) => (i <= paidPotIndex ? { ...p, amount: '0' } : p));
  }, [hand?.pots, isShowdownWithWinners, paidPotIndex]);

  const displayedPotScalar = useMemo(() => {
    if (!isShowdownWithWinners) return hand?.pot ?? '0';
    if (displayedPots && displayedPots.length > 0) {
      let total = 0n;
      for (const p of displayedPots) total += toBigIntSafe(p.amount);
      return total.toString();
    }
    // Legacy single-pot path: drop to zero as soon as the first (only) pot
    // has finished paying out so the scalar pot UI also drains visually.
    if (paidPotIndex >= 0) return '0';
    return hand?.pot ?? '0';
  }, [isShowdownWithWinners, displayedPots, paidPotIndex, hand?.pot]);
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

  // Server-driven runout: the server emits one broadcast per street
  // (flop → turn → river → showdown) with built-in pacing, and hole cards
  // appear in `hand.showdownHands` as soon as the all-in locks — so we just
  // render whatever the server currently says. No client-side staging or
  // reconnect heuristic.
  const totalCommunityCount = hand?.communityCards?.length ?? 0;
  const revealedCommunityCount = totalCommunityCount;
  const revealedHandAddrs = useMemo(() => {
    const set = new Set<string>();
    if (hand?.showdownHands) {
      for (const addr of Object.keys(hand.showdownHands)) set.add(addr.toLowerCase());
    }
    return set;
  }, [hand?.showdownHands]);

  // "Final showdown" visuals (winner medallion / dim non-winners) are gated on
  // the server's showdown frame. During the server-driven runout's intermediate
  // flop/turn/river frames, hole cards are visible but the winner UI stays
  // hidden until the final broadcast.
  const showFinalShowdownVisuals = !!isShowdownWithWinners;

  // Fold-out (uncontested) Show / Muck offer — visible only when I'm the
  // sole winner of a hand that didn't reach showdown and the server-side
  // window is still open. Server gates this; the client just renders the
  // overlay it advertises.
  const myAddrLower = currentPlayerAddress?.toLowerCase() ?? null;
  const showMuckOffer = !!(
    hand &&
    !hand.handWentToShowdown &&
    hand.foldOutWinnerAddress &&
    myAddrLower &&
    hand.foldOutWinnerAddress === myAddrLower &&
    hand.foldOutShowDecision === 'pending' &&
    hand.foldOutShowMuckExpiresAt
  );

  /** Server deadline for auto next hand (ISO). Omitted on older backends. */
  const serverNextHandMs = useMemo(() => {
    const iso = hand?.nextHandAt;
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
  }, [hand?.nextHandAt]);

  /**
   * If `nextHandAt` is missing, approximate the 15s window from the showdown
   * frame so the intermission UI still appears.
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
    setClientIntermissionEndMs((prev) => prev ?? Date.now() + POKER_BETWEEN_HANDS_DELAY_MS);
  }, [isShowdownWithWinners, hand?.handId, hand?.nextHandAt]);

  const intermissionEndMs =
    isShowdownWithWinners && hand ? (serverNextHandMs ?? clientIntermissionEndMs) : null;
  const showBetweenHandsTimer = intermissionEndMs != null;

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

  // Bet-to-pot gather: on every render snapshot current bets into
  // `lastBetsRef`, BUT when the street has just advanced read the *prior*
  // snapshot first to launch fly-to-pot animations. Skip the showdown
  // frame (per-pot payout choreography owns that transition) and skip
  // hand boundaries (chips from a finished hand shouldn't merge into a
  // new hand's empty pot).
  useEffect(() => {
    if (!hand) {
      lastStreetRef.current = {};
      lastBetsRef.current = {};
      return;
    }
    const prev = lastStreetRef.current;
    const isStreetAdvance =
      prev.handId === hand.handId &&
      !!prev.street &&
      prev.street !== hand.street &&
      hand.street !== 'showdown';

    let cleanup: (() => void) | undefined;
    if (isStreetAdvance) {
      const entries: GatherEntry[] = [];
      for (const [seatIdxStr, bet] of Object.entries(lastBetsRef.current)) {
        if (toBigIntSafe(bet.amount) > 0n) {
          entries.push({
            key: `gather-${hand.handId}-${prev.street}-${seatIdxStr}`,
            amount: bet.amount,
            fx: bet.fx,
            fy: bet.fy,
          });
        }
      }
      if (entries.length > 0) {
        setGatheringBets((cur) => [...cur, ...entries]);
        const ids = new Set(entries.map((e) => e.key));
        const t = setTimeout(() => {
          setGatheringBets((cur) => cur.filter((e) => !ids.has(e.key)));
        }, 850);
        cleanup = () => clearTimeout(t);
      }
    }

    // Always advance refs — whether or not we fired a gather — so the
    // next render doesn't re-detect the same street transition.
    lastStreetRef.current = { handId: hand.handId, street: hand.street };
    const nextBets: Record<number, { amount: string; fx: number; fy: number }> = {};
    for (let displaySlot = 0; displaySlot < state.seats.length; displaySlot++) {
      const actualIdx =
        mySeatIndex >= 0
          ? (mySeatIndex + displaySlot) % state.seats.length
          : displaySlot;
      const seat = state.seats[actualIdx];
      if (toBigIntSafe(seat.currentBet ?? 0) > 0n) {
        const { fx, fy } = betChipAnchorForDisplaySlot(state.seats.length, displaySlot);
        nextBets[actualIdx] = { amount: seat.currentBet ?? '0', fx, fy };
      }
    }
    lastBetsRef.current = nextBets;
    return cleanup;
  }, [hand?.handId, hand?.street, state.seats, mySeatIndex]);

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
    // Hero hole cards live on the avatar in PokerSeat (not the opponent card map),
    // so wire their CARD_ANCHOR_RING entry as an offset from the seat anchor — this
    // makes the hero hand draggable in the layout editor like every other element.
    const heroCardAnchor = cardAnchorForDisplaySlot(state.seats.length, displaySlot);
    const heroCardOffset = anchorFrac
      ? {
          x: (heroCardAnchor.fx - anchorFrac.fx) * dims.w,
          y: (heroCardAnchor.fy - anchorFrac.fy) * dims.h,
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
      // Sit Out / I'm Back are CASH-ONLY. In tournaments there is no "sit out"
      // refuge — AFK players keep being dealt in and posting blinds until they
      // bust (server enforces this in the deal query + setSitOut guard).
      // Suppressing the callback hides the corresponding radial items in PokerSeat.
      onSitOut: state.tournamentId ? undefined : onSitOut,
      onSitBack: state.tournamentId ? undefined : onSitBack,
      onRequestMobileActivity,
      includeActivityInPlayerRadial: hideSeatAvatars,
      playerTagOffset,
      showdownCardOffset,
      heroCardOffset,
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
              pot={displayedPotScalar}
              pots={displayedPots}
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
            {/* Provably-fair commitment badge — shows the deck hash so players
                can verify the deal wasn't rigged once the seed is revealed at
                showdown. Renders nothing if the server didn't include the hash
                (legacy hands etc.). */}
            <div className="mt-1.5">
              <ProvablyFairBadge
                serverSeedHash={hand.serverSeedHash}
                handId={hand.handId}
                isComplete={hand.street === 'showdown' && !!hand.winners?.length}
              />
            </div>
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

      {/* Per-pot chip BURST at showdown — each pot erupts into a spray of
          individual chips that funnel to the winner and pile into a stack (no
          fade). Source pots drain in lockstep via `displayedPots`. */}
      <AnimatePresence>
        {showFinalShowdownVisuals &&
          perPotBurstChips.map((c) => (
            <motion.div
              key={`burst-${hand!.handId}-${c.key}`}
              className="absolute z-[35] pointer-events-none"
              // Center the disc on its left/top point via x/y (real transforms
              // that compose with the animated scale/rotate → spin-in-place).
              initial={{ left: c.fromX, top: c.fromY, x: '-50%', y: '-50%', opacity: 0, scale: 0.7, rotate: 0 }}
              animate={{
                left: [c.fromX, c.peakX, c.slotX, c.slotX],
                top: [c.fromY, c.peakY, c.slotY - burstChipW * 0.5, c.slotY],
                opacity: [0, 1, 1, 1],
                scale: [0.7, 1.05, 1.06, 1],
                rotate: [0, c.rot, 0, 0], // tumble in flight, settle FLAT (was resting at a random angle → wonky)
              }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{
                duration: CHIP_FLY_DURATION_MS / 1000 + 0.1,
                delay: c.delaySec,
                times: [0, 0.42, 0.9, 1],
                ease: [0.25, 0.55, 0.35, 1],
              }}
            >
              <ChipDisc amount={c.denom} width={burstChipW} />
            </motion.div>
          ))}
      </AnimatePresence>

      {/* Impact ring — a crisp gold ring that snaps out the instant chips land
          at a winner seat. Replaces the old soft blurred glow blob. */}
      <AnimatePresence>
        {showFinalShowdownVisuals &&
          perPotChipFlights.map((t) => {
            const arrivalDelaySec = t.delaySec + (CHIP_FLY_DURATION_MS - 80) / 1000;
            return (
              <motion.div
                key={`splash-${hand!.handId}-${t.key}`}
                className="absolute z-[36] pointer-events-none"
                style={{
                  left: `${t.fx * 100}%`,
                  top: `${t.fy * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 'clamp(44px, 6cqw, 80px)',
                  height: 'clamp(44px, 6cqw, 80px)',
                  borderRadius: '9999px',
                  border: '2px solid rgba(253,224,71,0.9)',
                  boxShadow: '0 0 16px rgba(253,224,71,0.65)',
                }}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 0.95, 0], scale: [0.4, 1.5, 2.1] }}
                exit={{ opacity: 0 }}
                transition={{ delay: arrivalDelaySec, duration: 0.5, ease: 'easeOut', times: [0, 0.3, 1] }}
                aria-hidden
              />
            );
          })}
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
              // Snappier exit-in-place so it visually clears for the
              // gather chip without lingering as a "shadow" at the seat.
              exit={{ opacity: 0, scale: 0.85 }}
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

      {/* Bet-to-pot gather — fly each seat's committed chip stack into
          the pot at street's end. Spawned by the street-transition
          useEffect; AnimatePresence sweep removes them after the cleanup
          timer fires. Replaces the previous "bets vanish in place" look. */}
      <AnimatePresence>
        {gatheringBets.map((g) => (
          <motion.div
            key={g.key}
            className="absolute pointer-events-none"
            style={{
              transform: 'translate(-50%, -50%)',
              zIndex: 30,
            }}
            initial={{
              left: `${g.fx * 100}%`,
              top: `${g.fy * 100}%`,
              scale: 1,
              opacity: 1,
            }}
            animate={{
              left: `${POT_ANCHOR.fx * 100}%`,
              top: `${POT_ANCHOR.fy * 100}%`,
              // Slight mid-flight bulge then settle — "scooped into the pot".
              scale: [1, 1.08, 0.85],
              opacity: [1, 1, 0],
            }}
            exit={{ opacity: 0 }}
            transition={{
              left: { type: 'spring', stiffness: 90, damping: 20 },
              top: { type: 'spring', stiffness: 90, damping: 20 },
              scale: { duration: 0.7, ease: 'easeIn', times: [0, 0.55, 1] },
              opacity: { duration: 0.7, ease: 'easeIn', times: [0, 0.7, 1] },
            }}
          >
            <PokerChipStack weiAmount={g.amount} />
          </motion.div>
        ))}
      </AnimatePresence>

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
                  ? <CardDisplay cardIndex={null} small faceDown dealDelay={ci * 0.06} cardBackSrc={floatingTableLogoSrc} />
                  : (
                      <CardDisplay
                        cardIndex={showdownCards![ci] ?? null}
                        dealDelay={ci * 0.06}
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

      {showMuckOffer && onShowCards && onMuckCards && hand?.foldOutShowMuckExpiresAt && (
        <PokerShowMuckOverlay
          expiresAtIso={hand.foldOutShowMuckExpiresAt}
          pending={hand.foldOutShowDecision === 'pending'}
          onShow={onShowCards}
          onMuck={onMuckCards}
        />
      )}

      {/* Directed emotes — bubble pops above the sender, then arcs across to the target's seat. */}
      {dims.w > 0 && directedEmotes?.map((de) => {
        const fromSlot = toDisplaySlot(de.fromSeatIndex);
        const toSlot = toDisplaySlot(de.toSeatIndex);
        const fromA = seatAnchors[fromSlot];
        const toA = seatAnchors[toSlot];
        const def = POKER_DIRECTED_EMOTES[de.kind];
        if (!fromA || !toA || !def) return null;
        const raise = dims.h * 0.05;
        const fromX = fromA.fx * dims.w;
        const fromY = fromA.fy * dims.h - raise;
        const dx = toA.fx * dims.w - fromX;
        const dy = (toA.fy * dims.h - raise) - fromY;
        const apexY = Math.min(0, dy) - dims.h * 0.08; // arc up and over both seats
        return (
          <div
            key={de.id}
            className="absolute pointer-events-none"
            style={{ left: fromX, top: fromY, transform: 'translate(-50%, -50%)', zIndex: 42 }}
          >
            <motion.div
              initial={{ x: 0, y: 0, scale: 0.2, opacity: 0 }}
              animate={{
                x: [0, 0, dx * 0.5, dx, dx],
                y: [0, 0, apexY, dy, dy],
                scale: [0.2, 1.08, 1, 1.18, 0.55],
                opacity: [0, 1, 1, 1, 0],
              }}
              transition={{ duration: POKER_DIRECTED_EMOTE_FLY_MS / 1000, times: [0, 0.14, 0.5, 0.88, 1], ease: 'easeInOut' }}
            >
              <div
                className="relative flex items-center gap-1 font-jost font-extrabold"
                style={{
                  padding: '5px 10px', borderRadius: 13, whiteSpace: 'nowrap',
                  background: 'linear-gradient(180deg, #ffffff, #efe7ff)', color: '#241247',
                  boxShadow: '0 8px 22px rgba(0,0,0,0.55), 0 0 0 1px rgba(168,85,247,0.45)',
                  fontSize: 12, letterSpacing: '0.3px',
                }}
              >
                <span style={{ fontSize: 19, lineHeight: 1 }}>{def.glyph}</span>
                {def.label ? <span>{def.label}</span> : null}
                <span
                  style={{
                    position: 'absolute', left: 14, bottom: -4, width: 9, height: 9,
                    background: '#efe7ff', transform: 'rotate(45deg)', boxShadow: '1px 1px 0 rgba(168,85,247,0.25)',
                  }}
                />
              </div>
            </motion.div>
          </div>
        );
      })}

    </div>
  );
}
