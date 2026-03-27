'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { formatEther } from 'viem';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { motion, AnimatePresence } from 'framer-motion';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { PokerTableState, ChatMessagePayload } from '@/lib/websocket-client';
import { DEFAULT_POKER_THEME, getPokerThemeVars } from '@/lib/poker-themes';
import { PokerThemeProvider } from '@/components/poker/PokerThemeContext';
import { PokerTable } from '@/components/poker/PokerTable';
import type { Emotion } from '@/components/poker/avatar/AvatarView';
import { PokerActions } from '@/components/poker/PokerActions';
import { PokerDepositModal } from '@/components/poker/PokerDepositModal';
import { PokerStatsModal } from '@/components/poker/PokerStatsModal';
import { ProfileAvatarModal } from '@/components/shared/ProfileAvatarModal';
import { PokerActivityFeed } from '@/components/poker/PokerActivityFeed';
import { PokerOpponentProfileCard } from '@/components/poker/PokerOpponentProfileCard';
import { PokerSoundsSettingsModal } from '@/components/poker/PokerSoundsSettingsModal';
import { PokerTableSettingsModal } from '@/components/poker/PokerTableSettingsModal';
import { EditQuickChatModal } from '@/components/poker/EditQuickChatModal';
import { usePokerSounds } from '@/hooks/use-poker-sounds';
import { PokerTableEffectProvider } from '@/hooks/use-poker-table-effect';
import { useQuickChatPhrases } from '@/hooks/useQuickChatPhrases';
import { useProfileWs } from '@/contexts/profile-ws-context';
import { isAdminWallet } from '@/lib/admin';
import { PokerTableDashboard } from '@/components/poker/PokerTableDashboard';
import { PokerPlayerTableDashboard } from '@/components/poker/PokerPlayerTableDashboard';
import { useQueryClient } from '@tanstack/react-query';
import { IconButton } from '@/components/animate-ui/components/buttons/icon';
import { toast } from 'sonner';
import { PokerBetaSplash } from '@/components/poker/PokerBetaSplash';
import { MorbiusLoadingChip } from '@/components/shared/MorbiusLoadingChip';

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
  const pinParam = searchParams.get('pin');

  const [state, setState] = useState<PokerTableState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsModalAddress, setStatsModalAddress] = useState<string | null>(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showMyStats, setShowMyStats] = useState(false);
  const [opponentProfileAddress, setOpponentProfileAddress] = useState<string | null>(null);
  const isAdmin = isAdminWallet(address);
  /** Chat bubbles above seats: id, senderAddress (lowercase), text, expiresAt. Cleared after 5s. */
  const [seatBubbles, setSeatBubbles] = useState<Array<{ id: string; senderAddress: string; text: string; expiresAt: number }>>([]);
  const bubbleTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reactionTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  /** Per-seat QuickChat phrase shown above seat; cleared after 2s. */
  const [reactionBySeatIndex, setReactionBySeatIndex] = useState<Record<number, string>>({});
  const [broadcastEmotionBySeatIndex, setBroadcastEmotionBySeatIndex] = useState<Record<number, Emotion>>({});
  const emotionTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const clientRef = useRef<BlackjackWebSocketClient | null>(null);
  const [tipAnimating, setTipAnimating] = useState(false);
  /** Bumped to open Activity drawer from seat radial on mobile. */
  const [activityMobileOpenSerial, setActivityMobileOpenSerial] = useState(0);
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
            .pokerJoinTable(tableId, buyInParam, pinParam || undefined)
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

  // QuickChat phrases — broadcast to table, show above seat for 2s
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

  const onOpponentRadialAction = useCallback(
    async (action: 'profile' | 'follow' | 'gift', addr: string) => {
      const me = normalizedAddress;
      if (action === 'profile') {
        setOpponentProfileAddress(addr);
        return;
      }
      if (action === 'gift') {
        toast.info('Gifts coming soon');
        return;
      }
      if (action === 'follow') {
        if (!me) {
          toast.error('Connect your wallet to follow players');
          return;
        }
        try {
          const isFollowing = await queryClient.fetchQuery({
            queryKey: ['isFollowing', me, addr],
            queryFn: async () => {
              const res = await fetch(
                `/api/player/${addr}/is-following?follower=${encodeURIComponent(me)}`,
              );
              if (!res.ok) throw new Error('Failed to check follow status');
              const data = await res.json();
              return data.isFollowing as boolean;
            },
          });

          if (isFollowing) {
            const res = await fetch(`/api/player/${addr}/follow`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ follower: me }),
            });
            if (!res.ok) throw new Error('Failed to unfollow');
            toast.success('Unfollowed');
          } else {
            const res = await fetch(`/api/player/${addr}/follow`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ follower: me }),
            });
            if (!res.ok) throw new Error('Failed to follow');
            toast.success('Following');
          }
          await queryClient.invalidateQueries({ queryKey: ['isFollowing', me, addr] });
          await queryClient.invalidateQueries({ queryKey: ['followCounts', addr] });
          await queryClient.invalidateQueries({ queryKey: ['followCounts', me] });
        } catch {
          toast.error('Could not update follow');
        }
      }
    },
    [normalizedAddress, queryClient],
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
  const sounds = usePokerSounds();
  const [showSoundsModal, setShowSoundsModal] = useState(false);
  const [showTableSettingsModal, setShowTableSettingsModal] = useState(false);
  const [showEditQuickChatModal, setShowEditQuickChatModal] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [statsMenuOpen, setStatsMenuOpen] = useState(false);
  const [quickChatPhrases, setQuickChatPhrases] = useQuickChatPhrases();

  // ── Your turn sound ───────────────────────────────────────────────────────
  const prevCanActRef = useRef(false);
  useEffect(() => {
    if (canAct && !prevCanActRef.current) {
      sounds.play('player_turn', ps('PlayerTurn.mp3'));
    }
    prevCanActRef.current = !!canAct;
  }, [canAct]);

  // ── Cards dealing sound (new hand) ────────────────────────────────────────
  const prevHandIdRef = useRef<string | null>(null);
  useEffect(() => {
    const handId = hand?.handId ?? null;
    if (handId && handId !== prevHandIdRef.current) {
      sounds.play('cards_dealing', ps('CardsDealing.wav'));
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
      sounds.play('opponent_fold', ps('OpponentFold.wav'));
    } else if (isAllIn) {
      sounds.play('opponent_allin', ps('OpponentAllin.mp3'));
    } else if (la.action === 'call' || la.action === 'raise' || la.action === 'bet') {
      sounds.play('opponent_call_raise', ps('OpponentCall-Raise.wav'));
    } else if (la.action === 'check') {
      sounds.play('opponent_checks', ps('OpponentChecks.mp3'));
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
      sounds.play('win', ps('PlayerWins.mp3'));
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
          sounds.play('opponent_joined', ps('OpponentJoined.mp3'));
        } else if (wasOpponent && !isOpponent) {
          sounds.play('opponent_left', ps('OpponentLeft.mp3'));
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
    <PokerThemeProvider themeId={pokerTheme}>
      <PokerTableEffectProvider>
        <PokerBetaSplash />
        <div
          className={`flex flex-col ${cyberpunk ? 'font-mono uppercase' : ''}`}
          style={{
            ...themeVars as React.CSSProperties,
            height: '100dvh',
            background: 'rgb(2 6 23)',
            color: 'var(--poker-text)',
            overflow: 'hidden',
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)',
          }}
        >
          {/* Top nav bar */}
          <div
            className="grid flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 z-30 font-russo-one"
            style={{
              background: 'rgba(10,10,10,0.96)',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              paddingTop: 'max(8px, env(safe-area-inset-top, 0px))',
              paddingBottom: '8px',
            }}
          >
            <div aria-hidden className="min-w-0" />
            {state && (
              <div className="flex flex-col items-center justify-center min-w-0 gap-0.5">
                <span className="text-[10px] text-[rgba(255,255,255,0.45)] tabular-nums truncate text-center w-full">
                  {fmtChips(state.smallBlind)}/{fmtChips(state.bigBlind)} · {state.seats.filter(s => s.playerAddress).length}/{state.maxSeats} seats
                </span>
              </div>
            )}
            {!state && <div className="min-w-0" />}
            <div className="flex items-center justify-end gap-1.5 shrink-0 relative">
              {/* Settings dropdown — includes Table Appearance, Sounds, Edit QuickChat */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setSettingsMenuOpen((o) => !o); setStatsMenuOpen(false); }}
                  className="h-9 px-3 rounded-sm text-[11px] font-bold tracking-wide transition-all hover:brightness-125 active:scale-[0.97]"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    color: 'rgba(255,255,255,0.75)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                  }}
                  aria-expanded={settingsMenuOpen}
                  aria-haspopup="true"
                >
                  Settings
                </button>
                {settingsMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      aria-hidden
                      onClick={() => setSettingsMenuOpen(false)}
                    />
                    <div
                      className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-white/10 overflow-hidden"
                      style={{
                        background: 'rgba(10,10,10,0.98)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => { setShowTableSettingsModal(true); setSettingsMenuOpen(false); }}
                        className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10"
                        style={{ color: 'rgba(255,255,255,0.9)' }}
                      >
                        Table Appearance
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowSoundsModal(true); setSettingsMenuOpen(false); }}
                        className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                        style={{ color: 'rgba(255,255,255,0.9)' }}
                      >
                        Sounds
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowEditQuickChatModal(true); setSettingsMenuOpen(false); }}
                        className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                        style={{ color: 'rgba(255,255,255,0.9)' }}
                      >
                        Edit QuickChat
                      </button>
                    </div>
                  </>
                )}
              </div>
              {/* Stats dropdown — includes Player Stats, Table Stats, and (admin) Dashboard */}
              {normalizedAddress && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setStatsMenuOpen((o) => !o); setSettingsMenuOpen(false); }}
                    className="h-9 px-3 rounded-sm text-[11px] font-bold tracking-wide transition-all hover:brightness-125 active:scale-[0.97]"
                    style={{
                      background: (showMyStats || showDashboard) ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.07)',
                      color: (showMyStats || showDashboard) ? 'rgb(34,211,238)' : 'rgba(255,255,255,0.75)',
                      border: `1px solid ${(showMyStats || showDashboard) ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.1)'}`,
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                    }}
                    aria-expanded={statsMenuOpen}
                    aria-haspopup="true"
                  >
                    Stats
                  </button>
                  {statsMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        aria-hidden
                        onClick={() => setStatsMenuOpen(false)}
                      />
                      <div
                        className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-white/10 overflow-hidden"
                        style={{
                          background: 'rgba(10,10,10,0.98)',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => { setStatsModalAddress(normalizedAddress); setShowStatsModal(true); setStatsMenuOpen(false); }}
                          className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10"
                          style={{ color: 'rgba(255,255,255,0.9)' }}
                        >
                          Player Stats
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowMyStats(v => !v); if (showDashboard) setShowDashboard(false); setStatsMenuOpen(false); }}
                          className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                          style={{ color: showMyStats ? 'rgb(34,211,238)' : 'rgba(255,255,255,0.9)' }}
                        >
                          Table Stats
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => { setShowDashboard(v => !v); if (showMyStats) setShowMyStats(false); setStatsMenuOpen(false); }}
                            className="w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/10 border-t border-white/5"
                            style={{ color: showDashboard ? 'rgb(34,211,238)' : 'rgba(255,255,255,0.9)' }}
                          >
                            Poker Dashboard
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
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

          {/* Dashboard overlay — replaces table when admin toggles dashboard */}
          {showDashboard && isAdmin && (
            <div className="flex-1 relative overflow-y-auto" style={{ minHeight: 0 }}>
              <PokerTableDashboard tableId={tableId} />
            </div>
          )}

          {/* Player table stats — replaces table when player toggles My Table */}
          {showMyStats && normalizedAddress && !showDashboard && (
            <div className="flex-1 relative overflow-y-auto" style={{ minHeight: 0 }}>
              <PokerPlayerTableDashboard tableId={tableId} playerAddress={normalizedAddress} />
            </div>
          )}

          {/* Table — fills all remaining height between nav and controls bar */}
          <div
            className="flex-1 relative"
            style={{
              minHeight: 0,
              maxWidth: 'min(100vw, calc((100dvh - 160px) * 2.4))',
              marginLeft: 'auto',
              marginRight: 'auto',
              width: '100%',
              display: showDashboard || showMyStats ? 'none' : undefined,
            }}
          >
            {/* Tip dealer button — top center overlay */}
            {normalizedAddress && wsConnected && wsClient && mySeat && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
                <IconButton
                  variant="tip"
                  size="tip"
                  onClick={async () => {
                    if (tipAnimating) return;
                    sounds.play('call', ps('PlayerClickConfirmation1.mp3'));
                    setTipAnimating(true);
                    try {
                      await wsClient.sendRequest('tip_dealer', {
                        amount: (BigInt(2000) * BigInt('1000000000000000000')).toString(),
                      });
                      fetchLatestState();
                    } catch { /* ignore */ }
                    setTimeout(() => setTipAnimating(false), 900);
                  }}
                  disabled={tipAnimating}
                >
                  Tip 2,000
                </IconButton>
                {tipAnimating && (
                  <div className="absolute pointer-events-none" style={{ top: 0, left: '50%', transform: 'translateX(-50%)' }}>
                    <div className="tip-chip-fly">
                      <div className="w-6 h-6 rounded-full border-2 border-amber-400 bg-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/40">
                        <span className="text-white text-[8px] font-bold">$</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {state ? (
              <PokerTable
                state={state}
                currentPlayerAddress={normalizedAddress}
                onLeave={handleLeaveClick}
                onRequestMobileActivity={() => setActivityMobileOpenSerial((n) => n + 1)}
                timeLeft={timeLeft}
                chatBubbleBySeatIndex={chatBubbleBySeatIndex}
                reactionBySeatIndex={reactionBySeatIndex}
                broadcastEmotionBySeatIndex={broadcastEmotionBySeatIndex}
                onPhraseReaction={mySeatIndex >= 0 ? onPhraseReaction : undefined}
                onAnimationReaction={mySeatIndex >= 0 ? onAnimationReaction : undefined}
                onReUpClick={undefined}
                onMenuClick={mySeat ? () => setShowAvatarModal(true) : undefined}
                onOpponentClick={(addr) => setOpponentProfileAddress(addr)}
                onOpponentRadialAction={onOpponentRadialAction}
                quickChatPhrases={quickChatPhrases}
                setQuickChatPhrases={setQuickChatPhrases}
                onOpenEditQuickChat={() => setShowEditQuickChatModal(true)}
              />
            ) : !error ? (
              <>
                <div className="absolute inset-0 flex items-center justify-center text-[var(--poker-text-muted)] text-sm">
                  Loading table...
                </div>
                <MorbiusLoadingChip />
              </>
            ) : null}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center px-4">
                <p className="text-[var(--poker-danger)] text-sm text-center">{error}</p>
              </div>
            )}
          </div>

          {/* Bottom row: md+ 3-col grid (empty | empty | betting); Activity overlays bottom-left so table keeps full height */}
          <div
            className="flex-shrink-0 grid grid-cols-1 md:grid-cols-[minmax(260px,1fr)_1fr_minmax(280px,1fr)] gap-0 min-h-0"
          >
            {/* Col 1: empty — Activity feed is overlay (fixed) on md+, not in flow */}
            <div className="hidden md:block min-w-0 md:order-1" />
            {/* Col 2: empty middle */}
            <div className="hidden md:block min-w-0 md:order-2" />
            {/* Col 3: betting controls — right on md+, first on mobile */}
            <div className="order-1 md:order-3 flex-shrink-0 min-w-0">
              {state && mySeat && sharedActions}
            </div>
          </div>

          {/* Activity feed — overlay on md+ (fixed bottom-left), drawer on mobile; does not take layout space */}
          {wsClient && pokerChatRoomId && (
            <PokerActivityFeed
              wsClient={wsClient}
              wsConnected={wsConnected}
              roomId={pokerChatRoomId}
              tableId={tableId}
              state={state}
              mobileOpenRequestSerial={activityMobileOpenSerial}
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
          playerAddress={statsModalAddress}
        />
        <PokerSoundsSettingsModal
          isOpen={showSoundsModal}
          onClose={() => setShowSoundsModal(false)}
        />
        <PokerTableSettingsModal
          isOpen={showTableSettingsModal}
          onClose={() => setShowTableSettingsModal(false)}
          isAdmin={isAdmin}
          currentLogo={state?.tableLogo}
          currentLogoOpacity={state?.tableLogoOpacity}
          wsClient={wsClient}
          tableId={tableId}
        />
        <EditQuickChatModal
          open={showEditQuickChatModal}
          onClose={() => setShowEditQuickChatModal(false)}
          selectedPhrases={quickChatPhrases}
          onSave={setQuickChatPhrases}
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
        <AnimatePresence>
          {opponentProfileAddress && (() => {
            const seat = state?.seats.find(s => s.playerAddress === opponentProfileAddress);
            return (
              <PokerOpponentProfileCard
                key={opponentProfileAddress}
                address={opponentProfileAddress}
                displayName={seat?.displayName}
                avatarConfig={seat?.avatarConfig}
                onClose={() => setOpponentProfileAddress(null)}
                onViewFullProfile={(addr) => {
                  setStatsModalAddress(addr);
                  setShowStatsModal(true);
                }}
              />
            );
          })()}
        </AnimatePresence>

        <ProfileAvatarModal
          open={showAvatarModal}
          onClose={() => setShowAvatarModal(false)}
          wsClient={wsClient}
          onSave={() => {
            fetchLatestState();
            queryClient.invalidateQueries({ queryKey: ['playerProfile'] });
          }}
        />
      </PokerTableEffectProvider>
      </PokerThemeProvider>
  );
}
