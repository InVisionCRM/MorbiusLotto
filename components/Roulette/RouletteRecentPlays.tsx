'use client'

import { formatEther } from 'viem'
import { useRouletteResults, type RouletteSpinRow } from '@/hooks/use-roulette-results'
import {
  getPocketColor,
  ROULETTE_BLACK_HEX,
  ROULETTE_GREEN_HEX,
  ROULETTE_RED_HEX,
} from './roulette-constants'
import { cn } from '@/lib/utils'

function PocketBadge({ n }: { n: number }) {
  const color = getPocketColor(n)
  const surface =
    color === 'red'
      ? { backgroundColor: ROULETTE_RED_HEX, borderColor: 'rgba(255,255,255,0.28)' }
      : color === 'green'
        ? { backgroundColor: ROULETTE_GREEN_HEX, borderColor: 'rgba(255,255,255,0.28)' }
        : { backgroundColor: ROULETTE_BLACK_HEX, borderColor: 'rgba(255,255,255,0.2)' }
  return (
    <span
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-black text-white'
      )}
      style={surface}
    >
      {n}
    </span>
  )
}

function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function formatMorbius(wei: bigint): string {
  const n = Number(formatEther(wei))
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function SpinRow({ spin }: { spin: RouletteSpinRow }) {
  const won = spin.netPayout > 0n
  const profitLoss = spin.netPayout - spin.totalWagered
  const timeStr = spin.timestamp
    ? new Date(spin.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 rounded-lg transition-colors">
      <PocketBadge n={spin.result} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-mono truncate">
            {formatAddress(spin.player)}
          </span>
          <span className="text-[10px] text-gray-600">{timeStr}</span>
        </div>
        <div className="text-xs text-gray-500">
          Wagered: <span className="text-gray-300">{formatMorbius(spin.totalWagered)} M</span>
        </div>
      </div>
      <div className={cn('text-sm font-bold tabular-nums', profitLoss >= 0n ? 'text-green-400' : 'text-red-400')}>
        {profitLoss >= 0n ? '+' : ''}{formatMorbius(profitLoss)} M
      </div>
    </div>
  )
}

export function RouletteRecentPlays({
  playerAddress,
  compact,
}: {
  playerAddress?: `0x${string}` | null
  compact?: boolean
}) {
  const { results } = useRouletteResults({ playerAddress, limit: compact ? 20 : 50 })

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500 text-sm">
        No spins yet. Be the first to play!
      </div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-white/5">
      {results.map((spin) => (
        <SpinRow key={`${spin.spinId}-${spin.transactionHash}`} spin={spin} />
      ))}
    </div>
  )
}
