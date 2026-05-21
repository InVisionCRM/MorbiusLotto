'use client';

import { useCallback, useEffect, useState } from 'react';

export interface PokerRepToken {
  address: string;
  name: string;
  symbol: string;
  logoUrl: string | null;
}

function storageKey(address: string): string {
  return `morblotto-poker-rep-token-${address.toLowerCase()}`;
}

/**
 * Per-wallet "rep" token shown on the avatar's REP badge. Stored in
 * localStorage for now — TODO: move into the player profile (alongside
 * `bio`/`xHandle`) when the upstream profile schema grows a `repToken` slot.
 */
export function useRepToken(address: string | null) {
  const [token, setTokenState] = useState<PokerRepToken | null>(null);

  useEffect(() => {
    if (!address || typeof window === 'undefined') {
      setTokenState(null);
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey(address));
      if (!raw) {
        setTokenState(null);
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.address === 'string') {
        setTokenState({
          address: parsed.address,
          name: parsed.name ?? '',
          symbol: parsed.symbol ?? '',
          logoUrl: parsed.logoUrl ?? null,
        });
      } else {
        setTokenState(null);
      }
    } catch {
      setTokenState(null);
    }
  }, [address]);

  const setToken = useCallback(
    (next: PokerRepToken | null) => {
      setTokenState(next);
      if (!address || typeof window === 'undefined') return;
      try {
        if (next) {
          window.localStorage.setItem(storageKey(address), JSON.stringify(next));
        } else {
          window.localStorage.removeItem(storageKey(address));
        }
      } catch {
        /* localStorage unavailable — keep in-memory only */
      }
    },
    [address],
  );

  return { token, setToken };
}
