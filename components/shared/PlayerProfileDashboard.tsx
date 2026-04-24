'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePlayerProfileStats } from '@/hooks/use-player-profile'
import { usePlayerServerBalance } from '@/hooks/use-player-server-balance'
import { PlayerStatsDashboard } from '@/components/BLACKJACK/PlayerStatsDashboard'
import { useLotteryPlayerStats, useInstantLotteryResults } from '@/hooks/use-instant-lottery'
import { LotteryPlayerDashboard } from '@/components/lottery/LotteryPlayerDashboard'
import { KenoPlayerDashboard } from '@/components/CryptoKeno/KenoPlayerDashboard'
import { PlinkoPlayerDashboard } from '@/components/PLINKO/PlinkoPlayerDashboard'
import { AllStatsDashboard } from '@/components/shared/AllStatsDashboard'
import { PokerPlayerDashboard } from '@/components/poker/PokerPlayerDashboard'
import { RoulettePerformanceChart } from '@/components/Roulette/RoulettePerformanceChart'
import { useRoulettePlayerStats } from '@/hooks/use-roulette-results'
import { ProvablyFairClientSeedModal } from '@/components/shared/ProvablyFairClientSeedModal'
import { generateHexClientSeed } from '@/lib/generate-client-seed'
import {
  loadStoredClientSeed,
  saveStoredClientSeed,
  type ProvablyFairStoredGame,
} from '@/lib/provably-fair-client-seed-storage'

export type PlayerProfileGame = 'all' | 'blackjack' | 'poker' | 'lottery' | 'keno' | 'plinko' | 'roulette'

