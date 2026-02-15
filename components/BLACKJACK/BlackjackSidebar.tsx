'use client'

import React, { useState, useEffect, useRef } from 'react'
import { History, BookOpen, Award, TrendingUp, Zap, Gamepad2 } from 'lucide-react'
import QuickHistory from '@/components/BLACKJACK/QuickHistory'
import BlackjackRealTimeBetChart from '@/components/BLACKJACK/RealTimeBetChart'
import GlobalWinsFeed from '@/components/BLACKJACK/GlobalWinsFeed'
import type { BlackjackRealTimeBetChartRef } from '@/components/BLACKJACK/RealTimeBetChart'
import { GameResult } from '@/app/BLACKJACK/types'
import { TournamentListSidebar } from '@/components/BLACKJACK/TournamentListSidebar'
import type { TournamentListItem } from '@/lib/tournament-types'
import { Theme } from '@/lib/theme'
// GameVerificationTools removed - use /BLACKJACK/verify page instead
type GameVerificationData = any // Type kept for compatibility

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

const BASE_TABS = [
  { id: 'recent', label: 'Recent', icon: History },
  { id: 'wins', label: 'Global', icon: Zap },
  { id: 'chart', label: 'Chart', icon: TrendingUp },
  { id: 'howto', label: 'How to Play', icon: BookOpen },
  { id: 'tournaments', label: 'Tournaments', icon: Award },
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
  /** Tournament list for sidebar "Tournaments" tab (expandable table + pagination) */
  tournaments?: TournamentListItem[]
  /** Refetch tournament list (e.g. when user opens Tournaments tab) */
  onRefreshTournaments?: () => void | Promise<void | TournamentListItem[]>
  /** Whether tournament list is loading */
  tournamentsLoading?: boolean
  /** Open create tournament flow from sidebar */
  onCreateTournament?: () => void
  /** Join tournament from sidebar expanded view (tournamentId, isPrivate) */
  onJoinTournament?: (tournamentId: string, isPrivate: boolean) => void
  /** Player balance for Join button state */
  playerBalance?: bigint
  /** Player address for Join button state */
  playerAddress?: string | null
  /** Open tournament lobby to "My History" tab */
  onOpenTournamentHistory?: () => void
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
  tournaments = [],
  onRefreshTournaments,
  tournamentsLoading = false,
  onCreateTournament,
  onJoinTournament,
  playerBalance,
  playerAddress,
  onOpenTournamentHistory,
}: BlackjackSidebarProps) {
  const isDesktop = useIsDesktop()
  const [activeTab, setActiveTab] = useState<BlackjackSidebarTabId>(() => 'chart')

  const tabs = inTournament
    ? [...BASE_TABS, TOURNAMENT_PLAY_TAB]
    : BASE_TABS

  // When entering a tournament, switch to tournament tab; when leaving, switch to chart tab
  useEffect(() => {
    if (inTournament) {
      setActiveTab('tournament-play')
    } else {
      setActiveTab((prev) => (prev === 'tournament-play' ? 'chart' : prev))
    }
  }, [inTournament])

  // Refresh tournament list when user opens Tournaments tab (only when tab becomes active)
  const onRefreshTournamentsRef = useRef(onRefreshTournaments)
  onRefreshTournamentsRef.current = onRefreshTournaments
  useEffect(() => {
    if (activeTab === 'tournaments') {
      onRefreshTournamentsRef.current?.()
    }
  }, [activeTab])

  const handleQuickHistoryVerify = (gameId: string) => {
    onVerifyGameRequest?.(gameId)
    if (typeof window !== 'undefined') window.open('/BLACKJACK/verify', '_blank')
  }

  const activeLabel = tabs.find((t) => t.id === activeTab)?.label ?? 'Chart'

  return (
    <div className="w-full min-w-0 flex flex-col h-full min-h-0">
      {/* Compact icon bar — icons only with active label */}
      <div className="flex items-center gap-1 px-2 py-2 shrink-0 relative z-10 bg-black/20 border-b border-white/10 rounded-t-xl">
        <div className="flex gap-0.5 flex-wrap">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`p-2 rounded-lg transition-colors ${
                activeTab === id ? 'bg-cyan-500/30 text-cyan-400' : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
              title={label}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <span className="ml-2 text-sm font-medium text-cyan-300 truncate min-w-0">{activeLabel}</span>
      </div>

      {/* Content — padding only for howto/tournaments/chart/tournament-play; Recent/Top have their own */}
      <div
        className={`${PANEL_CLASS} flex-1 min-h-0 overflow-auto no-scrollbar relative flex flex-col ${
          activeTab === 'howto' || activeTab === 'tournaments' || activeTab === 'chart' || activeTab === 'wins' || activeTab === 'tournament-play' ? 'p-4' : ''
        }`}
        style={Theme.panel.sidebar}
      >
        {activeTab === 'recent' && (
          <QuickHistory
            history={history}
            reserveBalance={reserveBalance}
            onVerifyGame={handleQuickHistoryVerify}
          />
        )}
        {activeTab === 'wins' && (
          <GlobalWinsFeed wsClient={wsClient} wsConnected={wsConnected ?? false} className="min-h-0" />
        )}
        {/* Chart is always mounted when chartRef is set so addGameResult() works from page (ref stays attached).
            Hidden when tab is not active so data accumulates across tab switches. */}
        {chartRef != null && (
          <div
            className={`min-w-0 w-full ${activeTab === 'chart' ? 'flex-1 flex flex-col min-h-[260px]' : 'hidden'}`}
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
          <div className="flex flex-col flex-1 min-h-0 text-sm text-white/90">
            {onOpenTournamentHistory && (
              <button
                type="button"
                onClick={onOpenTournamentHistory}
                className="mb-2 w-full py-2 px-3 rounded-lg text-xs font-medium bg-slate-700/60 hover:bg-slate-600/60 text-cyan-300 border border-cyan-500/20 transition-colors flex items-center justify-center gap-2"
              >
                <History className="w-3.5 h-3.5" />
                View all tournament history
              </button>
            )}
            <TournamentListSidebar
              tournaments={tournaments}
              isLoading={tournamentsLoading}
              onRefresh={onRefreshTournaments ?? (() => {})}
              onTournamentLobby={onTournamentLobby ?? (() => {})}
              onCreateTournament={onCreateTournament}
              onJoin={onJoinTournament}
              playerBalance={playerBalance}
              playerAddress={playerAddress}
            />
          </div>
        )}
        {activeTab === 'tournament-play' && inTournament && tournamentTabContent != null && (
          <div className="flex flex-col gap-4 h-full min-h-0">
            {tournamentTabContent}
          </div>
        )}
      </div>
    </div>
  )
}
