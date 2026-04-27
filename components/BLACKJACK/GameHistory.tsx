'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { History, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Trophy, Clock } from 'lucide-react'
import { formatEther } from 'viem'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export interface GameHistoryEntry {
  id: string
  gameId: string
  timestamp: number
  betAmount: bigint
  payout: bigint
  result: 'win' | 'loss' | 'push' | 'blackjack'
  playerHands: Array<{
    cards: number[]
    total: number
    result: 'win' | 'loss' | 'push' | 'blackjack'
    payout: bigint
  }>
  dealerCards: number[]
  dealerTotal: number
  serverSeedHash?: string
  verified?: boolean
  wasSplit?: boolean
  wasDoubleDown?: boolean
}

const HISTORY_PAGE_SIZE = 25

interface GameHistoryProps {
  history: GameHistoryEntry[]
  onVerifyGame?: (gameId: string) => void
  isLoading?: boolean
}

// Card value to rank mapping
const VALUE_TO_RANK: Record<number, string> = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6',
  7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K'
}

// Suits for deterministic assignment
const SUITS = ['S', 'H', 'D', 'C'] // Spades, Hearts, Diamonds, Clubs

// Get card image path from value and index
const getCardImagePath = (value: number, index: number, salt: number = 0): string => {
  const rank = VALUE_TO_RANK[value] || '2'
  const suitIndex = (index + salt) % 4
  const suit = SUITS[suitIndex]
  return `/BlackJack/Cards/PNG/${rank}${suit}.png`
}

// Card component that displays the actual card image
const CardImage = ({ value, index, salt = 0 }: { value: number; index: number; salt?: number }) => {
  // Normalize: 0 can be Ace from deck index; 1-13 are ranks
  const rank = (value >= 0 && value <= 51) ? (value % 13) + 1 : (value === 0 ? 1 : value);
  if (rank < 1 || rank > 13) return null;

  const imagePath = getCardImagePath(rank, index, salt);

  return (
    <div
      className="relative flex-shrink-0 rounded-md overflow-hidden shadow-lg"
      style={{
        width: '45px',
        height: '63px',
        marginLeft: index > 0 ? '-15px' : '0',
        position: 'relative',
      }}
    >
      <Image
        src={imagePath}
        alt={`Card ${VALUE_TO_RANK[rank] || rank}`}
        width={45}
        height={63}
        className="object-contain"
        style={{ width: '100%', height: '100%' }}
        unoptimized
      />
    </div>
  )
}

