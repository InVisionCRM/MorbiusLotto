'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { formatEther } from 'viem'
import Image from 'next/image'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'

export interface GlobalWinEntry {
  id: string
  playerAddress: string
  result: 'win' | 'loss' | 'push' | 'blackjack'
  amount: bigint
  payout: bigint
  timestamp: number
}

interface GlobalWinsFeedProps {
  wsClient?: any
  wsConnected?: boolean
  className?: string
}

const tableCls = 'text-white font-poppins bg-transparent'
const rowCls = 'border-white/10 hover:bg-transparent'
const headCls = 'text-white/80 font-medium h-9 px-2'
const cellCls = 'text-white p-2'

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

function formatAddress(address: string): string {
  if (!address || address.length < 8) return address
  return address.slice(-4)
}

export function GlobalWinsFeed({ wsClient, wsConnected, className = '' }: GlobalWinsFeedProps) {
  const [entries, setEntries] = useState<GlobalWinEntry[]>([])
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)

  useEffect(() => {
    if (!wsClient || !wsConnected) return

    const handleGlobalGameComplete = (data: any) => {
      try {
        const entry: GlobalWinEntry = {
          id: data.gameId || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          playerAddress: data.playerAddress || '0x0000...0000',
          result: data.result || 'loss',
          amount: BigInt(String(data.betAmount || '0')),
          payout: BigInt(String(data.payout || '0')),
          timestamp: Date.now(),
        }

        setEntries(prev => {
          if (prev.some(e => e.id === entry.id)) return prev
          return [entry, ...prev].slice(0, 20)
        })
      } catch (error) {
        console.error('Error processing global game event:', error)
      }
    }

    wsClient.on('global_game_completed', handleGlobalGameComplete)
    return () => wsClient.off('global_game_completed')
  }, [wsClient, wsConnected])

  const addLocalEntry = useCallback((entry: GlobalWinEntry) => {
    setEntries(prev => {
      if (prev.some(e => e.id === entry.id)) return prev
      return [entry, ...prev].slice(0, 20)
    })
  }, [])

  if (entries.length === 0) {
    return null
  }

  return (
    <>
      <div className={className}>
        <p className="text-white/60 text-xs font-poppins font-bold uppercase tracking-wider mb-2">Live Results</p>
        <Table className={tableCls}>
          <TableHeader>
            <TableRow className={rowCls}>
              <TableHead className={headCls}>Result</TableHead>
              <TableHead className={headCls}>Player</TableHead>
              <TableHead className={headCls}>P/L</TableHead>
              <TableHead className={headCls}>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const isWin = entry.result === 'win' || entry.result === 'blackjack'
              const isPush = entry.result === 'push'
              const profit = entry.payout - entry.amount
              const profitAmount = Math.abs(Math.floor(Number(formatEther(profit))))

              const resultLabel = entry.result === 'blackjack' ? 'BJ' : isWin ? 'W' : isPush ? 'P' : 'L'
              const resultCls =
                entry.result === 'blackjack'
                  ? 'text-amber-300'
                  : isWin
                    ? 'text-emerald-400'
                    : isPush
                      ? 'text-yellow-400'
                      : 'text-red-400'

              return (
                <TableRow key={entry.id} className={rowCls}>
                  <TableCell className={cellCls}>
                    <span className={`font-bold font-poppins ${resultCls}`}>{resultLabel}</span>
                  </TableCell>
                  <TableCell className={`${cellCls} font-mono text-sm text-white/90 truncate max-w-[80px]`} title={entry.playerAddress}>
                    <button
                      onClick={() => setSelectedAddress(entry.playerAddress)}
                      className="text-cyan-400 hover:text-cyan-300 underline transition-colors"
                    >
                      {formatAddress(entry.playerAddress)}
                    </button>
                  </TableCell>
                  <TableCell className={cellCls}>
                    {isPush ? (
                      <span className="text-yellow-400 font-poppins text-sm">Push</span>
                    ) : (
                      <span className={`font-poppins text-sm tabular-nums ${resultCls}`}>
                        {isWin ? '+' : '−'}{profitAmount.toLocaleString()}
                        <Image
                          src="/morbius/MorbiusLogo (3).png"
                          alt="MORBIUS"
                          width={12}
                          height={12}
                          className="inline object-contain ml-0.5 align-middle"
                        />
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={`${cellCls} text-white/60 text-xs font-poppins`}>
                    {timeAgo(entry.timestamp)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <PlayerProfileModal
        isOpen={!!selectedAddress}
        onClose={() => setSelectedAddress(null)}
        address={selectedAddress}
      />
    </>
  )
}

export default GlobalWinsFeed
