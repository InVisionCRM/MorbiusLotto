'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import {
  BlackjackWebSocketClient,
  type PokerTableState,
  type SignTypedDataFn,
} from '@/lib/websocket-client';
import { toast } from 'sonner';

interface UsePokerConnectionArgs {
  tableId: string;
  normalizedAddress: string | null;
  signTypedDataAsync: unknown;
  isE2EMock: boolean;
  joinFromLobby: boolean;
  buyInParam: string | null;
  pinParam: string | null;
  setProfileWsClient: (client: BlackjackWebSocketClient | null) => void;
  replaceUrl: (url: string) => void;
}

export function usePokerConnection({
  tableId,
  normalizedAddress,
  signTypedDataAsync,
  isE2EMock,
  joinFromLobby,
  buyInParam,
  pinParam,
  setProfileWsClient,
  replaceUrl,
}: UsePokerConnectionArgs) {
  const [state, setState] = useState<PokerTableState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const clientRef = useRef<BlackjackWebSocketClient | null>(null);
  const fetchSeqRef = useRef(0);

  const signTypedRef = useRef(signTypedDataAsync as SignTypedDataFn | undefined);
  signTypedRef.current = signTypedDataAsync as SignTypedDataFn | undefined;

  const stableSignTypedData = useCallback<SignTypedDataFn>((args) => {
    const fn = signTypedRef.current;
    if (!fn) return Promise.reject(new Error('Wallet signer not ready'));
    return fn(args);
  }, []);

  // Fetch personalized state and apply it only if no newer fetch has started.
  const fetchLatestState = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    const seq = ++fetchSeqRef.current;
    client
      .pokerGetState(tableId)
      .then((s) => {
        if (fetchSeqRef.current === seq && s) setState(s);
      })
      .catch(() => {});
  }, [tableId]);

  const afterConnectRef = useRef<() => Promise<void>>(async () => {});

  afterConnectRef.current = async () => {
    const client = clientRef.current;
    if (!client || !tableId) return;
    setWsConnected(true);
    setDisconnected(false);
    setError(null);

    if (joinFromLobby && buyInParam && normalizedAddress) {
      await client
        .pokerJoinTable(tableId, buyInParam, pinParam || undefined)
        .catch((err: unknown) => {
          const msg: string = (err as Error)?.message ?? '';
          if (!msg.toLowerCase().includes('already seated')) {
            setError(msg || 'Failed to join');
            toast.error(msg || 'Failed to join');
          }
        });
      try {
        await client.joinRoom(`poker:table:${tableId}`);
        const s = await client.pokerGetState(tableId);
        if (s) setState(s);
        replaceUrl(`/poker/${tableId}`);
      } catch {
        replaceUrl(`/poker/${tableId}`);
      }
      return;
    }

    const s = await client.pokerGetState(tableId);
    if (s) setState(s);
  };

  useEffect(() => {
    if (isE2EMock) {
      setWsConnected(true);
      setError(null);
      return;
    }
    if (!tableId) return;
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl) {
      setError('WebSocket not configured');
      return;
    }
    const client = new BlackjackWebSocketClient(
      wsUrl,
      normalizedAddress ?? undefined,
      normalizedAddress ? stableSignTypedData : undefined
    );
    clientRef.current = client;
    setWsClient(client);

    const onReconnected = () => {
      void afterConnectRef.current();
    };

    const onReconnectFailed = () => {
      setError('Could not reconnect to the game server');
      toast.error('Connection lost — please refresh the page');
    };

    client.on('reconnected', onReconnected);
    client.on('reconnect_failed', onReconnectFailed);

    client.on('poker_table_state', (payload: PokerTableState) => {
      if (payload.tableId !== tableId) return;
      setState((prev) => {
        if (payload.myHoleCards != null) return payload;
        const sameHand =
          prev?.currentHand?.handId != null && payload.currentHand?.handId === prev.currentHand.handId;
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
      .then(() => afterConnectRef.current())
      .catch((err) => {
        setError(err?.message ?? 'Failed to connect');
        toast.error(err?.message ?? 'Failed to connect');
      });

    return () => {
      client.off('reconnected', onReconnected);
      client.off('reconnect_failed', onReconnectFailed);
      client.disconnect();
      clientRef.current = null;
      setWsClient(null);
      setWsConnected(false);
    };
  }, [
    tableId,
    normalizedAddress,
    stableSignTypedData,
    isE2EMock,
    joinFromLobby,
    buyInParam,
    pinParam,
    replaceUrl,
    fetchLatestState,
  ]);

  // Keep profile context in sync without re-triggering socket connect lifecycle.
  useEffect(() => {
    setProfileWsClient(wsClient);
    return () => {
      setProfileWsClient(null);
    };
  }, [wsClient, setProfileWsClient]);

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
      leaveOnUnload();
    };
  }, [tableId, normalizedAddress]);

  return {
    state,
    setState,
    wsConnected,
    wsClient,
    error,
    disconnected,
    clientRef,
    fetchLatestState,
  };
}
