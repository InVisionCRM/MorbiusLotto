'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useSignTypedData } from 'wagmi';
import { formatEther } from 'viem';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { motion, AnimatePresence } from 'framer-motion';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { PokerTableState, ChatMessagePayload } from '@/lib/websocket-client';
import { DEFAULT_POKER_THEME, getPokerThemeVars } from '@/lib/poker-themes';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { PokerThemeProvider } from '@/components/poker/PokerThemeContext';
import { PokerTable } from '@/components/poker/PokerTable';
import type { Emotion } from '@/components/poker/avatar/AvatarPreview';
import { PokerActions } from '@/components/poker/PokerActions';
import { PokerDepositModal } from '@/components/poker/PokerDepositModal';
import { PokerStatsModal } from '@/components/poker/PokerStatsModal';
import { ProfileAvatarModal } from '@/components/shared/ProfileAvatarModal';
import { PokerActivityFeed } from '@/components/poker/PokerActivityFeed';
import { useProfileWs } from '@/contexts/profile-ws-context';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const POKER_CHAT_BUBBLE_DURATION_MS = 5000;
const POKER_QUICK_REACTION_DURATION_MS = 2000;
const POKER_AVATAR_EMOTION_DURATION_MS = 3000;
const POKER_AVATAR_EMOTION_WINK_MS = 1200;

