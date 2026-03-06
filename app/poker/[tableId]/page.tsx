'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useSignTypedData } from 'wagmi';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { PokerTableState } from '@/lib/websocket-client';
import { defaultPokerLayout } from '@/lib/poker-layout';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import Footer from '@/components/BIG-WHEEL/Footer';
import { PokerTable } from '@/components/poker/PokerTable';
import { PokerActions } from '@/components/poker/PokerActions';
import { toast } from 'sonner';

export default function PokerTablePage() {
  const params = useParams();
  const router = useRouter();
  const tableId = typeof params.tableId === 'string' ? params.tableId : '';
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [state, setState] = useState<PokerTableState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      setState((prev) => ({
        ...payload,
        myHoleCards: payload.myHoleCards ?? prev?.myHoleCards ?? null,
      }));
    });

    client
      .connect()
      .then(() => {
        setWsConnected(true);
        return client.pokerGetState(tableId);
      })
      .then((s) => setState(s))
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
  }, [tableId, normalizedAddress]);

  useEffect(() => {
    if (!wsConnected || !clientRef.current || !tableId) return;
    clientRef.current.joinRoom(`poker:table:${tableId}`).catch(() => {});
  }, [wsConnected, tableId]);

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

  return (
    <GlobalMainNav page="home">
      <div className="min-h-screen text-white flex flex-col items-center justify-center bg-slate-950">
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
              <Link href="/poker" className="absolute left-2 top-2 z-20 text-cyan-400 hover:text-cyan-300 text-sm">
                ← Lobby
              </Link>
              {error && (
                <p className="absolute left-2 top-8 z-20 text-red-400 text-sm">{error}</p>
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
                <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-slate-300">Loading table...</p>
              )}
            </div>
          </div>
        </div>

        {/* Betting controls: outside game board (only when it's your turn) */}
        {state && hand && canAct && (
          <div
            className="w-full max-w-2xl px-3 py-3 sm:px-4 sm:py-4 flex-shrink-0"
            style={{
              background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(34, 211, 238, 0.3)',
            }}
          >
            <PokerActions
              canAct={!!canAct}
              canCheck={canCheck}
              minRaise={hand.minRaise}
              stack={mySeat?.stack ?? '0'}
              callAmount={callAmount}
              onFold={handleFold}
              onCheck={handleCheck}
              onCall={handleCall}
              onBet={handleBet}
              onRaise={handleRaise}
            />
          </div>
        )}

        <Footer />
      </div>
    </GlobalMainNav>
  );
}
