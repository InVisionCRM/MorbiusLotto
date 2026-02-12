'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { usePlayerProfileStats, usePlayerProfileGames } from '@/hooks/use-player-profile'
import { formatEther } from 'viem'
import { GameHistory } from '@/components/BLACKJACK/GameHistory'
import { PlayerStatsDashboard } from '@/components/BLACKJACK/PlayerStatsDashboard'
import type { GameHistoryEntry } from '@/components/BLACKJACK/GameHistory'

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
              <PlayerStatsDashboard stats={dashboardStats} isLoading={false} />
            ) : (
              <div className="text-center py-12 text-white/60">
                <p>No stats available for this address</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            {gamesLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              </div>
            ) : historyEntries.length > 0 ? (
              <GameHistory history={historyEntries} isLoading={false} />
            ) : (
              <div className="text-center py-12 text-white/60">
                <p>No game history available for this address</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
