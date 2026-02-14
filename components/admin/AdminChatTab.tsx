'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Pause, Trash2, UserX, RefreshCw } from 'lucide-react';

const CHAT_ROOMS = [
  { id: 'main', label: 'Lobby' },
  { id: 'blackjack', label: 'Blackjack' },
  { id: 'plinko', label: 'Plinko' },
  { id: 'keno', label: 'Keno' },
  { id: 'lottery', label: 'Lottery' },
  { id: 'bigwheel', label: 'Big Wheel' },
  { id: 'morb-it', label: 'Morb-It' },
];

interface ChatMessageRow {
  id: string;
  room_id: string;
  sender_address: string | null;
  text: string;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len) + '…';
}

export default function AdminChatTab() {
  const { address } = useAccount();
  const [config, setConfig] = useState<Record<string, string>>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [messagesRoom, setMessagesRoom] = useState('main');
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockInput, setBlockInput] = useState('');
  const [blockSubmitting, setBlockSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const headers = (): Record<string, string> =>
    address ? { 'x-admin-wallet': address } : {};

  const fetchConfig = useCallback(async () => {
    if (!address) return;
    setConfigLoading(true);
    try {
      const res = await fetch('/api/admin/config', { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } finally {
      setConfigLoading(false);
    }
  }, [address]);

  const setPaused = useCallback(
    async (paused: boolean) => {
      if (!address) return;
      setConfigLoading(true);
      try {
        const res = await fetch('/api/admin/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...headers() },
          body: JSON.stringify({ chat_paused: paused ? 'true' : 'false' }),
        });
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
        }
      } finally {
        setConfigLoading(false);
      }
    },
    [address]
  );

  const fetchMessages = useCallback(async () => {
    if (!address) return;
    setMessagesLoading(true);
    try {
      const res = await fetch(
        `/api/admin/chat/messages?roomId=${encodeURIComponent(messagesRoom)}&limit=80`,
        { headers: headers() }
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      } else {
        setMessages([]);
      }
    } finally {
      setMessagesLoading(false);
    }
  }, [address, messagesRoom]);

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!address) return;
      setDeleteId(messageId);
      try {
        const res = await fetch(`/api/admin/chat/messages/${messageId}`, {
          method: 'DELETE',
          headers: headers() as HeadersInit,
        });
        if (res.status === 204) {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        }
      } finally {
        setDeleteId(null);
      }
    },
    [address]
  );

  const fetchBlocked = useCallback(async () => {
    if (!address) return;
    setBlockedLoading(true);
    try {
      const res = await fetch('/api/admin/chat/blocked', { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setBlocked(data.addresses ?? []);
      } else {
        setBlocked([]);
      }
    } finally {
      setBlockedLoading(false);
    }
  }, [address]);

  const addBlocked = useCallback(async () => {
    const trimmed = blockInput.trim();
    if (!address || !trimmed || !/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return;
    setBlockSubmitting(true);
    try {
      const res = await fetch('/api/admin/chat/blocked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ address: trimmed }),
      });
      if (res.ok) {
        const data = await res.json();
        setBlocked(data.addresses ?? []);
        setBlockInput('');
      }
    } finally {
      setBlockSubmitting(false);
    }
  }, [address, blockInput]);

  const removeBlocked = useCallback(
    async (addr: string) => {
      if (!address) return;
      try {
        const res = await fetch(`/api/admin/chat/blocked/${encodeURIComponent(addr)}`, {
          method: 'DELETE',
          headers: headers() as HeadersInit,
        });
        if (res.status === 204) {
          setBlocked((prev) => prev.filter((a) => a.toLowerCase() !== addr.toLowerCase()));
        }
      } catch {
        // ignore
      }
    },
    [address]
  );

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    fetchBlocked();
  }, [fetchBlocked]);

  const chatPaused = config['chat_paused'] === 'true';

  if (!address) {
    return (
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardContent className="py-4 px-3 text-xs text-slate-500">
          Connect wallet to manage chat.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Pause chat */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <Pause className="w-3.5 h-3.5 text-cyan-400" />
            Pause chat
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3 px-3 flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {chatPaused ? 'Chat is paused (no one can send).' : 'Chat is active.'}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-xs border-slate-600 text-slate-300 h-7"
            onClick={() => setPaused(!chatPaused)}
            disabled={configLoading}
          >
            {chatPaused ? 'Unpause' : 'Pause'}
          </Button>
        </CardContent>
      </Card>

      {/* Recent messages + delete */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
            Recent messages
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={messagesRoom}
              onChange={(e) => setMessagesRoom(e.target.value)}
              className="text-[11px] bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200"
              aria-label="Chat room"
            >
              {CHAT_ROOMS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={fetchMessages}
              disabled={messagesLoading}
              className="p-1.5 rounded border border-slate-600 text-slate-400 hover:text-white disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${messagesLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="py-3 px-3">
          {messagesLoading && messages.length === 0 ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-slate-500">No messages in this room.</p>
          ) : (
            <ul className="space-y-2 max-h-[280px] overflow-y-auto">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start justify-between gap-2 text-xs border-b border-slate-700/50 pb-2 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-slate-500">
                      {m.created_at
                        ? new Date(m.created_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}{' '}
                      {m.sender_address ? (
                        <span className="text-cyan-400/90 font-mono">
                          {m.sender_address.slice(0, 8)}…{m.sender_address.slice(-6)}
                        </span>
                      ) : (
                        <span className="text-slate-500">Anonymous</span>
                      )}
                    </span>
                    <p className="text-slate-200 mt-0.5 break-words">
                      {m.deleted_at ? (
                        <em className="text-slate-500">[Deleted]</em>
                      ) : (
                        truncate(m.text, 120)
                      )}
                    </p>
                  </div>
                  {!m.deleted_at && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="shrink-0 h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => deleteMessage(m.id)}
                      disabled={deleteId === m.id}
                      aria-label="Delete message"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Blocked addresses */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <UserX className="w-3.5 h-3.5 text-cyan-400" />
            Blocked addresses
          </CardTitle>
          <button
            type="button"
            onClick={fetchBlocked}
            disabled={blockedLoading}
            className="p-1.5 rounded border border-slate-600 text-slate-400 hover:text-white disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${blockedLoading ? 'animate-spin' : ''}`} />
          </button>
        </CardHeader>
        <CardContent className="py-3 px-3 space-y-3">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="0x… (42 chars)"
              value={blockInput}
              onChange={(e) => setBlockInput(e.target.value)}
              className="flex-1 h-8 text-xs bg-slate-800 border-slate-600 text-slate-200 placeholder:text-slate-500"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-xs border-slate-600 text-slate-300 h-8"
              onClick={addBlocked}
              disabled={
                blockSubmitting ||
                !/^0x[a-fA-F0-9]{40}$/.test(blockInput.trim())
              }
            >
              Block
            </Button>
          </div>
          {blocked.length === 0 ? (
            <p className="text-xs text-slate-500">No blocked addresses.</p>
          ) : (
            <ul className="space-y-1.5 max-h-[160px] overflow-y-auto">
              {blocked.map((addr) => (
                <li
                  key={addr}
                  className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-300"
                >
                  <span className="truncate">{addr}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="shrink-0 h-6 text-xs text-amber-400 hover:text-amber-300"
                    onClick={() => removeBlocked(addr)}
                  >
                    Unblock
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
