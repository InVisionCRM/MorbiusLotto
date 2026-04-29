'use client'

import { BadgeDollarSign, Gamepad2, Trophy, Users, Wallet } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { PlayerStatsFeatureGrid, type PlayerStatsFeatureItem } from '@/components/ui/player-stats-feature-grid'
import { fetchDexScreenerProxy } from '@/lib/dexscreener-client'
import { formatMorbiusFloor } from '@/lib/format-morbius-display'
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'
import { usePlatformAnalytics } from '@/hooks/use-platform-analytics'

interface PulseScanTokenResponse {
  holders?: string | number
  holders_count?: string | number
  holdersCount?: string | number
}

interface DexScreenerTokenResponse {
  pairs?: Array<{
    priceUsd?: string
  }>
}

interface MorbiusMarketStats {
  priceUsd: string | null
  holders: string | null
}

function formatCount(value: bigint | number | string | null | undefined): string {
  if (value == null) return '0'
  const normalized = typeof value === 'bigint' ? value : BigInt(String(value || 0))
  return normalized.toLocaleString()
}

function formatUsdPrice(priceUsd: string | null): string {
  if (!priceUsd) return '...'

  const [wholeRaw, fractionalRaw = ''] = priceUsd.split('.')
  const whole = wholeRaw || '0'
  const significantFraction = fractionalRaw.replace(/0+$/, '')

  if (!significantFraction) return `$${BigInt(whole).toLocaleString()}`

  const decimals = whole === '0' ? Math.min(Math.max(significantFraction.length, 4), 8) : 4
  const fractional = fractionalRaw.padEnd(decimals, '0').slice(0, decimals)

  return `$${BigInt(whole).toLocaleString()}.${fractional}`
}

function readHolderCount(data: PulseScanTokenResponse): string | null {
  const value = data.holders_count ?? data.holdersCount ?? data.holders
  if (value == null) return null
  return formatCount(value)
}

function useMorbiusMarketStats() {
  return useQuery<MorbiusMarketStats>({
    queryKey: ['morbiusMarketStats'],
    queryFn: async ({ signal }) => {
      const [tokenResult, dexResult] = await Promise.allSettled([
        fetch(`https://api.scan.pulsechain.com/api/v2/tokens/${MORBIUS_TOKEN_ADDRESS}`, { signal }),
        fetchDexScreenerProxy('tokens', MORBIUS_TOKEN_ADDRESS, { signal }),
      ])

      let holders: string | null = null
      let priceUsd: string | null = null

      if (tokenResult.status === 'fulfilled' && tokenResult.value.ok) {
        const tokenData = (await tokenResult.value.json()) as PulseScanTokenResponse
        holders = readHolderCount(tokenData)
      }

      if (dexResult.status === 'fulfilled' && dexResult.value.ok) {
        const dexData = (await dexResult.value.json()) as DexScreenerTokenResponse
        priceUsd = dexData.pairs?.find((pair) => pair.priceUsd)?.priceUsd ?? null
      }

      return { holders, priceUsd }
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 30_000,
  })
}

export function PlatformStatsSection() {
  const { data: analytics, isLoading: analyticsLoading } = usePlatformAnalytics()
  const { data: marketStats } = useMorbiusMarketStats()

  const totalGames = analytics?.combined.totalGamesPlayed ?? '0'
  const totalWagered = analytics?.combined.totalVolume ?? '0'
  const totalWon = analytics?.combined.totalPayouts ?? '0'
  const totalPlayers = analytics?.blackjack.total_players ?? 0

  const items: PlayerStatsFeatureItem[] = [
    {
      title: 'Games Played',
      value: analyticsLoading ? '...' : formatCount(totalGames),
      subtitle: 'Completed rounds across tracked games',
      icon: Gamepad2,
    },
    {
      title: 'MORBIUS Wagered',
      value: analyticsLoading ? '...' : formatMorbiusFloor(totalWagered),
      subtitle: 'Total MORBIUS played across games',
      icon: BadgeDollarSign,
    },
    {
      title: 'MORBIUS Won',
      value: analyticsLoading ? '...' : formatMorbiusFloor(totalWon),
      subtitle: 'Total MORBIUS paid out to players',
      icon: Trophy,
      valueClassName: 'text-cyan-100',
    },
    {
      title: 'Total Players',
      value: analyticsLoading ? '...' : formatCount(totalPlayers),
      subtitle: 'Unique tracked game wallets',
      icon: Users,
    },
    {
      title: 'MORBIUS Price',
      value: formatUsdPrice(marketStats?.priceUsd ?? null),
      subtitle: 'Live DexScreener USD quote',
      icon: Wallet,
      valueClassName: 'text-cyan-100',
    },
    {
      title: 'MORBIUS Holders',
      value: marketStats?.holders ?? '...',
      subtitle: 'PulseChain token holders',
      icon: Users,
    },
  ]

  return (
    <section className="relative w-full max-w-6xl px-4">
      <div className="pointer-events-none absolute inset-x-4 top-10 h-40 rounded-full bg-cyan-500/10 blur-3xl" aria-hidden />
      <div className="relative z-10 mb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300/80">Platform Stats</p>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">MORBlotto By The Numbers</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-300/80">
          Live game totals and MORBIUS market signals from the platform, PulseChain, and DexScreener.
        </p>
      </div>

      <PlayerStatsFeatureGrid items={items} className="overflow-hidden rounded-2xl border border-cyan-500/20" />
    </section>
  )
}
