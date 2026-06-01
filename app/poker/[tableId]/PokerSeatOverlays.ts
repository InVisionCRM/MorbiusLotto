'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { BlackjackWebSocketClient, ChatMessagePayload, PokerTableState } from '@/lib/websocket-client';
import type { Emotion } from '@/components/avatar';
import {
  POKER_DIRECTED_EMOTES,
  POKER_DIRECTED_EMOTE_FLY_MS,
  POKER_PROJECTILE_FLY_MS,
  POKER_PROJECTILE_TOTAL_MS,
  POKER_MAX_STUCK_ARROWS,
  isPokerDirectedEmoteKind,
  type PokerDirectedEmoteKind,
} from '@/lib/poker-directed-emotes';

export interface DirectedEmoteFlight {
  id: string;
  fromSeatIndex: number;
  toSeatIndex: number;
  kind: PokerDirectedEmoteKind;
}

/** An arrow stuck in a target seat's circle border. `fromSeatIndex` gives its incoming angle. */
export interface StuckArrow {
  id: string;
  fromSeatIndex: number;
}

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
  const [directedEmotes, setDirectedEmotes] = useState<DirectedEmoteFlight[]>([]);
  const [stuckArrowsBySeatIndex, setStuckArrowsBySeatIndex] = useState<Record<number, StuckArrow[]>>({});

  const bubbleTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reactionTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const emotionTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const directedTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

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

    // Pulse a seat's avatar emotion (auto-clears) — shared by directed-emote sender/target reactions.
    const pulse = (seatIndex: number, emotion: Emotion) => {
      setBroadcastEmotionBySeatIndex((prev) => ({ ...prev, [seatIndex]: emotion }));
      if (emotionTimeoutsRef.current.has(seatIndex)) clearTimeout(emotionTimeoutsRef.current.get(seatIndex)!);
      const duration = emotion === 'wink' ? AVATAR_EMOTION_WINK_MS : AVATAR_EMOTION_DURATION_MS;
      const t = setTimeout(() => {
        setBroadcastEmotionBySeatIndex((prev) => {
          const next = { ...prev };
          delete next[seatIndex];
          return next;
        });
        emotionTimeoutsRef.current.delete(seatIndex);
      }, duration);
      emotionTimeoutsRef.current.set(seatIndex, t);
    };

    const onDirectedEmote = (payload: { tableId?: string; fromSeatIndex?: number; toSeatIndex?: number; kind?: string }) => {
      if (payload.tableId !== tableId) return;
      const { fromSeatIndex, toSeatIndex, kind } = payload;
      if (typeof fromSeatIndex !== 'number' || typeof toSeatIndex !== 'number' || !isPokerDirectedEmoteKind(kind)) return;
      const def = POKER_DIRECTED_EMOTES[kind];
      const id = `de-${Date.now()}-${fromSeatIndex}-${toSeatIndex}-${Math.random().toString(36).slice(2, 7)}`;
      setDirectedEmotes((prev) => [...prev, { id, fromSeatIndex, toSeatIndex, kind }]);
      pulse(fromSeatIndex, def.sender); // sender reacts as they throw it

      // ── Projectiles: fast straight flight; arrow sticks (persists), snowball shatters (transient) ──
      if (def.projectile) {
        const landT = setTimeout(() => {
          pulse(toSeatIndex, def.target); // target flinches on impact
          if (def.projectile === 'arrow') {
            // hand the flight off to a persistent stuck arrow on the target's border
            setStuckArrowsBySeatIndex((prev) => {
              const list = [...(prev[toSeatIndex] ?? []), { id, fromSeatIndex }];
              if (list.length > POKER_MAX_STUCK_ARROWS) list.splice(0, list.length - POKER_MAX_STUCK_ARROWS);
              return { ...prev, [toSeatIndex]: list };
            });
            setDirectedEmotes((prev) => prev.filter((d) => d.id !== id));
          }
        }, POKER_PROJECTILE_FLY_MS);
        directedTimeoutsRef.current.add(landT);
        if (def.projectile === 'snowball') {
          const removeT = setTimeout(() => {
            setDirectedEmotes((prev) => prev.filter((d) => d.id !== id));
            directedTimeoutsRef.current.delete(removeT);
          }, POKER_PROJECTILE_TOTAL_MS);
          directedTimeoutsRef.current.add(removeT);
        }
        return;
      }

      // ── Emotes: bubble arcs over, target reacts on landing ──
      const landT = setTimeout(() => pulse(toSeatIndex, def.target), Math.round(POKER_DIRECTED_EMOTE_FLY_MS * 0.82));
      directedTimeoutsRef.current.add(landT);
      const removeT = setTimeout(() => {
        setDirectedEmotes((prev) => prev.filter((d) => d.id !== id));
        directedTimeoutsRef.current.delete(removeT);
      }, POKER_DIRECTED_EMOTE_FLY_MS + 250);
      directedTimeoutsRef.current.add(removeT);
    };

    client.on('poker_quick_reaction', onQuickReaction);
    client.on('poker_avatar_emotion', onAvatarEmotion);
    client.on('poker_directed_emote', onDirectedEmote);
    return () => {
      client.off('poker_quick_reaction', onQuickReaction);
      client.off('poker_avatar_emotion', onAvatarEmotion);
      client.off('poker_directed_emote', onDirectedEmote);
      reactionTimeoutsRef.current.forEach((t) => clearTimeout(t));
      reactionTimeoutsRef.current.clear();
      emotionTimeoutsRef.current.forEach((t) => clearTimeout(t));
      emotionTimeoutsRef.current.clear();
      directedTimeoutsRef.current.forEach((t) => clearTimeout(t));
      directedTimeoutsRef.current.clear();
    };
  }, [clientRef, tableId]);

  // Stuck arrows are per-hand — clear the pincushion when a new hand starts.
  useEffect(() => {
    setStuckArrowsBySeatIndex({});
  }, [state?.currentHand?.handId]);

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

  const onSendDirectedEmote = useCallback(
    (toSeatIndex: number, kind: PokerDirectedEmoteKind) => {
      const client = clientRef.current;
      if (!client?.isConnected() || !tableId || mySeatIndex < 0) return;
      if (toSeatIndex < 0 || toSeatIndex === mySeatIndex) return;
      // Rely on the server echo (broadcast includes the sender) so every client renders the
      // same flight at the same time — no optimistic local copy to dedupe.
      client.sendPokerDirectedEmote(tableId, toSeatIndex, kind);
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
    directedEmotes,
    stuckArrowsBySeatIndex,
    onPhraseReaction,
    onAnimationReaction,
    onSendDirectedEmote,
  };
}
