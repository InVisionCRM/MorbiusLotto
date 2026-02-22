'use client';

import { useState, useRef, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useChat } from '@/hooks/use-chat';
import { PlayerStatsModal } from './PlayerStatsModal';
import { SelfExclusionModal, useSessionDuration } from '@/components/ResponsibleGaming';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { ChatMessagePayload } from '@/lib/websocket-client';

const CHAT_MESSAGE_MAX_LENGTH = 150;

const EMOJI_LIST = [
  '😀', '😂', '🤣','👍', '👎', '👏','👋', '💪',
  '❤️', '💯', '🔥','🎉', '👀', '🤔', '😎', '🥳', '🙃',
];

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (sec < 10) return 'Just now';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24 && d.toDateString() === now.toDateString()) return `${hr}h ago`;
    if (hr < 48 && d.getDate() === now.getDate() - 1) return 'Yesterday';
    if (hr < 168) return `${Math.floor(hr / 24)}d ago`;
    return formatTime(iso);
  } catch {
    return '';
  }
}

function senderLabel(msg: ChatMessagePayload): string {
  if (msg.displayName?.trim()) return msg.displayName.trim();
  if (msg.senderAddress) {
    return `${msg.senderAddress.slice(0, 6)}…${msg.senderAddress.slice(-4)}`;
  }
  return 'Anonymous';
}

export interface ChatPanelProps {
  /** Chat room: 'main' (home), 'blackjack', 'plinko', 'keno', etc. */
  roomId: string;
  /** Optional title above the chat (e.g. "Lobby" or "Blackjack Chat") */
  title?: string;
  /** Optional existing WebSocket client (e.g. from Blackjack page). If not provided, a chat-only connection is created. */
  wsClient?: BlackjackWebSocketClient | null;
  /** When using wsClient, pass true when the client is connected so chat can join the room. */
  wsConnected?: boolean;
  /** Collapsible: show as floating panel with toggle. Default true on home, can be false when embedded in game. */
  collapsible?: boolean;
  /** Optional class for the container (e.g. position/size overrides) */
  className?: string;
  /** When used inside GlobalChat Sheet: true when the sheet is open. Used to report unseen messages. */
  sheetOpen?: boolean;
  /** Called when unseen message state changes (e.g. for showing a dot on the collapsed chat trigger). */
  onUnreadChange?: (hasUnread: boolean) => void;
}

