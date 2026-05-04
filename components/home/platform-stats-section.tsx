'use client'

import {
  BadgeDollarSign,
  Coins,
  Flame,
  Gamepad2,
  Gift,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { formatEther } from 'viem'
import { PlayerStatsFeatureGrid, type PlayerStatsFeatureItem } from '@/components/ui/player-stats-feature-grid'
import { fetchDexScreenerProxy } from '@/lib/dexscreener-client'
import { formatMorbiusFloor } from '@/lib/format-morbius-display'
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'
import { getApiUrlOptional } from '@/lib/api-urls'
import { usePlatformAnalytics } from '@/hooks/use-platform-analytics'
import { useMorbiusBurned } from '@/hooks/use-morbius-burned'
import { useWplsPrice } from '@/hooks/use-wpls-price'

interface PulseScanTokenResponse {
  holders?: string | number
  holders_count?: string | number
  holdersCount?: string | number
}

interface DexScreenerPairRow {
  baseToken?: { address?: string }
  priceUsd?: string
  liquidity?: { usd?: number }
  marketCap?: number
  fdv?: number
}

interface DexScreenerTokenResponse {
  pairs?: DexScreenerPairRow[]
}

interface MorbiusMarketStats {
  priceUsd: string | null
  holders: string | null
  /** USD — best-effort from DexScreener pair (marketCap, else fdv). */
  marketCapUsd: number | null
}

interface MerkleEpochRow {
  total_reward_amount?: string
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

function formatUsdMarketCap(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return '...'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(usd)
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
      let marketCapUsd: number | null = null

      if (tokenResult.status === 'fulfilled' && tokenResult.value.ok) {
        const tokenData = (await tokenResult.value.json()) as PulseScanTokenResponse
        holders = readHolderCount(tokenData)
      }

      if (dexResult.status === 'fulfilled' && dexResult.value.ok) {
        const dexData = (await dexResult.value.json()) as DexScreenerTokenResponse
        const pairs = dexData.pairs ?? []
        const normalizedAddr = MORBIUS_TOKEN_ADDRESS.toLowerCase()
        const tokenPairs = pairs
          .filter(
            (p) =>
              p.baseToken?.address?.toLowerCase() === normalizedAddr &&
              p.priceUsd,
          )
          .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
        const best = tokenPairs[0]
        priceUsd = best?.priceUsd ?? null
        const mc = best?.marketCap ?? best?.fdv
        marketCapUsd = mc != null && Number.isFinite(mc) ? mc : null
      }

      return { holders, priceUsd, marketCapUsd }
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 30_000,
  })
}

function sumEpochRewards(epochs: MerkleEpochRow[]): bigint {
  return epochs.reduce((s, e) => s + BigInt(e.total_reward_amount || '0'), 0n)
}

function useMerkleDistributedTotal() {
  const apiBase = getApiUrlOptional()
  return useQuery<bigint>({
    queryKey: ['merkleDistributedTotal', apiBase],
    queryFn: async ({ signal }) => {
      if (!apiBase) return 0n
      const [h, l] = await Promise.all([
        fetch(`${apiBase}/api/merkle/epochs`, { signal }),
        fetch(`${apiBase}/api/merkle-lp/epochs`, { signal }),
      ])
      if (!h.ok || !l.ok) {
        throw new Error('Merkle epochs unavailable')
      }
      const holderEpochs = (await h.json()) as MerkleEpochRow[]
      const lpEpochs = (await l.json()) as MerkleEpochRow[]
      if (!Array.isArray(holderEpochs) || !Array.isArray(lpEpochs)) {
        throw new Error('Invalid merkle epochs response')
      }
      return sumEpochRewards(holderEpochs) + sumEpochRewards(lpEpochs)
    },
    enabled: !!apiBase,
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 60_000,
  })
}

export function PlatformStatsSection() {
  const { data: analytics, isLoading: analyticsLoading } = usePlatformAnalytics()
  const { data: marketStats, isLoading: marketStatsLoading } = useMorbiusMarketStats()
  const { burnedAmount, isLoading: burnLoading } = useMorbiusBurned()
  const { wplsPerMORBIUS, isLoading: plsPriceLoading } = useWplsPrice()
  const apiBase = getApiUrlOptional()
  const {
    data: distributedWei,
    isLoading: distributedLoading,
    isError: distributedError,
  } = useMerkleDistributedTotal()

  const totalGames = analytics?.combined.totalGamesPlayed ?? '0'
  const totalWagered = analytics?.combined.totalVolume ?? '0'
  const totalWon = analytics?.combined.totalPayouts ?? '0'

  const plsPriceDisplay =
    plsPriceLoading || !wplsPerMORBIUS ? '...' : Number(formatEther(wplsPerMORBIUS)).toFixed(6)

  const plsSubtitle = 'WPLS per 1 MORBIUS'

  let distributedDisplay = '—'
  if (!apiBase) {
    distributedDisplay = '—'
  } else if (distributedLoading) {
    distributedDisplay = '...'
  } else if (distributedError || distributedWei === undefined) {
    distributedDisplay = '—'
  } else {
    distributedDisplay = formatMorbiusFloor(distributedWei)
  }

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
      title: 'Total Market Cap',
      value: marketStatsLoading ? '...' : formatUsdMarketCap(marketStats?.marketCapUsd ?? null),
      subtitle: 'Data pulled from Dexscreener.',
      icon: TrendingUp,
    },
    {
      title: 'MORBIUS Burned',
      value: burnLoading ? '...' : formatMorbiusFloor(burnedAmount, { compact: false }),
      subtitle: 'MORBIUS burned to date',
      icon: Flame,
      valueClassName: 'text-orange-300',
    },
    {
      title: 'MORBIUS Distributed',
      value: distributedDisplay,
      subtitle: 'Holder + LP Rewards',
      icon: Gift,
      valueClassName: 'text-cyan-100',
    },
    {
      title: 'MORBIUS Price',
      value: formatUsdPrice(marketStats?.priceUsd ?? null),
      subtitle: 'Live DexScreener USD quote',
      icon: Wallet,
      valueClassName: 'text-cyan-100',
    },
    {
      title: 'MORBIUS / PLS',
      value: plsPriceDisplay,
      subtitle: plsSubtitle,
      icon: Coins,
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
        <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">The Numbers</h2>
      </div>

      <PlayerStatsFeatureGrid items={items} className="overflow-hidden rounded-2xl border border-cyan-500/20" />
    </section>
  )
}
