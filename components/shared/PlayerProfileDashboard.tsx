'use client'

import React, { useState, useEffect } from 'react'
import { usePlayerProfileStats } from '@/hooks/use-player-profile'
import { usePlayerServerBalance } from '@/hooks/use-player-server-balance'
import { PlayerStatsDashboard } from '@/components/BLACKJACK/PlayerStatsDashboard'
import { useLotteryPlayerStats, useInstantLotteryResults } from '@/hooks/use-instant-lottery'
import { LotteryPlayerDashboard } from '@/components/lottery/LotteryPlayerDashboard'
import { KenoPlayerDashboard } from '@/components/CryptoKeno/KenoPlayerDashboard'
import { PlinkoPlayerDashboard } from '@/components/PLINKO/PlinkoPlayerDashboard'
import { AllStatsDashboard } from '@/components/shared/AllStatsDashboard'
import { PokerPlayerDashboard } from '@/components/poker/PokerPlayerDashboard'

export type PlayerProfileGame = 'all' | 'blackjack' | 'poker' | 'lottery' | 'keno' | 'plinko'

const GAME_LABELS: Record<PlayerProfileGame, string> = {
  all: 'All stats',
  blackjack: 'Blackjack',
  poker: 'Poker',
  lottery: 'Lottery',
  keno: 'Keno',
  plinko: 'Plinko',
}

export interface PlayerProfileDashboardProps {
  address: string
  /** Default / reset selection (e.g. when opening the modal from a specific game). */
  initialGame?: PlayerProfileGame
  /** `id` for the game &lt;select&gt; (avoid duplicate ids when modal + page both exist). */
  gameSelectId?: string
  /**
   * When set (modal), re-apply `initialGame` whenever the modal opens (`true`).
   * Omit on standalone pages.
   */
  modalOpen?: boolean
}

export function PlayerProfileDashboard({
  address,
  initialGame = 'all',
  gameSelectId = 'player-dashboard-game',
  modalOpen,
}: PlayerProfileDashboardProps) {
  const [selectedGame, setSelectedGame] = useState<PlayerProfileGame>(initialGame)

  useEffect(() => {
    if (modalOpen === undefined) {
      setSelectedGame(initialGame)
    } else if (modalOpen) {
      setSelectedGame(initialGame)
    }
  }, [initialGame, modalOpen])

  const { data: stats, isLoading: statsLoading } = usePlayerProfileStats(selectedGame === 'blackjack' ? address : null)
  const { data: reserveBalance } = usePlayerServerBalance(selectedGame === 'blackjack' ? address : null)
  const lotteryAddress = address ? ((address.startsWith('0x') ? address : `0x${address}`) as `0x${string}`) : undefined
  const lotteryStats = useLotteryPlayerStats(selectedGame === 'lottery' || selectedGame === 'all' ? lotteryAddress : undefined)
  const { results: lotteryResults } = useInstantLotteryResults(
    (selectedGame === 'lottery' || selectedGame === 'all') && lotteryAddress ? { playerAddress: lotteryAddress, limit: 50 } : {}
  )

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

  const isAll = selectedGame === 'all'
  const isLottery = selectedGame === 'lottery'
  const isKeno = selectedGame === 'keno'
  const isPlinko = selectedGame === 'plinko'
  const isPoker = selectedGame === 'poker'
  const isLoading = isLottery ? lotteryStats.isLoading : statsLoading

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor={gameSelectId} className="text-sm text-white/80 whitespace-nowrap">
          Game:
        </label>
        <select
          id={gameSelectId}
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
      ) : isPoker ? (
        <PokerPlayerDashboard playerAddress={address} />
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
            <PlayerStatsDashboard
              stats={dashboardStats}
              isLoading={false}
              playerAddress={address}
              reserveBalance={typeof reserveBalance === 'bigint' ? reserveBalance : undefined}
            />
          ) : (
            <div className="text-center py-12 text-white/60">
              <p>No stats available for this address</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
