'use client';

import { useQuery } from '@tanstack/react-query';

export type PokerChipLedgerCategory = 'all' | 'cash' | 'tournaments' | 'exchanges';

/**
 * Raw values from `PokerChipLedgerReason` on the server. Surface kept as a
 * `string` so a new reason added to the server enum doesn't blow up the client
 * — UI maps to icon/label with a fallback.
 */
export type PokerChipLedgerReason =
  | 'purchase'
  | 'cashout'
  | 'cash_join'
  | 'cash_leave'
  | 'cash_reup'
  | 'cash_admin_return'
  | 'tournament_create_guarantee'
  | 'tournament_buyin'
  | 'tournament_refund'
  | 'tournament_prize'
  | 'rake'
  | 'creator_fee'
  | 'platform_fee'
  | (string & {});

export interface PokerChipLedgerEntry {
  id: string;
  delta: string;          // signed bigint as string
  balanceAfter: string;
  reason: PokerChipLedgerReason;
  refType: string | null;
  refId: string | null;
  refName: string | null; // tournament name (or null for tables)
  createdAt: string;      // ISO UTC
}

export interface PokerChipLedgerPage {
  entries: PokerChipLedgerEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface UsePokerChipLedgerArgs {
  address: string | null;
  limit?: number;
  offset?: number;
  category?: PokerChipLedgerCategory;
  /** Optional refetch interval; default 20s so the lobby snippet updates live. */
  refetchInterval?: number | false;
}

function parseEntry(raw: any): PokerChipLedgerEntry {
  return {
    id: String(raw?.id ?? ''),
    delta: String(raw?.delta ?? '0'),
    balanceAfter: String(raw?.balanceAfter ?? raw?.balance_after ?? '0'),
    reason: String(raw?.reason ?? 'unknown'),
    refType: raw?.refType ?? raw?.ref_type ?? null,
    refId: raw?.refId ?? raw?.ref_id ?? null,
    refName: raw?.refName ?? raw?.ref_name ?? null,
    createdAt: String(raw?.createdAt ?? raw?.created_at ?? ''),
  };
}

export function usePokerChipLedger({
  address,
  limit = 5,
  offset = 0,
  category = 'all',
  refetchInterval = 20_000,
}: UsePokerChipLedgerArgs) {
  return useQuery<PokerChipLedgerPage>({
    queryKey: ['pokerChipLedger', address, limit, offset, category],
    queryFn: async () => {
      if (!address) throw new Error('Address required');
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        category,
      });
      const res = await fetch(`/api/poker/player/${address}/chip-ledger?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch chip ledger');
      const data = await res.json();
      return {
        entries: Array.isArray(data?.entries) ? data.entries.map(parseEntry) : [],
        total: Number(data?.total ?? 0),
        limit: Number(data?.limit ?? limit),
        offset: Number(data?.offset ?? offset),
      };
    },
    enabled: !!address,
    refetchInterval: refetchInterval || false,
  });
}
