'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiUrlOptional } from '@/lib/api-urls';

export type ChipRewardCohort = 'morbius' | 'lp';

export interface ChipRewardHistoryRow {
  epoch_id: string;
  cohort: ChipRewardCohort;
  epoch_number: number;
  credited_at: string | null;
  basis_wei: string;            // 18-dec wei string
  chips_credited: string;       // whole chips as integer string
  morbius_pool_wei: string;     // pool size at epoch (18-dec wei)
  total_basis_wei: string;      // sum of all basis at snapshot (18-dec wei)
}

export interface ChipRewardCohortData {
  lifetimeChips: string;        // sum of chips_credited across all epochs
  epochs: number;               // count of epochs the wallet has been credited in
  lastCreditedAt: string | null;
  history: ChipRewardHistoryRow[];
}

export interface ChipRewardWalletData {
  morbius: ChipRewardCohortData;
  lp: ChipRewardCohortData;
}

const EMPTY_COHORT: ChipRewardCohortData = {
  lifetimeChips: '0',
  epochs: 0,
  lastCreditedAt: null,
  history: [],
};

const EMPTY_DATA: ChipRewardWalletData = { morbius: { ...EMPTY_COHORT }, lp: { ...EMPTY_COHORT } };

interface UseHolderChipRewardsReturn {
  data: ChipRewardWalletData;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches /api/holder-rewards/wallet/:address. Returns lifetime totals + 12 most
 * recent credited epochs per cohort. Auto-refetches when the address changes.
 */
export function useHolderChipRewards(address: string | null | undefined): UseHolderChipRewardsReturn {
  const [data, setData] = useState<ChipRewardWalletData>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setData(EMPTY_DATA);
      setError(null);
      return;
    }
    const api = getApiUrlOptional();
    if (!api) {
      setError('API not configured');
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetch(`${api}/api/holder-rewards/wallet/${address.toLowerCase()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? r.statusText);
        return (await r.json()) as ChipRewardWalletData;
      })
      .then((d) => {
        setData({
          morbius: { ...EMPTY_COHORT, ...d.morbius, history: d.morbius?.history ?? [] },
          lp:      { ...EMPTY_COHORT, ...d.lp,      history: d.lp?.history      ?? [] },
        });
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [address, refreshKey]);

  return { data, isLoading, error, refetch };
}