export function ChatPanel({
  roomId,
  title = 'Chat',
  wsClient,
  wsConnected,
  collapsible = true,
  className = '',
  sheetOpen,
  onUnreadChange,
}: ChatPanelProps) {
  const { messages, sendMessage, connected, error, setDisplayName, loadMore, loadingMore, chatPaused } = useChat(roomId, { wsClient, wsConnected });
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{ address: string; displayName?: string | null } | null>(null);
  const [showResponsibleGaming, setShowResponsibleGaming] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastReadCountRef = useRef(0);
  const lastReadWhenSheetOpenRef = useRef(0);
  const lastMessageIdRef = useRef<string | null>(null);
  const { address: walletAddress } = useAccount();
  const { minutes: sessionMinutes } = useSessionDuration();

  // Unread: when panel is open, mark all as read; when closed and messages grow, increment unread (skip initial load)
  useEffect(() => {
    if (open) {
      lastReadCountRef.current = messages.length;
      setUnreadCount(0);
    } else if (messages.length > lastReadCountRef.current) {
      if (lastReadCountRef.current === 0 && messages.length > 0) {
        lastReadCountRef.current = messages.length;
      } else {
        setUnreadCount(messages.length - lastReadCountRef.current);
      }
    }
  }, [open, messages.length]);

  // Report unseen messages to parent (e.g. GlobalChat) when sheet is closed
  useEffect(() => {
    if (onUnreadChange == null) return;
    if (sheetOpen === true) {
      lastReadWhenSheetOpenRef.current = messages.length;
      onUnreadChange(false);
    } else if (sheetOpen === false) {
      const hasUnread = messages.length > lastReadWhenSheetOpenRef.current;
      onUnreadChange(hasUnread);
    }
  }, [sheetOpen, messages.length, onUnreadChange]);

  // Auto-scroll to bottom only when the latest message changed (new message at end), not when loading more
  useEffect(() => {
    const lastId = messages.length ? messages[messages.length - 1]?.id ?? null : null;
    if (lastId && lastId !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastId;
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }
  }, [messages]);

  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const threshold = 60;
    setShowScrollToBottom(el.scrollHeight - el.scrollTop - el.clientHeight > threshold);
  };

  const scrollToBottom = () => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
      setShowScrollToBottom(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !connected || chatPaused) return;
    sendMessage(trimmed);
    setInput('');
  };

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    if (el) {
      const start = el.selectionStart ?? input.length;
      const end = el.selectionEnd ?? input.length;
      const before = input.slice(0, start);
      const after = input.slice(end);
      const next = (before + emoji + after).slice(0, CHAT_MESSAGE_MAX_LENGTH);
      setInput(next);
      requestAnimationFrame(() => {
        if (!el.isConnected) return;
        const newPos = Math.min(start + emoji.length, next.length);
        el.setSelectionRange(newPos, newPos);
        el.focus();
      });
    } else {
      setInput((prev) => (prev + emoji).slice(0, CHAT_MESSAGE_MAX_LENGTH));
    }
  };

  const handleSaveDisplayName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed.length < 3 || trimmed.length > 32 || !setDisplayName || nameSaving) return;
    setNameSaving(true);
    try {
      await setDisplayName(trimmed);
      setShowNameInput(false);
      setNameInput('');
    } catch {
      // Error already surfaced by useChat/sendRequest
    } finally {
      setNameSaving(false);
    }
  };

  const messageListMaxHeight = collapsible ? 'max-h-[150px]' : 'max-h-[28rem]'; // ~10 messages when embedded
  const panelContent = (
    <>
      <div className={`relative flex-1 min-h-[120px] flex flex-col ${messageListMaxHeight}`}>
        <div
          ref={listRef}
          onScroll={handleListScroll}
          className="flex-1 overflow-y-auto p-2 space-y-2"
          style={{
            background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
            boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1)',
          }}
        >
          {connected && messages.length > 0 && (
            <div className="flex justify-center py-1">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs text-cyan-300/80 hover:text-cyan-300 disabled:opacity-50 px-2 py-1 rounded border border-cyan-500/30"
              >
                {loadingMore ? 'Loading…' : 'Load older messages'}
              </button>
            </div>
          )}
          {chatPaused && (
            <div className="text-amber-400/90 text-xs p-2 rounded bg-amber-500/10 text-center">
              Chat is temporarily paused
            </div>
          )}
          {error && (
            <div className="text-amber-400/90 text-xs p-2 rounded bg-amber-500/10">
              {error}
            </div>
          )}
          {!connected && !error && (
            <div className="text-white/50 text-xs p-2">Connecting…</div>
          )}
          {connected && messages.length === 0 && (
            <div className="text-white/50 text-xs p-2">No messages yet. Say hi!</div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className="text-left">
              <div className="flex items-baseline gap-2 flex-wrap">
                {msg.senderAddress ? (
                  <button
                    type="button"
                    onClick={() => setSelectedPlayer({ address: msg.senderAddress!, displayName: msg.displayName })}
                    className="text-cyan-300/90 text-xs font-medium shrink-0 hover:text-cyan-200 hover:underline cursor-pointer transition-colors"
                  >
                    {senderLabel(msg)}
                  </button>
                ) : (
                  <span className="text-cyan-300/90 text-xs font-medium shrink-0">
                    {senderLabel(msg)}
                  </span>
                )}
                <span
                  className="text-white/40 text-[10px] shrink-0"
                  title={formatTime(msg.timestamp)}
                >
                  {formatRelative(msg.timestamp)}
                </span>
              </div>
              <p className="text-white/90 text-sm break-words pl-0 mt-0.5">{msg.text}</p>
            </div>
          ))}
        </div>
        {showScrollToBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-600/90 hover:bg-cyan-500/90 text-white border border-cyan-400/50 shadow-lg"
          >
            Scroll to bottom
          </button>
        )}
      </div>
      <form onSubmit={handleSubmit} className="p-2 border-t border-white/10 flex flex-col gap-1">
        {showEmojiPicker && (
          <div
            className="flex flex-wrap gap-1 p-2 rounded-lg border border-cyan-500/30 bg-black/40 max-h-24 overflow-y-auto"
            style={{
              background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
              boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.5)',
            }}
          >
            {EMOJI_LIST.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-cyan-500/20 text-lg leading-none transition"
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => setShowEmojiPicker((v) => !v)}
            className="w-9 h-9 flex-shrink-0 rounded-lg border border-cyan-500/30 bg-black/30 hover:bg-cyan-500/20 text-lg flex items-center justify-center transition"
            title="Insert emoji"
            aria-label="Insert emoji"
          >
            😀
          </button>
          <div className="flex-1 min-w-0 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, CHAT_MESSAGE_MAX_LENGTH))}
              placeholder={chatPaused ? 'Chat is paused' : connected ? 'Type a message…' : 'Connect to chat'}
              disabled={!connected || chatPaused}
              maxLength={CHAT_MESSAGE_MAX_LENGTH}
              className="w-full rounded-lg px-3 py-2 pr-12 text-sm bg-black/30 text-white placeholder-white/40 border border-cyan-500/30 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/40 tabular-nums pointer-events-none">
              {input.length}/{CHAT_MESSAGE_MAX_LENGTH}
            </span>
          </div>
          <button
            type="submit"
            disabled={!connected || chatPaused || !input.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:pointer-events-none text-white transition shrink-0"
          >
            Send
          </button>
        </div>
      </form>
    </>
  );

  const shell = (
    <div
      className={`flex flex-col rounded-2xl overflow-hidden border border-cyan-500/30 shadow-xl h-full min-h-[320px] ${className}`}
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
        border: '1px inset rgba(60, 60, 60, 0.5)',
      }}
    >
      <div
        className="flex flex-col gap-1 px-3 py-2 border-b border-white/10"
        style={{ background: 'linear-gradient(to right, rgba(34, 211, 238, 0.15), transparent)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-cyan-300 font-semibold text-sm">{title}</span>
          <div className="flex items-center gap-2">
            {walletAddress && sessionMinutes > 0 && (
              <span
                className="text-white/40 text-[10px] tabular-nums"
                title={`Session: ${Math.floor(sessionMinutes / 60)}h ${sessionMinutes % 60}m`}
              >
                {sessionMinutes >= 60
                  ? `${Math.floor(sessionMinutes / 60)}h${sessionMinutes % 60 > 0 ? ` ${sessionMinutes % 60}m` : ''}`
                  : `${sessionMinutes}m`
                }
              </span>
            )}
            {walletAddress && (
              <button
                type="button"
                onClick={() => setShowResponsibleGaming(true)}
                className="w-6 h-6 rounded-full bg-amber-500/20 hover:bg-amber-500/30 flex items-center justify-center transition"
                title="Responsible Gaming"
              >
                <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </button>
            )}
            {connected ? (
              <span className="text-emerald-400/80 text-xs">● Live</span>
            ) : (
              <span className="text-white/40 text-xs">Offline</span>
            )}
          </div>
        </div>
        {walletAddress && connected && (
          showNameInput ? (
            <div className="flex gap-2 items-center mt-1">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Display name (3–32 chars)"
                maxLength={32}
                className="flex-1 min-w-0 rounded px-2 py-1 text-xs bg-black/30 text-white placeholder-white/40 border border-cyan-500/30 focus:border-cyan-400/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveDisplayName}
                disabled={nameInput.trim().length < 3 || nameSaving}
                className="px-2 py-1 rounded text-xs font-medium bg-cyan-600/80 hover:bg-cyan-500/80 disabled:opacity-50 text-white shrink-0"
              >
                {nameSaving ? '…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setShowNameInput(false); setNameInput(''); }}
                className="px-2 py-1 rounded text-xs text-white/70 hover:text-white shrink-0"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNameInput(true)}
              className="text-left text-xs text-cyan-300/80 hover:text-cyan-300 mt-0.5"
            >
              Set display name
            </button>
          )
        )}
      </div>
      {panelContent}
    </div>
  );

  const statsModal = selectedPlayer && (
    <PlayerStatsModal
      address={selectedPlayer.address}
      displayName={selectedPlayer.displayName}
      onClose={() => setSelectedPlayer(null)}
    />
  );

  const responsibleGamingModal = (
    <SelfExclusionModal
      isOpen={showResponsibleGaming}
      onClose={() => setShowResponsibleGaming(false)}
    />
  );

  if (collapsible) {
    return (
      <>
        <div
          className={`fixed right-0 top-1/4 z-[100] w-[320px] sm:w-[360px] ${className}`}
          aria-label="Community chat"
        >
          {open ? (
            <div className="relative flex flex-col" style={{ height: '75vh' }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute -top-1 -right-1 z-10 w-7 h-7 rounded-full bg-slate-800 border border-cyan-500/30 text-white/70 hover:text-white flex items-center justify-center"
                aria-label="Close chat"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {shell}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="w-full rounded-2xl py-3 px-4 text-left flex items-center gap-2 border-2 border-cyan-400/60 text-cyan-300 font-semibold text-sm transition hover:bg-cyan-500/20 hover:border-cyan-400/80 shadow-lg relative"
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.9))',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), 0 0 20px rgba(34, 211, 238, 0.15)',
              }}
              aria-label={`Open ${title}${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {title}
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-500 text-white text-xs font-bold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          )}
        </div>
        {statsModal}
        {responsibleGamingModal}
      </>
    );
  }

  return (
    <>
      <div className={className}>{shell}</div>
      {statsModal}
      {responsibleGamingModal}
    </>
  );
}
