'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { formatEther } from 'viem'
import { useBlackjackTopPlayers, type TopPlayerEntry } from '@/hooks/use-blackjack-stats'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'

const TOP_N = 10

const tableCls = 'text-white font-poppins bg-transparent'
const rowCls = 'border-white/10 hover:bg-transparent'
const headCls = 'text-white/80 font-medium h-9 px-2'
const cellCls = 'text-white p-2'

function formatMorbius(wei: bigint): string {
  return Math.floor(Number(formatEther(wei))).toLocaleString()
}

function formatAddress(addr: string): string {
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
      <Table className={tableCls}>
        <TableHeader>
          <TableRow className={rowCls}>
            <TableHead className={headCls}>#</TableHead>
            <TableHead className={headCls}>Player</TableHead>
            <TableHead className={headCls}>Games</TableHead>
            <TableHead className={headCls}>Wagered</TableHead>
            <TableHead className={headCls}>P/L</TableHead>
            <TableHead className={headCls}>Win %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((entry: TopPlayerEntry) => {
            const isProfit = entry.profit_loss >= BigInt(0)
            return (
              <TableRow key={entry.wallet_address} className={rowCls}>
                <TableCell className={cellCls}>
                  <span
                    className={`inline-flex w-7 h-7 items-center justify-center rounded text-xs font-bold font-poppins ${
                      entry.rank <= 3 ? 'text-amber-300' : 'text-white/70'
                    }`}
                  >
                    {entry.rank}
                  </span>
                </TableCell>
                <TableCell className={`${cellCls} font-mono text-sm text-white/90 truncate max-w-[100px]`} title={entry.wallet_address}>
                  <button
                    onClick={() => setSelectedAddress(entry.wallet_address)}
                    className="text-cyan-400 hover:text-cyan-300 underline transition-colors"
                  >
                    {formatAddress(entry.wallet_address)}
                  </button>
                </TableCell>
                <TableCell className={`${cellCls} tabular-nums`}>{entry.total_games}</TableCell>
                <TableCell className={`${cellCls} tabular-nums text-white/80 flex items-center gap-1`}>
                  {formatMorbius(entry.total_bet)}{' '}
                  <Image
                    src="/morbius/MorbiusLogo (3).png"
                    alt="MORBIUS"
                    width={16}
                    height={16}
                    className="object-contain inline-block"
                  />
                </TableCell>
                <TableCell className={`${cellCls} tabular-nums font-poppins ${isProfit ? 'text-emerald-400' : 'text-red-400'} flex items-center gap-1`}>
                  {isProfit ? '+' : ''}{formatMorbius(entry.profit_loss)}{' '}
                  <Image
                    src="/morbius/MorbiusLogo (3).png"
                    alt="MORBIUS"
                    width={16}
                    height={16}
                    className="object-contain inline-block"
                  />
                </TableCell>
                <TableCell className={`${cellCls} tabular-nums text-white/80`}>{entry.win_rate.toFixed(1)}%</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <PlayerProfileModal
        isOpen={!!selectedAddress}
        onClose={() => setSelectedAddress(null)}
        address={selectedAddress}
      />
    </>
  )
}
