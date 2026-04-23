'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import {
  BlackjackWebSocketClient,
  type PokerTableState,
  type SignTypedDataFn,
} from '@/lib/websocket-client';
import { toast } from 'sonner';

function pokerTablePath(tableId: string, s: PokerTableState | null): string {
  const tid = s?.tournamentId;
  return tid
    ? `/poker/${tableId}?tournament=${encodeURIComponent(tid)}`
    : `/poker/${tableId}`;
}

/** Server appends this so the client can offer "leave other table & join here". */
const POKER_OTHER_TABLE_ID_RE =
  /other_table_id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

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
  /** When true, do not send `pokerLeaveTable` on tab close (tournament refresh / accidental close). */
  skipLeaveOnUnload?: boolean;
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
  skipLeaveOnUnload = false,
}: UsePokerConnectionArgs) {
  const [state, setState] = useState<PokerTableState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const clientRef = useRef<BlackjackWebSocketClient | null>(null);
  const fetchSeqRef = useRef(0);
  const personalRefetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const normalizedAddrRef = useRef<string | null>(null);
  normalizedAddrRef.current = normalizedAddress?.toLowerCase() ?? null;

  const signTypedRef = useRef(signTypedDataAsync as SignTypedDataFn | undefined);
  signTypedRef.current = signTypedDataAsync as SignTypedDataFn | undefined;

  /** URL-driven join params: keep in refs so clearing `?join=1` after join does not remount the socket. */
  const joinFromLobbyRef = useRef(joinFromLobby);
  const buyInParamRef = useRef(buyInParam);
  const pinParamRef = useRef(pinParam);
  joinFromLobbyRef.current = joinFromLobby;
  buyInParamRef.current = buyInParam;
  pinParamRef.current = pinParam;

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

  const schedulePersonalStateRefetch = useCallback(() => {
    if (!normalizedAddress || !clientRef.current?.isConnected()) return;
    if (personalRefetchDebounceRef.current) clearTimeout(personalRefetchDebounceRef.current);
    personalRefetchDebounceRef.current = setTimeout(() => {
      personalRefetchDebounceRef.current = null;
      fetchLatestState();
    }, 280);
  }, [normalizedAddress, fetchLatestState]);

  const afterConnectRef = useRef<() => Promise<void>>(async () => {});

  afterConnectRef.current = async () => {
    const client = clientRef.current;
    if (!client || !tableId) return;
    setWsConnected(true);
    setDisconnected(false);
    setError(null);

    if (joinFromLobbyRef.current && buyInParamRef.current && normalizedAddress) {
      const pin = pinParamRef.current || undefined;
      const finishLobbyJoin = async () => {
        await client.joinRoom(`poker:table:${tableId}`);
        const s = await client.pokerGetState(tableId);
        if (s) setState(s);
        replaceUrl(pokerTablePath(tableId, s ?? null));
      };

      try {
        await client.pokerJoinTable(tableId, buyInParamRef.current, pin);
        await finishLobbyJoin();
      } catch (err: unknown) {
        const msg: string = (err as Error)?.message ?? '';
        const lower = msg.toLowerCase();
        const atThisTableOnly =
          lower.includes('already seated at this table') && !lower.includes('another cash table');
        const otherMatch = msg.match(POKER_OTHER_TABLE_ID_RE);

        if (otherMatch?.[1]) {
          const otherId = otherMatch[1];
          replaceUrl(`/poker/${tableId}`);
          setError('You are still seated at another table. Use the toast action or Leave on that table.');
          toast.error('Still seated at another cash table', {
            description: 'Leave that seat to join this one.',
            duration: 20_000,
            action: {
              label: 'Leave other & join here',
              onClick: () => {
                void (async () => {
                  try {
                    await client.pokerLeaveTable(otherId);
                    await client.pokerJoinTable(tableId, buyInParamRef.current, pin);
                    await finishLobbyJoin();
                    setError(null);
                    toast.success('Joined this table');
                  } catch (e) {
                    const m = (e as Error)?.message ?? 'Could not switch tables';
                    setError(m);
                    toast.error(m);
                  }
                })();
              },
            },
          });
        } else if (!atThisTableOnly) {
          setError(msg || 'Failed to join');
          toast.error(msg || 'Failed to join');
          replaceUrl(`/poker/${tableId}`);
        } else {
          try {
            await finishLobbyJoin();
          } catch {
            replaceUrl(`/poker/${tableId}`);
          }
        }
      }
      return;
    }

    try {
      await client.joinRoom(`poker:table:${tableId}`);
    } catch {
      /* non-fatal */
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
      const me = normalizedAddrRef.current;
      const seated =
        !!me && payload.seats.some((s) => s.playerAddress && s.playerAddress.toLowerCase() === me);
      if (seated && payload.myHoleCards == null) {
        schedulePersonalStateRefetch();
      }
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
      if (personalRefetchDebounceRef.current) {
        clearTimeout(personalRefetchDebounceRef.current);
        personalRefetchDebounceRef.current = null;
      }
      client.off('reconnected', onReconnected);
      client.off('reconnect_failed', onReconnectFailed);
      client.disconnect();
      clientRef.current = null;
      setWsClient(null);
      setWsConnected(false);
      setState(null);
    };
  }, [
    tableId,
    normalizedAddress,
    stableSignTypedData,
    isE2EMock,
    replaceUrl,
    fetchLatestState,
  ]);

  // Wallet becomes available after mount (or reconnect): pull hole cards + seat view immediately.
  useEffect(() => {
    if (isE2EMock || !tableId) return;
    if (!normalizedAddress || !clientRef.current?.isConnected()) return;
    schedulePersonalStateRefetch();
  }, [isE2EMock, tableId, normalizedAddress, wsConnected, schedulePersonalStateRefetch]);

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

  // Tab close / full page unload only. Do NOT run leave in effect cleanup: React 18 Strict Mode
  // remounts dev components once; cleanup would fire pokerLeaveTable right after join, and the URL
  // no longer has ?join=1 so the remount never re-joins. In-app exit uses the Leave control.
  useEffect(() => {
    if (skipLeaveOnUnload || !tableId || !normalizedAddress) return;
    const leaveOnUnload = () => {
      const client = clientRef.current;
      if (client?.isConnected()) {
        client.pokerLeaveTable(tableId).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', leaveOnUnload);
    return () => {
      window.removeEventListener('beforeunload', leaveOnUnload);
    };
  }, [tableId, normalizedAddress, skipLeaveOnUnload]);

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
