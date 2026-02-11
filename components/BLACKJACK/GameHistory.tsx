'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { History, ChevronDown, ChevronUp, Trophy, Target, Clock } from 'lucide-react'
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
  const imagePath = getCardImagePath(value, index, salt)

  if (!value || value < 1 || value > 13) {
    return null
  }

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
        alt={`Card ${VALUE_TO_RANK[value] || value}`}
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
      <CardContent className="space-y-3">
        <AnimatePresence>
          {sortedHistory.map((entry, entryIndex) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="border border-gray-700 rounded-lg overflow-hidden"
            >
              {/* Game Summary - grid: even columns, text left */}
              <div
                className="p-4 cursor-pointer hover:bg-gray-800/50 transition-colors"
                onClick={() => setExpandedGame(expandedGame === entry.id ? null : entry.id)}
              >
                <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-4 items-center text-left">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <Badge className={`${getResultColor(entry.result)} border-0`}>
                      {entry.result === 'blackjack' && <Trophy className="w-3 h-3 mr-1" />}
                      {entry.result.toUpperCase()}
                    </Badge>
                    {entry.wasSplit && (
                      <Badge className="bg-cyan-900/30 text-cyan-300 border border-cyan-500/30 text-xs">
                        SPLIT
                      </Badge>
                    )}
                    {entry.wasDoubleDown && (
                      <Badge className="bg-amber-900/30 text-amber-300 border border-amber-500/30 text-xs">
                        2x
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-400 min-w-0">
                    <Clock className="w-4 h-4 flex-shrink-0" />
                    <span>{formatTimestamp(entry.timestamp)}</span>
                  </div>
                  <div className="text-sm min-w-0">
                    <div className="flex items-center gap-1 text-gray-300">
                      <Target className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span>{formatAmount(entry.betAmount)} MORBIUS</span>
                    </div>
                  </div>
                  <div className={`text-sm font-medium min-w-0 ${
                    getProfit(entry) > 0 ? 'text-green-400' :
                    getProfit(entry) < 0 ? 'text-red-400' : 'text-yellow-400'
                  }`}>
                    {getProfit(entry) > 0 ? '+' : ''}{getProfit(entry).toLocaleString()} MORBIUS
                  </div>
                  <div className="flex items-center justify-end">
                    {expandedGame === entry.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Preview Cards Row - grid: even columns, text left */}
                <div className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 items-center text-left">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-500 uppercase tracking-wider flex-shrink-0">You:</span>
                    <div className="flex items-center min-w-0">
                      {entry.playerHands && entry.playerHands.length > 0 && entry.playerHands[0].cards && entry.playerHands[0].cards.length > 0 ? (
                        <>
                          {entry.playerHands[0].cards.slice(0, 3).map((cardValue, idx) => (
                            <CardImage
                              key={`preview-player-${idx}`}
                              value={cardValue}
                              index={idx}
                              salt={entryIndex}
                            />
                          ))}
                          {entry.playerHands[0].cards.length > 3 && (
                            <span className="text-xs text-gray-500 ml-1 self-center">
                              +{entry.playerHands[0].cards.length - 3}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-500">No cards</span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-white text-left">
                    {entry.playerHands && entry.playerHands.length > 0 ? entry.playerHands[0].total : '0'}
                  </span>
                  <span className="text-gray-600 text-center">vs</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-500 uppercase tracking-wider flex-shrink-0">Dealer:</span>
                    <div className="flex items-center min-w-0">
                      {entry.dealerCards && entry.dealerCards.length > 0 ? (
                        <>
                          {entry.dealerCards.slice(0, 3).map((cardValue, idx) => (
                            <CardImage
                              key={`preview-dealer-${idx}`}
                              value={cardValue}
                              index={idx}
                              salt={entryIndex + 100}
                            />
                          ))}
                          {entry.dealerCards.length > 3 && (
                            <span className="text-xs text-gray-500 ml-1 self-center">
                              +{entry.dealerCards.length - 3}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-500">No cards</span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-white text-left">
                    {entry.dealerTotal || 0}
                  </span>
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
                      <div className="grid grid-cols-[1fr_1fr] gap-4 items-center pt-2 border-t border-gray-700 text-left">
                        <div className="flex items-center gap-2">
                          {entry.verified ? (
                            <>
                              <div className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0"></div>
                              <span className="text-sm text-green-400">Verified</span>
                            </>
                          ) : (
                            <>
                              <div className="w-2 h-2 bg-yellow-400 rounded-full flex-shrink-0"></div>
                              <span className="text-sm text-yellow-400">Unverified</span>
                            </>
                          )}
                        </div>
                        <div className="text-left">
                          <Link href={`/BLACKJACK/verify?gameId=${encodeURIComponent(entry.gameId)}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              className="text-xs"
                            >
                              Verify Game
                            </Button>
                          </Link>
                        </div>
                      </div>
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
