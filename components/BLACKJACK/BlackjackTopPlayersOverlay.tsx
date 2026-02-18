'use client'

import React from 'react'
import Link from 'next/link'
import { formatEther } from 'viem'
import { useBlackjackTopPlayers } from '@/hooks/use-blackjack-stats'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const TOP_N = 15

const PANEL_STYLE = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
} as const

function formatMorbius(wei: bigint): string {
  return Math.floor(Number(formatEther(wei))).toLocaleString()
}

function shortAddress(addr: string): string {
  if (!addr || addr.length < 8) return addr
  return addr.slice(-4)
}

export function BlackjackTopPlayersOverlay() {
  const { data: players, isLoading } = useBlackjackTopPlayers(TOP_N)

  if (isLoading || !players?.length) return null

  return (
    <div className="rounded-xl overflow-hidden" style={PANEL_STYLE}>
      <div className="px-3 py-2 border-b border-white/10">
        <h3 className="text-cyan-300 font-semibold text-sm">Top Players</h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-white/10 hover:bg-transparent">
            <TableHead className="text-white/70 font-medium">#</TableHead>
            <TableHead className="text-white/70 font-medium">Player</TableHead>
            <TableHead className="text-right text-white/70 font-medium">Games</TableHead>
            <TableHead className="text-right text-white/70 font-medium">P/L</TableHead>
            <TableHead className="text-right text-white/70 font-medium">Win %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((e) => (
            <TableRow key={e.wallet_address} className="border-white/5 hover:bg-white/5">
              <TableCell className="text-white/90">
                <span className={e.rank <= 3 ? 'text-amber-300 font-bold' : 'text-white/60'}>{e.rank}</span>
              </TableCell>
              <TableCell>
                <Link
                  href={`/player/${e.wallet_address}`}
                  className="text-cyan-400 hover:text-cyan-300 font-mono"
                >
                  ...{shortAddress(e.wallet_address)}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums text-white/90">{e.total_games}</TableCell>
              <TableCell className={`text-right tabular-nums ${e.profit_loss >= 0n ? 'text-emerald-400' : 'text-red-400'}`}>
                {e.profit_loss >= 0n ? '+' : ''}{formatMorbius(e.profit_loss)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-white/80">{e.win_rate.toFixed(1)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