export default function PokerTablePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tableId = typeof params.tableId === 'string' ? params.tableId : '';
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const joinFromLobby = searchParams.get('join') === '1';
  const buyInParam = searchParams.get('buyIn');

  const [state, setState] = useState<PokerTableState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  /** Chat bubbles above seats: id, senderAddress (lowercase), text, expiresAt. Cleared after 5s. */
  const [seatBubbles, setSeatBubbles] = useState<Array<{ id: string; senderAddress: string; text: string; expiresAt: number }>>([]);
  const bubbleTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reactionTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  /** Per-seat quick reaction (emoji or phrase) shown above seat; cleared after 2s. */
  const [reactionBySeatIndex, setReactionBySeatIndex] = useState<Record<number, { type: 'emoji' | 'phrase'; value: string }>>({});
  const [broadcastEmotionBySeatIndex, setBroadcastEmotionBySeatIndex] = useState<Record<number, Emotion>>({});
  const emotionTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const clientRef = useRef<BlackjackWebSocketClient | null>(null);
  const fetchSeqRef = useRef(0);

  const normalizedAddress = address?.toLowerCase() ?? null;
  const profileWs = useProfileWs();
  const queryClient = useQueryClient();

  // Fetch personalized state and apply it only if no newer fetch has started.
  const fetchLatestState = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    const seq = ++fetchSeqRef.current;
    client.pokerGetState(tableId).then((s) => {
      if (fetchSeqRef.current === seq && s) setState(s);
    }).catch(() => {});
  }, [tableId]);

  useEffect(() => {
    if (!tableId) return;
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl) {
      setError('WebSocket not configured');
      return;
    }
    const client = new BlackjackWebSocketClient(wsUrl, normalizedAddress ?? undefined, signTypedDataAsync as any);
    clientRef.current = client;
    setWsClient(client);
    profileWs?.setWsClient(client);

    client.on('poker_table_state', (payload: PokerTableState) => {
      if (payload.tableId !== tableId) return;
      setState((prev) => {
        // If the server sent hole cards, use them
        if (payload.myHoleCards != null) return payload;
        // If the hand changed, don't carry over stale hole cards
        const sameHand = prev?.currentHand?.handId != null &&
          payload.currentHand?.handId === prev.currentHand.handId;
        // New hand started via broadcast — fetch personalized state to get our hole cards.
        // fetchLatestState() uses a sequence counter to discard out-of-order responses.
        if (!sameHand && payload.currentHand) {
          fetchLatestState();
        }
        return {
          ...payload,
          myHoleCards: sameHand ? (prev?.myHoleCards ?? null) : null,
        };
      });
    });

    client
      .connect()
      .then(() => {
        setWsConnected(true);
        if (joinFromLobby && buyInParam && normalizedAddress) {
          return client
            .pokerJoinTable(tableId, buyInParam)
            .catch((err) => {
              // Already seated is fine — just load current state
              const msg: string = err?.message ?? '';
              if (!msg.toLowerCase().includes('already seated')) {
                setError(msg || 'Failed to join');
                toast.error(msg || 'Failed to join');
              }
            })
            .then(() => client.joinRoom(`poker:table:${tableId}`))
            .then(() => client.pokerGetState(tableId))
            .then((s) => {
              if (s) setState(s);
              router.replace(`/poker/${tableId}`);
            })
            .catch(() => router.replace(`/poker/${tableId}`));
        }
        return client.pokerGetState(tableId).then(setState);
      })
      .catch((err) => {
        setError(err?.message ?? 'Failed to connect');
        toast.error(err?.message ?? 'Failed to connect');
      });

    return () => {
      client.disconnect();
      clientRef.current = null;
      setWsClient(null);
      setWsConnected(false);
      profileWs?.setWsClient(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, normalizedAddress, signTypedDataAsync]);

  useEffect(() => {
    if (!wsConnected || !clientRef.current || !tableId) return;
    clientRef.current.joinRoom(`poker:table:${tableId}`).catch(() => {});
  }, [wsConnected, tableId]);

  // Table chat: show message above sender's seat for 5s
  const pokerChatRoomId = tableId ? `poker:table:${tableId}` : '';
  useEffect(() => {
    const client = clientRef.current;
    if (!client || !pokerChatRoomId) return;

    const onChatMessage = (payload: ChatMessagePayload) => {
      if (payload.roomId?.toLowerCase() !== pokerChatRoomId.toLowerCase()) return;
      const sender = payload.senderAddress?.trim()?.toLowerCase();
      if (!sender || !payload.text?.trim()) return;

      if (sender !== normalizedAddress) {
        new Audio(ps('ChatMessage.mp3')).play().catch(() => {});
      }

      const id = payload.id || `chat-${Date.now()}-${sender}`;
      const expiresAt = Date.now() + POKER_CHAT_BUBBLE_DURATION_MS;

      setSeatBubbles((prev) => {
        const next = prev.filter((b) => b.id !== id);
        next.push({ id, senderAddress: sender, text: payload.text.trim(), expiresAt });
        return next;
      });

      const t = setTimeout(() => {
        setSeatBubbles((prev) => prev.filter((b) => b.id !== id));
        bubbleTimeoutsRef.current.delete(id);
      }, POKER_CHAT_BUBBLE_DURATION_MS);
      bubbleTimeoutsRef.current.set(id, t);
    };

    client.on('chat_message', onChatMessage);
    return () => {
      client.off('chat_message', onChatMessage);
      bubbleTimeoutsRef.current.forEach((t) => clearTimeout(t));
      bubbleTimeoutsRef.current.clear();
    };
  }, [pokerChatRoomId]);

  // Quick reactions (emoji/phrase) — broadcast to table, show above seat for 2s
  useEffect(() => {
    const client = clientRef.current;
    if (!client || !tableId) return;

    const onQuickReaction = (payload: { tableId?: string; seatIndex?: number; type?: 'emoji' | 'phrase'; value?: string }) => {
      if (payload.tableId !== tableId || payload.seatIndex == null || (payload.type !== 'emoji' && payload.type !== 'phrase')) return;
      const seatIndex = payload.seatIndex;
      const value = typeof payload.value === 'string' ? payload.value.trim() : '';
      if (!value) return;

      if (reactionTimeoutsRef.current.has(seatIndex)) {
        clearTimeout(reactionTimeoutsRef.current.get(seatIndex)!);
        reactionTimeoutsRef.current.delete(seatIndex);
      }

      setReactionBySeatIndex((prev) => ({ ...prev, [seatIndex]: { type: payload.type!, value } }));

      const t = setTimeout(() => {
        setReactionBySeatIndex((prev) => {
          const next = { ...prev };
          delete next[seatIndex];
          return next;
        });
        reactionTimeoutsRef.current.delete(seatIndex);
      }, POKER_QUICK_REACTION_DURATION_MS);
      reactionTimeoutsRef.current.set(seatIndex, t);
    };

    client.on('poker_quick_reaction', onQuickReaction);

    const onAvatarEmotion = (payload: { tableId?: string; seatIndex?: number; emotion?: string }) => {
      if (payload.tableId !== tableId || payload.seatIndex == null || !payload.emotion) return;
      const emotion = payload.emotion as Emotion;
      const duration = emotion === 'wink' ? POKER_AVATAR_EMOTION_WINK_MS : POKER_AVATAR_EMOTION_DURATION_MS;
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
    client.on('poker_avatar_emotion', onAvatarEmotion);

    return () => {
      client.off('poker_quick_reaction', onQuickReaction);
      client.off('poker_avatar_emotion', onAvatarEmotion);
      reactionTimeoutsRef.current.forEach((t) => clearTimeout(t));
      reactionTimeoutsRef.current.clear();
      emotionTimeoutsRef.current.forEach((t) => clearTimeout(t));
      emotionTimeoutsRef.current.clear();
    };
  }, [tableId]);

  // Heartbeat: detect disconnect/reconnect and re-sync state
  useEffect(() => {
    if (!clientRef.current || !tableId) return;
    let wasConnected = clientRef.current.isConnected();
    const interval = setInterval(() => {
      const client = clientRef.current;
      if (!client) return;
      const isNowConnected = client.isConnected();
      if (wasConnected && !isNowConnected) {
        setDisconnected(true);
      } else if (!wasConnected && isNowConnected) {
        setDisconnected(false);
        // Re-join room and refresh state after reconnect
        client.joinRoom(`poker:table:${tableId}`).catch(() => {});
        fetchLatestState();
      }
      wasConnected = isNowConnected;
    }, 1500);
    return () => clearInterval(interval);
  }, [tableId, wsConnected, fetchLatestState]);

  // Mobile viewport lock (768px breakpoint, same as Plinko) — restore on unmount
  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    const originalContent = viewport?.getAttribute('content') ?? '';
    const setViewport = (mobile: boolean) => {
      if (!viewport) return;
      if (mobile) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
      } else {
        viewport.setAttribute('content', originalContent || 'width=device-width, initial-scale=1');
      }
    };
    const check = () => setViewport(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('resize', check);
      if (viewport) viewport.setAttribute('content', originalContent || 'width=device-width, initial-scale=1');
    };
  }, []);

  // Leave table when navigating away (browser tab close / navigation)
  useEffect(() => {
    if (!tableId || !normalizedAddress) return;
    const leaveOnUnload = () => {
      const client = clientRef.current;
      if (client?.isConnected()) {
        client.pokerLeaveTable(tableId).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', leaveOnUnload);
    return () => {
      window.removeEventListener('beforeunload', leaveOnUnload);
      // Also leave when the React component unmounts (Next.js client-side nav)
      leaveOnUnload();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, normalizedAddress]);

  const handleFold = useCallback(() => {
    if (!state?.currentHand || !clientRef.current) return;
    clientRef.current
      .pokerAction(tableId, state.currentHand.handId, 'fold')
      .then(setState)
      .catch((err) => toast.error((err as Error).message));
  }, [tableId, state?.currentHand]);

  const handleCheck = useCallback(() => {
    if (!state?.currentHand || !clientRef.current) return;
    clientRef.current
      .pokerAction(tableId, state.currentHand.handId, 'check')
      .then(setState)
      .catch((err) => toast.error((err as Error).message));
  }, [tableId, state?.currentHand]);

  const handleCall = useCallback(() => {
    if (!state?.currentHand || !clientRef.current) return;
    clientRef.current
      .pokerAction(tableId, state.currentHand.handId, 'call', state.currentHand.toCall)
      .then(setState)
      .catch((err) => toast.error((err as Error).message));
  }, [tableId, state?.currentHand]);

  const handleBet = useCallback(
    (amount: string) => {
      if (!state?.currentHand || !clientRef.current) return;
      clientRef.current
        .pokerAction(tableId, state.currentHand.handId, 'bet', amount)
        .then(setState)
        .catch((err) => toast.error((err as Error).message));
    },
    [tableId, state?.currentHand]
  );

  const handleRaise = useCallback(
    (amount: string) => {
      if (!state?.currentHand || !clientRef.current) return;
      clientRef.current
        .pokerAction(tableId, state.currentHand.handId, 'raise', amount)
        .then(setState)
        .catch((err) => toast.error((err as Error).message));
    },
    [tableId, state?.currentHand]
  );

  const handleLeave = useCallback(() => {
    if (!clientRef.current) return;
    setShowLeaveConfirm(false);
    clientRef.current
      .pokerLeaveTable(tableId)
      .then(() => {
        // Prevent the unmount effect from leaving again
        clientRef.current = null;
        router.push('/poker');
      })
      .catch((err) => toast.error((err as Error).message));
  }, [tableId, router]);

  const handleLeaveClick = useCallback(() => {
    setShowLeaveConfirm(true);
  }, []);

  // Map chat bubbles to seat index (latest bubble per seat)
  const chatBubbleBySeatIndex = useMemo(() => {
    if (!state) return undefined;
    const now = Date.now();
    const active = seatBubbles.filter((b) => b.expiresAt > now);
    if (active.length === 0) return undefined;
    const bySeat: Record<number, string> = {};
    state.seats.forEach((seat, idx) => {
      const addr = seat.playerAddress?.toLowerCase();
      if (!addr) return;
      const bubble = active
        .filter((b) => b.senderAddress === addr)
        .sort((a, b) => b.expiresAt - a.expiresAt)[0];
      if (bubble) bySeat[idx] = bubble.text;
    });
    return Object.keys(bySeat).length ? bySeat : undefined;
  }, [state, seatBubbles]);

  const hand = state?.currentHand;
  const mySeatIndex = state ? state.seats.findIndex((s) => s.playerAddress === normalizedAddress) : -1;

  const onEmojiReaction = useCallback(
    (emoji: string) => {
      const client = clientRef.current;
      if (!client?.isConnected() || !tableId || mySeatIndex < 0) return;
      client.sendPokerQuickReaction(tableId, 'emoji', emoji);
      setReactionBySeatIndex((prev) => ({ ...prev, [mySeatIndex]: { type: 'emoji', value: emoji } }));
      if (reactionTimeoutsRef.current.has(mySeatIndex)) clearTimeout(reactionTimeoutsRef.current.get(mySeatIndex)!);
      const t = setTimeout(() => {
        setReactionBySeatIndex((prev) => {
          const next = { ...prev };
          delete next[mySeatIndex];
          return next;
        });
        reactionTimeoutsRef.current.delete(mySeatIndex);
      }, POKER_QUICK_REACTION_DURATION_MS);
      reactionTimeoutsRef.current.set(mySeatIndex, t);
    },
    [tableId, mySeatIndex],
  );

  const onPhraseReaction = useCallback(
    (phrase: string) => {
      const client = clientRef.current;
      if (!client?.isConnected() || !tableId || mySeatIndex < 0) return;
      client.sendPokerQuickReaction(tableId, 'phrase', phrase);
      setReactionBySeatIndex((prev) => ({ ...prev, [mySeatIndex]: { type: 'phrase', value: phrase } }));
      if (reactionTimeoutsRef.current.has(mySeatIndex)) clearTimeout(reactionTimeoutsRef.current.get(mySeatIndex)!);
      const t = setTimeout(() => {
        setReactionBySeatIndex((prev) => {
          const next = { ...prev };
          delete next[mySeatIndex];
          return next;
        });
        reactionTimeoutsRef.current.delete(mySeatIndex);
      }, POKER_QUICK_REACTION_DURATION_MS);
      reactionTimeoutsRef.current.set(mySeatIndex, t);
    },
    [tableId, mySeatIndex],
  );

  const onAnimationReaction = useCallback(
    (emotion: Emotion) => {
      const client = clientRef.current;
      if (!client?.isConnected() || !tableId || mySeatIndex < 0) return;
      client.sendPokerAvatarEmotion(tableId, emotion);
    },
    [tableId, mySeatIndex],
  );

  const mySeat = mySeatIndex >= 0 && state ? state.seats[mySeatIndex] : null;
  const canAct =
    !!hand &&
    hand.actingPosition != null &&
    mySeat &&
    state!.seats[hand.actingPosition]?.playerAddress === normalizedAddress &&
    !mySeat.folded &&
    !!state?.myHoleCards && state.myHoleCards.length > 0;
  const canCheck = hand?.toCall === '0' || hand?.toCall === '';
  const callAmount = hand?.toCall ?? '0';

  const ps = (file: string) => `/POKER/PokerSounds/${file}`;

  // ── Your turn sound ───────────────────────────────────────────────────────
  const prevCanActRef = useRef(false);
  useEffect(() => {
    if (canAct && !prevCanActRef.current) {
      new Audio(ps('PlayerTurn.mp3')).play().catch(() => {});
    }
    prevCanActRef.current = !!canAct;
  }, [canAct]);

  // ── Cards dealing sound (new hand) ────────────────────────────────────────
  const prevHandIdRef = useRef<string | null>(null);
  useEffect(() => {
    const handId = hand?.handId ?? null;
    if (handId && handId !== prevHandIdRef.current) {
      new Audio(ps('CardsDealing.wav')).play().catch(() => {});
    }
    prevHandIdRef.current = handId;
  }, [hand?.handId]);

  // ── Opponent action sounds ────────────────────────────────────────────────
  const prevLastActionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const la = hand?.lastAction;
    if (!la) return;
    const key = `${hand?.handId}:${la.position}:${la.action}:${la.amount}`;
    if (key === prevLastActionKeyRef.current) return;
    prevLastActionKeyRef.current = key;

    // Only play for opponent actions
    if (mySeatIndex >= 0 && la.position === mySeatIndex) return;

    const opponentStack = state?.seats[la.position]?.stack ?? '1';
    const stackBig = toBigIntSafe(opponentStack);
    const isAllIn = stackBig === 0n && (la.action === 'bet' || la.action === 'raise' || la.action === 'call');

    if (la.action === 'fold') {
      new Audio(ps('OpponentFold.wav')).play().catch(() => {});
    } else if (isAllIn) {
      new Audio(ps('OpponentAllin.mp3')).play().catch(() => {});
    } else if (la.action === 'call' || la.action === 'raise' || la.action === 'bet') {
      new Audio(ps('OpponentCall-Raise.wav')).play().catch(() => {});
    } else if (la.action === 'check') {
      new Audio(ps('OpponentChecks.mp3')).play().catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand?.lastAction, hand?.handId]);

  // ── Player wins sound ─────────────────────────────────────────────────────
  const prevWinnerKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (hand?.street !== 'showdown' || !hand.winners?.length) return;
    const key = `${hand.handId}:${hand.winners.map(w => w.address).join(',')}`;
    if (key === prevWinnerKeyRef.current) return;
    prevWinnerKeyRef.current = key;
    if (hand.winners.some(w => w.address === normalizedAddress)) {
      new Audio(ps('PlayerWins.mp3')).play().catch(() => {});
    }
  }, [hand?.street, hand?.winners, hand?.handId, normalizedAddress]);

  // ── Opponent join / leave sounds ──────────────────────────────────────────
  const prevSeatAddrsRef = useRef<(string | null)[]>([]);
  useEffect(() => {
    if (!state) return;
    const current = state.seats.map(s => s.playerAddress ?? null);
    const prev = prevSeatAddrsRef.current;
    if (prev.length > 0) {
      for (let i = 0; i < current.length; i++) {
        const wasOpponent = prev[i] && prev[i] !== normalizedAddress;
        const isOpponent  = current[i] && current[i] !== normalizedAddress;
        if (!wasOpponent && isOpponent) {
          new Audio(ps('OpponentJoined.mp3')).play().catch(() => {});
        } else if (wasOpponent && !isOpponent) {
          new Audio(ps('OpponentLeft.mp3')).play().catch(() => {});
        }
      }
    }
    prevSeatAddrsRef.current = current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.seats]);

  // ── Turn timer countdown ──────────────────────────────────────────────────
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const timerHandIdRef = useRef<string | null>(null);
  const timerPositionRef = useRef<number | null>(null);

  useEffect(() => {
    const turnStartedAt = hand?.turnStartedAt ?? null;
    const actingPosition = hand?.actingPosition ?? null;

    // Reset to 30 whenever the acting player changes
    const key = `${hand?.handId}:${actingPosition}`;
    const prevKey = `${timerHandIdRef.current}:${timerPositionRef.current}`;
    if (key !== prevKey) {
      timerHandIdRef.current = hand?.handId ?? null;
      timerPositionRef.current = actingPosition;
      if (turnStartedAt && actingPosition != null) {
        const elapsed = (Date.now() - new Date(turnStartedAt).getTime()) / 1000;
        setTimeLeft(Math.max(0, Math.round(30 - elapsed)));
      } else {
        setTimeLeft(30);
      }
    }

    if (!turnStartedAt || actingPosition == null) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - new Date(turnStartedAt).getTime()) / 1000;
      const remaining = Math.max(0, Math.round(30 - elapsed));
      setTimeLeft(remaining);
    }, 500);

    return () => clearInterval(interval);
  }, [hand?.turnStartedAt, hand?.actingPosition, hand?.handId]);

  const pokerTheme = DEFAULT_POKER_THEME;
  const themeVars = getPokerThemeVars(pokerTheme);
  const cyberpunk = pokerTheme === 'cyberpunk';

  const fmtChips = (wei: string | number) => {
    try {
      const n = Number(formatEther(toBigIntSafe(wei)));
      return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch { return String(wei); }
  };

  const sharedActions = state && mySeat && (
    <PokerActions
      canAct={!!canAct}
      canCheck={canCheck}
      minRaise={hand?.minRaise ?? '0'}
      stack={mySeat.stack ?? '0'}
      callAmount={callAmount}
      pot={hand?.pot ?? '0'}
      onFold={handleFold}
      onCheck={handleCheck}
      onCall={handleCall}
      onBet={handleBet}
      onRaise={handleRaise}
    />
  );

  return (
    <GlobalMainNav page="home">
      <PokerThemeProvider themeId={pokerTheme}>
        <div
          className={`flex flex-col ${cyberpunk ? 'font-mono uppercase' : ''}`}
          style={{
            ...themeVars as React.CSSProperties,
            minHeight: '100dvh',
            background: 'rgb(2 6 23)',
            color: 'var(--poker-text)',
            overflow: 'hidden',
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)',
          }}
        >
          {/* Top nav bar */}
          <div
            className="flex-shrink-0 flex items-center justify-between px-2 z-30 gap-2"
            style={{
              background: 'rgba(10,10,10,0.96)',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              paddingTop: 'max(8px, env(safe-area-inset-top, 0px))',
              paddingBottom: '8px',
            }}
          >
            <Link
              href="/poker"
              className="h-9 px-3 rounded-sm text-[11px] font-bold tracking-wide flex items-center hover:brightness-125 active:scale-[0.97] transition-all shrink-0"
              style={{
                background: 'rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.75)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
            >
              ← Lobby
            </Link>
            {state && (
              <span className="text-[10px] text-[rgba(255,255,255,0.45)] tabular-nums truncate flex-1 text-center">
                {fmtChips(state.smallBlind)}/{fmtChips(state.bigBlind)} · {state.seats.filter(s => s.playerAddress).length}/{state.maxSeats} seats
              </span>
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              {normalizedAddress && (
                <button
                  type="button"
                  onClick={() => setShowStatsModal(true)}
                  className="h-9 px-3 rounded-sm text-[11px] font-bold tracking-wide transition-all hover:brightness-125 active:scale-[0.97]"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    color: 'rgba(255,255,255,0.75)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                  }}
                >
                  Stats
                </button>
              )}
              <button
                type="button"
                onClick={handleLeaveClick}
                className="h-9 px-3 rounded-sm text-[11px] font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97]"
                style={{
                  background: 'linear-gradient(180deg, #8b1a1a 0%, #6b1111 100%)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                }}
              >
                Leave
              </button>
            </div>
          </div>

          {/* Disconnected banner */}
          {disconnected && (
            <div
              className="flex-shrink-0 py-1.5 text-center text-[11px] font-medium animate-pulse"
              style={{ color: 'var(--poker-danger)', background: 'color-mix(in srgb, var(--poker-danger) 10%, transparent)', borderBottom: '1px solid var(--poker-danger)' }}
            >
              Connection lost — reconnecting...
            </div>
          )}

          {/* Table — bottom padding so current player/cards overlay open center on mobile, above bar on desktop */}
          {/* maxWidth clamps width relative to available height so the oval stays proportional on wide monitors */}
          <div
            className={`flex-1 relative ${state && mySeat ? 'pb-[100px] sm:pb-[200px]' : ''}`}
            style={{
              minHeight: 0,
              overflow: 'visible',
              maxWidth: 'min(100vw, calc((100dvh - 120px) * 2.4))',
              marginLeft: 'auto',
              marginRight: 'auto',
              width: '100%',
            }}
          >
            {state ? (
              <PokerTable
                state={state}
                currentPlayerAddress={normalizedAddress}
                onLeave={handleLeaveClick}
                timeLeft={timeLeft}
                chatBubbleBySeatIndex={chatBubbleBySeatIndex}
                reactionBySeatIndex={reactionBySeatIndex}
                broadcastEmotionBySeatIndex={broadcastEmotionBySeatIndex}
                onEmojiReaction={mySeatIndex >= 0 ? onEmojiReaction : undefined}
                onPhraseReaction={mySeatIndex >= 0 ? onPhraseReaction : undefined}
                onAnimationReaction={mySeatIndex >= 0 ? onAnimationReaction : undefined}
                onReUpClick={mySeat ? () => setShowDepositModal(true) : undefined}
                onMenuClick={mySeat ? () => setShowAvatarModal(true) : undefined}
              />
            ) : !error ? (
              <div className="absolute inset-0 flex items-center justify-center text-[var(--poker-text-muted)] text-sm">
                Loading table...
              </div>
            ) : null}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center px-4">
                <p className="text-[var(--poker-danger)] text-sm text-center">{error}</p>
              </div>
            )}
          </div>

          {/* Action bar */}
          {state && mySeat && (
            <div className="flex-shrink-0">
              {sharedActions}
            </div>
          )}

          {/* Activity feed — always-on, bottom-left desktop / left-drawer mobile */}
          {wsClient && pokerChatRoomId && (
            <PokerActivityFeed
              wsClient={wsClient}
              wsConnected={wsConnected}
              roomId={pokerChatRoomId}
              tableId={tableId}
              state={state}
            />
          )}
        </div>

        <PokerDepositModal
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          balanceLabel="Poker Balance"
          wsClient={mySeat ? wsClient : undefined}
          tableId={mySeat ? tableId : undefined}
          currentStack={mySeat?.stack}
          onReupSuccess={(s) => { if (s) setState(s); }}
        />
        <PokerStatsModal
          isOpen={showStatsModal}
          onClose={() => setShowStatsModal(false)}
          playerAddress={normalizedAddress}
        />
        {/* Leave table confirmation (non-tournament): shows leaving amount and asks to confirm */}
        {showLeaveConfirm && mySeat && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div
              className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden p-5"
              style={{ boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)' }}
            >
              <p className="text-slate-200 text-sm mb-1">Leaving amount</p>
              <p className="text-cyan-400 font-semibold tabular-nums text-lg mb-4">{fmtChips(mySeat.stack ?? '0')} chips</p>
              <p className="text-slate-300 text-sm mb-5">Are you sure you want to leave?</p>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowLeaveConfirm(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:brightness-110"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.9)',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLeave}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:brightness-110"
                  style={{
                    background: 'linear-gradient(180deg, #8b1a1a 0%, #6b1111 100%)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}
        <ProfileAvatarModal
          open={showAvatarModal}
          onClose={() => setShowAvatarModal(false)}
          wsClient={wsClient}
          onSave={() => {
            fetchLatestState();
            queryClient.invalidateQueries({ queryKey: ['playerProfile'] });
          }}
        />
      </PokerThemeProvider>
    </GlobalMainNav>
  );
}
