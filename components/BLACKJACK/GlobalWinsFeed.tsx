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
  /** Player card count for P-X vs D-X verification */
  playerCardCount?: number
  /** Dealer card count for P-X vs D-X verification */
  dealerCardCount?: number
  /** When true, amount/payout are in tournament chips (display as chips, not MORBIUS) */
  isTournament?: boolean
  /** Chip delta for tournament games (chips_after - chips_before); use for P/L when isTournament */
  chipDelta?: number
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
  const [isLoading, setIsLoading] = useState(true)

  // Fetch recent wins when WebSocket connects
  useEffect(() => {
    if (!wsClient || !wsConnected) {
      setIsLoading(false)
      return
    }

    const fetchRecentWins = async () => {
      try {
        setIsLoading(true)
        // Request recent global wins via WebSocket
        const response = await wsClient.sendRequest('recent_global_wins', { limit: 20 })
        if (response && Array.isArray(response.wins)) {
          const recentEntries: GlobalWinEntry[] = response.wins.map((win: any) => ({
            id: win.gameId || `${win.timestamp}-${Math.random().toString(36).slice(2)}`,
            playerAddress: win.playerAddress || '0x0000...0000',
            result: win.result || 'loss',
            amount: BigInt(String(win.betAmount || '0')),
            payout: BigInt(String(win.payout || '0')),
            timestamp: win.timestamp || Date.now(),
            playerCardCount: win.playerCardCount,
            dealerCardCount: win.dealerCardCount,
            isTournament: win.isTournament,
            chipDelta: win.chipDelta,
          }))
          setEntries(recentEntries)
        }
      } catch (error) {
        console.error('Error fetching recent wins:', error)
        // Continue with empty list if fetch fails
      } finally {
        setIsLoading(false)
      }
    }

    fetchRecentWins()
  }, [wsClient, wsConnected])

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
          playerCardCount: data.playerCardCount,
          dealerCardCount: data.dealerCardCount,
          isTournament: data.isTournament,
          chipDelta: data.chipDelta,
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

  if (isLoading) {
    return (
      <div className={className}>
        <p className="text-white/60 text-xs font-poppins font-bold uppercase tracking-wider mb-2">Live Results</p>
        <div className="flex items-center justify-center gap-2 py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          <p className="text-white/60 text-sm font-poppins">Loading wins...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={className}>
        <p className="text-white/60 text-xs font-poppins font-bold uppercase tracking-wider mb-2">Live Results</p>
        {entries.length === 0 ? (
          <p className="text-white/50 text-sm font-poppins text-center py-4">
            No recent wins to display.
          </p>
        ) : (
        <Table className={tableCls}>
          <TableHeader>
            <TableRow className={rowCls}>
              <TableHead className={headCls}>Result</TableHead>
              <TableHead className={headCls}>Player</TableHead>
              <TableHead className={headCls}>P/L</TableHead>
              <TableHead className={`${headCls} whitespace-nowrap min-w-[4rem]`} title="Player vs Dealer card count for verification">P vs D</TableHead>
              <TableHead className={headCls}>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const isWin = entry.result === 'win' || entry.result === 'blackjack'
              const isPush = entry.result === 'push'
              const isTournament = entry.isTournament === true
              const profitAmount = isTournament
                ? Math.abs(typeof entry.chipDelta === 'number' ? entry.chipDelta : Number(entry.payout) - Number(entry.amount))
                : Math.abs(Math.floor(Number(formatEther(entry.payout - entry.amount))))

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
                        {isTournament ? (
                          <span className="text-white/60 text-xs ml-0.5">chips</span>
                        ) : (
                          <Image
                            src="/morbius/MorbiusLogo (3).png"
                            alt="MORBIUS"
                            width={12}
                            height={12}
                            className="inline object-contain ml-0.5 align-middle"
                          />
                        )}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={`${cellCls} text-white/70 text-xs font-mono whitespace-nowrap`} title="Player card count vs Dealer card count">
                    {typeof entry.playerCardCount === 'number' && typeof entry.dealerCardCount === 'number'
                      ? `P-${entry.playerCardCount} vs D-${entry.dealerCardCount}`
                      : '—'}
                  </TableCell>
                  <TableCell className={`${cellCls} text-white/60 text-xs font-poppins`}>
                    {timeAgo(entry.timestamp)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        )}
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
