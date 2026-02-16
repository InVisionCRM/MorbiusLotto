'use client'

import React, { useState } from 'react'
import { formatEther } from 'viem'
import { useBlackjackTopPlayers, type TopPlayerEntry } from '@/hooks/use-blackjack-stats'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'

const TOP_N = 25

const PANEL_STYLE = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

function formatMorbius(wei: bigint): string {
  return Math.floor(Number(formatEther(wei))).toLocaleString()
}

function shortAddress(addr: string): string {
  if (!addr || addr.length < 8) return addr
  return addr.slice(-4)
}

export default function BlackjackTopPlayers() {
  const { data: players, isLoading, error } = useBlackjackTopPlayers(TOP_N)
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)

  if (error) {
    const message = error instanceof Error ? error.message : 'Failed to load leaderboard.'
    return (
      <div className="text-center py-4 min-w-0">
        <p className="text-red-400/90 text-sm font-poppins">Failed to load leaderboard.</p>
        <p className="text-red-300/80 text-xs mt-2 font-poppins font-mono max-w-xl mx-auto break-words">{message}</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        <p className="text-white/60 text-sm font-poppins">Loading leaderboard...</p>
      </div>
    )
  }

  const list = Array.isArray(players) ? players : []

  if (list.length === 0) {
    return (
      <p className="text-white/50 text-sm font-poppins text-center py-4">
        No player stats yet. Play games to appear on the leaderboard.
      </p>
    )
  }

  return (
    <>
      <div className="rounded-xl overflow-hidden" style={PANEL_STYLE}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 px-3 text-white/70 font-medium">#</th>
                <th className="text-left py-2 px-3 text-white/70 font-medium">Player</th>
                <th className="text-right py-2 px-3 text-white/70 font-medium">Games</th>
                <th className="text-right py-2 px-3 text-white/70 font-medium">Wagered</th>
                <th className="text-right py-2 px-3 text-white/70 font-medium">P/L</th>
                <th className="text-right py-2 px-3 text-white/70 font-medium">Win %</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e: TopPlayerEntry) => (
                <tr key={e.wallet_address} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 px-3">
                    <span className={e.rank <= 3 ? 'text-amber-300 font-bold' : 'text-white/60'}>{e.rank}</span>
                  </td>
                  <td className="py-2 px-3">
                    <button
                      onClick={() => setSelectedAddress(e.wallet_address)}
                      className="text-cyan-400 hover:text-cyan-300 font-mono"
                    >
                      ...{shortAddress(e.wallet_address)}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-white/90">{e.total_games}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-white/80">{formatMorbius(e.total_bet)}</td>
                  <td className={`py-2 px-3 text-right tabular-nums ${e.profit_loss >= BigInt(0) ? 'text-emerald-400' : 'text-red-400'}`}>
                    {e.profit_loss >= BigInt(0) ? '+' : ''}{formatMorbius(e.profit_loss)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-white/80">{e.win_rate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PlayerProfileModal
        isOpen={!!selectedAddress}
        onClose={() => setSelectedAddress(null)}
        address={selectedAddress}
      />
    </>
  )
}
