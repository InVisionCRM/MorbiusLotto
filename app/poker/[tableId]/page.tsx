'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useSignTypedData } from 'wagmi';
import { formatEther } from 'viem';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { PokerTableState } from '@/lib/websocket-client';
import { defaultPokerLayout } from '@/lib/poker-layout';
import { DEFAULT_POKER_THEME, getPokerThemeVars } from '@/lib/poker-themes';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import Footer from '@/components/BIG-WHEEL/Footer';
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

        {/* ─── MOBILE LAYOUT (< sm) ─── */}
        <div
          className={`sm:hidden flex flex-col bg-[var(--poker-bg)] text-[var(--poker-text)] tracking-[var(--poker-tracking)] ${cyberpunk ? 'font-mono uppercase' : ''}`}
          style={{ ...themeVars, height: '100dvh' }}
        >
          {/* Top nav bar */}
          <div
            className="flex-shrink-0 flex items-center justify-between px-3 py-2 z-10 gap-2"
            style={{ background: 'rgba(0,0,0,0.55)', borderBottom: '1px solid var(--poker-panel-border)' }}
          >
            <Link href="/poker" className="text-[var(--poker-accent)] text-sm font-medium shrink-0 hover:opacity-80">
              ← Lobby
            </Link>
            {state && (
              <span className="text-[10px] text-[var(--poker-accent)] tabular-nums truncate flex-1 text-center">
                {fmtChips(state.smallBlind)}/{fmtChips(state.bigBlind)} · {state.seats.filter(s => s.playerAddress).length}/{state.maxSeats} seats
              </span>
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowDepositModal(true)}
                className="px-2.5 py-1 rounded border border-[var(--poker-accent)] text-[var(--poker-accent)] text-[11px] font-medium hover:opacity-80 active:scale-95 transition-all"
              >
                {mySeat ? 'Re-up' : 'Bal'}
              </button>
              <button
                type="button"
                onClick={handleLeave}
                className="px-2.5 py-1 rounded border border-[var(--poker-danger)] text-[var(--poker-danger)] text-[11px] font-medium hover:opacity-80 active:scale-95 transition-all"
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

          {/* Table area — flex-1 so it fills remaining space above action bar */}
          <div className="flex-1 min-h-0 relative overflow-hidden">
            {state ? (
              <PokerTable layout={defaultPokerLayout} state={state} currentPlayerAddress={normalizedAddress} onLeave={handleLeave} timeLeft={timeLeft} />
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

          {/* Action bar — always pinned at bottom */}
          {state && mySeat && <div className="flex-shrink-0">{sharedActions}</div>}
        </div>

        {/* ─── DESKTOP LAYOUT (≥ sm) ─── */}
        <div
          className={`hidden sm:flex flex-col items-center w-full flex-1 min-w-0 min-h-screen bg-[var(--poker-bg)] text-[var(--poker-text)] tracking-[var(--poker-tracking)] relative ${cyberpunk ? 'font-mono uppercase' : ''}`}
          style={themeVars}
        >
          {cyberpunk && (
            <div
              className="absolute inset-0 pointer-events-none z-0"
              style={{
                background: 'linear-gradient(rgba(0,255,170,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,170,0.05) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
              aria-hidden
            />
          )}
          <div className="z-10 flex flex-col items-center w-full flex-1 min-w-0">
            <div className="relative w-full max-w-full h-[100dvh] max-h-[100dvh] md:max-h-none md:h-auto md:w-fit flex-shrink-0 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/POKER/Pokerbg.jpg"
                alt=""
                className="block w-full h-full max-w-full max-h-full object-contain pointer-events-none md:max-h-[100vh] md:w-auto md:h-auto"
              />
              <div className="absolute inset-0 bg-black/40 pointer-events-none" aria-hidden />
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 pointer-events-auto min-w-0 min-h-0">
                  <div className="absolute left-2 top-2 z-20 flex items-center gap-2">
                    <Link href="/poker" className="text-[var(--poker-accent)] hover:opacity-90 text-xs sm:text-sm">
                      ← Lobby
                    </Link>
                    <button
                      type="button"
                      onClick={() => setShowDepositModal(true)}
                      className="px-2 py-0.5 sm:px-3 sm:py-1 rounded border border-[var(--poker-accent)] text-[var(--poker-accent)] hover:opacity-80 active:scale-95 active:brightness-90 transition-all text-[10px] sm:text-xs"
                    >
                      {mySeat ? '+ Re-up' : 'Balance'}
                    </button>
                  </div>
                  {disconnected && (
                    <div className="absolute left-1/2 -translate-x-1/2 top-2 z-30 px-3 py-1.5 rounded-lg border border-[var(--poker-danger)] text-[var(--poker-danger)] text-xs sm:text-sm font-medium animate-pulse backdrop-blur-sm bg-[var(--poker-bg-elevated)]">
                      Connection lost — reconnecting...
                    </div>
                  )}
                  {error && (
                    <p className="absolute left-2 top-8 z-20 text-[var(--poker-danger)] text-sm">{error}</p>
                  )}
                  {state && (
                    <PokerTable layout={defaultPokerLayout} state={state} currentPlayerAddress={normalizedAddress} onLeave={handleLeave} timeLeft={timeLeft} />
                  )}
                  {!state && !error && (
                    <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-[var(--poker-text-muted)]">Loading table...</p>
                  )}
                </div>
              </div>
            </div>
            {state && mySeat && <div className="w-full flex-shrink-0">{sharedActions}</div>}
          </div>
          <Footer />
        </div>

        <PokerDepositModal
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          wsClient={mySeat ? wsClient : undefined}
          tableId={mySeat ? tableId : undefined}
          currentStack={mySeat?.stack}
          onReupSuccess={(s) => { if (s) setState(s); }}
        />
      </PokerThemeProvider>
    </GlobalMainNav>
  );
}
