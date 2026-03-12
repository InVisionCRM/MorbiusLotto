'use client';

import { useState, useRef, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useChat } from '@/hooks/use-chat';
import { Theme } from '@/lib/theme';
import { useProfileSettingsModal } from '@/components/shared/ProfileSettingsModalContext';
import { PlayerStatsModal } from './PlayerStatsModal';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { ChatMessagePayload } from '@/lib/websocket-client';

/** LightModal panel + Theme.inset offset shadows */
const LIGHT_SHELL_STYLE: React.CSSProperties = {
  background: 'white',
  boxShadow: Theme.inset.boxShadow,
  border: Theme.inset.border,
};

/** Inner recessed area (message list, emoji picker) */
const LIGHT_INSET_STYLE: React.CSSProperties = {
  background: 'rgb(249 250 251)', /* gray-50 */
  boxShadow: Theme.inset.light.boxShadow,
  border: Theme.inset.light.border,
};

const CHAT_MESSAGE_MAX_LENGTH = 150;

const EMOJI_LIST = [
  '😀', '😂', '🤣','👍', '👎', '👏','👋', '💪',
  '❤️', '💯', '🔥','🎉', '👀', '🤔', '😎', '🥳', '🙃',
];

/** 25 cross-color gradient placeholders (pink+yellow, red+blue, cyan+pink, etc.); same user always gets same gradient */
const AVATAR_GRADIENTS: string[] = [
  'linear-gradient(135deg, #ec4899 0%, #eab308 100%)',   /* pink & yellow */
  'linear-gradient(135deg, #ef4444 0%, #3b82f6 100%)',   /* red & blue */
  'linear-gradient(135deg, #ef4444 0%, #eab308 100%)',    /* red & yellow */
  'linear-gradient(135deg, #06b6d4 0%, #000000 100%)',    /* cyan & black */
  'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)',   /* cyan & pink */
  'linear-gradient(135deg, #8b5cf6 0%, #f97316 100%)',    /* violet & orange */
  'linear-gradient(135deg, #22c55e 0%, #6366f1 100%)',    /* green & indigo */
  'linear-gradient(135deg, #f59e0b 0%, #ec4899 100%)',    /* amber & pink */
  'linear-gradient(135deg, #14b8a6 0%, #dc2626 100%)',    /* teal & red */
  'linear-gradient(135deg, #a855f7 0%, #22d3ee 100%)',    /* purple & cyan */
  'linear-gradient(135deg, #fbbf24 0%, #7c3aed 100%)',    /* yellow & violet */
  'linear-gradient(135deg, #06b6d4 0%, #f43f5e 100%)',    /* cyan & rose */
  'linear-gradient(135deg, #3b82f6 0%, #f97316 100%)',    /* blue & orange */
  'linear-gradient(135deg, #84cc16 0%, #ec4899 100%)',   /* lime & pink */
  'linear-gradient(135deg, #ef4444 0%, #8b5cf6 100%)',   /* red & purple */
  'linear-gradient(135deg, #22d3ee 0%, #f59e0b 100%)',    /* cyan & amber */
  'linear-gradient(135deg, #ec4899 0%, #3b82f6 100%)',    /* pink & blue */
  'linear-gradient(135deg, #eab308 0%, #14b8a6 100%)',    /* yellow & teal */
  'linear-gradient(135deg, #f97316 0%, #6366f1 100%)',    /* orange & indigo */
  'linear-gradient(135deg, #dc2626 0%, #22c55e 100%)',    /* red & green */
  'linear-gradient(135deg, #a855f7 0%, #fbbf24 100%)',    /* purple & yellow */
  'linear-gradient(135deg, #06b6d4 0%, #ef4444 100%)',    /* cyan & red */
  'linear-gradient(135deg, #4ade80 0%, #f43f5e 100%)',    /* green & rose */
  'linear-gradient(135deg, #f59e0b 0%, #6366f1 100%)',    /* amber & indigo */
  'linear-gradient(135deg, #ec4899 0%, #14b8a6 100%)',    /* pink & teal */
  'linear-gradient(135deg, #000000 0%, #eab308 100%)',     /* black & yellow */
];

function avatarGradientIndex(msg: ChatMessagePayload): number {
  const id = msg.senderAddress ?? msg.displayName?.trim() ?? 'anon';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % AVATAR_GRADIENTS.length;
}

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

