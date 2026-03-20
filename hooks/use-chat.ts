'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import {
  BlackjackWebSocketClient,
  type ChatMessagePayload,
  type ChatMessageDeletedPayload,
  type RoomJoinedPayload,
} from '@/lib/websocket-client';

function normalizeChatMessage(m: ChatMessagePayload): ChatMessagePayload {
  return {
    ...m,
    displayName: m.displayName ?? null,
    profileImageUrl: m.profileImageUrl ?? null,
    avatarConfig: m.avatarConfig ?? null,
  };
}

export interface UseChatOptions {
  /** Optional existing WebSocket client (e.g. from Blackjack page). If not provided, a chat-only client is created. */
  wsClient?: BlackjackWebSocketClient | null;
  /** When using wsClient: pass true when the client is connected so we join the room. Omit when using internal client. */
  wsConnected?: boolean;
}

export function useChat(roomId: string, options: UseChatOptions = {}) {
  const { wsClient: externalClient, wsConnected: externalConnected } = options;
  const { address } = useAccount();
  const [messages, setMessages] = useState<ChatMessagePayload[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [chatPaused, setChatPaused] = useState(false);
  const internalClientRef = useRef<BlackjackWebSocketClient | null>(null);
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  const client = externalClient ?? internalClientRef.current;

  const sendMessage = useCallback(
    (text: string) => {
      const c = externalClient ?? internalClientRef.current;
      if (c?.isConnected()) {
        c.sendChatMessage(roomIdRef.current, text);
      }
    },
    [externalClient]
  );

  const setDisplayName = useCallback(
    async (displayName: string, profileImageUrl?: string | null, bio?: string | null, xHandle?: string | null, tgHandle?: string | null) => {
      const c = externalClient ?? internalClientRef.current;
      if (!c?.isConnected()) throw new Error('Not connected');
      return c.setDisplayName(displayName, profileImageUrl, undefined, bio, xHandle, tgHandle);
    },
    [externalClient]
  );

  const getProfile = useCallback(async () => {
    const c = externalClient ?? internalClientRef.current;
    if (!c?.isConnected()) return { displayName: null, profileImageUrl: null };
    return c.getProfile();
  }, [externalClient]);

  const loadMore = useCallback(async () => {
    const c = externalClient ?? internalClientRef.current;
    if (!c?.isConnected() || loadingMore) return;
    const oldestId = messages[0]?.id;
    if (!oldestId) return;
    setLoadingMore(true);
    try {
      const { messages: older } = await c.getChatHistory(roomIdRef.current, oldestId, 50);
      if (older.length === 0) return;
      setMessages((prev) => [...older.map(normalizeChatMessage), ...prev]);
    } finally {
      setLoadingMore(false);
    }
  }, [externalClient, messages, loadingMore]);

  // Create and connect internal client only when no external client and we have a room
  useEffect(() => {
    if (externalClient != null || !roomId) return;

    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl) {
      setError('Chat not configured (set NEXT_PUBLIC_WEBSOCKET_URL)');
      return;
    }

    const internal = new BlackjackWebSocketClient(wsUrl, address ?? undefined);
    internalClientRef.current = internal;
    setError(null);

    internal
      .connect()
      .then(() => {
        setConnected(true);
        return internal.joinRoom(roomId);
      })
      .then((payload: RoomJoinedPayload) => {
        if (roomIdRef.current === payload.roomId) {
          setMessages(payload.recentMessages.map((m) => normalizeChatMessage(m as ChatMessagePayload)));
          setChatPaused(payload.chatPaused === true);
        }
      })
      .catch((err) => {
        setError(err?.message ?? 'Failed to connect');
        setConnected(false);
      });

    const onChat = (payload: ChatMessagePayload) => {
      if (payload.roomId !== roomIdRef.current) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.id)) return prev;
        return [...prev, normalizeChatMessage(payload)];
      });
    };

    const onDeleted = (payload: ChatMessageDeletedPayload) => {
      if (payload.roomId !== roomIdRef.current) return;
      setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
    };

    const onError = (payload: { message?: string; error?: string }) => {
      const msg = payload?.message ?? payload?.error ?? 'Something went wrong';
      setError(msg);
      // Clear after 5s so user can try again
      setTimeout(() => setError(null), 5000);
    };

    internal.on('chat_message', onChat);
    internal.on('chat_message_deleted', onDeleted);
    internal.on('error', onError);

    return () => {
      internal.off('chat_message', onChat);
      internal.off('chat_message_deleted', onDeleted);
      internal.off('error', onError);
      internal.disconnect();
      internalClientRef.current = null;
      setConnected(false);
      setMessages([]);
    };
  }, [roomId, address, externalClient]);

  // When external client is provided: join room and subscribe to chat_message (only when connected)
  useEffect(() => {
    const isExternalConnected = externalConnected ?? externalClient?.isConnected();
    if (externalClient == null || !isExternalConnected) return;

    setConnected(true);
    setMessages([]);
    externalClient
      .joinRoom(roomId)
      .then((payload: RoomJoinedPayload) => {
        if (roomIdRef.current === payload.roomId) {
          setMessages(payload.recentMessages.map((m) => normalizeChatMessage(m as ChatMessagePayload)));
          setChatPaused(payload.chatPaused === true);
        }
      })
      .catch((err) => {
        setError(err?.message ?? 'Failed to join room');
      });

    const onChat = (payload: ChatMessagePayload) => {
      if (payload.roomId !== roomIdRef.current) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.id)) return prev;
        return [...prev, normalizeChatMessage(payload)];
      });
    };

    const onDeleted = (payload: ChatMessageDeletedPayload) => {
      if (payload.roomId !== roomIdRef.current) return;
      setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
    };

    const onError = (payload: { message?: string; error?: string }) => {
      const msg = payload?.message ?? payload?.error ?? 'Something went wrong';
      setError(msg);
      setTimeout(() => setError(null), 5000);
    };

    externalClient.on('chat_message', onChat);
    externalClient.on('chat_message_deleted', onDeleted);
    externalClient.on('error', onError);
    return () => {
      externalClient.off('chat_message', onChat);
      externalClient.off('chat_message_deleted', onDeleted);
      externalClient.off('error', onError);
    };
  }, [roomId, externalClient, externalConnected]);

  // Sync connected state when using external client
  useEffect(() => {
    if (externalClient == null) return;
    setConnected(externalClient.isConnected());
  }, [externalClient, connected]);

  return { messages, sendMessage, connected, error, setDisplayName, getProfile, loadMore, loadingMore, chatPaused };
}
