'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { History, ChevronDown, ChevronUp, Trophy, Target, DollarSign, Clock } from 'lucide-react'
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
}

interface GameHistoryProps {
  history: GameHistoryEntry[]
  onVerifyGame?: (gameId: string) => void
  isLoading?: boolean
}

const CARD_SYMBOLS = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6',
  7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K'
}

const SUITS = ['♠', '♥', '♦', '♣']

export function GameHistory({ history, onVerifyGame, isLoading }: GameHistoryProps) {
  const [expandedGame, setExpandedGame] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'profit'>('newest')

  const sortedHistory = React.useMemo(() => {
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

  const formatCards = (cards: number[]) => {
    return cards.map((card, index) => {
      const suitIndex = Math.floor((card - 1) / 13)
      const rank = ((card - 1) % 13) + 1
      return (
        <span key={index} className="inline-flex items-center mx-0.5">
          <span className="text-xs font-bold">{CARD_SYMBOLS[rank as keyof typeof CARD_SYMBOLS]}</span>
          <span className="text-xs ml-0.5" style={{ color: suitIndex % 2 === 0 ? '#fff' : '#ff6b6b' }}>
            {SUITS[suitIndex]}
          </span>
        </span>
      )
    })
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
      <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
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
      <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
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
    <Card className="bg-gradient-to-br from-gray-900 to-black border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <History className="w-5 h-5" />
            Game History ({history.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
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
      <CardContent className="space-y-3">
        <AnimatePresence>
          {sortedHistory.map((entry) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="border border-gray-700 rounded-lg overflow-hidden"
            >
              {/* Game Summary */}
              <div
                className="p-4 cursor-pointer hover:bg-gray-800/50 transition-colors"
                onClick={() => setExpandedGame(expandedGame === entry.id ? null : entry.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Badge className={`${getResultColor(entry.result)} border-0`}>
                      {entry.result === 'blackjack' && <Trophy className="w-3 h-3 mr-1" />}
                      {entry.result.toUpperCase()}
                    </Badge>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Clock className="w-4 h-4" />
                      {formatTimestamp(entry.timestamp)}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-sm">
                        <Target className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-300">
                          {formatAmount(entry.betAmount)} MORBIUS
                        </span>
                      </div>
                      <div className={`text-sm font-medium ${
                        getProfit(entry) > 0 ? 'text-green-400' :
                        getProfit(entry) < 0 ? 'text-red-400' : 'text-yellow-400'
                      }`}>
                        {getProfit(entry) > 0 ? '+' : ''}{getProfit(entry).toLocaleString()} MORBIUS
                      </div>
                    </div>

                    <div className="flex items-center">
                      {expandedGame === entry.id ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>
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
                      {/* Hands Details */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-gray-300">Hands Played</h4>
                        {entry.playerHands.map((hand, index) => (
                          <div key={index} className="bg-gray-800/50 rounded p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-400">Hand {index + 1}:</span>
                                <div className="flex items-center gap-1">
                                  {formatCards(hand.cards)}
                                  <span className="text-sm text-gray-500 ml-2">
                                    (Total: {hand.total})
                                  </span>
                                </div>
                              </div>
                              <Badge className={`${getResultColor(hand.result)} border-0 text-xs`}>
                                {hand.result.toUpperCase()}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-400">
                                Bet: {formatAmount(entry.betAmount / BigInt(entry.playerHands.length))} MORBIUS
                              </span>
                              <span className={`font-medium ${
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
                      <div>
                        <h4 className="text-sm font-medium text-gray-300 mb-2">Dealer</h4>
                        <div className="flex items-center gap-2">
                          {formatCards(entry.dealerCards)}
                          <span className="text-sm text-gray-500 ml-2">
                            (Total: {entry.dealerTotal})
                          </span>
                        </div>
                      </div>

                      {/* Verification */}
                      {onVerifyGame && (
                        <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                          <div className="flex items-center gap-2">
                            {entry.verified ? (
                              <>
                                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                <span className="text-sm text-green-400">Verified</span>
                              </>
                            ) : (
                              <>
                                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                                <span className="text-sm text-yellow-400">Unverified</span>
                              </>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onVerifyGame(entry.gameId)}
                            className="text-xs"
                          >
                            Verify Game
                          </Button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}