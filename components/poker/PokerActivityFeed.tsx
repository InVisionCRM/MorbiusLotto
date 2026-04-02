'use client';

import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import { motion, AnimatePresence } from 'framer-motion';
import { useChat } from '@/hooks/use-chat';
import type { BlackjackWebSocketClient, PokerTableState } from '@/lib/websocket-client';
import { POKER_FACTS } from '@/app/poker/poker-facts';

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
type ShowdownEntry = {
  kind: 'showdown';
  id: string;
  winnerAddr: string;
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
type Entry = ChatEntry | ActionEntry | ReactionEntry | DividerEntry | ShowdownEntry | SystemEntry;

// ── Constants ─────────────────────────────────────────────────────────────

const MAX_ENTRIES = 50;
const CHAT_MAX_LEN = 150;

const ACTION_COLORS: Record<string, string> = {
  fold:     'rgba(239,68,68,0.9)',
  check:    'rgba(156,163,175,0.85)',
  call:     'rgba(74,222,128,0.9)',
  bet:      'rgba(251,191,36,0.9)',
  raise:    'rgba(251,146,60,0.9)',
  'all-in': 'rgba(248,113,113,1)',
  allin:    'rgba(248,113,113,1)',
};

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

function formatEventTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtWei(wei: string | number): string {
  try {
    return formatMorbiusFloor(wei);
  } catch {
    return '';
  }
}

function seatLabel(seatIndex: number, state: PokerTableState | null): string {
  const seat = state?.seats[seatIndex];
  return seat?.playerAddress ? shortAddr(seat.playerAddress) : `S${seatIndex + 1}`;
}

const CARD_RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const CARD_SUITS = ['C','D','H','S'];

function TinyCard({ idx }: { idx: number }) {
  const rank = CARD_RANKS[idx % 13];
  const suit = CARD_SUITS[Math.floor(idx / 13)];
  return (
     
    <img
      src={`/BlackJack/Cards/PNG/${rank}${suit}.png`}
      alt={`${rank}${suit}`}
      style={{ width: 16, height: 22, objectFit: 'cover', borderRadius: 2, display: 'inline-block' }}
    />
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export interface PokerActivityFeedProps {
  wsClient: BlackjackWebSocketClient | null;
  wsConnected: boolean;
  roomId: string;
  tableId: string;
  state: PokerTableState | null;
  /** When true, desktop panel is in-flow (no fixed) so it can sit in a grid column */
  embedInLayout?: boolean;
  /**
   * Increment (e.g. `n => n + 1` from parent) to open the mobile Activity drawer programmatically.
   * Used by the poker seat player radial on narrow viewports.
   */
  mobileOpenRequestSerial?: number;
}

/** Desktop fixed panel heights: expanded vs collapsed. */
const DESKTOP_ACTIVITY_HEIGHT_EXPANDED = 'min(520px, calc(100dvh - 112px))';
const DESKTOP_ACTIVITY_HEIGHT_COLLAPSED = 'min(180px, calc((100dvh - 112px) * 0.33))';
const POKER_AFK_TIMEOUTS_BEFORE_KICK = 6;

export function PokerActivityFeed({
  wsClient, wsConnected, roomId, tableId, state, embedInLayout = false,
  mobileOpenRequestSerial = 0,
}: PokerActivityFeedProps) {
  const { messages, sendMessage, connected } = useChat(roomId, { wsClient, wsConnected });

  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastMobileOpenRequestRef = useRef(0);

  useEffect(() => {
    if (mobileOpenRequestSerial <= lastMobileOpenRequestRef.current) return;
    lastMobileOpenRequestRef.current = mobileOpenRequestSerial;
    setMobileOpen(true);
  }, [mobileOpenRequestSerial]);

  const listRef = useRef<HTMLDivElement>(null);
  const seenMsgIdsRef = useRef<Set<string>>(new Set());
  const lastActionKeyRef = useRef<string | null>(null);
  const lastHandIdRef = useRef<string | null>(null);
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
  }, [roomId]);

  // ── System feed messages: welcome + periodic FactBot ─────────────────────
  useEffect(() => {
    if (!connected || !tableId || welcomeSentRef.current) return;
    welcomeSentRef.current = true;
    const sb = state?.smallBlind ? fmtWei(state.smallBlind) : '?';
    const bb = state?.bigBlind ? fmtWei(state.bigBlind) : '?';
    setEntries((prev) => [
      ...prev,
      {
        kind: 'system',
        id: `welcome-${tableId}`,
        type: 'welcome',
        text:
          'Welcome to Morbius.IO Poker on PulseChain!\\n\\n' +
          'Quick Tips:\\n' +
          `- Blinds: ${sb}/${bb}\\n` +
          '- Tap your avatar for settings and quick reactions\\n' +
          '- Use Activity chat to coordinate and banter\\n\\n' +
          'Socials:\\n' +
          '- X: https://x.com/MorbiusIO\\n' +
          '- Telegram: https://t.me/MorbiusIO',
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
  useEffect(() => {
    const la = state?.currentHand?.lastAction;
    const handId = state?.currentHand?.handId;
    if (!la || !handId) return;

    const key = `${handId}:${la.position}:${la.action}:${la.amount}`;
    if (key === lastActionKeyRef.current) return;
    lastActionKeyRef.current = key;

    setEntries((prev) => {
      const next = [...prev];

      // New hand divider (skip on very first hand)
      if (handId !== lastHandIdRef.current && lastHandIdRef.current !== null) {
        next.push({ kind: 'divider', id: `divider-${handId}`, ts: Date.now() });
      }
      lastHandIdRef.current = handId;

      const seat = state?.seats[la.position];
      next.push({
        kind: 'action',
        id: key,
        seatIndex: la.position,
        playerAddr: seat?.playerAddress ?? '',
        action: la.action,
        amount: la.amount && la.amount !== '0' ? la.amount : undefined,
        ts: Date.now(),
      });

      return next.slice(-MAX_ENTRIES);
    });
   
  }, [state?.currentHand?.lastAction, state?.currentHand?.handId]);

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
    // No handName = won by everyone else folding — don't reveal hole cards
    const isFoldWin = !winner.handName;

    setEntries((prev) => [
      ...prev,
      {
        kind: 'showdown',
        id: `showdown-${hand.handId}`,
        winnerAddr: winner.address,
        amount: winner.amount,
        handName: winner.handName,
        communityCards: isFoldWin ? undefined : [...(hand.communityCards ?? [])],
        holeCards: isFoldWin ? undefined : [...(hand.showdownHands?.[winner.address] ?? [])],
        ts: Date.now(),
      } satisfies ShowdownEntry,
    ].slice(-MAX_ENTRIES));
   
  }, [state?.currentHand?.street, state?.currentHand?.handId, state?.currentHand?.winners]);

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

  // ── Entry renderer ────────────────────────────────────────────────────────
  function renderEntry(entry: Entry) {
    if (entry.kind === 'system') {
      const isWelcome = entry.type === 'welcome';
      const isFact = entry.type === 'factbot';
      const isPlayerEvent = entry.type === 'player_event';
      return (
        <div
          key={entry.id}
          className="px-2.5 py-1 text-[10px] md:text-[11px] leading-snug whitespace-pre-line"
          style={{
            color: isWelcome
              ? 'rgba(250,204,21,0.9)'
              : isFact
                ? 'rgba(52,211,153,0.9)'
                : isPlayerEvent
                  ? 'rgba(56,189,248,0.92)'
                  : 'rgba(251,146,60,0.92)',
          }}
        >
          <span
            className="font-semibold"
            style={{
              color: isWelcome
                ? 'rgba(250,204,21,1)'
                : isFact
                  ? 'rgba(52,211,153,1)'
                  : isPlayerEvent
                    ? 'rgba(34,211,238,1)'
                    : 'rgba(251,146,60,1)',
            }}
          >
            {isWelcome ? 'Morbius: ' : isFact ? 'FactBot: ' : entry.type === 'player_event' ? 'Table: ' : 'System: '}
          </span>
          {entry.text}
        </div>
      );
    }
    if (entry.kind === 'divider') {
      return (
        <div key={entry.id} className="flex items-center gap-1 py-0.5 mx-2 select-none">
          <div className="flex-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }} />
          <span className="text-[9px] uppercase tracking-wider px-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
            New Hand
          </span>
          <div className="flex-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }} />
        </div>
      );
    }
    if (entry.kind === 'showdown') {
      const name = shortAddr(entry.winnerAddr);
      const amt = fmtWei(entry.amount);
      return (
        <div
          key={entry.id}
          className="mx-1.5 my-1 px-2 py-1.5 rounded"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
        >
          {/* Winner line */}
          <div className="flex items-center gap-1 text-[10px] md:text-[11px]">
            <span style={{ color: 'rgba(34,197,94,0.9)' }}>🏆</span>
            <span className="font-mono" style={{ color: 'rgba(255,255,255,0.7)' }}>{name}</span>
            <span style={{ color: 'rgba(34,197,94,0.9)' }}>won</span>
            {amt && <span className="font-semibold" style={{ color: 'rgba(34,197,94,0.9)' }}>{amt}</span>}
          </div>
          {/* Cards — only shown for real showdown, not fold wins */}
          {entry.communityCards && entry.communityCards.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-1">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.25)' }}>Board</span>
                <div className="flex gap-0.5">
                  {entry.communityCards.map((c, i) => <TinyCard key={i} idx={c} />)}
                </div>
              </div>
              {entry.holeCards && entry.holeCards.length >= 2 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.25)' }}>Hand</span>
                  <div className="flex gap-0.5">
                    {entry.holeCards.map((c, i) => <TinyCard key={i} idx={c} />)}
                  </div>
                  {entry.handName && (
                    <span className="text-[9px] italic" style={{ color: 'rgba(251,191,36,0.85)' }}>
                      {entry.handName}
                    </span>
                  )}
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
      const name = entry.playerAddr ? shortAddr(entry.playerAddr) : seatLabel(entry.seatIndex, state);
      const amtStr = entry.amount ? fmtWei(entry.amount) : '';
      return (
        <div key={entry.id} className="flex items-baseline gap-1 px-2.5 py-[2px] text-[10px] md:text-[11px] leading-snug">
          <span className="font-mono shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }}>{name}</span>
          <span className="shrink-0 font-medium" style={{ color }}>{label}</span>
          {amtStr && (
            <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>{amtStr}</span>
          )}
        </div>
      );
    }
    if (entry.kind === 'reaction') {
      const name = seatLabel(entry.seatIndex, state);
      return (
        <div key={entry.id} className="flex items-baseline gap-1 px-2.5 py-[2px] text-[10px] md:text-[11px] leading-snug">
          <span className="font-mono shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }}>{name}</span>
          <span style={{ color: 'rgba(255,255,255,0.75)' }}>{entry.value}</span>
        </div>
      );
    }
    // chat
    const name = entry.displayName?.trim() || shortAddr(entry.sender);
    return (
      <div key={entry.id} className="px-2.5 py-[2px] text-[10px] md:text-[11px] leading-snug">
        <span className="font-medium" style={{ color: 'rgba(34,211,238,0.8)' }}>{name}: </span>
        <span className="break-words" style={{ color: 'rgba(255,255,255,0.8)' }}>{entry.text}</span>
      </div>
    );
  }

  // ── Shared panel content ──────────────────────────────────────────────────
  const panelContent = (
    <div className="flex flex-col h-full min-h-0" style={{ fontFamily: '"Russo One", sans-serif' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-2.5 shrink-0"
        style={{
          height: 32,
          background: 'rgba(0,0,0,0.35)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Activity
        </span>
        <div className="flex items-center gap-1">
          {/* Expand/collapse — desktop only */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="hidden md:flex w-5 h-5 items-center justify-center rounded text-[10px] transition hover:bg-white/10"
            style={{ color: 'rgba(255,255,255,0.4)' }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▾' : '▴'}
          </button>
          {/* Close — mobile drawer only */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="flex md:hidden w-5 h-5 items-center justify-center rounded text-[10px] transition hover:bg-white/10"
            style={{ color: 'rgba(255,255,255,0.35)' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Feed */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto min-h-0 py-1 text-[10px] md:text-[11px] leading-snug"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}
      >
        {entries.length === 0 && (
          <div className="px-2.5 py-2" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Waiting for activity…
          </div>
        )}
        {entries.map(renderEntry)}
      </div>

      {/* Input */}
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
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded text-[10px] md:text-[11px] text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition"
          style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        />
        <button
          type="submit"
          disabled={!connected || !input.trim()}
          className="shrink-0 px-2.5 py-1.5 rounded text-[10px] md:text-[11px] font-semibold text-white transition-colors disabled:opacity-25 disabled:pointer-events-none"
          style={{ background: 'rgba(34,211,238,0.7)' }}
        >
          Send
        </button>
      </form>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  const desktopPanelStyle: CSSProperties = {
    background: 'rgba(6,8,12,0.88)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    backdropFilter: 'blur(10px)',
  };

  return (
    <>
      {/* Desktop: persistent panel — fixed bottom-left (readable height) or in-flow when embedInLayout */}
      <div
        className={
          embedInLayout
            ? 'hidden md:flex flex-col rounded-lg overflow-hidden min-h-0 w-full self-end'
            : 'hidden md:flex fixed z-30 flex-col rounded-lg overflow-hidden'
        }
        style={
          embedInLayout
            ? {
                ...desktopPanelStyle,
                height: expanded ? DESKTOP_ACTIVITY_HEIGHT_EXPANDED : DESKTOP_ACTIVITY_HEIGHT_COLLAPSED,
                maxHeight: 'calc(100dvh - 112px)',
                transition: 'height 0.25s ease',
              }
            : {
                ...desktopPanelStyle,
                width: 300,
                height: expanded ? DESKTOP_ACTIVITY_HEIGHT_EXPANDED : DESKTOP_ACTIVITY_HEIGHT_COLLAPSED,
                transition: 'height 0.25s ease',
                left: 'max(12px, env(safe-area-inset-left, 0px))',
                bottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
              }
        }
      >
        {panelContent}
      </div>

      {/* Mobile: left-edge tab + slide-in drawer */}
      <div className="md:hidden">
        {/* Tab button */}
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

        {/* Backdrop */}
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

        {/* Side drawer */}
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
              {panelContent}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
