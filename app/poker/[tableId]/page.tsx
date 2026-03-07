'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useSignTypedData } from 'wagmi';
import { getWebSocketUrlOptional, getApiUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { PokerTableState } from '@/lib/websocket-client';
import { defaultPokerLayout } from '@/lib/poker-layout';
import { DEFAULT_POKER_THEME, getPokerThemeVars } from '@/lib/poker-themes';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import Footer from '@/components/BIG-WHEEL/Footer';
import { PokerThemeProvider } from '@/components/poker/PokerThemeContext';
import { PokerTable } from '@/components/poker/PokerTable';
import { PokerActions } from '@/components/poker/PokerActions';
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
  const [botsActive, setBotsActive] = useState(false);
  const [spawningBots, setSpawningBots] = useState(false);
  const clientRef = useRef<BlackjackWebSocketClient | null>(null);

  const normalizedAddress = address?.toLowerCase() ?? null;

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
            .then(() => client.joinRoom(`poker:table:${tableId}`))
            .then(() => client.pokerGetState(tableId))
            .then((s) => {
              setState(s);
              router.replace(`/poker/${tableId}`);
            })
            .catch((err) => {
              setError(err?.message ?? 'Failed to join');
              toast.error(err?.message ?? 'Failed to join');
              router.replace(`/poker/${tableId}`);
            });
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
        client.pokerGetState(tableId).then(setState).catch(() => {});
      }
      wasConnected = isNowConnected;
    }, 1500);
    return () => clearInterval(interval);
  }, [tableId, wsConnected]);

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
      .then(() => router.push('/poker'))
      .catch((err) => toast.error((err as Error).message));
  }, [tableId, router]);

  const handleSpawnBots = useCallback(async (numBots: number = 2) => {
    const apiUrl = getApiUrlOptional();
    if (!apiUrl || !tableId) return;
    setSpawningBots(true);
    try {
      const res = await fetch(`${apiUrl}/api/poker/bots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId, numBots }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add bots');
      setBotsActive(true);
      toast.success(`Added ${data.bots?.length ?? numBots} bot(s) to the table`);
      // Refresh state
      if (clientRef.current) {
        clientRef.current.pokerGetState(tableId).then(setState).catch(() => {});
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSpawningBots(false);
    }
  }, [tableId]);

  const handleRemoveBots = useCallback(async () => {
    const apiUrl = getApiUrlOptional();
    if (!apiUrl || !tableId) return;
    try {
      const res = await fetch(`${apiUrl}/api/poker/bots?tableId=${tableId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove bots');
      setBotsActive(false);
      toast.success('Bots removed');
      if (clientRef.current) {
        clientRef.current.pokerGetState(tableId).then(setState).catch(() => {});
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [tableId]);

  const hand = state?.currentHand;
  const mySeatIndex = state ? state.seats.findIndex((s) => s.playerAddress === normalizedAddress) : -1;
  const mySeat = mySeatIndex >= 0 && state ? state.seats[mySeatIndex] : null;
  const canAct =
    !!hand &&
    hand.actingPosition != null &&
    mySeat &&
    state!.seats[hand.actingPosition]?.playerAddress === normalizedAddress &&
    !mySeat.folded;
  const canCheck = hand?.toCall === '0' || hand?.toCall === '';
  const callAmount = hand?.toCall ?? '0';

  const pokerTheme = DEFAULT_POKER_THEME;

  return (
    <GlobalMainNav page="home">
      <PokerThemeProvider themeId={pokerTheme}>
        <div
          className="min-h-screen bg-[var(--poker-bg)] text-[var(--poker-text)] flex flex-col items-center justify-center relative tracking-[var(--poker-tracking)]"
          style={getPokerThemeVars(pokerTheme)}
        >
          {pokerTheme === 'cyberpunk' && (
            <div
              className="absolute inset-0 pointer-events-none z-0"
              style={{
                background: 'linear-gradient(rgba(0,255,170,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,170,0.05) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
              aria-hidden
            />
          )}
          <div className={`z-10 flex flex-col items-center w-full flex-1 min-w-0 ${pokerTheme === 'cyberpunk' ? 'font-mono uppercase' : ''}`}>
          {/* Canvas: fit in viewport on mobile; desktop preserves aspect */}
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
                {!botsActive ? (
                  <button
                    type="button"
                    onClick={() => handleSpawnBots(2)}
                    disabled={spawningBots}
                    className="px-2 py-0.5 sm:px-3 sm:py-1 rounded border border-[var(--poker-chip)] text-[var(--poker-chip)] hover:opacity-80 text-[10px] sm:text-xs disabled:opacity-50"
                  >
                    {spawningBots ? 'Adding...' : '+ Add Bots'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRemoveBots}
                    className="px-2 py-0.5 sm:px-3 sm:py-1 rounded border border-[var(--poker-danger)] text-[var(--poker-danger)] hover:opacity-80 text-[10px] sm:text-xs"
                  >
                    Remove Bots
                  </button>
                )}
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
                <PokerTable
                  layout={defaultPokerLayout}
                  state={state}
                  currentPlayerAddress={normalizedAddress}
                  onLeave={handleLeave}
                />
              )}
              {!state && !error && (
                <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-[var(--poker-text-muted)]">Loading table...</p>
              )}
            </div>
          </div>
        </div>

        {/* Betting controls: outside game board (only when it's your turn) */}
        {state && hand && canAct && (
          <div className="w-full max-w-2xl px-3 py-3 sm:px-4 sm:py-4 flex-shrink-0 border-t border-[var(--poker-panel-border)] bg-[var(--poker-panel-bg)]">
            <PokerActions
              canAct={!!canAct}
              canCheck={canCheck}
              minRaise={hand.minRaise}
              stack={mySeat?.stack ?? '0'}
              callAmount={callAmount}
              pot={hand.pot}
              onFold={handleFold}
              onCheck={handleCheck}
              onCall={handleCall}
              onBet={handleBet}
              onRaise={handleRaise}
            />
          </div>
        )}
          </div>
        <Footer />
        </div>
      </PokerThemeProvider>
    </GlobalMainNav>
  );
}
