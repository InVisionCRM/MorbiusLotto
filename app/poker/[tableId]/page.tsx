'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useSignTypedData } from 'wagmi';
import { formatEther } from 'viem';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { PokerTableState } from '@/lib/websocket-client';
import { DEFAULT_POKER_THEME, getPokerThemeVars } from '@/lib/poker-themes';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { PokerThemeProvider } from '@/components/poker/PokerThemeContext';
import { PokerTable } from '@/components/poker/PokerTable';
import { PokerActions } from '@/components/poker/PokerActions';
import { PokerDepositModal } from '@/components/poker/PokerDepositModal';
import { toast } from 'sonner';

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
  const clientRef = useRef<BlackjackWebSocketClient | null>(null);
  // Monotonic counter to discard out-of-order pokerGetState responses.
  const fetchSeqRef = useRef(0);

  const normalizedAddress = address?.toLowerCase() ?? null;

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
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, normalizedAddress, signTypedDataAsync]);

  useEffect(() => {
    if (!wsConnected || !clientRef.current || !tableId) return;
    clientRef.current.joinRoom(`poker:table:${tableId}`).catch(() => {});
  }, [wsConnected, tableId]);

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
    clientRef.current
      .pokerLeaveTable(tableId)
      .then(() => {
        // Prevent the unmount effect from leaving again
        clientRef.current = null;
        router.push('/poker');
      })
      .catch((err) => toast.error((err as Error).message));
  }, [tableId, router]);

  const hand = state?.currentHand;
  const mySeatIndex = state ? state.seats.findIndex((s) => s.playerAddress === normalizedAddress) : -1;
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

  const fmtChips = (wei: string) => {
    try {
      const n = Number(formatEther(BigInt(wei)));
      return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch { return wei; }
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
              <button
                type="button"
                onClick={() => setShowDepositModal(true)}
                className="h-9 px-3 rounded-sm text-[11px] font-bold tracking-wide transition-all hover:brightness-125 active:scale-[0.97]"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  color: 'rgba(255,255,255,0.75)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
              >
                {mySeat ? 'Re-up' : 'Balance'}
              </button>
              <button
                type="button"
                onClick={handleLeave}
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

          {/* Table — bottom padding so current player tag stays above action bar */}
          <div className="flex-1 relative" style={{ minHeight: 0, overflow: 'visible', paddingBottom: state && mySeat ? 140 : 0 }}>
            {state ? (
              <PokerTable state={state} currentPlayerAddress={normalizedAddress} onLeave={handleLeave} timeLeft={timeLeft} />
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
      </PokerThemeProvider>
    </GlobalMainNav>
  );
}