function senderInitials(msg: ChatMessagePayload): string {
  const label = senderLabel(msg);
  if (msg.displayName?.trim()) {
    const parts = msg.displayName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
    return label.slice(0, 2).toUpperCase();
  }
  return label.slice(0, 2).toUpperCase();
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
}: ChatPanelProps) {
  const { messages, sendMessage, connected, error, setDisplayName, getProfile, loadMore, loadingMore, chatPaused } = useChat(roomId, { wsClient, wsConnected });
  const { openProfileSettings } = useProfileSettingsModal();
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{ address: string; displayName?: string | null } | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastReadCountRef = useRef(0);
  const lastReadWhenSheetOpenRef = useRef(0);
  const lastMessageIdRef = useRef<string | null>(null);
  const { address: walletAddress } = useAccount();

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    if (compact) {
      e.preventDefault();
      const trimmed = input.trim();
      if (trimmed && connected && !chatPaused) {
        sendMessage(trimmed);
        setInput('');
      }
    } else {
      if (!e.shiftKey) {
        e.preventDefault();
        const trimmed = input.trim();
        if (trimmed && connected && !chatPaused) {
          sendMessage(trimmed);
          setInput('');
        }
      }
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

  const lm = Theme.lightModal;
  const messageListMaxHeight = fillHeight ? 'flex-1' : collapsible ? 'max-h-[150px]' : 'max-h-[28rem]';
  const listStyle = compact ? { background: 'rgba(248,250,252,0.98)' } : LIGHT_INSET_STYLE;
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
                className={`text-xs disabled:opacity-50 px-2 py-1 rounded-xl border border-gray-200 ${lm.mutedText} hover:bg-gray-100 hover:text-gray-900`}
              >
                {loadingMore ? 'Loading…' : 'Load older messages'}
              </button>
            </div>
          )}
          {chatPaused && (
            <div className="text-amber-700 text-xs p-2 rounded-lg bg-amber-50 border border-amber-200 text-center font-sans">
              Chat is temporarily paused
            </div>
          )}
          {error && (
            <div className="text-amber-700 text-xs p-2 rounded-lg bg-amber-50 border border-amber-200 font-sans">
              {error}
            </div>
          )}
          {!connected && !error && (
            <div className={`${lm.mutedText} text-xs p-2 font-sans`}>Connecting…</div>
          )}
          {connected && messages.length === 0 && (
            <div className={`${lm.mutedText} text-xs p-2 font-sans`}>No messages yet. Say hi!</div>
          )}
          {messages.map((msg) => {
            const isOwnMessage = !!walletAddress && msg.senderAddress?.toLowerCase() === walletAddress.toLowerCase();
            const avatarStyle = {
              background: AVATAR_GRADIENTS[avatarGradientIndex(msg)],
              textShadow: '0 0 1px rgba(0,0,0,0.4)',
            };
            if (compact) {
              return (
                <div key={msg.id} className="text-left flex gap-1.5 items-baseline font-sans">
                  <span className="text-[11px] text-gray-500 shrink-0">{senderLabel(msg)}:</span>
                  <span className="text-[13px] text-gray-900 break-words min-w-0">{msg.text}</span>
                </div>
              );
            }
            return (
            <div key={msg.id} className="text-left flex gap-2 font-sans">
              {isOwnMessage ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const p = await getProfile();
                      openProfileSettings({
                        displayName: p.displayName ?? '',
                        profileImageUrl: p.profileImageUrl,
                        onSave: async (name, img) => {
                          await setDisplayName(name, img);
                        },
                      });
                    } catch {
                      // Not connected or no client
                    }
                  }}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 text-white cursor-pointer hover:ring-2 hover:ring-cyan-500/50 transition-shadow"
                  style={avatarStyle}
                  title="Profile settings"
                  aria-label="Open profile settings"
                >
                  {senderInitials(msg)}
                </button>
              ) : (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 text-white"
                  style={avatarStyle}
                  aria-hidden
                >
                  {senderInitials(msg)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  {msg.senderAddress ? (
                    <button
                      type="button"
                      onClick={() => setSelectedPlayer({ address: msg.senderAddress!, displayName: msg.displayName })}
                      className={`font-jost ${lm.accentText} text-xs font-medium shrink-0 hover:text-cyan-600 cursor-pointer transition-colors`}
                    >
                      {senderLabel(msg)}
                    </button>
                  ) : (
                    <span className={`font-jost ${lm.accentText} text-xs font-medium shrink-0`}>
                      {senderLabel(msg)}
                    </span>
                  )}
                  <span
                    className={`${lm.mutedText} text-[10px] shrink-0`}
                    title={formatTime(msg.timestamp)}
                  >
                    {formatRelative(msg.timestamp)}
                  </span>
                </div>
                <p className={`${lm.bodyText} text-sm break-words pl-0 mt-0.5`}>{msg.text}</p>
              </div>
            </div>
            );
          })}
        </div>
        {showScrollToBottom && !compact && (
          <button
            type="button"
            onClick={scrollToBottom}
            className={`absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl text-xs font-medium ${lm.primaryButton}`}
          >
            Scroll to bottom
          </button>
        )}
      </div>
      <form
        onSubmit={handleSubmit}
        className={`font-sans flex-shrink-0 border-t border-gray-200 ${lm.bodyText} ${compact ? 'p-2 flex items-end gap-2' : 'p-2 flex flex-col gap-2'}`}
      >
        {!compact && showEmojiPicker && (
          <div
            className="flex flex-wrap gap-1 p-2 rounded-xl border border-gray-200 max-h-24 overflow-y-auto"
            style={LIGHT_INSET_STYLE}
          >
            {EMOJI_LIST.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-200 text-lg leading-none transition"
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
              className="w-full min-w-0 h-11 py-2.5 px-3 rounded-full border border-gray-200 bg-white text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 resize-none overflow-hidden font-sans"
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
                className={`${lm.input} w-full resize-none py-2 pr-14 text-sm`}
              />
              <span className={`absolute right-2 bottom-2 text-[10px] tabular-nums pointer-events-none ${lm.mutedText}`}>
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
              className={`w-9 h-9 flex-shrink-0 rounded-xl text-lg flex items-center justify-center transition ${lm.secondaryButton}`}
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
              : `px-4 py-2 rounded-xl text-sm font-medium shrink-0 ml-auto ${lm.primaryButton}`}
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
      className={`flex flex-col overflow-hidden h-full font-sans ${compact ? 'min-h-0 border-0 shadow-none rounded-none bg-transparent' : `font-poppins rounded-2xl border-2 border-gray-200 shadow-xl min-h-[320px] ${fillHeight ? 'min-h-0' : ''}`} ${className}`}
      style={compact ? undefined : LIGHT_SHELL_STYLE}
    >
      {(!compact || title) && (
        <div className={`flex flex-col gap-1 px-3 py-2 border-b border-gray-200 ${lm.bodyText} ${compact ? 'py-1.5' : ''}`}>
          <div className="flex items-center justify-between">
            <span className={`${lm.accentText} font-semibold text-sm`}>{title}</span>
            <div className="flex items-center gap-2">
              {!compact && walletAddress && connected && !showNameInput && (
                <button
                  type="button"
                  onClick={() => setShowNameInput(true)}
                  className={`text-xs shrink-0 ${lm.linkText}`}
                >
                  Set display name
                </button>
              )}
              {headerActions}
            </div>
          </div>
          {walletAddress && connected && showNameInput && (
            <div className="flex gap-2 items-center mt-1">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Display name (3–32 chars)"
                maxLength={32}
                className={`flex-1 min-w-0 rounded-xl px-2 py-1 text-xs ${lm.input} py-1.5`}
              />
              <button
                type="button"
                onClick={handleSaveDisplayName}
                disabled={nameInput.trim().length < 3 || nameSaving}
                className={`px-2 py-1 rounded-xl text-xs font-medium shrink-0 ${lm.primaryButton}`}
              >
                {nameSaving ? '…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setShowNameInput(false); setNameInput(''); }}
                className={`px-2 py-1 rounded-xl text-xs shrink-0 ${lm.linkText}`}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
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
                className="absolute -top-1 -right-1 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-gray-200 border-2 border-gray-400 text-gray-700 hover:bg-gray-300 hover:text-black hover:border-gray-500 transition-colors shadow-sm"
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
              className={`w-full rounded-2xl py-3 px-4 text-left flex items-center gap-2 border-2 border-gray-200 font-semibold text-sm transition hover:bg-gray-50 hover:border-cyan-500/50 shadow-lg relative ${lm.accentText}`}
              style={{
                background: 'white',
                boxShadow: Theme.inset.light.boxShadow,
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
      </>
    );
  }

  return (
    <>
      <div className={className}>{shell}</div>
      {statsModal}
    </>
  );
}
