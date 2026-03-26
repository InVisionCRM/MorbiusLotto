'use client'

import React, { useState, useEffect } from 'react'
import { History, BookOpen, TrendingUp, Zap, Gamepad2 } from 'lucide-react'
import QuickHistory from '@/components/BLACKJACK/QuickHistory'
import BlackjackRealTimeBetChart from '@/components/BLACKJACK/RealTimeBetChart'
import GlobalWinsFeed from '@/components/BLACKJACK/GlobalWinsFeed'
import type { BlackjackRealTimeBetChartRef } from '@/components/BLACKJACK/RealTimeBetChart'
import { GameResult } from '@/app/BLACKJACK/types'
import { Theme } from '@/lib/theme'
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

const PANEL_CLASS = ''

const BASE_TABS = [
  { id: 'recent', label: 'Recent', shortLabel: 'Recent', icon: History },
  { id: 'wins', label: 'Global', shortLabel: 'Global', icon: Zap },
  { id: 'chart', label: 'Chart', shortLabel: 'Chart', icon: TrendingUp },
  { id: 'howto', label: 'How to Play', shortLabel: 'How', icon: BookOpen },
] as const

const TOURNAMENT_PLAY_TAB = { id: 'tournament-play' as const, label: 'Tournament', shortLabel: 'Play', icon: Gamepad2 }

export type BlackjackSidebarTabId = (typeof BASE_TABS)[number]['id'] | 'tournament-play'

interface BlackjackSidebarProps {
  history: GameResult[]
  reserveBalance?: bigint
  chartRef?: React.RefObject<BlackjackRealTimeBetChartRef | null>
  chartSessionStartTime?: number
  wsClient?: unknown
  wsConnected?: boolean
  onVerifyGameRequest?: (gameId: string) => void
  /** When true, a "Tournament" tab is shown with HUD + betting controls; only visible during a tournament */
  inTournament?: boolean
  /** Content for the tournament tab (TournamentHUD + TournamentBetPanel) */
  tournamentTabContent?: React.ReactNode
}

export default function BlackjackSidebar({
  history,
  reserveBalance,
  chartRef,
  chartSessionStartTime,
  wsClient,
  wsConnected,
  onVerifyGameRequest,
  inTournament = false,
  tournamentTabContent,
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

  const handleQuickHistoryVerify = (gameId: string) => {
    onVerifyGameRequest?.(gameId)
    if (typeof window !== 'undefined') window.open('/BLACKJACK/verify', '_blank')
  }

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden rounded-xl"
      style={{ ...Theme.panel.sidebar, containerType: 'inline-size', containerName: 'sidebar' }}
    >
      <style>{`
        @container sidebar (max-width: 200px) {
          .sidebar-tab-label { display: none; }
        }
      `}</style>
      {/* Tab buttons — fixed at top */}
      <div
        className={`grid gap-2 p-3 shrink-0 items-start bg-black/20 ${tabs.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}
      >
        {tabs.map((tab) => {
          const { id, label, icon: Icon } = tab
          const shortLabel = 'shortLabel' in tab ? (tab as { shortLabel?: string }).shortLabel : label
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all min-w-0 ${
                activeTab === id
                  ? 'bg-cyan-600/40 border-2 border-cyan-500/50 text-cyan-200'
                  : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              title={label}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="sidebar-tab-label text-xs font-medium truncate w-full text-center">{shortLabel}</span>
            </button>
          )
        })}
      </div>

      {/* Scrollable content — min-h-0 required so this flex child can shrink and show scrollbar */}
      <div
        className={`${PANEL_CLASS} flex-1 min-h-0 overflow-auto no-scrollbar border-t border-white/10 ${
          activeTab === 'howto' || activeTab === 'chart' || activeTab === 'wins' || activeTab === 'tournament-play' ? 'p-4' : ''
        }`}
      >
        {activeTab === 'recent' && (
          <QuickHistory
            history={history}
            reserveBalance={inTournament ? undefined : reserveBalance}
            onVerifyGame={handleQuickHistoryVerify}
          />
        )}
        {activeTab === 'wins' && (
          <GlobalWinsFeed wsClient={wsClient} wsConnected={wsConnected ?? false} />
        )}
        {/* Chart is always mounted when chartRef is set so addGameResult() works from page (ref stays attached).
            Hidden when tab is not active so data accumulates across tab switches. */}
        {chartRef != null && (
          <div
            className={`min-w-0 w-full ${activeTab === 'chart' ? 'h-[260px] shrink-0' : 'hidden'}`}
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
              <li><strong>Deposit:</strong> Click your reserve balance
                <span
                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 mx-1 align-middle text-xs font-bold text-white/80 whitespace-nowrap"
                  style={{
                    background: 'linear-gradient(145deg, rgb(0, 0, 0), rgb(1, 2, 3))',
                    border: '1px solid rgb(16, 137, 217)',
                    boxShadow: 'inset 1px 1px 2px rgb(0,0,0), 0 1px 4px rgba(0,0,0,0.3)',
                  }}
                >
                  0
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/morbius/MorbiusLogo (3).png" alt="" width={16} height={16} className="object-contain" />
                  <i className="fas fa-chevron-down text-white/60" style={{ fontSize: 7 }} />
                </span>
                in the top left of the game table to deposit or withdraw.
              </li>
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
        {activeTab === 'tournament-play' && inTournament && tournamentTabContent != null && (
          <div className="flex flex-col gap-4">
            {tournamentTabContent}
          </div>
        )}
      </div>
    </div>
  )
}
