'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * useTelegramStatus — tracks whether a wallet has a Telegram account linked.
 *
 * Returns the current status plus a `refetch()` so callers can re-check on
 * demand (e.g. the link modal polls it every couple of seconds while the user
 * is over in Telegram sending their code).
 */

export interface TelegramStatus {
  linked: boolean;
  username: string | null;
  linkedAt: string | null;
  notificationsEnabled: boolean;
}

export interface UseTelegramStatusResult {
  status: TelegramStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTelegramStatus(
  address: string | null | undefined,
): UseTelegramStatusResult {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!address) {
      setStatus(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/telegram/status?address=${encodeURIComponent(address)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`Telegram status request failed (${res.status})`);
      const data = await res.json();
      setStatus({
        linked: data?.linked === true,
        username: data?.username ?? null,
        linkedAt: data?.linkedAt ?? null,
        notificationsEnabled: data?.notificationsEnabled === true,
      });
    } catch (err) {
      setError((err as Error)?.message ?? 'Could not load Telegram status');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { status, loading, error, refetch };
}
