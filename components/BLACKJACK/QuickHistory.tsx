'use client'

import React from 'react'
import Image from 'next/image'
import { formatEther } from 'viem'
import { GameResult } from '@/app/BLACKJACK/types'

interface QuickHistoryProps {
  history: GameResult[]
}

const QuickHistory: React.FC<QuickHistoryProps> = ({ history }) => {
  // Get last 20 hands
  const recentHistory = history.slice(0, 20)

  // Get suit letter for image filename
  const getSuitLetter = (suit: string) => {
    switch (suit) {
      case 'hearts': return 'H'
      case 'diamonds': return 'D'
      case 'clubs': return 'C'
      case 'spades': return 'S'
      default: return 'S'
    }
  }

  // Get value string for image filename
  const getValueString = (value: number) => {
    if (value === 1) return 'A'
    if (value === 11) return 'J'
    if (value === 12) return 'Q'
    if (value === 13) return 'K'
    return value.toString()
  }

  // Get card image path
  const getCardImagePath = (card: { value: number; suit: string }) => {
    const valueStr = getValueString(card.value)
    const suitLetter = getSuitLetter(card.suit)
    return `/BlackJack/Cards/PNG/${valueStr}${suitLetter}.png`
  }

  // Determine result type
  const getResultType = (result: GameResult): 'win' | 'loss' | 'push' | 'blackjack' => {
    if (result.isBlackjack) return 'blackjack'
    if (result.payout > BigInt(0)) return 'win'
    if (result.payout === BigInt(0) && result.playerHand.total === result.dealerHand.total) return 'push'
    return 'loss'
  }

  // Calculate win/loss amount
  const getWinLossAmount = (result: GameResult): bigint => {
    const betAmount = result.playerHand.betAmount || BigInt(0)
    return result.payout - betAmount
  }

  if (recentHistory.length === 0) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-6">
        <div
          className="rounded-xl p-8 text-center"
          style={{
            background: 'linear-gradient(145deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
            boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
            border: '1px inset rgba(60, 60, 60, 0.5)',
          }}
        >
          <p className="text-white/50 text-sm">No game history yet. Play some games to see your results!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6">
      <h2 className="text-2xl font-bold text-white mb-4 text-center">Recent Games</h2>
      <div className="space-y-2">
        {recentHistory.map((result, index) => {
          const resultType = getResultType(result)
          const winLossAmount = getWinLossAmount(result)
          const betAmount = result.playerHand.betAmount || BigInt(0)

          // Result badge styling
          const getResultBadgeStyle = () => {
            switch (resultType) {
              case 'blackjack':
                return 'bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-yellow-300 border-yellow-400/30'
              case 'win':
                return 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-300 border-green-400/30'
              case 'loss':
                return 'bg-gradient-to-r from-red-500/20 to-red-600/20 text-red-300 border-red-400/30'
              case 'push':
                return 'bg-gradient-to-r from-gray-500/20 to-gray-600/20 text-gray-300 border-gray-400/30'
            }
          }

          const getResultText = () => {
            switch (resultType) {
              case 'blackjack': return 'BJ'
              case 'win': return 'WIN'
              case 'loss': return 'LOSS'
              case 'push': return 'PUSH'
            }
          }

          return (
            <div
              key={result.gameId || index}
              className="rounded-lg p-3 transition-all hover:scale-[1.02]"
              style={{
                background: 'linear-gradient(145deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                border: '1px inset rgba(60, 60, 60, 0.5)',
              }}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                {/* Left Section: Result Badge and Amounts */}
                <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                  {/* Result Badge */}
                  <div className={`px-3 py-1 rounded-md font-bold text-xs uppercase border ${getResultBadgeStyle()}`}>
                    {getResultText()}
                  </div>

                  {/* Bet Amount */}
                  <div className="flex flex-col items-center min-w-[60px] sm:min-w-[80px]">
                    <span className="text-white/50 text-xs">Bet</span>
                    <span className="text-white font-bold text-sm">{formatEther(betAmount)}</span>
                  </div>

                  {/* Win/Loss Amount */}
                  <div className="flex flex-col items-center min-w-[60px] sm:min-w-[80px]">
                    <span className="text-white/50 text-xs">
                      {resultType === 'win' || resultType === 'blackjack' ? 'Won' : resultType === 'push' ? 'Returned' : 'Lost'}
                    </span>
                    <span
                      className={`font-bold text-sm ${
                        resultType === 'win' || resultType === 'blackjack'
                          ? 'text-green-400'
                          : resultType === 'loss'
                          ? 'text-red-400'
                          : 'text-gray-400'
                      }`}
                    >
                      {resultType === 'loss' ? '-' : '+'}
                      {formatEther(winLossAmount < BigInt(0) ? -winLossAmount : winLossAmount)}
                    </span>
                  </div>
                </div>

                {/* Right Section: Cards */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 flex-1 min-w-0">
                  {/* Player Cards */}
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-white/50 text-xs mr-1 sm:mr-2 flex-shrink-0">Player:</span>
                    <div className="flex gap-0.5 flex-1 min-w-0">
                      {result.playerHand.cards.map((card, cardIndex) => (
                        <div
                          key={`player-${cardIndex}`}
                          className="w-6 h-8 sm:w-8 sm:h-11 rounded-sm overflow-hidden flex-shrink-0"
                          style={{
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
                          }}
                        >
                          <Image
                            src={getCardImagePath(card)}
                            alt={`${getValueString(card.value)} of ${card.suit}`}
                            width={32}
                            height={44}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ))}
                    </div>
                    <span className="text-white/70 text-xs ml-1 sm:ml-2 font-bold flex-shrink-0">{result.playerHand.total}</span>
                  </div>

                  {/* Dealer Cards */}
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-white/50 text-xs mr-1 sm:mr-2 flex-shrink-0">Dealer:</span>
                    <div className="flex gap-0.5 flex-1 min-w-0">
                      {result.dealerHand.cards.map((card, cardIndex) => (
                        <div
                          key={`dealer-${cardIndex}`}
                          className="w-6 h-8 sm:w-8 sm:h-11 rounded-sm overflow-hidden flex-shrink-0"
                          style={{
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
                          }}
                        >
                          <Image
                            src={getCardImagePath(card)}
                            alt={`${getValueString(card.value)} of ${card.suit}`}
                            width={32}
                            height={44}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ))}
                    </div>
                    <span className="text-white/70 text-xs ml-1 sm:ml-2 font-bold flex-shrink-0">{result.dealerHand.total}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default QuickHistory
