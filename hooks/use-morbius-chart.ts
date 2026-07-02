'use client'

import { useQuery } from '@tanstack/react-query'

/** One daily candle from GET /api/price-chart — unix seconds + close price (WPLS per MORBIUS, USD-quoted by GeckoTerminal). */
export interface MorbiusChartCandle {
  t: number
  c: number
}

/**
 * Fetch the 90-day daily MORBIUS price series (proxied from GeckoTerminal by
 * /api/price-chart). Cached generously — price candles only change daily, the
 * proxy itself caches for 5 minutes.
 */
export function useMorbiusChart() {
  return useQuery({
    queryKey: ['morbius-price-chart'],
    queryFn: async (): Promise<MorbiusChartCandle[]> => {
      const res = await fetch('/api/price-chart')
      if (!res.ok) throw new Error(`price chart ${res.status}`)
      const json = (await res.json()) as { candles?: MorbiusChartCandle[] }
      return json.candles ?? []
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  })
}
