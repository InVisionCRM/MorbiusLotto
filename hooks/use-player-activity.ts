'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

/**
 * Unified sitewide activity feed. Backed by /api/players/:address/activity, which
 * UNIONs the DB-retained history sources — poker_chip_ledger (poker, keno2,
 * plinko-chips, every arcade game, deposits/withdrawals, holder rewards) + blackjack
 * (games/multi seats) + lottery 6-of-55 (instant_lottery_plays). Each row is already
 * enriched server-side with {gameKey, gameLabel, kind}. Legacy on-chain Plinko/Keno
 * are read from chain separately (see usePlinkoPlayerDashboard).
 *
 * All amounts (amount, balance, wager, payout) are WEI strings — format with
 * formatEther to display MORBIUS.
 */
export type ActivityKind =
  | 'bet'
  | 'payout'
  | 'win'
  | 'loss'
  | 'push'
  | 'refund'
  | 'tip'
  | 'fee'
  | 'deposit'
  | 'withdrawal'
  | 'buy'
  | 'sell'
  | 'reward'
  | 'adjustment'
  | (string & {});

export type ActivitySource = 'ledger' | 'blackjack' | 'lottery';

export interface PlayerActivityEntry {
  id: string;
  source: ActivitySource;
  amount: string; // signed net effect on the player, in wei
  balance: string | null; // running chip balance in wei (ledger rows only)
  wager: string | null; // gross stake in wei (game rows only)
  payout: string | null; // gross payout in wei (game rows only)
  reason: string;
  gameKey: string;
  gameLabel: string;
  kind: ActivityKind;
  refType: string | null;
  refId: string | null;
  refName: string | null; // tournament name (or null)
  createdAt: string; // ISO UTC
}

export interface PlayerActivityPage {
  entries: PlayerActivityEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface UsePlayerActivityArgs {
  address: string | null;
  limit?: number;
  offset?: number;
  /** Filter to a single gameKey (e.g. 'dragon_tiger', 'poker', 'blackjack', 'lottery'). */
  game?: string;
  /** Filter by net outcome: 'win' (amount > 0) or 'loss' (amount < 0). */
  outcome?: 'win' | 'loss';
  /** Optional refetch interval; default 20s so the feed updates live. */
  refetchInterval?: number | false;
}

function parseEntry(raw: any): PlayerActivityEntry {
  return {
    id: String(raw?.id ?? ''),
    source: (raw?.source ?? 'ledger') as ActivitySource,
    amount: String(raw?.amount ?? '0'),
    balance: raw?.balance != null ? String(raw.balance) : null,
    wager: raw?.wager != null ? String(raw.wager) : null,
    payout: raw?.payout != null ? String(raw.payout) : null,
    reason: String(raw?.reason ?? 'unknown'),
    gameKey: String(raw?.gameKey ?? raw?.game_key ?? 'other'),
    gameLabel: String(raw?.gameLabel ?? raw?.game_label ?? 'Other'),
    kind: String(raw?.kind ?? 'adjustment'),
    refType: raw?.refType ?? raw?.ref_type ?? null,
    refId: raw?.refId ?? raw?.ref_id ?? null,
    refName: raw?.refName ?? raw?.ref_name ?? null,
    createdAt: String(raw?.createdAt ?? raw?.created_at ?? ''),
  };
}

export function usePlayerActivity({
  address,
  limit = 25,
  offset = 0,
  game,
  outcome,
  refetchInterval = 20_000,
}: UsePlayerActivityArgs) {
  return useQuery<PlayerActivityPage>({
    queryKey: ['playerActivity', address, limit, offset, game ?? 'all', outcome ?? 'all'],
    queryFn: async () => {
      if (!address) throw new Error('Address required');
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (game) params.set('game', game);
      if (outcome) params.set('outcome', outcome);
      const res = await fetch(`/api/players/${address}/activity?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch player activity');
      const data = await res.json();
      return {
        entries: Array.isArray(data?.entries) ? data.entries.map(parseEntry) : [],
        total: Number(data?.total ?? 0),
        limit: Number(data?.limit ?? limit),
        offset: Number(data?.offset ?? offset),
      };
    },
    enabled: !!address,
    placeholderData: keepPreviousData,
    refetchInterval: refetchInterval || false,
  });
}
