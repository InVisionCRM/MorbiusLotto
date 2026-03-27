'use client';

import { useQuery } from '@tanstack/react-query';
import { getApiUrlOptional } from '@/lib/api-urls';

/** Authoritative playable Blackjack balance from the game server (DB), not on-chain reserve. */
export function usePlayerServerBalance(walletAddress: string | null | undefined) {
  const apiUrl = getApiUrlOptional();
  const normalized =
    walletAddress && walletAddress.length > 0
      ? (walletAddress.startsWith('0x') ? walletAddress : `0x${walletAddress}`).toLowerCase()
      : null;

  return useQuery({
    queryKey: ['player-server-balance', normalized],
    queryFn: async (): Promise<bigint | null> => {
      if (!apiUrl || !normalized || normalized.length !== 42) return null;
      const res = await fetch(`${apiUrl}/api/player/${normalized}/balance`);
      if (!res.ok) return null;
      const data = await res.json();
      return BigInt(data?.balance ?? '0');
    },
    enabled: Boolean(apiUrl && normalized && normalized.length === 42),
    staleTime: 15_000,
  });
}
