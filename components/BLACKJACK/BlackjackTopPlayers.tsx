'use client'

import React from 'react'
import { formatEther } from 'viem'
import { useBlackjackTopPlayers, type TopPlayerEntry } from '@/hooks/use-blackjack-stats'

const PANEL_CLASS =
  'rounded-xl border border-white/10 bg-gradient-to-br from-slate-900/95 to-slate-800/90 shadow-[inset_0_3px_6px_rgba(0,0,0,0.8),inset_0_-3px_6px_rgba(255,255,255,0.06)]'

const TOP_N = 10

function formatMorbius(wei: bigint): string {
  return Math.floor(Number(formatEther(wei))).toLocaleString()
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function BlackjackTopPlayers() {
  const { data: players, isLoading, error } = useBlackjackTopPlayers(TOP_N)

  if (error) {
    const message = error instanceof Error ? error.message : 'Failed to load leaderboard.'
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-4 min-w-0 text-center">
        <p className="text-red-400/90 text-sm">Failed to load leaderboard.</p>
        <p className="text-red-300/80 text-xs mt-2 font-mono max-w-xl mx-auto break-words">{message}</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-2 min-w-0">
        <div className={`${PANEL_CLASS} p-8 flex items-center justify-center gap-2`}>
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
          <p className="text-white/60 text-sm">Loading leaderboard...</p>
        </div>
      </div>
    )
  }

  const list = Array.isArray(players) ? players : []

  if (list.length === 0) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-4 min-w-0 text-center">
        <p className="text-white/50 text-sm">No player stats yet. Play games to appear on the leaderboard.</p>
      </div>
    )
  }

  const gridCols = 'grid-cols-[auto_minmax(5rem,1fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_minmax(3.5rem,1fr)]'

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-2 min-w-0">
      <div
        className={`hidden sm:grid ${gridCols} gap-3 px-4 py-2.5 text-xs font-medium text-white/50 uppercase tracking-wider border-b border-white/10 mb-1`}
      >
        <span>#</span>
        <span>Player</span>
        <span>Games</span>
        <span>Wagered</span>
        <span>P/L</span>
        <span>Win %</span>
      </div>

      <div className="space-y-1.5 overflow-x-auto min-w-0">
        {list.map((entry: TopPlayerEntry) => {
          const isProfit = entry.profit_loss >= BigInt(0)
          return (
            <div
              key={entry.wallet_address}
              className={`${PANEL_CLASS} p-3 sm:px-4 transition-all hover:border-cyan-500/20`}
            >
              <div className={`grid ${gridCols} gap-3 sm:gap-4 items-center text-left`}>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold ${
                      entry.rank <= 3
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                        : 'bg-slate-500/20 text-slate-300 border border-slate-400/40'
                    }`}
                  >
                    {entry.rank}
                  </span>
                </div>
                <div className="min-w-0 font-mono text-white/90 text-sm truncate" title={entry.wallet_address}>
                  {truncateAddress(entry.wallet_address)}
                </div>
                <div className="min-w-0 text-white font-semibold text-sm tabular-nums">{entry.total_games}</div>
                <div className="min-w-0 text-white/80 text-sm tabular-nums">{formatMorbius(entry.total_bet)} M</div>
                <div
                  className={`min-w-0 font-semibold text-sm tabular-nums ${
                    isProfit ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {isProfit ? '+' : ''}{formatMorbius(entry.profit_loss)} M
                </div>
                <div className="min-w-0 text-white/70 text-sm tabular-nums">{entry.win_rate.toFixed(1)}%</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
