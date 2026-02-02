'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import {
  BlackjackWebSocketClient,
  type ChatMessagePayload,
  type RoomJoinedPayload,
} from '@/lib/websocket-client';

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
    async (displayName: string) => {
      const c = externalClient ?? internalClientRef.current;
      if (!c?.isConnected()) throw new Error('Not connected');
      return c.setDisplayName(displayName);
    },
    [externalClient]
  );

  const loadMore = useCallback(async () => {
    const c = externalClient ?? internalClientRef.current;
    if (!c?.isConnected() || loadingMore) return;
    const oldestId = messages[0]?.id;
    if (!oldestId) return;
    setLoadingMore(true);
    try {
      const { messages: older } = await c.getChatHistory(roomIdRef.current, oldestId, 50);
      if (older.length === 0) return;
      setMessages((prev) => [...older.map((m) => ({ ...m, displayName: m.displayName ?? null })), ...prev]);
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
          setMessages(
            payload.recentMessages.map((m) => ({
              id: m.id,
              roomId: m.roomId,
              senderAddress: m.senderAddress,
              displayName: m.displayName ?? null,
              text: m.text,
              timestamp: m.timestamp,
            }))
          );
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
        return [...prev, payload];
      });
    };

    internal.on('chat_message', onChat);

    return () => {
      internal.off('chat_message', onChat);
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
          setMessages(
            payload.recentMessages.map((m) => ({
              id: m.id,
              roomId: m.roomId,
              senderAddress: m.senderAddress,
              displayName: m.displayName ?? null,
              text: m.text,
              timestamp: m.timestamp,
            }))
          );
        }
      })
      .catch((err) => {
        setError(err?.message ?? 'Failed to join room');
      });

    const onChat = (payload: ChatMessagePayload) => {
      if (payload.roomId !== roomIdRef.current) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.id)) return prev;
        return [...prev, payload];
      });
    };

    externalClient.on('chat_message', onChat);
    return () => {
      externalClient.off('chat_message', onChat);
    };
  }, [roomId, externalClient, externalConnected]);

  // Sync connected state when using external client
  useEffect(() => {
    if (externalClient == null) return;
    setConnected(externalClient.isConnected());
  }, [externalClient, connected]);

  return { messages, sendMessage, connected, error, setDisplayName, loadMore, loadingMore };
}
