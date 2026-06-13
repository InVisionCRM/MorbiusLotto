'use client';

// Per-player craps roll history, fetched from /api/arcade/craps/history.
// Recomputes summary stats client-side from the rolls payload — totals
// aren't denormalised on the server (each roll row carries wins/losses).

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';

export interface CrapsHistoryRoll {
  rollId: string;
  sessionId: string;
  nonce: number;
  die1: number;
  die2: number;
  sum: number;
  phaseBefore: 'COME_OUT' | 'POINT';
  phaseAfter: 'COME_OUT' | 'POINT';
  pointBefore: number | null;
  pointAfter: number | null;
  wins: string;    // bigint-as-string
  losses: string;  // bigint-as-string
  isPoint: boolean;
  isSevenOut: boolean;
  createdAt: string;
}

export interface CrapsHistoryStats {
  rolls: number;
  totalWagered: bigint;
  totalWon: bigint;
  net: bigint;
  biggestWin: bigint;
  sevenOuts: number;
  pointsMade: number;
}

interface HistoryResponse {
  ok: boolean;
  rolls: CrapsHistoryRoll[];
  error?: string;
}

function computeStats(rolls: CrapsHistoryRoll[]): CrapsHistoryStats {
  let totalWon = 0n;
  let totalWagered = 0n;
  let biggestWin = 0n;
  let sevenOuts = 0;
  let pointsMade = 0;
  for (const r of rolls) {
    const w = BigInt(r.wins);
    const l = BigInt(r.losses);
    totalWon += w;
    totalWagered += l;
    if (w > biggestWin) biggestWin = w;
    if (r.isSevenOut) sevenOuts++;
    if (r.isPoint) pointsMade++;
  }
  return {
    rolls: rolls.length,
    totalWagered,
    totalWon,
    net: totalWon - totalWagered,
    biggestWin,
    sevenOuts,
    pointsMade,
  };
}

export function useCrapsHistory(limit = 200) {
  const { address, isConnected } = useAccount();
  const enabled = Boolean(isConnected && address);

  const q = useQuery({
    queryKey: ['craps-history', address, limit],
    queryFn: async (): Promise<{ rolls: CrapsHistoryRoll[]; stats: CrapsHistoryStats }> => {
      const res = await fetch(`/api/arcade/craps/history?limit=${limit}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
      const data = (await res.json()) as HistoryResponse;
      if (!data.ok) throw new Error(data.error || 'history error');
      const rolls = data.rolls ?? [];
      return { rolls, stats: computeStats(rolls) };
    },
    enabled,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  return {
    rolls: q.data?.rolls ?? [],
    stats: q.data?.stats ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
    enabled,
  };
}
