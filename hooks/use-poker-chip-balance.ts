'use client';

import { useQuery } from '@tanstack/react-query';
import { getApiUrlOptional } from '@/lib/api-urls';

/** Off-chain poker chip balance from the game server (chip-count string, not wei). */
export function usePokerChipBalance(walletAddress: string | null | undefined) {
  const normalized =
    walletAddress && walletAddress.length > 0
      ? (walletAddress.startsWith('0x') ? walletAddress : `0x${walletAddress}`).toLowerCase()
      : null;
  const apiUrl = getApiUrlOptional();

  return useQuery({
    queryKey: ['poker-chip-balance', normalized],
    queryFn: async (): Promise<string | null> => {
      if (!normalized || normalized.length !== 42 || !apiUrl) return null;
      const res = await fetch(
        `${apiUrl}/api/poker/chips/balance?address=${encodeURIComponent(normalized)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.balance != null ? String(data.balance) : '0';
    },
    enabled: Boolean(normalized && normalized.length === 42 && apiUrl),
    staleTime: 15_000,
  });
}
