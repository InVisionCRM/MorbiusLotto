'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { History, Trophy, BookOpen, Award, TrendingUp, Zap, ShieldCheck, Gamepad2 } from 'lucide-react'
import QuickHistory from '@/components/BLACKJACK/QuickHistory'
import BlackjackTopPlayers from '@/components/BLACKJACK/BlackjackTopPlayers'
import BlackjackRealTimeBetChart from '@/components/BLACKJACK/RealTimeBetChart'
import GlobalWinsFeed from '@/components/BLACKJACK/GlobalWinsFeed'
import type { BlackjackRealTimeBetChartRef } from '@/components/BLACKJACK/RealTimeBetChart'
import { GameResult } from '@/app/BLACKJACK/types'
import { GameVerificationTools, type GameVerificationData } from '@/components/BLACKJACK/GameVerificationTools'

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mql = typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)') : null
    if (!mql) return
    setIsDesktop(mql.matches)
    const handler = () => setIsDesktop(mql.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return isDesktop
}

const PANEL_CLASS = 'rounded-xl'
const PANEL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.8), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 1px 2px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

const BASE_TABS = [
  { id: 'recent', label: 'Recent Games', icon: History },
  { id: 'top', label: 'Top Players', icon: Trophy },
  { id: 'wins', label: 'Global Wins', icon: Zap },
  { id: 'chart', label: 'P&L Chart', icon: TrendingUp },
  { id: 'howto', label: 'How to Play', icon: BookOpen },
  { id: 'tournaments', label: 'Tournaments', icon: Award },
  { id: 'verify', label: 'Provably Fair', icon: ShieldCheck },
] as const

const TOURNAMENT_PLAY_TAB = { id: 'tournament-play' as const, label: 'Tournament', icon: Gamepad2 }

export type BlackjackSidebarTabId = (typeof BASE_TABS)[number]['id'] | 'tournament-play'

interface BlackjackSidebarProps {
  history: GameResult[]
  reserveBalance?: bigint
  onQuickJoinTournament?: () => void
  onTournamentLobby?: () => void
  chartRef?: React.RefObject<BlackjackRealTimeBetChartRef | null>
  chartSessionStartTime?: number
  wsClient?: unknown
  wsConnected?: boolean
  clientSeed?: string
  onClientSeedChange?: (value: string) => void
  onGenerateClientSeed?: () => void
  onVerifyGameRequest?: (gameId: string) => void
  verifyGameHandler?: (gameId: string) => Promise<GameVerificationData | null>
  /** When true, a "Tournament" tab is shown with HUD + betting controls; only visible during a tournament */
  inTournament?: boolean
  /** Content for the tournament tab (TournamentHUD + TournamentBetPanel) */
  tournamentTabContent?: React.ReactNode
}

