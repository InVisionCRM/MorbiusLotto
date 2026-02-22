'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useSignTypedData } from 'wagmi';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { PokerTableState } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import Footer from '@/components/BIG-WHEEL/Footer';
import { PokerTable } from '@/components/poker/PokerTable';
import { ChatPanel } from '@/components/chat/ChatPanel';
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

  return (
    <GlobalMainNav page="home">
      <div
        className="min-h-screen text-white relative bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/POKER/Pokerbg.jpg)' }}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative w-full max-w-5xl mx-auto px-4 py-4">
          <Link href="/poker" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block z-10 relative">
            ← Lobby
          </Link>

          {error && (
            <p className="text-red-400 mb-4 relative z-10">{error}</p>
          )}

          {state && (
            <PokerTable
              state={state}
              currentPlayerAddress={normalizedAddress}
              onFold={handleFold}
              onCheck={handleCheck}
              onCall={handleCall}
              onBet={handleBet}
              onRaise={handleRaise}
              onLeave={handleLeave}
            />
          )}

          {!state && !error && (
            <p className="text-slate-300 relative z-10">Loading table...</p>
          )}

          <div className="fixed right-4 top-24 z-20 max-w-xs">
            <ChatPanel
              roomId={`poker:table:${tableId}`}
              title="Table chat"
              wsClient={wsClient ?? undefined}
              wsConnected={wsConnected}
              collapsible
            />
          </div>
        </div>
        <Footer />
      </div>
    </GlobalMainNav>
  );
}
