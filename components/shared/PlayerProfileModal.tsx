'use client'

import React, { useState, useId, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { usePlayerProfileStats, usePlayerProfileGames } from '@/hooks/use-player-profile'
import { formatEther } from 'viem'
import { PlayerStatsDashboard } from '@/components/BLACKJACK/PlayerStatsDashboard'
import { motion, AnimatePresence } from 'framer-motion'
import { useOutsideClick } from '@/hooks/use-outside-click'

interface PlayerProfileModalProps {
  isOpen: boolean
  onClose: () => void
  address: string | null
}

function formatAddress(address: string): string {
  if (!address || address.length < 8) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatMorbius(amount: bigint): string {
  return Math.floor(Number(formatEther(amount))).toLocaleString()
}

interface GameHistoryEntry {
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
  verified?: boolean
}

function formatTimestamp(timestamp: number): string {
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

function getResultColor(result: string): string {
  switch (result) {
    case 'win': return 'text-cyan-400'
    case 'loss': return 'text-white'
    case 'push': return 'text-cyan-300'
    case 'blackjack': return 'text-cyan-400'
    default: return 'text-white'
  }
}

function getProfit(entry: GameHistoryEntry): number {
  return Math.floor(Number(formatEther(entry.payout))) - Math.floor(Number(formatEther(entry.betAmount)))
}

export function PlayerProfileModal({ isOpen, onClose, address }: PlayerProfileModalProps) {
  const [activeTab, setActiveTab] = useState<'stats' | 'history'>('stats')
  const { data: stats, isLoading: statsLoading } = usePlayerProfileStats(address)
  const { data: games, isLoading: gamesLoading } = usePlayerProfileGames(address, 100)

  // Convert games to GameHistoryEntry format
  const historyEntries: GameHistoryEntry[] = React.useMemo(() => {
    if (!games) return []
    return games
      .filter((g) => g.result && g.completed_at)
      .map((game) => ({
        id: game.id,
        gameId: game.game_id,
        timestamp: new Date(game.completed_at || game.created_at).getTime(),
        betAmount: game.total_bet_amount,
        payout: game.total_payout,
        result: game.result as 'win' | 'loss' | 'push' | 'blackjack',
        playerHands: [],
        dealerCards: [],
        dealerTotal: 0,
        verified: false,
      }))
  }, [games])

  // Convert stats to PlayerStatsDashboard format
  const dashboardStats = React.useMemo(() => {
    if (!stats) return null
    return {
      totalGames: stats.total_games,
      totalBet: stats.total_bet,
      totalWin: stats.total_win,
      winRate: stats.win_rate,
      blackjackCount: stats.blackjack_count || 0,
      currentStreak: stats.current_streak || 0,
      bestStreak: stats.best_streak || 0,
      biggestWin: stats.biggest_win,
      biggestLoss: stats.biggest_loss,
      averageBet: stats.total_games > 0 ? Number(stats.total_bet) / stats.total_games / 1e18 : 0,
      averagePayout: stats.total_games > 0 ? Number(stats.total_win) / stats.total_games / 1e18 : 0,
      profitLoss: Number(stats.profit_loss) / 1e18,
      roi: Number(stats.total_bet) > 0 ? (Number(stats.profit_loss) / Number(stats.total_bet)) * 100 : 0,
      gamesToday: 0, // Could be calculated from games if needed
      gamesThisWeek: 0, // Could be calculated from games if needed
      favoriteBetAmount: Number(stats.favorite_bet_amount) / 1e18,
    }
  }, [stats])

  if (!address) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-gradient-to-b from-gray-900 to-black border-cyan-500/30">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="font-mono text-cyan-400">{formatAddress(address)}</span>
            <span className="text-white/60 text-sm font-normal">Profile</span>
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10 mb-4">
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === 'stats'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-white/60 hover:text-white'
            }`}
          >
            Stats
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === 'history'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-white/60 hover:text-white'
            }`}
          >
            History
          </button>
        </div>

        {/* Content */}
        {activeTab === 'stats' && (
          <div>
            {statsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              </div>
            ) : dashboardStats ? (
              <PlayerStatsDashboard stats={dashboardStats} isLoading={false} playerAddress={address} />
            ) : (
              <div className="text-center py-12 text-white/60">
                <p>No stats available for this address</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <HistoryTab 
            entries={historyEntries} 
            isLoading={gamesLoading}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function HistoryTab({ entries, isLoading }: { entries: GameHistoryEntry[]; isLoading: boolean }) {
  const [activeEntry, setActiveEntry] = useState<GameHistoryEntry | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()

  useOutsideClick(ref, () => setActiveEntry(null))

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveEntry(null)
      }
    }

    if (activeEntry) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', onKeyDown)
    } else {
      document.body.style.overflow = 'auto'
    }

    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [activeEntry])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-white/60 font-poppins text-xs">
        <p>No game history available</p>
      </div>
    )
  }

  return (
    <>
      <AnimatePresence>
        {activeEntry && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 h-full w-full z-50"
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {activeEntry ? (
          <div className="fixed inset-0 grid place-items-center z-[100] p-4">
            <motion.button
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-4 right-4 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full h-8 w-8 text-white font-poppins text-xs"
              onClick={() => setActiveEntry(null)}
            >
              ×
            </motion.button>
            <motion.div
              layoutId={`card-${activeEntry.id}-${id}`}
              ref={ref}
              className="w-full max-w-md h-full md:h-fit md:max-h-[90%] flex flex-col bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg overflow-hidden border border-gray-700"
            >
              <div className="p-3 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <motion.h3
                      layoutId={`title-${activeEntry.id}-${id}`}
                      className={`font-poppins text-xs font-semibold ${getResultColor(activeEntry.result)}`}
                    >
                      {activeEntry.result.toUpperCase()}
                    </motion.h3>
                    <motion.p
                      layoutId={`time-${activeEntry.id}-${id}`}
                      className="font-poppins text-xs text-white/60 mt-1"
                    >
                      {formatTimestamp(activeEntry.timestamp)}
                    </motion.p>
                  </div>
                  <div className="text-right">
                    <motion.p
                      layoutId={`bet-${activeEntry.id}-${id}`}
                      className="font-poppins text-xs text-white"
                    >
                      Bet: {formatMorbius(activeEntry.betAmount)} MORBIUS
                    </motion.p>
                    <motion.p
                      layoutId={`profit-${activeEntry.id}-${id}`}
                      className={`font-poppins text-xs font-medium ${
                        getProfit(activeEntry) > 0 ? 'text-cyan-400' :
                        getProfit(activeEntry) < 0 ? 'text-white' : 'text-cyan-300'
                      }`}
                    >
                      {getProfit(activeEntry) > 0 ? '+' : ''}{getProfit(activeEntry).toLocaleString()} MORBIUS
                    </motion.p>
                  </div>
                </div>
                <motion.div
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pt-2 border-t border-gray-700 space-y-2 font-poppins text-xs text-white/80"
                >
                  <div>
                    <span className="text-cyan-400">Game ID:</span> {activeEntry.gameId.slice(0, 8)}...
                  </div>
                  <div>
                    <span className="text-cyan-400">Payout:</span> {formatMorbius(activeEntry.payout)} MORBIUS
                  </div>
                  {activeEntry.dealerTotal > 0 && (
                    <div>
                      <span className="text-cyan-400">Dealer Total:</span> {activeEntry.dealerTotal}
                    </div>
                  )}
                  {activeEntry.verified !== undefined && (
                    <div>
                      <span className="text-cyan-400">Status:</span>{' '}
                      <span className={activeEntry.verified ? 'text-cyan-400' : 'text-white/60'}>
                        {activeEntry.verified ? 'Verified' : 'Unverified'}
                      </span>
                    </div>
                  )}
                </motion.div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-lg p-2 space-y-1">
        {entries.map((entry) => (
          <motion.div
            layoutId={`card-${entry.id}-${id}`}
            key={entry.id}
            onClick={() => setActiveEntry(entry)}
            className="p-2 flex justify-between items-center hover:bg-gray-700/30 rounded cursor-pointer transition-colors"
          >
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <motion.h3
                layoutId={`title-${entry.id}-${id}`}
                className={`font-poppins text-xs font-semibold ${getResultColor(entry.result)}`}
              >
                {entry.result.toUpperCase()}
              </motion.h3>
              <motion.p
                layoutId={`time-${entry.id}-${id}`}
                className="font-poppins text-xs text-white/60"
              >
                {formatTimestamp(entry.timestamp)}
              </motion.p>
            </div>
            <div className="flex flex-col items-end gap-1 min-w-0 ml-2">
              <motion.p
                layoutId={`bet-${entry.id}-${id}`}
                className="font-poppins text-xs text-white whitespace-nowrap"
              >
                {formatMorbius(entry.betAmount)} MORBIUS
              </motion.p>
              <motion.p
                layoutId={`profit-${entry.id}-${id}`}
                className={`font-poppins text-xs font-medium whitespace-nowrap ${
                  getProfit(entry) > 0 ? 'text-cyan-400' :
                  getProfit(entry) < 0 ? 'text-white' : 'text-cyan-300'
                }`}
              >
                {getProfit(entry) > 0 ? '+' : ''}{getProfit(entry).toLocaleString()} MORBIUS
              </motion.p>
            </div>
          </motion.div>
        ))}
      </div>
    </>
  )
}
