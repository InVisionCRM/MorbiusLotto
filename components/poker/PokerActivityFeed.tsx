'use client';

import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { formatChips } from '@/lib/format-poker-chips';
import { motion, AnimatePresence } from 'framer-motion';
import { useChat } from '@/hooks/use-chat';
import type { BlackjackWebSocketClient, PokerTableState } from '@/lib/websocket-client';
import { POKER_FACTS } from '@/app/poker/poker-facts';
import { POKER_RANK_SUIT_LABEL_COLORS } from '@/components/poker/CardDisplay';
import { useSidebarOptional } from '@/components/ui/sidebar';

// ── Types ──────────────────────────────────────────────────────────────────

type ChatEntry = {
  kind: 'chat';
  id: string;
  sender: string;
  displayName?: string | null;
  text: string;
  ts: number;
};
type ActionEntry = {
  kind: 'action';
  id: string;
  seatIndex: number;
  playerAddr: string;
  displayName?: string | null;
  action: string;
  amount?: string;
  ts: number;
};
type ReactionEntry = {
  kind: 'reaction';
  id: string;
  seatIndex: number;
  value: string;
  ts: number;
};
type DividerEntry = { kind: 'divider'; id: string; ts: number };
type StreetHeaderEntry = { kind: 'street_header'; id: string; label: string; ts: number };
type ShowdownEntry = {
  kind: 'showdown';
  id: string;
  winnerAddr: string;
  displayName?: string | null;
  amount: string;
  handName?: string;        // undefined = fold win (don't reveal cards)
  communityCards?: number[];
  holeCards?: number[];
  ts: number;
};
type SystemEntry = {
  kind: 'system';
  id: string;
  type: 'welcome' | 'factbot' | 'player_event' | 'idle_warning';
  text: string;
  ts: number;
};
type Entry =
  | ChatEntry
  | ActionEntry
  | ReactionEntry
  | DividerEntry
  | StreetHeaderEntry
  | ShowdownEntry
  | SystemEntry;

// ── Constants ─────────────────────────────────────────────────────────────

const MAX_ENTRIES = 150;
const CHAT_MAX_LEN = 150;

/**
 * Verb colors — same hues as `PokerActions` commit + primary (fold / check / call / Bet|Raise).
 * @see `foldBtnStyleCommit`, `checkBtnStyleCommit`, `callBtnStyleCommit`, `primaryBtnStyle` in PokerActions.tsx
 */
const ACTION_COLORS: Record<string, string> = {
  fold:     'rgb(252, 165, 165)',  // red commit gradient (#b91c1c family)
  check:    'rgb(96, 165, 250)',  // blue commit (#3b82f6 / #2563eb) — not grey
  call:     'rgb(74, 222, 128)',  // green commit (#22c55e / #16a34a)
  bet:      'rgb(45, 212, 191)',  // primary bet/raise (#0d9488 teal)
  raise:    'rgb(45, 212, 191)',
  'all-in': 'rgb(220, 38, 38)',  // strong red (stays distinct from fold tint)
  allin:    'rgb(220, 38, 38)',
};

type FeedBurst = { id: string; text: string; tone: 'red' | 'black' };
const BURST_MS = 1200;

