'use client'

import React, { useState } from 'react'
import { formatUnits } from 'viem'
import { useLotteryTopPlayers, type LotteryTopPlayerEntry } from '@/hooks/use-instant-lottery'
import { TOKEN_DECIMALS } from '@/lib/contracts'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const TOP_N = 50

const PANEL_STYLE = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

function formatMorbius(wei: bigint): string {
  return Math.floor(Number(formatUnits(wei, TOKEN_DECIMALS))).toLocaleString()
}

function shortAddress(addr: string): string {
  if (!addr || addr.length < 8) return addr
  return addr.slice(-4)
}

export default function LotteryTopPlayers() {
  const { data: players, isLoading, error } = useLotteryTopPlayers(TOP_N)
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
        <div className="px-3 py-2 border-b border-white/10">
          <h3 className="text-cyan-300 font-semibold text-sm">Leaderboard</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-white/70 font-medium">#</TableHead>
              <TableHead className="text-white/70 font-medium">Player</TableHead>
              <TableHead className="text-white/70 font-medium text-center">Games</TableHead>
              <TableHead className="text-center text-white/70 font-medium">Wagered</TableHead>
              <TableHead className="text-right text-white/70 font-medium">P/L</TableHead>
              <TableHead className="text-right text-white/70 font-medium">Win %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((e: LotteryTopPlayerEntry) => (
              <TableRow key={e.wallet_address} className="border-white/5 hover:bg-white/5">
                <TableCell className="text-white/90">
                  <span className={e.rank <= 3 ? 'text-amber-300 font-bold' : 'text-white/60'}>{e.rank}</span>
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => setSelectedAddress(e.wallet_address)}
                    className="text-cyan-400 hover:text-cyan-300 font-mono"
                  >
                    {shortAddress(e.wallet_address)}
                  </button>
                </TableCell>
                <TableCell className="text-center tabular-nums text-white/90">{e.total_games}</TableCell>
                <TableCell className="text-center tabular-nums text-white/80">{formatMorbius(e.total_bet)}</TableCell>
                <TableCell className={`text-right tabular-nums ${e.profit_loss >= 0n ? 'text-emerald-400' : 'text-red-400'}`}>
                  {e.profit_loss >= 0n ? '+' : ''}{formatMorbius(e.profit_loss)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-white/80">{e.win_rate.toFixed(1)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PlayerProfileModal
        isOpen={!!selectedAddress}
        onClose={() => setSelectedAddress(null)}
        address={selectedAddress}
        game="lottery"
      />
    </>
  )
}
