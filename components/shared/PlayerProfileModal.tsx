'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { usePlayerProfileStats } from '@/hooks/use-player-profile'
import { PlayerStatsDashboard } from '@/components/BLACKJACK/PlayerStatsDashboard'
import { useLotteryPlayerStats, useInstantLotteryResults } from '@/hooks/use-instant-lottery'
import { LotteryPlayerDashboard } from '@/components/lottery/LotteryPlayerDashboard'
import { KenoPlayerDashboard } from '@/components/CryptoKeno/KenoPlayerDashboard'
import { PlinkoPlayerDashboard } from '@/components/PLINKO/PlinkoPlayerDashboard'
import { AllStatsDashboard } from '@/components/shared/AllStatsDashboard'

export type PlayerProfileGame = 'all' | 'blackjack' | 'lottery' | 'keno' | 'plinko'

const GAME_LABELS: Record<PlayerProfileGame, string> = {
  all: 'All stats',
  blackjack: 'Blackjack',
  lottery: 'Lottery',
  keno: 'Keno',
  plinko: 'Plinko',
}

interface PlayerProfileModalProps {
  isOpen: boolean
  onClose: () => void
  address: string | null
  /** Initial game to show; when opened from home (no arg), pass 'all' to show combined stats first. */
  game?: PlayerProfileGame
}

export function PlayerProfileModal({ isOpen, onClose, address, game = 'all' }: PlayerProfileModalProps) {
  const [selectedGame, setSelectedGame] = useState<PlayerProfileGame>(game)

  // Sync selected game when modal opens or game prop changes (e.g. open from Plinko page)
  useEffect(() => {
    if (isOpen) setSelectedGame(game)
  }, [isOpen, game])

  const { data: stats, isLoading: statsLoading } = usePlayerProfileStats(selectedGame === 'blackjack' ? address : null)
  const lotteryAddress = address ? (address.startsWith('0x') ? address : `0x${address}`) as `0x${string}` : undefined
  const lotteryStats = useLotteryPlayerStats(selectedGame === 'lottery' || selectedGame === 'all' ? lotteryAddress : undefined)
  const { results: lotteryResults } = useInstantLotteryResults(
    (selectedGame === 'lottery' || selectedGame === 'all') && lotteryAddress ? { playerAddress: lotteryAddress, limit: 50 } : {}
  )

  // Convert stats to PlayerStatsDashboard format (blackjack only)
  const dashboardStats = React.useMemo(() => {
    if (selectedGame !== 'blackjack' || !stats) return null
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
      gamesToday: 0,
      gamesThisWeek: 0,
      favoriteBetAmount: Number(stats.favorite_bet_amount) / 1e18,
    }
  }, [selectedGame, stats])

  if (!address) return null

  const isAll = selectedGame === 'all'
  const isLottery = selectedGame === 'lottery'
  const isKeno = selectedGame === 'keno'
  const isPlinko = selectedGame === 'plinko'
  const isLoading = isLottery ? lotteryStats.isLoading : statsLoading

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-gradient-to-b from-gray-900 to-black border-cyan-500/30">
        <DialogHeader className="flex flex-row items-center justify-between gap-4">
          <DialogTitle className="text-xl font-bold text-white">
            Player Dashboard
          </DialogTitle>
          <Button
            variant="outline"
            size="lg"
            className="text-xl font-semibold text-white border-white/50 hover:bg-white/10 hover:text-white shrink-0 px-6"
            onClick={onClose}
          >
            Close
          </Button>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <label htmlFor="player-dashboard-game" className="text-sm text-white/80 whitespace-nowrap">Game:</label>
            <select
              id="player-dashboard-game"
              value={selectedGame}
              onChange={(e) => setSelectedGame(e.target.value as PlayerProfileGame)}
              className="bg-slate-800/90 border border-cyan-500/30 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              {(Object.entries(GAME_LABELS) as [PlayerProfileGame, string][]).map(([value, label]) => (
                <option key={value} value={value} className="bg-slate-900 text-white">
                  {label}
                </option>
              ))}
            </select>
          </div>

          {isAll ? (
          <AllStatsDashboard playerAddress={address} />
        ) : isPlinko ? (
          <PlinkoPlayerDashboard playerAddress={address} />
        ) : isKeno ? (
          <KenoPlayerDashboard playerAddress={address} />
        ) : isLottery ? (
          <div className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              </div>
            ) : (
              <LotteryPlayerDashboard
                stats={lotteryStats}
                results={lotteryResults}
                playerAddress={address}
                isLoadingResults={false}
              />
            )}
          </div>
        ) : (
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