export default function BlackjackSidebar({
  history,
  reserveBalance,
  onQuickJoinTournament,
  onTournamentLobby,
  chartRef,
  chartSessionStartTime,
  wsClient,
  wsConnected,
  clientSeed = '',
  onClientSeedChange,
  onGenerateClientSeed,
  onVerifyGameRequest,
  verifyGameHandler,
  inTournament = false,
  tournamentTabContent,
}: BlackjackSidebarProps) {
  const isDesktop = useIsDesktop()
  const [activeTab, setActiveTab] = useState<BlackjackSidebarTabId>(() => 'recent')
  const [sidebarVerifyGameId, setSidebarVerifyGameId] = useState<string | null>(null)
  const onSidebarVerifyGameIdConsumed = useCallback(() => setSidebarVerifyGameId(null), [])

  const tabs = inTournament
    ? [...BASE_TABS, TOURNAMENT_PLAY_TAB]
    : BASE_TABS

  useEffect(() => {
    if (inTournament) {
      setActiveTab('tournament-play')
    } else if (activeTab === 'tournament-play') {
      setActiveTab('recent')
    }
  }, [inTournament, isDesktop, activeTab])

  const handleQuickHistoryVerify = (gameId: string) => {
    setSidebarVerifyGameId(gameId)
    setActiveTab('verify')
    onVerifyGameRequest?.(gameId)
  }

  return (
    <div className="w-full min-w-0 flex flex-col h-full">
      {/* Tabs */}
      <div className="flex overflow-x-auto no-scrollbar bg-slate-800/60 rounded-t-xs">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex-shrink-0 px-3 py-2.5 text-sm font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === id
                ? 'text-cyan-400 border-cyan-500 bg-cyan-500/10'
                : 'text-white/70 border-transparent hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* Content — padding only for howto/tournaments/chart/tournament-play; Recent/Top have their own */}
      <div
        className={`${PANEL_CLASS} flex-1 min-h-0 overflow-auto no-scrollbar ${
          activeTab === 'howto' || activeTab === 'tournaments' || activeTab === 'chart' || activeTab === 'wins' || activeTab === 'verify' || activeTab === 'tournament-play' ? 'p-4' : ''
        }`}
        style={PANEL_STYLE}
      >
        {activeTab === 'recent' && (
          <QuickHistory
            history={history}
            reserveBalance={reserveBalance}
            onVerifyGame={handleQuickHistoryVerify}
          />
        )}
        {activeTab === 'top' && <BlackjackTopPlayers />}
        {activeTab === 'wins' && (
          <GlobalWinsFeed wsClient={wsClient} wsConnected={wsConnected ?? false} className="min-h-0" />
        )}
        {/* Chart is always mounted when chartRef is set so addGameResult() works from page (ref stays attached).
            Hidden when tab is not active so data accumulates across tab switches. */}
        {chartRef != null && (
          <div
            className={`min-w-0 ${activeTab === 'chart' ? 'h-[320px] min-h-[280px] w-full' : 'hidden'}`}
            aria-hidden={activeTab !== 'chart'}
          >
            <BlackjackRealTimeBetChart
              ref={chartRef}
              sessionStartTime={chartSessionStartTime ?? Date.now()}
            />
          </div>
        )}
        {activeTab === 'howto' && (
          <div className="text-sm text-white/90 space-y-4">
            <h3 className="text-base font-semibold text-cyan-300/95">Deposit & Withdraw</h3>
            <ul className="space-y-1 list-disc list-inside text-white/80">
              <li><strong>Deposit:</strong> Game menu → Deposit to send MORBIUS to your reserve. Or click your reserve balance.</li>
              <li><strong>Withdraw:</strong> Withdraw anytime from the menu or by clicking your reserve.</li>
              <li>Bets use your reserve; winnings are added back.</li>
            </ul>
            <h3 className="text-base font-semibold text-cyan-300/95">Game Rules</h3>
            <ul className="space-y-1 list-disc list-inside text-white/80">
              <li>Get close to 21 without going over. Beat the dealer.</li>
              <li><strong>Hit</strong> — another card. <strong>Stand</strong> — keep your hand.</li>
              <li><strong>Double Down</strong> — double bet, one more card.</li>
              <li><strong>Split</strong> — on a pair, split into two hands (double bet).</li>
              <li>Blackjack (Ace + 10) pays 3:2. Dealer stands on 17.</li>
            </ul>
          </div>
        )}
        {activeTab === 'tournaments' && (
          <div className="text-sm text-white/90 space-y-4">
            <p className="text-white/80">
              Join or create Blackjack tournaments. Quick Join uses a fixed buy-in; the Lobby lets you browse or create custom events.
            </p>
            <div className="flex flex-col gap-2">
              {onQuickJoinTournament && (
                <button
                  type="button"
                  onClick={onQuickJoinTournament}
                  className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-sm transition-colors border border-cyan-500/30"
                >
                  Quick Join Tournament
                </button>
              )}
              {onTournamentLobby && (
                <button
                  type="button"
                  onClick={onTournamentLobby}
                  className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white font-semibold text-sm transition-colors border border-cyan-500/30"
                >
                  Tournament Lobby
                </button>
              )}
            </div>
          </div>
        )}
        {activeTab === 'tournament-play' && inTournament && tournamentTabContent != null && (
          <div className="flex flex-col gap-4 h-full min-h-0">
            {tournamentTabContent}
          </div>
        )}
        {activeTab === 'verify' && (
          <div className="text-sm text-white/90 space-y-4">
            <p className="text-[10px] text-cyan-300/40 text-center">
              Optional. Leave blank to auto-generate a seed on Deal Cards.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={clientSeed}
                onChange={(e) => onClientSeedChange?.(e.target.value)}
                className="flex-1 px-3 py-2 text-center font-mono text-cyan-300 text-sm rounded border border-white/20 bg-white/5 focus:outline-none focus:border-cyan-500/50"
                placeholder="Client seed (optional)"
              />
              <button
                type="button"
                onClick={onGenerateClientSeed}
                className="w-10 h-10 flex-shrink-0 rounded-lg font-black text-base transition-all active:scale-95 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/10"
                title="Generate random client seed"
              >
                ↻
              </button>
            </div>
            {verifyGameHandler && (
              <div className="pt-2">
                <GameVerificationTools
                  onVerify={verifyGameHandler}
                  initialGameId={sidebarVerifyGameId ?? undefined}
                  onInitialGameIdConsumed={onSidebarVerifyGameIdConsumed}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