const ACTION_LABELS: Record<string, string> = {
  fold: 'folded', check: 'checked', call: 'called',
  bet: 'bet', raise: 'raised', 'all-in': 'ALL IN', allin: 'ALL IN',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function shortAddr(addr: string): string {
  if (!addr) return '???';
  return `…${addr.slice(-4).toUpperCase()}`;
}

function fallbackLast4(addr: string): string {
  if (!addr) return '????';
  return addr.slice(-4).toUpperCase();
}

function displayPlayerName(displayName?: string | null, addr?: string | null): string {
  const trimmed = (displayName ?? '').trim();
  if (trimmed.length > 0) return trimmed;
  return fallbackLast4(addr ?? '');
}

function formatStreetLabel(street: string): string {
  const s = street.trim().toLowerCase();
  if (s === 'preflop') return 'Preflop';
  if (s === 'flop') return 'Flop';
  if (s === 'turn') return 'Turn';
  if (s === 'river') return 'River';
  if (s === 'showdown') return 'Showdown';
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatEventTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtChips(chips: string | number): string {
  try {
    return formatChips(chips);
  } catch {
    return '';
  }
}

function seatLabel(seatIndex: number, state: PokerTableState | null): string {
  const seat = state?.seats[seatIndex];
  return seat?.playerAddress ? shortAddr(seat.playerAddress) : `S${seatIndex + 1}`;
}

const CARD_RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const CARD_SUITS = ['♣','♦','♥','♠'];

function TinyCard({ idx }: { idx: number }) {
  const rank = CARD_RANKS[idx % 13];
  const suitIdx = Math.floor(idx / 13);
  const suit = CARD_SUITS[suitIdx];
  const color = POKER_RANK_SUIT_LABEL_COLORS[suitIdx];
  return (
    <span className="font-jost font-bold tabular-nums text-[11px]" style={{ color }}>
      {rank}{suit}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export type PokerActivityFeedLayout = 'fixed' | 'embedded-bottom' | 'right-rail';

export interface PokerActivityFeedProps {
  wsClient: BlackjackWebSocketClient | null;
  wsConnected: boolean;
  roomId: string;
  tableId: string;
  state: PokerTableState | null;
  /**
   * Desktop placement: fixed corner, embedded bottom grid, or collapsible right rail (must be wrapped in `Sidebar` + `SidebarBody`).
   * @default 'fixed'
   */
  layout?: PokerActivityFeedLayout;
  /**
   * Increment (e.g. `n => n + 1` from parent) to open the mobile Activity drawer programmatically.
   * Used by the poker seat player radial on narrow viewports.
   */
  mobileOpenRequestSerial?: number;
  /** QuickChat phrase chips (table page); same handler as seat radial — broadcasts phrase + head bubble. */
  quickChatPhrases?: string[];
  onQuickChatPhrase?: (phrase: string) => void;
  onOpenEditQuickChat?: () => void;
  /** When false, QuickChat strip is hidden (e.g. not seated). */
  quickChatEligible?: boolean;
}

/** Desktop fixed panel heights: expanded vs collapsed (expanded cap is half of prior max). */
const DESKTOP_ACTIVITY_HEIGHT_EXPANDED = 'min(260px, calc((100dvh - 112px) / 2))';
const DESKTOP_ACTIVITY_HEIGHT_COLLAPSED = 'min(180px, calc((100dvh - 112px) * 0.33))';
const POKER_AFK_TIMEOUTS_BEFORE_KICK = 3;

export function PokerActivityFeed({
  wsClient,
  wsConnected,
  roomId,
  tableId,
  state,
  layout = 'fixed',
  mobileOpenRequestSerial = 0,
  quickChatPhrases,
  onQuickChatPhrase,
  onOpenEditQuickChat,
  quickChatEligible = false,
}: PokerActivityFeedProps) {
  const sidebarOpt = useSidebarOptional();
  const railOpen = layout === 'right-rail' ? Boolean(sidebarOpt?.open) : true;

  const { messages, sendMessage, connected } = useChat(roomId, { wsClient, wsConnected });

  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [docMounted, setDocMounted] = useState(false);
  const lastMobileOpenRequestRef = useRef(0);

  const [activeBurst, setActiveBurst] = useState<FeedBurst | null>(null);
  const burstQueueRef = useRef<FeedBurst[]>([]);
  const burstPlayingRef = useRef(false);
  const prevFeedLastIdRef = useRef<string | null>(null);

  const drainBurstQueue = useCallback(() => {
    if (burstPlayingRef.current) return;
    const next = burstQueueRef.current.shift();
    if (!next) return;
    burstPlayingRef.current = true;
    setActiveBurst(next);
    setTimeout(() => {
      burstPlayingRef.current = false;
      setActiveBurst(null);
      if (burstQueueRef.current.length > 0) {
        setTimeout(drainBurstQueue, 80);
      }
    }, BURST_MS);
  }, []);

  const enqueueBursts = useCallback(
    (items: FeedBurst[]) => {
      burstQueueRef.current.push(...items);
      drainBurstQueue();
    },
    [drainBurstQueue],
  );

  useEffect(() => {
    setDocMounted(true);
  }, []);

  useEffect(() => {
    if (mobileOpenRequestSerial <= lastMobileOpenRequestRef.current) return;
    lastMobileOpenRequestRef.current = mobileOpenRequestSerial;
    setMobileOpen(true);
  }, [mobileOpenRequestSerial]);

  const listRef = useRef<HTMLDivElement>(null);
  const seenMsgIdsRef = useRef<Set<string>>(new Set());
  const lastActionKeyRef = useRef<string | null>(null);
  /** Highest action `order` already logged for the current hand. Rapid server broadcasts can be
   *  batched by React into a single state update, so we must iterate the server-provided
   *  `recentActions` list and log any gap — tracking just the newest action would drop the rest. */
  const lastActionOrderRef = useRef<{ handId: string; order: number } | null>(null);
  const lastHandIdRef = useRef<string | null>(null);
  /** `${handId}:${street}` — insert a street subheader when this changes for the current hand. */
  const lastActionStreetKeyRef = useRef<string | null>(null);
  const lastShowdownHandRef = useRef<string | null>(null);
  const welcomeSentRef = useRef(false);
  const factUsedIndicesRef = useRef<Set<number>>(new Set());
  const prevSeatSnapshotRef = useRef<Array<{
    playerAddress: string | null;
    status: string;
    displayName?: string | null;
    consecutiveTimeouts: number;
  }> | null>(null);

  // Reset one-time system message state when room changes.
  useEffect(() => {
    welcomeSentRef.current = false;
    factUsedIndicesRef.current.clear();
    prevSeatSnapshotRef.current = null;
    prevFeedLastIdRef.current = null;
    burstQueueRef.current = [];
    burstPlayingRef.current = false;
    setActiveBurst(null);
    lastActionKeyRef.current = null;
    lastActionOrderRef.current = null;
    lastHandIdRef.current = null;
    lastActionStreetKeyRef.current = null;
    lastShowdownHandRef.current = null;
  }, [roomId]);

  // Tournament HUD–style full-panel bursts for high-salience feed moments.
  useEffect(() => {
    if (entries.length === 0) return;
    const last = entries[entries.length - 1];
    if (prevFeedLastIdRef.current === last.id) return;
    prevFeedLastIdRef.current = last.id;

    if (last.kind === 'showdown') {
      enqueueBursts([
        {
          id: `burst-sd-${last.id}`,
          text: last.handName ? 'SHOWDOWN' : 'FOLD WIN',
          tone: 'black',
        },
      ]);
      return;
    }
    if (last.kind === 'action' && (last.action === 'all-in' || last.action === 'allin')) {
      enqueueBursts([{ id: `burst-ai-${last.id}`, text: 'ALL IN', tone: 'red' }]);
      return;
    }
    if (last.kind === 'system' && last.type === 'idle_warning') {
      enqueueBursts([{ id: `burst-idle-${last.id}`, text: 'IDLE WARNING', tone: 'red' }]);
    }
  }, [entries, enqueueBursts]);

  // ── System feed messages: welcome + periodic FactBot ─────────────────────
  useEffect(() => {
    if (!connected || !tableId || welcomeSentRef.current) return;
    welcomeSentRef.current = true;
    const sb = state?.smallBlind ? fmtChips(state.smallBlind) : '?';
    const bb = state?.bigBlind ? fmtChips(state.bigBlind) : '?';
    setEntries((prev) => [
      ...prev,
      {
        kind: 'system',
        id: `welcome-${tableId}`,
        type: 'welcome',
        text: `Welcome to Morbius.IO Poker! Blinds: ${sb}/${bb}. Tap your avatar for reactions and settings.`,
        ts: Date.now(),
      } satisfies SystemEntry,
    ].slice(-MAX_ENTRIES));
  }, [connected, tableId, state?.smallBlind, state?.bigBlind]);

  useEffect(() => {
    if (!connected) return;

    const addFact = () => {
      if (POKER_FACTS.length === 0) return;
      if (factUsedIndicesRef.current.size >= POKER_FACTS.length) {
        factUsedIndicesRef.current.clear();
      }

      let idx = Math.floor(Math.random() * POKER_FACTS.length);
      while (factUsedIndicesRef.current.has(idx) && factUsedIndicesRef.current.size < POKER_FACTS.length) {
        idx = Math.floor(Math.random() * POKER_FACTS.length);
      }
      factUsedIndicesRef.current.add(idx);

      setEntries((prev) => [
        ...prev,
        {
          kind: 'system',
          id: `factbot-${Date.now()}-${idx}`,
          type: 'factbot',
          text: POKER_FACTS[idx],
          ts: Date.now(),
        } satisfies SystemEntry,
      ].slice(-MAX_ENTRIES));
    };

    const intervalId = setInterval(addFact, 5 * 60 * 1000);
    const firstTimeout = setTimeout(addFact, 30_000);
    return () => {
      clearInterval(intervalId);
      clearTimeout(firstTimeout);
    };
  }, [connected]);

  // ── Player system events: join / leave / watch + idle warnings ───────────
  useEffect(() => {
    if (!state?.seats?.length) return;

    const prev = prevSeatSnapshotRef.current;
    const next = state.seats.map((seat) => ({
      playerAddress: seat.playerAddress?.toLowerCase() ?? null,
      status: seat.status,
      displayName: seat.displayName ?? null,
      consecutiveTimeouts: Number(seat.consecutiveTimeouts ?? 0),
    }));

    if (!prev) {
      prevSeatSnapshotRef.current = next;
      return;
    }

    const now = Date.now();
    const nowLabel = formatEventTime(now);
    const updates: SystemEntry[] = [];

    for (let i = 0; i < next.length; i++) {
      const p = prev[i];
      const n = next[i];
      if (!p || !n) continue;

      // Join / leave / watch transitions
      if (!p.playerAddress && n.playerAddress) {
        const name = displayPlayerName(n.displayName, n.playerAddress);
        const actionText = n.status === 'sitting_out' ? 'is now watching' : 'joined the table';
        updates.push({
          kind: 'system',
          id: `player-join-${i}-${now}-${n.playerAddress}`,
          type: 'player_event',
          text: `${name} ${actionText} at ${nowLabel}`,
          ts: now,
        });
      } else if (p.playerAddress && !n.playerAddress) {
        const name = displayPlayerName(p.displayName, p.playerAddress);
        updates.push({
          kind: 'system',
          id: `player-leave-${i}-${now}-${p.playerAddress}`,
          type: 'player_event',
          text: `${name} left the table at ${nowLabel}`,
          ts: now,
        });
      } else if (p.playerAddress && n.playerAddress && p.playerAddress === n.playerAddress && p.status !== n.status) {
        const name = displayPlayerName(n.displayName ?? p.displayName, n.playerAddress);
        if (n.status === 'sitting_out') {
          updates.push({
            kind: 'system',
            id: `player-watch-${i}-${now}-${n.playerAddress}`,
            type: 'player_event',
            text: `${name} is now watching at ${nowLabel}`,
            ts: now,
          });
        } else if (p.status === 'sitting_out' && n.status === 'active') {
          updates.push({
            kind: 'system',
            id: `player-back-${i}-${now}-${n.playerAddress}`,
            type: 'player_event',
            text: `${name} rejoined from watching at ${nowLabel}`,
            ts: now,
          });
        }
      }

      // Idle warnings (same idea as blackjack: warn when timeout count increases and is high)
      if (n.playerAddress) {
        const prevTimeouts = p.consecutiveTimeouts ?? 0;
        const currentTimeouts = n.consecutiveTimeouts ?? 0;
        if (currentTimeouts > prevTimeouts && currentTimeouts >= 2) {
          const name = displayPlayerName(n.displayName, n.playerAddress);
          updates.push({
            kind: 'system',
            id: `idle-${i}-${now}-${n.playerAddress}-${currentTimeouts}`,
            type: 'idle_warning',
            text: `${name} is idle (${currentTimeouts}/${POKER_AFK_TIMEOUTS_BEFORE_KICK}) at ${nowLabel}.`,
            ts: now,
          });
        }
      }
    }

    prevSeatSnapshotRef.current = next;
    if (updates.length === 0) return;
    setEntries((prevEntries) => [...prevEntries, ...updates].slice(-MAX_ENTRIES));
  }, [state]);

  // ── Sync chat messages into unified feed ──────────────────────────────────
  useEffect(() => {
    const newMsgs = messages.filter((m) => {
      const id = m.id || `chat-${m.timestamp}-${m.senderAddress}`;
      return !seenMsgIdsRef.current.has(id);
    });
    if (newMsgs.length === 0) return;
    newMsgs.forEach((m) => {
      seenMsgIdsRef.current.add(m.id || `chat-${m.timestamp}-${m.senderAddress}`);
    });
    setEntries((prev) => [
      ...prev,
      ...newMsgs.map((m): ChatEntry => ({
        kind: 'chat',
        id: m.id || `chat-${m.timestamp}-${m.senderAddress}`,
        sender: m.senderAddress ?? 'anon',
        displayName: m.displayName,
        text: m.text,
        ts: new Date(m.timestamp).getTime(),
      })),
    ].slice(-MAX_ENTRIES));
  }, [messages]);

  // ── Track hand actions from state ─────────────────────────────────────────
  //
  // Iterate the server-provided `recentActions` (not just `lastAction`): if two
  // actions happen between React renders, both setStates get batched and we only
  // see the last one. Tracking by `order` means we log every action exactly once,
  // and using each action's own `street` keeps street headers aligned with where
  // the action actually happened rather than the snapshot's current street.
  useEffect(() => {
    const hand = state?.currentHand;
    const handId = hand?.handId;
    if (!handId) return;
    const recent = hand?.recentActions ?? [];

    // Fallback to `lastAction` if server hasn't been updated to send `recentActions` yet.
    const actions: {
      order: number;
      street: string;
      position: number;
      action: string;
      amount: string;
    }[] =
      recent.length > 0
        ? recent
        : hand?.lastAction
          ? [{ order: 0, street: (hand.street ?? '').trim() || '—', ...hand.lastAction }]
          : [];

    if (actions.length === 0) return;

    // Reset watermark when we switch hands.
    if (!lastActionOrderRef.current || lastActionOrderRef.current.handId !== handId) {
      lastActionOrderRef.current = { handId, order: -Infinity };
    }
    const watermark = lastActionOrderRef.current.order;
    const toLog = actions.filter((a) => a.order > watermark);
    if (toLog.length === 0) return;

    setEntries((prev) => {
      const next = [...prev];

      // New hand divider (skip on very first hand)
      if (handId !== lastHandIdRef.current && lastHandIdRef.current !== null) {
        next.push({ kind: 'divider', id: `divider-${handId}`, ts: Date.now() });
      }
      lastHandIdRef.current = handId;

      for (const a of toLog) {
        const street = (a.street ?? '').trim() || '—';
        const streetKey = `${handId}:${street}`;
        if (streetKey !== lastActionStreetKeyRef.current) {
          lastActionStreetKeyRef.current = streetKey;
          next.push({
            kind: 'street_header',
            id: `street-${streetKey}`,
            label: formatStreetLabel(street),
            ts: Date.now(),
          });
        }

        const seat = state?.seats[a.position];
        const key = `${handId}:${street}:${a.order}:${a.position}:${a.action}:${a.amount}`;
        lastActionKeyRef.current = key;
        next.push({
          kind: 'action',
          id: key,
          seatIndex: a.position,
          playerAddr: seat?.playerAddress ?? '',
          displayName: seat?.displayName ?? null,
          action: a.action,
          amount: a.amount && a.amount !== '0' ? a.amount : undefined,
          ts: Date.now(),
        });
      }

      return next.slice(-MAX_ENTRIES);
    });

    lastActionOrderRef.current = {
      handId,
      order: toLog[toLog.length - 1].order,
    };
  }, [
    state?.currentHand?.recentActions,
    state?.currentHand?.lastAction,
    state?.currentHand?.handId,
    state?.currentHand?.street,
  ]);

  // ── Track QuickChat phrases ───────────────────────────────────────────────
  useEffect(() => {
    if (!wsClient || !tableId) return;
    const handler = (payload: {
      tableId?: string;
      seatIndex?: number;
      type?: string;
      value?: string;
    }) => {
      if (payload.tableId !== tableId || payload.seatIndex == null || payload.type !== 'phrase') return;
      const value = typeof payload.value === 'string' ? payload.value.trim() : '';
      if (!value) return;
      setEntries((prev) => [
        ...prev,
        {
          kind: 'reaction',
          id: `reaction-${Date.now()}-${payload.seatIndex}`,
          seatIndex: payload.seatIndex!,
          value,
          ts: Date.now(),
        },
      ].slice(-MAX_ENTRIES));
    };
    wsClient.on('poker_quick_reaction', handler);
    return () => wsClient.off('poker_quick_reaction', handler);
  }, [wsClient, tableId]);

  // ── Track showdown results ────────────────────────────────────────────────
  useEffect(() => {
    const hand = state?.currentHand;
    if (!hand || hand.street !== 'showdown' || !hand.winners?.length) return;
    if (hand.handId === lastShowdownHandRef.current) return;
    lastShowdownHandRef.current = hand.handId;

    const winner = hand.winners[0];
    // Fold-out: fewer than two dealt players still in — never reveal hole cards (server flag).
    const isFoldWin =
      hand.handWentToShowdown === false ||
      (hand.handWentToShowdown == null && !winner.handName);
    const winnerSeat = state?.seats.find((s) => s.playerAddress?.toLowerCase() === winner.address.toLowerCase());

    setEntries((prev) => [
      ...prev,
      {
        kind: 'showdown',
        id: `showdown-${hand.handId}`,
        winnerAddr: winner.address,
        displayName: winnerSeat?.displayName ?? null,
        amount: winner.amount,
        handName: winner.handName,
        communityCards: isFoldWin ? undefined : [...(hand.communityCards ?? [])],
        holeCards: isFoldWin ? undefined : [...(hand.showdownHands?.[winner.address] ?? [])],
        ts: Date.now(),
      } satisfies ShowdownEntry,
    ].slice(-MAX_ENTRIES));
   
  }, [
    state?.currentHand?.street,
    state?.currentHand?.handId,
    state?.currentHand?.winners,
    state?.currentHand?.handWentToShowdown,
  ]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const t = input.trim();
    if (!t || !connected) return;
    sendMessage(t);
    setInput('');
  }, [input, connected, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const t = input.trim();
    if (t && connected) { sendMessage(t); setInput(''); }
  }, [input, connected, sendMessage]);

  // ── Entry renderer (player name muted; verb uses `ACTION_COLORS` = PokerActions button hues) ──
  function renderEntry(entry: Entry) {
    const lineBase = 'font-jost font-bold px-2.5 py-[3px] text-[10px] md:text-[11px] leading-snug';
    if (entry.kind === 'system') {
      const isWelcome = entry.type === 'welcome';
      const isFact = entry.type === 'factbot';
      const isPlayerEvent = entry.type === 'player_event';
      const isIdle = entry.type === 'idle_warning';
      const labelColor = isWelcome
        ? 'rgba(255,255,255,0.45)'
        : isFact
          ? 'rgba(52,211,153,0.85)'
          : isPlayerEvent
            ? 'rgba(255,255,255,0.45)'
            : isIdle
              ? 'rgba(255,255,255,0.45)'
              : 'rgba(255,255,255,0.45)';
      const bodyColor = isWelcome
        ? 'rgba(255,255,255,0.85)'
        : isFact
          ? 'rgba(255,255,255,0.78)'
          : isPlayerEvent
            ? 'rgba(255,255,255,0.78)'
            : isIdle
              ? 'rgba(255,255,255,0.82)'
              : 'rgba(255,255,255,0.78)';
      return (
        <div
          key={entry.id}
          className={`${lineBase} whitespace-pre-line`}
          style={{ color: bodyColor }}
        >
          <span
            className="font-jost-normal text-[9px] uppercase tracking-[0.14em]"
            style={{ color: labelColor }}
          >
            {isWelcome ? 'Morbius ' : isFact ? 'FactBot ' : entry.type === 'player_event' ? 'Table ' : 'System '}
          </span>
          <span className="font-jost-normal tracking-wide">{entry.text}</span>
        </div>
      );
    }
    if (entry.kind === 'divider') {
      return (
        <div key={entry.id} className="flex items-center gap-1 py-1 mx-2 select-none">
          <div className="flex-1 h-px" style={{ background: 'rgba(26, 255, 0, 0.85)' }} />
          <span
            className="font-jost font-bold text-[12px] uppercase tracking-[0.18em] px-1"
            style={{ color: 'rgb(26, 255, 0)' }}
          >
            New Hand
          </span>
          <div className="flex-1 h-px" style={{ background: 'rgba(26, 255, 0, 0.85)' }} />
        </div>
      );
    }
    if (entry.kind === 'street_header') {
      return (
        <div key={entry.id} className="flex items-center gap-1 py-0.5 mx-2 select-none">
          <div className="flex-1 h-px" style={{ background: 'rgba(255, 255, 255, 0.29)' }} />
          <span
            className="font-jost font-bold text-[12px] uppercase tracking-[0.18em] px-1"
            style={{ color: 'rgba(19, 169, 196, 0.95)' }}
          >
            {entry.label}
          </span>
          <div className="flex-1 h-px" style={{ background: 'rgba(255, 255, 255, 0.29)' }} />
        </div>
      );
    }
    if (entry.kind === 'showdown') {
      const name = displayPlayerName(entry.displayName, entry.winnerAddr);
      const amt = fmtChips(entry.amount);
      return (
        <div
          key={entry.id}
          className="mx-1.5 my-1 px-2 py-1.5 rounded"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="flex flex-wrap items-center gap-1 text-[10px] md:text-[11px]">
            <span className="font-jost-normal" style={{ color: 'rgba(52,211,153,0.95)' }}>
              🏆
            </span>
            <span className="font-jost-normal truncate min-w-0" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {name}
            </span>
            <span className="font-jost-normal" style={{ color: 'rgba(52,211,153,0.9)' }}>
              won
            </span>
            {amt ? (
              <span className="font-jost tabular-nums shrink-0" style={{ color: 'rgba(255,255,255,0.98)' }}>
                {amt}
              </span>
            ) : null}
          </div>
          {entry.communityCards && entry.communityCards.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-1">
              <div className="flex items-center gap-1 flex-wrap">
                <span
                  className="font-jost-normal text-[9px] uppercase tracking-[0.18em]"
                  style={{ color: 'rgba(255,255,255,0.45)' }}
                >
                  Board
                </span>
                <div className="flex gap-0.5">
                  {entry.communityCards.map((c, i) => <TinyCard key={i} idx={c} />)}
                </div>
              </div>
              {entry.holeCards && entry.holeCards.length >= 2 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span
                    className="font-jost-normal text-[9px] uppercase tracking-[0.18em]"
                    style={{ color: 'rgba(255,255,255,0.45)' }}
                  >
                    Hand
                  </span>
                  <div className="flex gap-0.5">
                    {entry.holeCards.map((c, i) => <TinyCard key={i} idx={c} />)}
                  </div>
                  {entry.handName ? (
                    <span className="font-jost-normal text-[9px] italic tracking-wide" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      {entry.handName}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    if (entry.kind === 'action') {
      const color = ACTION_COLORS[entry.action] ?? 'rgba(255,255,255,0.55)';
      const label = ACTION_LABELS[entry.action] ?? entry.action;
      const name = displayPlayerName(entry.displayName, entry.playerAddr) || seatLabel(entry.seatIndex, state);
      const amtStr = entry.amount ? fmtChips(entry.amount) : '';
      return (
        <div key={entry.id} className={`${lineBase} flex items-baseline gap-1`}>
          <span className="font-jost-normal shrink-0 min-w-0 truncate max-w-[42%]" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {name}
          </span>
          <span className="font-jost shrink-0" style={{ color }}>
            {label}
          </span>
          {amtStr ? (
            <span className="font-jost tabular-nums shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {amtStr}
            </span>
          ) : null}
        </div>
      );
    }
    if (entry.kind === 'reaction') {
      const name = seatLabel(entry.seatIndex, state);
      return (
        <div key={entry.id} className={`${lineBase} flex items-baseline gap-1`}>
          <span className="font-jost-normal shrink-0" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {name}
          </span>
          <span className="font-jost-normal" style={{ color: 'rgba(255,255,255,0.78)' }}>
            {entry.value}
          </span>
        </div>
      );
    }
    const name = entry.displayName?.trim() || shortAddr(entry.sender);
    return (
      <div key={entry.id} className={`${lineBase}`}>
        <span className="font-jost-normal" style={{ color: 'rgba(255,255,255,0.55)' }}>
          {name}:{' '}
        </span>
        <span className="font-jost-normal break-words" style={{ color: 'rgba(255,255,255,0.85)' }}>
          {entry.text}
        </span>
      </div>
    );
  }

  const burstFontSize =
    layout === 'right-rail' ? (railOpen ? 28 : 15) : expanded ? 26 : 19;

  const burstOverlay = (
    <AnimatePresence>
      {activeBurst && (
        <motion.div
          key={activeBurst.id}
          className="absolute inset-0 z-40 flex items-center justify-center"
          style={{
            background: activeBurst.tone === 'red' ? 'rgba(220,38,38,0.98)' : 'rgba(0,0,0,0.96)',
            color: '#ffffff',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.span
            className="font-jost text-center px-3 select-none"
            style={{
              letterSpacing: '-0.01em',
              fontSize: burstFontSize,
              lineHeight: 1,
              whiteSpace: 'nowrap',
              color: '#ffffff',
            }}
            initial={{ scale: 0.92, y: 6 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          >
            {activeBurst.text}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ── Shared panel content (Jost + dividers like `PokerTournamentHUD` expanded panel) ──
  const renderPanelContent = (opts: { showDesktopHeightToggle: boolean; showMobileClose: boolean }) => (
    <div className="relative flex flex-col h-full min-h-0 select-none">
      <div
        className="flex items-center justify-between px-2.5 shrink-0"
        style={{
          height: 32,
          background: 'rgba(0,0,0,0.35)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <span
          className="font-jost-normal text-[10px] uppercase tracking-[0.18em]"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          Activity
        </span>
        <div className="flex items-center gap-1">
          {opts.showDesktopHeightToggle ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="hidden md:flex w-5 h-5 items-center justify-center rounded font-jost text-[10px] transition hover:bg-white/10"
              style={{ color: 'rgba(255,255,255,0.45)' }}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? '▾' : '▴'}
            </button>
          ) : null}
          {opts.showMobileClose ? (
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="flex md:hidden w-5 h-5 items-center justify-center rounded font-jost text-[10px] transition hover:bg-white/10"
              style={{ color: 'rgba(255,255,255,0.45)' }}
              aria-label="Close"
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto min-h-0 py-1"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.12) transparent' }}
      >
        {entries.length === 0 && (
          <div
            className="px-2.5 py-2 font-jost-normal text-[10px] tracking-wide"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            Waiting for activity…
          </div>
        )}
        {entries.map(renderEntry)}
      </div>

      {quickChatPhrases &&
      quickChatPhrases.length > 0 &&
      onQuickChatPhrase &&
      quickChatEligible ? (
        <div
          className="shrink-0 border-t px-2 py-2"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span
              className="font-jost-normal text-[9px] uppercase tracking-[0.14em]"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              QuickChat
            </span>
            {onOpenEditQuickChat ? (
              <button
                type="button"
                onClick={onOpenEditQuickChat}
                className="font-jost-normal shrink-0 text-[9px] uppercase tracking-[0.12em] text-cyan-400/90 hover:text-cyan-300 transition-colors"
              >
                Edit
              </button>
            ) : null}
          </div>
          <div
            className="flex flex-wrap gap-1 max-h-[100px] overflow-y-auto min-h-0"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.12) transparent' }}
          >
            {quickChatPhrases.map((phrase) => (
              <button
                key={phrase}
                type="button"
                title={phrase}
                disabled={!wsConnected}
                onClick={() => onQuickChatPhrase(phrase)}
                className="font-jost-normal max-w-full truncate rounded-md px-2 py-1 text-[10px] leading-tight transition-colors border border-white/10 hover:bg-white/10 hover:border-cyan-500/25 disabled:opacity-30 disabled:pointer-events-none"
                style={{ color: 'rgba(255,255,255,0.88)' }}
              >
                {phrase}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <form
        onSubmit={handleSend}
        className="flex shrink-0 items-center gap-1.5 px-2 py-1.5"
        style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, CHAT_MAX_LEN))}
          onKeyDown={handleKeyDown}
          placeholder={connected ? 'Message…' : 'Connecting…'}
          disabled={!connected}
          maxLength={CHAT_MAX_LEN}
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded font-jost text-[10px] md:text-[11px] text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition"
          style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        />
        <button
          type="submit"
          disabled={!connected || !input.trim()}
          className="shrink-0 px-2.5 py-1.5 rounded font-jost text-[10px] md:text-[11px] font-semibold tracking-wide text-white transition-colors disabled:opacity-25 disabled:pointer-events-none border border-cyan-500/30 bg-gradient-to-r from-cyan-600 to-blue-600 shadow-md"
        >
          Send
        </button>
      </form>

      {burstOverlay}
    </div>
  );

  const railCollapsed = (
    <div
      className="flex flex-col items-stretch justify-between h-full w-full py-6 px-1 select-none"
      role="note"
      aria-label="Activity and chat — hover or pin the rail to expand"
    >
      <div className="self-center w-12 h-px shrink-0" style={{ background: 'rgba(255,255,255,0.09)' }} />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 min-h-0">
        <span className="font-jost text-[15px] leading-none text-white/90" aria-hidden>
          💬
        </span>
        <span
          className="font-jost-normal text-[9px] uppercase tracking-[0.14em] text-center"
          style={{
            color: 'rgba(255,255,255,0.45)',
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
          }}
          aria-hidden
        >
          Activity
        </span>
      </div>
      <div className="self-center w-12 h-px shrink-0" style={{ background: 'rgba(255,255,255,0.09)' }} />
    </div>
  );

  const desktopPanelStyle: CSSProperties = {
    background: 'rgba(6,8,12,0.88)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    backdropFilter: 'blur(10px)',
  };

  const mobileDrawerChrome = (
    <div className="md:hidden">
      <AnimatePresence>
        {!mobileOpen && (
          <motion.button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="fixed left-0 z-30 flex flex-col items-center justify-center rounded-r-lg"
            style={{
              top: '50%',
              transform: 'translateY(-50%)',
              width: 28,
              height: 56,
              background: 'rgba(6,8,12,0.9)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderLeft: 'none',
              boxShadow: '3px 0 12px rgba(0,0,0,0.4)',
              color: 'rgba(255,255,255,0.55)',
              fontSize: 16,
            }}
            aria-label="Open activity feed"
            initial={{ x: -28 }}
            animate={{ x: 0 }}
            exit={{ x: -28 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          >
            💬
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-[38] bg-black/40"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed left-0 top-0 bottom-0 z-[39] flex flex-col overflow-hidden"
            style={{
              width: 260,
              background: 'rgba(6,8,12,0.97)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderLeft: 'none',
              boxShadow: '6px 0 32px rgba(0,0,0,0.7)',
            }}
            initial={{ x: -260 }}
            animate={{ x: 0 }}
            exit={{ x: -260 }}
            transition={{ type: 'spring', stiffness: 400, damping: 36 }}
          >
            {renderPanelContent({ showDesktopHeightToggle: false, showMobileClose: true })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const mobileBlock =
    layout === 'right-rail' && docMounted
      ? createPortal(mobileDrawerChrome, document.body)
      : layout !== 'right-rail'
        ? mobileDrawerChrome
        : null;

  return (
    <>
      {layout === 'right-rail' ? (
        <div className="relative flex flex-col h-full w-full min-h-0 pt-8 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {railOpen ? (
              <motion.div
                key="rail-open"
                className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-lg"
                style={desktopPanelStyle}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                {renderPanelContent({ showDesktopHeightToggle: false, showMobileClose: false })}
              </motion.div>
            ) : (
              <motion.div
                key="rail-collapsed"
                className="flex flex-col flex-1 min-h-0 items-stretch"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                {railCollapsed}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : null}

      {layout === 'embedded-bottom' ? (
        <div
          className="hidden md:block relative w-full self-end shrink-0 overflow-visible min-h-0"
          style={{
            height: DESKTOP_ACTIVITY_HEIGHT_COLLAPSED,
            maxHeight: 'calc(100dvh - 112px)',
            zIndex: expanded ? 50 : undefined,
          }}
        >
          <div
            className="absolute bottom-0 left-0 right-0 flex flex-col rounded-lg overflow-hidden min-h-0"
            style={{
              ...desktopPanelStyle,
              height: expanded ? DESKTOP_ACTIVITY_HEIGHT_EXPANDED : '100%',
              maxHeight: 'calc(100dvh - 112px)',
              transition: 'height 0.25s ease',
            }}
          >
            {renderPanelContent({ showDesktopHeightToggle: true, showMobileClose: false })}
          </div>
        </div>
      ) : null}

      {layout === 'fixed' ? (
        <div
          className="hidden md:flex fixed z-30 flex-col rounded-lg overflow-hidden"
          style={{
            ...desktopPanelStyle,
            width: 300,
            height: expanded ? DESKTOP_ACTIVITY_HEIGHT_EXPANDED : DESKTOP_ACTIVITY_HEIGHT_COLLAPSED,
            transition: 'height 0.25s ease',
            left: 'max(12px, env(safe-area-inset-left, 0px))',
            bottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
          }}
        >
          {renderPanelContent({ showDesktopHeightToggle: true, showMobileClose: false })}
        </div>
      ) : null}

      {mobileBlock}
    </>
  );
}
