'use client';

import { useState, useRef, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useChat } from '@/hooks/use-chat';
import { useDisplayNameGate } from '@/hooks/use-display-name-gate';
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal';
import type { BlackjackWebSocketClient, ChatMessagePayload } from '@/lib/websocket-client';

/** Recessed message list / emoji tray (nested strip inside main-nav-style shell) */
const CHAT_INSET_STYLE: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.22)',
  boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.55)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
};

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
  /** When true, message list uses flex-1 to fill available height instead of a max-h cap. Use when embedded in a fixed-height container. */
  fillHeight?: boolean;
  /** Extra content rendered on the right side of the panel header (e.g. a close button). */
  headerActions?: React.ReactNode;
  /** Compact mode: single-line input + send on one row, normal font, minimal chrome (e.g. table chat). */
  compact?: boolean;
  /** When true, no outer gradient/border (parent e.g. ChatSidebar drawer already provides chrome). */
  bareShell?: boolean;
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
  fillHeight = false,
  headerActions,
  compact = false,
  bareShell = false,
}: ChatPanelProps) {
  const { messages, sendMessage, connected, error, setDisplayName, loadMore, loadingMore, chatPaused } = useChat(roomId, { wsClient, wsConnected });
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [profileModalAddress, setProfileModalAddress] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastReadCountRef = useRef(0);
  const lastReadWhenSheetOpenRef = useRef(0);
  const lastMessageIdRef = useRef<string | null>(null);
  const { address: walletAddress } = useAccount();
  const { gate: displayNameGate, openPrompt: openDisplayNamePrompt, prompt: displayNamePrompt } = useDisplayNameGate(setDisplayName);

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

  const trySend = () => {
    const trimmed = input.trim();
    if (!trimmed || !connected || chatPaused) return;
    const flush = () => {
      sendMessage(trimmed);
      setInput('');
    };
    if (displayNameGate(flush)) return;
    flush();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    trySend();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    if (compact) {
      e.preventDefault();
      trySend();
    } else if (!e.shiftKey) {
      e.preventDefault();
      trySend();
    }
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

  const messageListMaxHeight = fillHeight ? 'flex-1' : collapsible ? 'max-h-[150px]' : 'max-h-[28rem]';
  const listStyle = compact ? { background: 'rgba(22, 24, 30, 0.96)' } : CHAT_INSET_STYLE;
  const panelContent = (
    <>
      <div className={`relative flex-1 flex flex-col ${fillHeight ? 'min-h-0' : 'min-h-[120px]'} ${messageListMaxHeight}`}>
        <div
          ref={listRef}
          onScroll={handleListScroll}
          className={`flex-1 overflow-y-auto rounded-none font-sans ${compact ? 'px-2 py-1.5 space-y-1' : 'p-2 space-y-2'}`}
          style={listStyle}
        >
          {connected && messages.length > 0 && !compact && (
            <div className="flex justify-center py-1">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs disabled:opacity-50 px-2 py-1 rounded-lg border border-white/15 text-white/70 hover:bg-white/5 hover:text-white transition-colors"
              >
                {loadingMore ? 'Loading…' : 'Load older messages'}
              </button>
            </div>
          )}
          {chatPaused && (
            <div className="text-amber-200/90 text-xs p-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-center font-sans">
              Chat is temporarily paused
            </div>
          )}
          {error && (
            <div className="text-amber-200/90 text-xs p-2 rounded-lg bg-amber-500/10 border border-amber-500/25 font-sans">
              {error}
            </div>
          )}
          {!connected && !error && (
            <div className="text-white/50 text-xs p-2 font-sans">Connecting…</div>
          )}
          {connected && messages.length === 0 && (
            <div className="text-white/50 text-xs p-2 font-sans">No messages yet. Say hi!</div>
          )}
          {messages.map((msg) => {
            if (compact) {
              return (
                <div key={msg.id} className="text-left flex gap-1.5 items-baseline font-sans">
                  <span className="text-[11px] text-white/55 shrink-0" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>{senderLabel(msg)}:</span>
                  <span className="text-[13px] text-white break-words min-w-0" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>{msg.text}</span>
                </div>
              );
            }
            return (
              <div key={msg.id} className="text-left flex gap-2.5 font-sans">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {msg.senderAddress ? (
                      <button
                        type="button"
                        onClick={() => setProfileModalAddress(msg.senderAddress!)}
                        className="font-jost text-cyan-400 text-xs font-medium shrink-0 hover:text-cyan-300 cursor-pointer transition-colors"
                      >
                        {senderLabel(msg)}
                      </button>
                    ) : (
                      <span className="font-jost text-cyan-400 text-xs font-medium shrink-0">
                        {senderLabel(msg)}
                      </span>
                    )}
                    <span
                      className="text-white/45 text-[10px] shrink-0 tabular-nums"
                      title={formatTime(msg.timestamp)}
                    >
                      {formatRelative(msg.timestamp)}
                    </span>
                  </div>
                  <p className="text-white text-sm break-words pl-0 mt-0.5 leading-relaxed" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>{msg.text}</p>
                </div>
              </div>
            );
          })}
        </div>
        {showScrollToBottom && !compact && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-cyan-600 to-cyan-700 text-white border border-cyan-500/40 shadow-lg shadow-cyan-900/40 hover:from-cyan-500 hover:to-cyan-600 transition-colors"
          >
            Scroll to bottom
          </button>
        )}
      </div>
      <form
        onSubmit={handleSubmit}
        className={`font-sans flex-shrink-0 border-t border-white/10 text-white ${compact ? 'p-2 flex items-end gap-2' : 'p-2 flex flex-col gap-2'}`}
      >
        {!compact && showEmojiPicker && (
          <div
            className="flex flex-wrap gap-1 p-2 rounded-lg border border-white/10 max-h-24 overflow-y-auto"
            style={CHAT_INSET_STYLE}
          >
            {EMOJI_LIST.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/10 text-lg leading-none transition text-white"
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <div className={compact ? 'flex-1 min-w-0 flex items-center' : 'w-full relative'}>
          {compact ? (
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, CHAT_MESSAGE_MAX_LENGTH))}
              onKeyDown={handleKeyDown}
              placeholder={chatPaused ? 'Chat paused' : connected ? 'Message…' : 'Connect to chat'}
              disabled={!connected || chatPaused}
              maxLength={CHAT_MESSAGE_MAX_LENGTH}
              rows={1}
              className="w-full min-w-0 h-11 py-2.5 px-3 rounded-full border border-white/20 bg-white/10 text-[15px] text-white placeholder:text-white/45 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 resize-none overflow-hidden font-sans"
              aria-label="Message"
            />
          ) : (
            <>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, CHAT_MESSAGE_MAX_LENGTH))}
                onKeyDown={handleKeyDown}
                placeholder={chatPaused ? 'Chat is paused' : connected ? 'Type a message…' : 'Connect to chat'}
                disabled={!connected || chatPaused}
                maxLength={CHAT_MESSAGE_MAX_LENGTH}
                rows={4}
                className="w-full resize-none py-2 pr-14 text-sm rounded-lg border border-white/20 bg-white/10 text-white placeholder:text-white/45 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              />
              <span className="absolute right-2 bottom-2 text-[10px] tabular-nums pointer-events-none text-white/45">
                {input.length}/{CHAT_MESSAGE_MAX_LENGTH}
              </span>
            </>
          )}
        </div>
        <div className={`flex gap-2 items-center ${compact ? 'shrink-0' : ''}`}>
          {!compact && (
            <button
              type="button"
              onClick={() => setShowEmojiPicker((v) => !v)}
              className="w-9 h-9 flex-shrink-0 rounded-lg text-lg flex items-center justify-center transition border border-white/15 bg-white/5 text-white hover:bg-white/10"
              title="Insert emoji"
              aria-label="Insert emoji"
            >
              😀
            </button>
          )}
          <button
            type="submit"
            disabled={!connected || chatPaused || !input.trim()}
            className={compact
              ? 'min-w-[52px] min-h-[44px] h-11 px-4 rounded-full bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 disabled:pointer-events-none text-white font-medium text-[15px] flex items-center justify-center transition-colors touch-manipulation'
              : 'px-4 py-2 rounded-lg text-sm font-medium shrink-0 ml-auto bg-gradient-to-r from-cyan-600 to-cyan-700 text-white border border-cyan-500/40 hover:from-cyan-500 hover:to-cyan-600 disabled:opacity-40 disabled:pointer-events-none shadow-md shadow-cyan-900/25 transition-colors'}
            aria-label="Send"
          >
            Send
          </button>
        </div>
      </form>
    </>
  );

  const shell = (
    <div
      className={`flex flex-col overflow-hidden h-full font-sans ${
        compact || bareShell
          ? 'min-h-0 border-0 shadow-none rounded-none bg-transparent'
          : `surface-panel-sidebar font-poppins rounded-xl min-h-[320px] ${fillHeight ? 'min-h-0' : ''}`
      } ${className}`}
    >
      {(!compact || title) && (
        <div className={`flex flex-col gap-1 px-3 py-2 border-b border-white/10 text-white ${compact ? 'py-1.5' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-white font-semibold text-sm tracking-tight truncate">{title}</span>
            <div className="flex items-center gap-2 shrink-0">
              {!compact && walletAddress && connected && (
                <button
                  type="button"
                  onClick={openDisplayNamePrompt}
                  className="text-xs shrink-0 text-cyan-400/90 hover:text-cyan-300 transition-colors"
                >
                  Set display name
                </button>
              )}
              {headerActions}
            </div>
          </div>
          {walletAddress && connected && displayNamePrompt}
        </div>
      )}
      {panelContent}
    </div>
  );

  const profileModal = (
    <PlayerProfileModal
      isOpen={!!profileModalAddress}
      onClose={() => setProfileModalAddress(null)}
      address={profileModalAddress}
      game="all"
      modalZIndex="z-[10060]"
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
                className="absolute -top-1 -right-1 z-10 w-9 h-9 rounded-lg flex items-center justify-center border border-white/15 bg-white/5 text-white hover:bg-white/10 transition-colors"
                aria-label="Close chat"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {shell}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="surface-panel-sidebar w-full rounded-xl py-3 px-4 text-left flex items-center gap-2 font-semibold text-sm transition text-white hover:bg-white/5 relative"
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
        {profileModal}
      </>
    );
  }

  return (
    <>
      <div className={className}>{shell}</div>
      {profileModal}
    </>
  );
}
