'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { formatEther } from 'viem';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { motion, AnimatePresence } from 'framer-motion';
import { useChat } from '@/hooks/use-chat';
import type { BlackjackWebSocketClient, PokerTableState } from '@/lib/websocket-client';

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
type Entry = ChatEntry | ActionEntry | ReactionEntry | DividerEntry | ShowdownEntry;

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

function fmtWei(wei: string | number): string {
  try {
    const n = Number(formatEther(toBigIntSafe(wei)));
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return Number.isInteger(n) ? n.toString() : n.toFixed(2);
  } catch { return ''; }
}

function seatLabel(seatIndex: number, state: PokerTableState | null): string {
  const seat = state?.seats[seatIndex];
  return seat?.playerAddress ? shortAddr(seat.playerAddress) : `S${seatIndex + 1}`;
}

const CARD_RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const CARD_SUITS = ['H','D','C','S'];

function TinyCard({ idx }: { idx: number }) {
  const rank = CARD_RANKS[idx % 13];
  const suit = CARD_SUITS[Math.floor(idx / 13)];
  return (
    // eslint-disable-next-line @next/next/no-img-element
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
  /** Extra bottom offset (px) for the fixed desktop panel — use when a bottom bar is in the layout */
  bottomOffset?: number;
  /**
   * Increment (e.g. `n => n + 1` from parent) to open the mobile Activity drawer programmatically.
   * Used by the poker seat player radial on narrow viewports.
   */
  mobileOpenRequestSerial?: number;
}

export function PokerActivityFeed({
  wsClient, wsConnected, roomId, tableId, state, embedInLayout = false, bottomOffset = 0,
  mobileOpenRequestSerial = 0,
}: PokerActivityFeedProps) {
  const { messages, sendMessage, connected } = useChat(roomId, { wsClient, wsConnected });

  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [collapsed, setCollapsed] = useState(false);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.currentHand?.street, state?.currentHand?.handId, state?.currentHand?.winners]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (listRef.current && !collapsed) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, collapsed]);

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
          <div className="flex items-center gap-1 text-[11px]">
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
                    <span className="text-[10px] italic" style={{ color: 'rgba(251,191,36,0.85)' }}>
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
        <div key={entry.id} className="flex items-baseline gap-1 px-2.5 py-[2px] text-[11px] leading-snug">
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
        <div key={entry.id} className="flex items-baseline gap-1 px-2.5 py-[2px] text-[11px] leading-snug">
          <span className="font-mono shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }}>{name}</span>
          <span style={{ color: 'rgba(255,255,255,0.75)' }}>{entry.value}</span>
        </div>
      );
    }
    // chat
    const name = entry.displayName?.trim() || shortAddr(entry.sender);
    return (
      <div key={entry.id} className="px-2.5 py-[2px] text-[11px] leading-snug">
        <span className="font-medium" style={{ color: 'rgba(34,211,238,0.8)' }}>{name}: </span>
        <span className="break-words" style={{ color: 'rgba(255,255,255,0.8)' }}>{entry.text}</span>
      </div>
    );
  }

  // ── Shared panel content ──────────────────────────────────────────────────
  const panelContent = (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div
        className="flex items-center justify-between px-2.5 shrink-0"
        style={{
          height: 32,
          background: 'rgba(0,0,0,0.35)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Activity
        </span>
        <div className="flex items-center gap-1">
          {/* Collapse toggle — desktop only */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden md:flex w-5 h-5 items-center justify-center rounded text-[10px] transition hover:bg-white/10"
            style={{ color: 'rgba(255,255,255,0.35)' }}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▲' : '▼'}
          </button>
          {/* Close — mobile drawer only */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="flex md:hidden w-5 h-5 items-center justify-center rounded text-[11px] transition hover:bg-white/10"
            style={{ color: 'rgba(255,255,255,0.35)' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Feed */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto min-h-0 py-1"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}
          >
            {entries.length === 0 && (
              <div className="px-2.5 py-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
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
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded text-[12px] text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition"
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            />
            <button
              type="submit"
              disabled={!connected || !input.trim()}
              className="shrink-0 px-2.5 py-1.5 rounded text-[12px] font-semibold text-white transition-colors disabled:opacity-25 disabled:pointer-events-none"
              style={{ background: 'rgba(34,211,238,0.7)' }}
            >
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  const desktopPanelStyle = {
    background: 'rgba(6,8,12,0.88)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    backdropFilter: 'blur(10px)',
    transition: 'height 0.2s ease',
  };

  return (
    <>
      {/* Desktop: persistent panel — fixed (legacy) or in-flow when embedInLayout */}
      <div
        className={
          embedInLayout
            ? 'hidden md:flex flex-col rounded-lg overflow-hidden h-full min-h-0 w-full'
            : 'hidden md:flex fixed left-4 z-30 flex-col rounded-lg overflow-hidden'
        }
        style={
          embedInLayout
            ? { ...desktopPanelStyle, height: collapsed ? 32 : '100%' }
            : { ...desktopPanelStyle, width: 272, height: collapsed ? 32 : 320, bottom: `${16 + bottomOffset}px` }
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
