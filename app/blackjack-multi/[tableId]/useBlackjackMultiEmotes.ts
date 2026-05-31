'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { Emotion } from '@/components/avatar';
import {
  POKER_DIRECTED_EMOTES,
  POKER_DIRECTED_EMOTE_FLY_MS,
  isPokerDirectedEmoteKind,
  type PokerDirectedEmoteKind,
} from '@/lib/poker-directed-emotes';

const AVATAR_EMOTION_DURATION_MS = 3000;
const AVATAR_EMOTION_WINK_MS = 1200;

/** A directed emote in flight across the blackjack table. Players are keyed by wallet address. */
export interface BjDirectedEmoteFlight {
  id: string;
  fromAddress: string;
  toAddress: string;
  kind: PokerDirectedEmoteKind;
}

/**
 * Blackjack-multi directed emotes: listen for `bj_multi_directed_emote`, expose in-flight
 * bubbles + a per-address broadcast emotion (so the sender reacts immediately and the target
 * reacts on landing), and a sender callback. Rendering is echo-driven (server broadcast
 * includes the sender) so every client animates the same flight in sync.
 */
export function useBlackjackMultiEmotes(
  wsClient: BlackjackWebSocketClient | null,
  tableId: string,
  myAddress: string | null,
) {
  const [directedEmotes, setDirectedEmotes] = useState<BjDirectedEmoteFlight[]>([]);
  const [broadcastEmotionByAddress, setBroadcastEmotionByAddress] = useState<Record<string, Emotion>>({});
  const emotionTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const directedTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    if (!wsClient || !tableId) return;

    const pulse = (address: string, emotion: Emotion) => {
      const key = address.toLowerCase();
      setBroadcastEmotionByAddress((prev) => ({ ...prev, [key]: emotion }));
      if (emotionTimeoutsRef.current.has(key)) clearTimeout(emotionTimeoutsRef.current.get(key)!);
      const duration = emotion === 'wink' ? AVATAR_EMOTION_WINK_MS : AVATAR_EMOTION_DURATION_MS;
      const t = setTimeout(() => {
        setBroadcastEmotionByAddress((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        emotionTimeoutsRef.current.delete(key);
      }, duration);
      emotionTimeoutsRef.current.set(key, t);
    };

    const onDirectedEmote = (payload: { tableId?: string; fromAddress?: string; toAddress?: string; kind?: string }) => {
      if (payload.tableId !== tableId) return;
      const { fromAddress, toAddress, kind } = payload;
      if (!fromAddress || !toAddress || !isPokerDirectedEmoteKind(kind)) return;
      const def = POKER_DIRECTED_EMOTES[kind];
      const id = `bde-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setDirectedEmotes((prev) => [...prev, { id, fromAddress, toAddress, kind }]);
      pulse(fromAddress, def.sender); // sender reacts as they throw it
      const landT = setTimeout(() => pulse(toAddress, def.target), Math.round(POKER_DIRECTED_EMOTE_FLY_MS * 0.82)); // target on landing
      directedTimeoutsRef.current.add(landT);
      const removeT = setTimeout(() => {
        setDirectedEmotes((prev) => prev.filter((d) => d.id !== id));
        directedTimeoutsRef.current.delete(removeT);
      }, POKER_DIRECTED_EMOTE_FLY_MS + 250);
      directedTimeoutsRef.current.add(removeT);
    };

    wsClient.on('bj_multi_directed_emote', onDirectedEmote);
    return () => {
      wsClient.off('bj_multi_directed_emote', onDirectedEmote);
      emotionTimeoutsRef.current.forEach((t) => clearTimeout(t));
      emotionTimeoutsRef.current.clear();
      directedTimeoutsRef.current.forEach((t) => clearTimeout(t));
      directedTimeoutsRef.current.clear();
    };
  }, [wsClient, tableId]);

  const onSendDirectedEmote = useCallback(
    (toAddress: string, kind: PokerDirectedEmoteKind) => {
      if (!wsClient?.isConnected() || !tableId || !toAddress) return;
      if (myAddress && toAddress.toLowerCase() === myAddress.toLowerCase()) return;
      wsClient.sendBJMultiDirectedEmote(tableId, toAddress, kind);
    },
    [wsClient, tableId, myAddress],
  );

  return { directedEmotes, broadcastEmotionByAddress, onSendDirectedEmote };
}