export function GameHistory({ history, onVerifyGame, isLoading }: GameHistoryProps) {
  const [expandedGame, setExpandedGame] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'profit'>('newest')
  const [page, setPage] = useState(1)

  const sortedHistory = useMemo(() => {
    const sorted = [...history]

    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => b.timestamp - a.timestamp)
      case 'oldest':
        return sorted.sort((a, b) => a.timestamp - b.timestamp)
      case 'profit':
        return sorted.sort((a, b) => {
          const aProfit = Number(formatEther(a.payout)) - Number(formatEther(a.betAmount))
          const bProfit = Number(formatEther(b.payout)) - Number(formatEther(b.betAmount))
          return bProfit - aProfit
        })
      default:
        return sorted
    }
  }, [history, sortBy])

  const totalPages = Math.max(1, Math.ceil(sortedHistory.length / HISTORY_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageOffset = (safePage - 1) * HISTORY_PAGE_SIZE
  const pagedHistory = useMemo(
    () => sortedHistory.slice(pageOffset, pageOffset + HISTORY_PAGE_SIZE),
    [sortedHistory, pageOffset],
  )

  useEffect(() => {
    setPage(1)
    setExpandedGame(null)
  }, [history, sortBy])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => {
    setExpandedGame(null)
  }, [safePage])

  const getResultColor = (result: string) => {
    switch (result) {
      case 'win': return 'text-green-400 bg-green-900/20'
      case 'loss': return 'text-red-400 bg-red-900/20'
      case 'push': return 'text-yellow-400 bg-yellow-900/20'
      case 'blackjack': return 'text-purple-400 bg-purple-900/20'
      default: return 'text-gray-400 bg-gray-900/20'
    }
  }

  const getProfit = (entry: GameHistoryEntry) => {
    return Math.floor(Number(formatEther(entry.payout))) - Math.floor(Number(formatEther(entry.betAmount)))
  }

  const formatAmount = (amount: bigint) => {
    return Math.floor(Number(formatEther(amount))).toLocaleString()
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60))
      return `${diffMinutes}m ago`
    } else if (diffHours < 24) {
      return `${diffHours}h ago`
    } else {
      const diffDays = Math.floor(diffHours / 24)
      return `${diffDays}d ago`
    }
  }

  if (isLoading) {
    return (
      <Card className="w-full max-w-full bg-gradient-to-br from-gray-900 to-black border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <History className="w-5 h-5" />
            Game History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
            <span className="ml-2 text-gray-400">Loading history...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (history.length === 0) {
    return (
      <Card className="w-full max-w-full bg-gradient-to-br from-gray-900 to-black border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <History className="w-5 h-5" />
            Game History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <History className="w-12 h-12 mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">No games played yet</p>
            <p className="text-sm text-gray-500 mt-2">Start playing to see your game history</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-full bg-gradient-to-br from-gray-900 to-black border-gray-700 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center justify-between w-full min-w-0">
          <CardTitle className="text-white flex items-center gap-2">
            <History className="w-5 h-5" />
            Game History ({history.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              title="Sort by"
              aria-label="Sort by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-gray-800 border border-gray-600 rounded px-3 py-1 text-sm text-white"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="profit">By Profit</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {sortedHistory.length > HISTORY_PAGE_SIZE && (
          <p className="text-[11px] text-gray-500 -mt-1 mb-1">
            Showing {pageOffset + 1}–{Math.min(pageOffset + HISTORY_PAGE_SIZE, sortedHistory.length)} of {sortedHistory.length}
          </p>
        )}
        <AnimatePresence>
          {pagedHistory.map((entry, idx) => {
            const entryIndex = pageOffset + idx
            return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-lg border border-gray-700/60 overflow-hidden"
            >
              {/* Top bar: Result, time, WAGER, OUTCOME */}
              <div
                className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-800/50 cursor-pointer hover:bg-gray-800/70 transition-colors"
                onClick={() => setExpandedGame(expandedGame === entry.id ? null : entry.id)}
              >
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <Badge className={`${getResultColor(entry.result)} border-0 shrink-0`}>
                    {entry.result === 'blackjack' && <Trophy className="w-3 h-3 mr-1" />}
                    {entry.result.toUpperCase()}
                  </Badge>
                  {entry.wasSplit && (
                    <Badge className="bg-cyan-900/30 text-cyan-300 border border-cyan-500/30 text-xs shrink-0">SPLIT</Badge>
                  )}
                  {entry.wasDoubleDown && (
                    <Badge className="bg-amber-900/30 text-amber-300 border border-amber-500/30 text-xs shrink-0">2x</Badge>
                  )}
                  <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    {formatTimestamp(entry.timestamp)}
                  </span>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">WAGER</span>
                    <span className="text-sm text-gray-300">{formatAmount(entry.betAmount)} MORBIUS</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">OUTCOME</span>
                    <span className={`text-sm font-bold ${
                      getProfit(entry) > 0 ? 'text-green-400' :
                      getProfit(entry) < 0 ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                      {getProfit(entry) > 0 ? '+' : ''}{getProfit(entry).toLocaleString()} MORBIUS
                    </span>
                  </div>
                  {expandedGame === entry.id ? (
                    <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              <AnimatePresence>
                {expandedGame === entry.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-700 bg-gray-900/30"
                  >
                    <div className="p-4 space-y-4">
                      {/* Player Hands Details */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-gray-300">Your Hands</h4>
                        {entry.playerHands.map((hand, handIndex) => (
                          <div
                            key={handIndex}
                            className="bg-gray-800/50 rounded-lg p-4"
                            style={{
                              border: hand.result === 'blackjack' ? '1px solid rgba(168, 85, 247, 0.5)' :
                                     hand.result === 'win' ? '1px solid rgba(34, 197, 94, 0.3)' :
                                     hand.result === 'loss' ? '1px solid rgba(239, 68, 68, 0.3)' :
                                     '1px solid rgba(234, 179, 8, 0.3)'
                            }}
                          >
                            <div className="grid grid-cols-[1fr_1fr] gap-4 items-center mb-3 text-left">
                              <div className="flex items-center gap-2">
                                {entry.playerHands.length > 1 && (
                                  <span className="text-sm text-gray-400">Hand {handIndex + 1}</span>
                                )}
                                <Badge className={`${getResultColor(hand.result)} border-0 text-xs`}>
                                  {hand.result.toUpperCase()}
                                </Badge>
                              </div>
                              <span className="text-lg font-bold text-white text-left">
                                Total: {hand.total}
                              </span>
                            </div>

                            {/* Full Cards Display */}
                            <div className="flex flex-wrap gap-1 mb-3">
                              {hand.cards && hand.cards.length > 0 ? (
                                hand.cards.map((cardValue, cardIdx) => (
                                  <CardImage
                                    key={`hand-${handIndex}-card-${cardIdx}`}
                                    value={cardValue}
                                    index={cardIdx}
                                    salt={entryIndex + handIndex * 10}
                                  />
                                ))
                              ) : (
                                <span className="text-xs text-gray-500">No cards available</span>
                              )}
                            </div>

                            <div className="grid grid-cols-[1fr_1fr] gap-4 items-center text-sm pt-2 border-t border-gray-700/50 text-left">
                              <span className="text-gray-400">
                                Bet: {formatAmount(entry.betAmount / BigInt(entry.playerHands.length))} MORBIUS
                              </span>
                              <span className={`font-medium text-left ${
                                Number(formatEther(hand.payout)) > Number(formatEther(entry.betAmount / BigInt(entry.playerHands.length))) ? 'text-green-400' :
                                Number(formatEther(hand.payout)) < Number(formatEther(entry.betAmount / BigInt(entry.playerHands.length))) ? 'text-red-400' : 'text-yellow-400'
                              }`}>
                                Payout: {formatAmount(hand.payout)} MORBIUS
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <Separator className="bg-gray-700" />

                      {/* Dealer Cards */}
                      <div className="bg-gray-800/30 rounded-lg p-4">
                        <div className="grid grid-cols-[1fr_1fr] gap-4 items-center mb-3 text-left">
                          <h4 className="text-sm font-medium text-gray-300">Dealer's Hand</h4>
                          <span className="text-lg font-bold text-white text-left">
                            Total: {entry.dealerTotal}
                            {entry.dealerTotal > 21 && (
                              <span className="text-red-400 ml-2 text-sm">BUST</span>
                            )}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {entry.dealerCards && entry.dealerCards.length > 0 ? (
                            entry.dealerCards.map((cardValue, cardIdx) => (
                              <CardImage
                                key={`dealer-card-${cardIdx}`}
                                value={cardValue}
                                index={cardIdx}
                                salt={entryIndex + 100}
                              />
                            ))
                          ) : (
                            <span className="text-xs text-gray-500">No cards available</span>
                          )}
                        </div>
                      </div>

                      {/* Verification */}
                      <div className="pt-2 border-t border-gray-700 space-y-3">
                        {entry.verified ? (
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-400 rounded-full shrink-0" />
                            <span className="text-sm text-green-400 font-medium">Verified</span>
                          </div>
                        ) : null}
                        <Link
                          href={`/BLACKJACK/verify?gameId=${encodeURIComponent(entry.gameId)}`}
                          className="block w-full"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full h-10 text-sm font-semibold rounded-lg border-2 border-cyan-500/40 bg-gradient-to-r from-cyan-600/25 to-blue-600/25 text-cyan-100 shadow-[0_4px_16px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] hover:from-cyan-600/40 hover:to-blue-600/40 hover:border-cyan-400/55 hover:text-white transition-all"
                          >
                            {entry.verified ? 'Open verification' : 'Verify this game'}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )})}
        </AnimatePresence>

        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-gray-700/80">
            <span className="text-xs text-gray-500 text-center sm:text-left tabular-nums">
              Page {safePage} of {totalPages}
            </span>
            <div className="flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-w-[100px] border-white/15 bg-gray-800/50 text-white hover:bg-gray-700/70"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4 mr-1" aria-hidden />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-w-[100px] border-white/15 bg-gray-800/50 text-white hover:bg-gray-700/70"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