const GAME_LABELS: Record<PlayerProfileGame, string> = {
  all: 'All stats',
  blackjack: 'Blackjack',
  poker: 'Poker',
  lottery: 'Lottery',
  keno: 'Keno',
  plinko: 'Plinko',
  roulette: 'Roulette',
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
  const [pfModalOpen, setPfModalOpen] = useState(false)
  const [pfModalGame, setPfModalGame] = useState<ProvablyFairStoredGame | null>(null)
  const [pfSeedValue, setPfSeedValue] = useState('')

  const openProvablyFairModal = useCallback((game: ProvablyFairStoredGame) => {
    setPfModalGame(game)
    setPfSeedValue(loadStoredClientSeed(game) ?? generateHexClientSeed())
    setPfModalOpen(true)
  }, [])

  const closeProvablyFairModal = useCallback((open: boolean) => {
    if (!open && pfModalGame) {
      saveStoredClientSeed(pfModalGame, pfSeedValue)
    }
    setPfModalOpen(open)
    if (!open) setPfModalGame(null)
  }, [pfModalGame, pfSeedValue])

  const onPfSeedChange = useCallback(
    (next: string) => {
      setPfSeedValue(next)
      if (pfModalGame) saveStoredClientSeed(pfModalGame, next)
    },
    [pfModalGame],
  )

  useEffect(() => {
    if (modalOpen === undefined) {
      setSelectedGame(initialGame)
    } else if (modalOpen) {
      setSelectedGame(initialGame)
    }
  }, [initialGame, modalOpen])

  useEffect(() => {
    setPfModalOpen(false)
    setPfModalGame(null)
  }, [selectedGame])

  const { data: stats, isLoading: statsLoading } = usePlayerProfileStats(selectedGame === 'blackjack' ? address : null)
  const { data: reserveBalance } = usePlayerServerBalance(selectedGame === 'blackjack' ? address : null)
  const { data: allStatsServerBalance, isFetched: allStatsBalanceFetched } = usePlayerServerBalance(
    selectedGame === 'all' ? address : null
  )
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

  const rouletteAddress = address ? ((address.startsWith('0x') ? address : `0x${address}`) as `0x${string}`) : undefined
  const rouletteStats = useRoulettePlayerStats(selectedGame === 'roulette' ? rouletteAddress : undefined)

  const isAll = selectedGame === 'all'
  const isLottery = selectedGame === 'lottery'
  const isKeno = selectedGame === 'keno'
  const isPlinko = selectedGame === 'plinko'
  const isPoker = selectedGame === 'poker'
  const isRoulette = selectedGame === 'roulette'
  const isLoading = isLottery ? lotteryStats.isLoading : statsLoading

  const verifyHref =
    selectedGame === 'blackjack'
      ? '/BLACKJACK/verify'
      : selectedGame === 'lottery'
        ? '/lottery/verify'
        : null
  const pfGame: ProvablyFairStoredGame | null =
    selectedGame === 'blackjack' ? 'blackjack' : selectedGame === 'lottery' ? 'lottery' : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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
        {verifyHref && pfGame && (
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <Link
              href={verifyHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-cyan-400/90 underline underline-offset-2 hover:text-cyan-300"
            >
              Verify
            </Link>
            <button
              type="button"
              onClick={() => openProvablyFairModal(pfGame)}
              className="text-xs text-cyan-400/90 underline underline-offset-2 hover:text-cyan-300"
            >
              Provably fair
            </button>
          </div>
        )}
      </div>

      <ProvablyFairClientSeedModal
        open={pfModalOpen && pfModalGame !== null}
        onOpenChange={closeProvablyFairModal}
        value={pfSeedValue}
        onChange={onPfSeedChange}
      />

      {isRoulette ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Spins', value: rouletteStats.totalSpins.toLocaleString(), className: 'text-cyan-300' },
              { label: 'Win Rate', value: `${Math.round(rouletteStats.winRate)}%`, className: rouletteStats.winRate >= 50 ? 'text-green-400' : rouletteStats.winRate >= 30 ? 'text-yellow-400' : 'text-red-400' },
              { label: 'Total Wagered', value: `${Math.round(Number(rouletteStats.totalWagered) / 1e18).toLocaleString()} M`, className: 'text-neutral-100' },
              { label: 'Profit / Loss', value: `${rouletteStats.profitLoss >= 0n ? '+' : ''}${Math.round(Number(rouletteStats.profitLoss) / 1e18).toLocaleString()} M`, className: rouletteStats.profitLoss > 0n ? 'text-green-400' : rouletteStats.profitLoss < 0n ? 'text-red-400' : 'text-yellow-400' },
              { label: 'Biggest Win', value: `+${Math.round(Number(rouletteStats.biggestWin) / 1e18).toLocaleString()} M`, className: 'text-green-400' },
              { label: 'Biggest Loss', value: `-${Math.round(Number(rouletteStats.biggestLoss) / 1e18).toLocaleString()} M`, className: 'text-red-400' },
              { label: 'Best Streak', value: rouletteStats.bestStreak.toString(), className: 'text-yellow-400' },
              { label: 'Avg Wager', value: `${Math.round(Number(rouletteStats.avgWager) / 1e18).toLocaleString()} M`, className: 'text-neutral-100' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-black/40 border border-white/10 px-4 py-3 flex flex-col gap-1">
                <span className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</span>
                <span className={`text-lg font-black tabular-nums ${s.className}`}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Color & lucky number breakdown */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-black/40 border border-white/10 px-4 py-3 space-y-2">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Color Breakdown</span>
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between"><span className="text-red-400 font-semibold">Red</span><span className="font-bold text-neutral-100">{rouletteStats.redHits}</span></div>
                <div className="flex justify-between"><span className="text-gray-300 font-semibold">Black</span><span className="font-bold text-neutral-100">{rouletteStats.blackHits}</span></div>
                <div className="flex justify-between"><span className="text-green-400 font-semibold">Green (0)</span><span className="font-bold text-neutral-100">{rouletteStats.greenHits}</span></div>
              </div>
            </div>
            <div className="rounded-xl bg-black/40 border border-white/10 px-4 py-3 flex flex-col gap-1">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Lucky Number</span>
              {rouletteStats.luckyNumber !== null ? (
                <>
                  <span className="text-3xl font-black text-cyan-300 tabular-nums">{rouletteStats.luckyNumber}</span>
                  <span className="text-xs text-gray-500">landed {rouletteStats.luckyNumberCount}×</span>
                </>
              ) : (
                <span className="text-gray-600 text-sm">No data</span>
              )}
            </div>
          </div>

          <RoulettePerformanceChart results={rouletteStats.results} />
        </div>
      ) : isAll ? (
        <AllStatsDashboard
          playerAddress={address}
          serverBalanceAnchor={
            allStatsBalanceFetched && typeof allStatsServerBalance === 'bigint' ? allStatsServerBalance : undefined
          }
        />
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
