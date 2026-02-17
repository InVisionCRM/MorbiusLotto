'use client';

import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { FreerollListItemPayload, FreerollEntryPayload } from '@/lib/websocket-client';

export interface UseFreerollOptions {
  wsClient: BlackjackWebSocketClient | null;
}

export function useFreeroll(options: UseFreerollOptions) {
  const { wsClient } = options;
  const { address } = useAccount();

  const [freerollList, setFreerollList] = useState<FreerollListItemPayload[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch list of freeroll tournaments.
   */
  const fetchFreerollList = useCallback(
    async (includePast = false): Promise<FreerollListItemPayload[]> => {
      if (!wsClient) return [];

      setIsLoading(true);
      setError(null);

      try {
        const response = await wsClient.sendRequest('freeroll_list', { includePast });
        const tournaments = response?.tournaments ?? [];
        setFreerollList(tournaments);
        return tournaments;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to list freerolls';
        setError(msg);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [wsClient]
  );

  /**
   * Register for a freeroll (during registration phase).
   */
  const registerFreeroll = useCallback(
    async (tournamentId: string): Promise<FreerollEntryPayload | null> => {
      if (!wsClient || !address) {
        setError('Not connected');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const payload = await wsClient.sendRequest('freeroll_register', { tournamentId });
        return payload as FreerollEntryPayload;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to register';
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [wsClient, address]
  );

  /**
   * Mark freeroll as "joined" (player at the table).
   */
  const joinFreeroll = useCallback(
    async (tournamentId: string): Promise<FreerollEntryPayload | null> => {
      if (!wsClient || !address) {
        setError('Not connected');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const payload = await wsClient.sendRequest('freeroll_join', { tournamentId });
        return payload as FreerollEntryPayload;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to join';
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [wsClient, address]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    freerollList,
    isLoading,
    error,
    fetchFreerollList,
    registerFreeroll,
    joinFreeroll,
    clearError,
  };
}
