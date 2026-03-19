'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { BJMultiTableState, BJMultiSeatState, BJMultiHandObj } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChat } from '@/hooks/use-chat';
import BJMultiSeat from '@/components/blackjack-multi/BJMultiSeat';
import BJMultiDealer from '@/components/blackjack-multi/BJMultiDealer';
import BJMultiBettingPanel from '@/components/blackjack-multi/BJMultiBettingPanel';
import BJMultiActionButtons from '@/components/blackjack-multi/BJMultiActionButtons';

const POSITIONS = [0, 1, 2] as const;

export default function BlackjackMultiTablePage() {
  const params = useParams();
  const tableId = typeof params.tableId === 'string' ? params.tableId : '';
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [state, setState] = useState<BJMultiTableState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsClientRef = useRef<BlackjackWebSocketClient | null>(null);
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);

  // Chat scoped to this table room
  const roomId = `blackjack:table:${tableId}`;
  const { messages: chatMessages, sendMessage: sendChatMessage, connected: chatConnected } = useChat(roomId, {
    wsClient,
    wsConnected,
  });

  // Derive my seat from state
  const mySeat = state?.seats.find(s =>
    s.playerAddress && address && s.playerAddress.toLowerCase() === address.toLowerCase()
  ) ?? null;

  const myPosition = mySeat?.position ?? null;

  const isMyTurn = mySeat !== null &&
    state?.phase === 'playing' &&
    state?.actingSeatPosition === myPosition;

  const activeHand: BJMultiHandObj | null = mySeat
    ? mySeat.hands[mySeat.activeHandIndex] ?? null
    : null;

  // Connect WebSocket
  useEffect(() => {
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl || !address) return;

    const client = new BlackjackWebSocketClient(
      wsUrl,
      address,
      signTypedDataAsync as any,
    );

    client.on('connected', async () => {
      setWsConnected(true);
      setError(null);

      // Join room + get state
      await client.sendRequest('join_room', { roomId: `blackjack:table:${tableId}` }).catch(() => {});
      try {
        const result = await client.sendRequest('bj_multi_get_state', { tableId });
        setState(result as BJMultiTableState);
      } catch (err) {
        setError('Failed to load table state');
      }
    });

    client.on('disconnected', () => setWsConnected(false));
    client.on('error', (err: any) => setError(err?.message || 'Connection error'));

    client.on('bj_multi_table_state', (payload: BJMultiTableState) => {
      setState(payload);
    });

    client.on('bj_multi_avatar_emotion', (_payload: any) => {
      // TODO: wire avatar emotion animations
    });

    client.connect();
    wsClientRef.current = client;
    setWsClient(client);

    return () => { client.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, address]);

  // Actions
  const takeSeat = useCallback(async (position: number) => {
    if (!wsClient?.isConnected() || !address) return;
    try {
      await wsClient.sendRequest('bj_multi_join_table', { tableId, seatPosition: position });
    } catch (err) {
      setError((err as Error).message);
    }
  }, [wsClient, tableId, address]);

  const leaveSeat = useCallback(async () => {
    if (!wsClient?.isConnected()) return;
    try {
      await wsClient.sendRequest('bj_multi_leave_table', { tableId });
    } catch (err) {
      setError((err as Error).message);
    }
  }, [wsClient, tableId]);

  const placeBet = useCallback(async (amountWei: string) => {
    if (!wsClient?.isConnected()) return;
    try {
      await wsClient.sendRequest('bj_multi_place_bet', { tableId, amount: amountWei });
    } catch (err) {
      setError((err as Error).message);
    }
  }, [wsClient, tableId]);

  const doAction = useCallback(async (action: 'hit' | 'stand' | 'double_down' | 'split', handIndex?: number) => {
    if (!wsClient?.isConnected()) return;
    try {
      await wsClient.sendRequest('bj_multi_action', { tableId, action, handIndex });
    } catch (err) {
      setError((err as Error).message);
    }
  }, [wsClient, tableId]);

  const sendEmotion = useCallback((emotion: string) => {
    if (!wsClient?.isConnected()) return;
    wsClient.sendRequest('bj_multi_avatar_emotion', { tableId, emotion }).catch(() => {});
  }, [wsClient, tableId]);

  if (!tableId) return null;

  return (
    <GlobalMainNav page="home" showBackArrow backArrowHref="/blackjack-multi" backArrowLabel="Lobby">
      <div className="min-h-screen bg-slate-950 text-white flex flex-col">
        {/* Connection status */}
        {!wsConnected && (
          <div className="bg-slate-800 text-slate-400 text-xs text-center py-1">
            {address ? 'Connecting…' : 'Connect your wallet to play'}
          </div>
        )}
        {error && (
          <div className="bg-red-900/60 text-red-300 text-xs text-center py-1 px-4">{error}</div>
        )}

        <main className="flex-1 container mx-auto px-4 py-4 max-w-4xl">
          {/* Table header */}
          {state && (
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-slate-400">
                Round #{state.roundNumber} &nbsp;·&nbsp;
                {formatEther(BigInt(state.minBet ?? '0'))} – {formatEther(BigInt(state.maxBet ?? '0'))} MORBIUS
              </div>
              <div className={`text-[11px] px-2 py-0.5 rounded-full ${
                state.phase === 'waiting' ? 'bg-slate-700 text-slate-400' :
                state.phase === 'betting' ? 'bg-yellow-800/60 text-yellow-300' :
                state.phase === 'playing' ? 'bg-green-800/60 text-green-300' :
                state.phase === 'dealer_turn' ? 'bg-blue-800/60 text-blue-300' :
                'bg-slate-700 text-slate-400'
              }`}>
                {state.phase === 'waiting' ? 'Waiting for players' :
                 state.phase === 'betting' ? 'Place your bets' :
                 state.phase === 'playing' ? 'Players acting' :
                 state.phase === 'dealer_turn' ? 'Dealer turn' : 'Round complete'}
              </div>
              {myPosition !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={leaveSeat}
                  className="text-xs text-slate-400 hover:text-red-400 h-6"
                >
                  Leave
                </Button>
              )}
            </div>
          )}

          {/* Dealer area */}
          <BJMultiDealer
            cards={state?.dealerCards ?? []}
            cardCount={state?.dealerCardCount ?? 0}
            total={state?.dealerTotal ?? 0}
            phase={state?.phase ?? 'waiting'}
          />

          {/* 3 seats */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {POSITIONS.map(pos => {
              const seat = state?.seats.find(s => s.position === pos);
              const isEmpty = !seat?.playerAddress;
              const isMe = seat?.playerAddress?.toLowerCase() === address?.toLowerCase();

              return (
                <BJMultiSeat
                  key={pos}
                  seat={seat ?? null}
                  position={pos}
                  isMe={isMe}
                  isEmpty={isEmpty}
                  isActing={state?.actingSeatPosition === pos && state?.phase === 'playing'}
                  phase={state?.phase ?? 'waiting'}
                  onTakeSeat={() => takeSeat(pos)}
                  canTakeSeat={!!address && !myPosition && isEmpty && wsConnected}
                  turnStartedAt={state?.actingSeatPosition === pos ? state?.turnStartedAt : null}
                />
              );
            })}
          </div>

          {/* Controls */}
          {state && myPosition !== null && (
            <div className="mt-6 space-y-3">
              {/* Betting panel — show during betting phase if I haven't bet yet */}
              {state.phase === 'betting' && mySeat && BigInt(mySeat.pendingBet) === 0n && (
                <BJMultiBettingPanel
                  minBet={state.minBet}
                  maxBet={state.maxBet}
                  onPlaceBet={placeBet}
                />
              )}
              {state.phase === 'betting' && mySeat && BigInt(mySeat.pendingBet) > 0n && (
                <div className="text-center text-sm text-green-400">
                  Bet placed: {Number(formatEther(BigInt(mySeat.pendingBet))).toLocaleString()} MORBIUS — waiting for round to start
                </div>
              )}

              {/* Action buttons — show when it's my turn */}
              {isMyTurn && activeHand && (
                <BJMultiActionButtons
                  hand={activeHand}
                  handIndex={mySeat?.activeHandIndex ?? 0}
                  onAction={doAction}
                />
              )}
            </div>
          )}

          {/* Take seat CTA when not seated */}
          {state && myPosition === null && address && (
            <div className="mt-6 text-center text-slate-500 text-sm">
              {state.seats.every(s => s.playerAddress) ? (
                <span>Table is full — spectating</span>
              ) : (
                <span>Click an empty seat to join</span>
              )}
            </div>
          )}

          {/* Simple chat */}
          <div className="mt-8 bg-slate-900/60 border border-slate-700 rounded-xl p-3 max-h-48 overflow-y-auto">
            <p className="text-xs text-slate-500 mb-2">Table chat</p>
            {chatMessages.slice(-20).map(m => (
              <div key={m.id} className="text-xs text-slate-300 mb-1">
                <span className="text-cyan-400">{m.displayName ?? m.senderAddress?.slice(0, 6)}: </span>
                {m.text}
              </div>
            ))}
            {address && wsConnected && (
              <ChatInput onSend={sendChatMessage} />
            )}
          </div>
        </main>
      </div>
    </GlobalMainNav>
  );
}

function ChatInput({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <form
      className="flex gap-2 mt-2"
      onSubmit={e => {
        e.preventDefault();
        if (text.trim()) { onSend(text.trim()); setText(''); }
      }}
    >
      <Input
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Say something…"
        className="h-7 text-xs bg-slate-800 border-slate-600 text-slate-200"
        maxLength={200}
      />
      <Button type="submit" size="sm" className="h-7 text-xs bg-slate-700 hover:bg-slate-600 px-3">
        Send
      </Button>
    </form>
  );
}
