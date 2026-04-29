'use client';

import { useEffect, useRef, useState } from 'react';
import { StreamVideoClient, type Call } from '@stream-io/video-react-sdk';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { WS_MESSAGE_TYPES } from '@/lib/websocket-message-types';

interface VoiceTokenPayload {
  apiKey: string;
  token?: string;
  userId?: string;
  expiresAt?: number;
  anonymous?: boolean;
}

export interface UsePokerVoiceOptions {
  wsClient: BlackjackWebSocketClient | null;
  walletAddress: string | null;
  /** Stable id for the call. Use the poker table id; voice is scoped per table. */
  tableId: string | null;
  /** Seated players can speak; watchers join listen-only. */
  seated: boolean;
  /** Gate: voice currently enabled for tournament tables only. Pass `false` to no-op. */
  enabled: boolean;
}

export interface UsePokerVoiceReturn {
  client: StreamVideoClient | null;
  call: Call | null;
  /** 'idle' before any join attempt, 'connecting' while joining, 'joined', or 'error'. */
  status: 'idle' | 'connecting' | 'joined' | 'error';
  error: string | null;
}

/**
 * Process-level cache of the connected `StreamVideoClient`. Stream charges per
 * participant-minute, but a single client connection across table navigations
 * is fine — the meter is per active *call*, which we leave on unmount.
 */
let cachedClient: StreamVideoClient | null = null;
let cachedClientUserId: string | null = null;

async function fetchVoiceToken(wsClient: BlackjackWebSocketClient): Promise<VoiceTokenPayload> {
  const res = (await wsClient.sendRequest(WS_MESSAGE_TYPES.pokerVoiceToken, {})) as VoiceTokenPayload | null;
  if (!res?.apiKey || (!res.anonymous && (!res.token || !res.userId))) {
    throw new Error('voice token unavailable');
  }
  return res;
}

async function getOrCreateClient(
  wsClient: BlackjackWebSocketClient,
  walletAddress: string | null,
  canSpeak: boolean,
): Promise<StreamVideoClient> {
  const tokenInfo = await fetchVoiceToken(wsClient);
  const anonymous = !canSpeak || !!tokenInfo.anonymous || !walletAddress;
  const userId = anonymous ? '!anon' : walletAddress!.toLowerCase();
  if (cachedClient && cachedClientUserId === userId) return cachedClient;

  if (cachedClient && cachedClientUserId !== userId) {
    await cachedClient.disconnectUser().catch(() => {});
    cachedClient = null;
    cachedClientUserId = null;
  }

  const client = anonymous
    ? new StreamVideoClient({
        apiKey: tokenInfo.apiKey,
        user: { type: 'anonymous' },
      })
    : new StreamVideoClient({
        apiKey: tokenInfo.apiKey,
        user: { id: userId },
        token: tokenInfo.token!,
        tokenProvider: async () => {
          const next = await fetchVoiceToken(wsClient);
          if (!next.token) throw new Error('voice token unavailable');
          return next.token;
        },
      });
  cachedClient = client;
  cachedClientUserId = userId;
  return client;
}

export function usePokerVoice({
  wsClient,
  walletAddress,
  tableId,
  seated,
  enabled,
}: UsePokerVoiceOptions): UsePokerVoiceReturn {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [status, setStatus] = useState<UsePokerVoiceReturn['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const callRef = useRef<Call | null>(null);

  const shouldJoin = enabled && !!wsClient && !!tableId;

  useEffect(() => {
    if (!shouldJoin) {
      // Tear down the active call when the player stands / busts / leaves.
      const c = callRef.current;
      callRef.current = null;
      setCall(null);
      setStatus('idle');
      setError(null);
      if (c) c.leave().catch(() => {});
      return;
    }

    let cancelled = false;
    setStatus('connecting');
    setError(null);

    (async () => {
      try {
        const c = await getOrCreateClient(wsClient!, walletAddress, seated);
        if (cancelled) return;
        setClient(c);

        const newCall = c.call('audio_room', `poker-table-${tableId}`);
        // Default mic muted on join — poker etiquette + avoids hot-mic accidents.
        await newCall.microphone.disable().catch(() => {});
        await newCall.join({ create: seated });
        if (cancelled) {
          newCall.leave().catch(() => {});
          return;
        }
        callRef.current = newCall;
        setCall(newCall);
        setStatus('joined');
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message ?? 'voice connect failed');
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      const c = callRef.current;
      callRef.current = null;
      if (c) c.leave().catch(() => {});
    };
  }, [shouldJoin, wsClient, walletAddress, tableId, seated]);

  return { client, call, status, error };
}
