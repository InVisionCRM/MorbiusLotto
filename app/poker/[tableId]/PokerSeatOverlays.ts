'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { BlackjackWebSocketClient, ChatMessagePayload, PokerTableState } from '@/lib/websocket-client';
import type { Emotion } from '@/components/avatar';

const CHAT_BUBBLE_DURATION_MS = 5000;
const QUICK_REACTION_DURATION_MS = 2000;
const AVATAR_EMOTION_DURATION_MS = 3000;
const AVATAR_EMOTION_WINK_MS = 1200;

interface UsePokerSeatOverlaysArgs {
  clientRef: MutableRefObject<BlackjackWebSocketClient | null>;
  pokerChatRoomId: string;
  tableId: string;
  normalizedAddress: string | null;
  state: PokerTableState | null;
  mySeatIndex: number;
}

export function usePokerSeatOverlays({
  clientRef,
  pokerChatRoomId,
  tableId,
  normalizedAddress,
  state,
  mySeatIndex,
}: UsePokerSeatOverlaysArgs) {
  const [seatBubbles, setSeatBubbles] = useState<
    Array<{ id: string; senderAddress: string; text: string; expiresAt: number }>
  >([]);
  const [reactionBySeatIndex, setReactionBySeatIndex] = useState<Record<number, string>>({});
  const [broadcastEmotionBySeatIndex, setBroadcastEmotionBySeatIndex] = useState<Record<number, Emotion>>({});

  const bubbleTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reactionTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const emotionTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const client = clientRef.current;
    if (!client || !pokerChatRoomId) return;

    const onChatMessage = (payload: ChatMessagePayload) => {
      if (payload.roomId?.toLowerCase() !== pokerChatRoomId.toLowerCase()) return;
      const sender = payload.senderAddress?.trim()?.toLowerCase();
      if (!sender || !payload.text?.trim()) return;

      if (sender !== normalizedAddress) {
        new Audio('/POKER/PokerSounds/ChatMessage.mp3').play().catch(() => {});
      }

      const id = payload.id || `chat-${Date.now()}-${sender}`;
      const expiresAt = Date.now() + CHAT_BUBBLE_DURATION_MS;
      setSeatBubbles((prev) => {
        const next = prev.filter((b) => b.id !== id);
        next.push({ id, senderAddress: sender, text: payload.text.trim(), expiresAt });
        return next;
      });

      const t = setTimeout(() => {
        setSeatBubbles((prev) => prev.filter((b) => b.id !== id));
        bubbleTimeoutsRef.current.delete(id);
      }, CHAT_BUBBLE_DURATION_MS);
      bubbleTimeoutsRef.current.set(id, t);
    };

    client.on('chat_message', onChatMessage);
    return () => {
      client.off('chat_message', onChatMessage);
      bubbleTimeoutsRef.current.forEach((t) => clearTimeout(t));
      bubbleTimeoutsRef.current.clear();
    };
  }, [clientRef, pokerChatRoomId, normalizedAddress]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client || !tableId) return;

    const onQuickReaction = (payload: { tableId?: string; seatIndex?: number; type?: string; value?: string }) => {
      if (payload.tableId !== tableId || payload.seatIndex == null || payload.type !== 'phrase') return;
      const seatIndex = payload.seatIndex;
      const value = typeof payload.value === 'string' ? payload.value.trim() : '';
      if (!value) return;

      if (reactionTimeoutsRef.current.has(seatIndex)) {
        clearTimeout(reactionTimeoutsRef.current.get(seatIndex)!);
        reactionTimeoutsRef.current.delete(seatIndex);
      }

      setReactionBySeatIndex((prev) => ({ ...prev, [seatIndex]: value }));

      const t = setTimeout(() => {
        setReactionBySeatIndex((prev) => {
          const next = { ...prev };
          delete next[seatIndex];
          return next;
        });
        reactionTimeoutsRef.current.delete(seatIndex);
      }, QUICK_REACTION_DURATION_MS);
      reactionTimeoutsRef.current.set(seatIndex, t);
    };

    const onAvatarEmotion = (payload: { tableId?: string; seatIndex?: number; emotion?: string }) => {
      if (payload.tableId !== tableId || payload.seatIndex == null || !payload.emotion) return;
      const emotion = payload.emotion as Emotion;
      const duration = emotion === 'wink' ? AVATAR_EMOTION_WINK_MS : AVATAR_EMOTION_DURATION_MS;
      setBroadcastEmotionBySeatIndex((prev) => ({ ...prev, [payload.seatIndex!]: emotion }));
      if (emotionTimeoutsRef.current.has(payload.seatIndex)) {
        clearTimeout(emotionTimeoutsRef.current.get(payload.seatIndex)!);
      }
      const t = setTimeout(() => {
        setBroadcastEmotionBySeatIndex((prev) => {
          const next = { ...prev };
          delete next[payload.seatIndex!];
          return next;
        });
        emotionTimeoutsRef.current.delete(payload.seatIndex!);
      }, duration);
      emotionTimeoutsRef.current.set(payload.seatIndex, t);
    };

    client.on('poker_quick_reaction', onQuickReaction);
    client.on('poker_avatar_emotion', onAvatarEmotion);
    return () => {
      client.off('poker_quick_reaction', onQuickReaction);
      client.off('poker_avatar_emotion', onAvatarEmotion);
      reactionTimeoutsRef.current.forEach((t) => clearTimeout(t));
      reactionTimeoutsRef.current.clear();
      emotionTimeoutsRef.current.forEach((t) => clearTimeout(t));
      emotionTimeoutsRef.current.clear();
    };
  }, [clientRef, tableId]);

  const onPhraseReaction = useCallback(
    (phrase: string) => {
      const client = clientRef.current;
      if (!client?.isConnected() || !tableId || mySeatIndex < 0) return;
      client.sendPokerQuickPhrase(tableId, phrase);
      setReactionBySeatIndex((prev) => ({ ...prev, [mySeatIndex]: phrase }));
      if (reactionTimeoutsRef.current.has(mySeatIndex)) clearTimeout(reactionTimeoutsRef.current.get(mySeatIndex)!);
      const t = setTimeout(() => {
        setReactionBySeatIndex((prev) => {
          const next = { ...prev };
          delete next[mySeatIndex];
          return next;
        });
        reactionTimeoutsRef.current.delete(mySeatIndex);
      }, QUICK_REACTION_DURATION_MS);
      reactionTimeoutsRef.current.set(mySeatIndex, t);
    },
    [clientRef, tableId, mySeatIndex],
  );

  const onAnimationReaction = useCallback(
    (emotion: Emotion) => {
      const client = clientRef.current;
      if (!client?.isConnected() || !tableId || mySeatIndex < 0) return;
      client.sendPokerAvatarEmotion(tableId, emotion);
    },
    [clientRef, tableId, mySeatIndex],
  );

  const chatBubbleBySeatIndex = useMemo(() => {
    if (!state) return undefined;
    const now = Date.now();
    const active = seatBubbles.filter((b) => b.expiresAt > now);
    if (active.length === 0) return undefined;
    const bySeat: Record<number, string> = {};
    state.seats.forEach((seat, idx) => {
      const addr = seat.playerAddress?.toLowerCase();
      if (!addr) return;
      const bubble = active.filter((b) => b.senderAddress === addr).sort((a, b) => b.expiresAt - a.expiresAt)[0];
      if (bubble) bySeat[idx] = bubble.text;
    });
    return Object.keys(bySeat).length ? bySeat : undefined;
  }, [state, seatBubbles]);

  return {
    chatBubbleBySeatIndex,
    reactionBySeatIndex,
    broadcastEmotionBySeatIndex,
    onPhraseReaction,
    onAnimationReaction,
  };
}
