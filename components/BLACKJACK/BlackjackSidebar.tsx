'use client'

import React, { useState, useEffect } from 'react'
import {
  History,
  BookOpen,
  Trophy,
  TrendingUp,
  Gamepad2,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Music,
  Play,
  Pause,
  SkipForward,
} from 'lucide-react'
import { IconChevronDown } from '@tabler/icons-react'
import QuickHistory from '@/components/BLACKJACK/QuickHistory'
import { BlackjackRecentPlays } from '@/components/BLACKJACK/BlackjackRecentPlays'
import { BlackjackRecentGames } from '@/components/BLACKJACK/BlackjackRecentGames'
import BlackjackTopPlayers from '@/components/BLACKJACK/BlackjackTopPlayers'
import BlackjackRealTimeBetChart from '@/components/BLACKJACK/RealTimeBetChart'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { BlackjackRealTimeBetChartRef } from '@/components/BLACKJACK/RealTimeBetChart'
import { GameResult } from '@/app/BLACKJACK/types'
import { Theme } from '@/lib/theme'
import BlackjackHowToVideoModal from '@/components/BLACKJACK/BlackjackHowToVideoModal'
import { PlayCircle } from 'lucide-react'
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
  { id: 'chart', label: 'Chart', shortLabel: 'Chart', icon: TrendingUp },
  { id: 'sounds', label: 'Sounds', shortLabel: 'Sounds', icon: Volume2 },
  { id: 'howto', label: 'How to Play', shortLabel: 'How', icon: BookOpen },
  { id: 'stats', label: 'Stats', shortLabel: 'Stats', icon: Trophy },
] as const

const TOURNAMENT_PLAY_TAB = { id: 'tournament-play' as const, label: 'Tournament', shortLabel: 'Play', icon: Gamepad2 }

export type BlackjackSidebarTabId = (typeof BASE_TABS)[number]['id'] | 'tournament-play'

interface BlackjackSidebarProps {
  history: GameResult[]
  reserveBalance?: bigint
  chartRef?: React.RefObject<BlackjackRealTimeBetChartRef | null>
  chartSessionStartTime?: number
  onVerifyGameRequest?: (gameId: string) => void
  /** When true, a "Tournament" tab is shown with HUD + betting controls; only visible during a tournament */
  inTournament?: boolean
  /** Content for the tournament tab (TournamentHUD + TournamentBetPanel) */
  tournamentTabContent?: React.ReactNode
  /** Sounds tab — audio controls (single-player sidebar) */
  soundEnabled: boolean
  onSoundEnabledChange: (enabled: boolean) => void
  dealerVoiceEnabled: boolean
  onDealerVoiceChange: (enabled: boolean) => void
  sfxEnabled: boolean
  onSfxEnabledChange: (enabled: boolean) => void
  isMusicPlaying: boolean
  onToggleMusic: () => void
  onNextTrack: () => void
  musicVolume: number
  onMusicVolumeChange: (volume: number) => void
  musicTrackDisplayName: string
}

export default function BlackjackSidebar({
  history,
  reserveBalance,
  chartRef,
  chartSessionStartTime,
  onVerifyGameRequest,
  inTournament = false,
  tournamentTabContent,
  soundEnabled,
  onSoundEnabledChange,
  dealerVoiceEnabled,
  onDealerVoiceChange,
  sfxEnabled,
  onSfxEnabledChange,
  isMusicPlaying,
  onToggleMusic,
  onNextTrack,
  musicVolume,
  onMusicVolumeChange,
  musicTrackDisplayName,
}: BlackjackSidebarProps) {
  const isDesktop = useIsDesktop()
  const [activeTab, setActiveTab] = useState<BlackjackSidebarTabId>(() => 'chart')
  const [howToVideoOpen, setHowToVideoOpen] = useState(false)

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
        className={`grid gap-2 p-3 shrink-0 items-start bg-black/20 ${
          tabs.length >= 6 ? 'grid-cols-6' : tabs.length >= 5 ? 'grid-cols-5' : 'grid-cols-4'
        }`}
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
          activeTab === 'howto' ||
          activeTab === 'chart' ||
          activeTab === 'sounds' ||
          activeTab === 'tournament-play'
            ? 'p-4'
            : ''
        }`}
      >
        {activeTab === 'recent' && (
          <div className="min-w-0 space-y-4 p-3 pb-4">
            <QuickHistory
              history={history}
              reserveBalance={inTournament ? undefined : reserveBalance}
              onVerifyGame={handleQuickHistoryVerify}
            />
          </div>
        )}
        {activeTab === 'stats' && (
          <div className="min-w-0 p-3 pb-4">
            <div className="min-w-0 rounded-xl border border-cyan-500/25 bg-black/25">
              <Tabs defaultValue="recent-games" className="p-2 sm:p-3">
                <TabsList className="grid h-10 w-full min-w-0 grid-cols-3 gap-0.5 rounded-lg border border-cyan-500/30 bg-black/40 p-0.5">
                  <TabsTrigger
                    value="recent-games"
                    className="font-jost min-w-0 truncate rounded-md px-0.5 py-1.5 text-center text-[10px] font-bold leading-tight text-white/80 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 data-[state=active]:text-white sm:text-[11px]"
                  >
                    Recent Games
                  </TabsTrigger>
                  <TabsTrigger
                    value="recent-play"
                    className="font-jost min-w-0 truncate rounded-md px-0.5 py-1.5 text-center text-[10px] font-bold leading-tight text-white/80 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 data-[state=active]:text-white sm:text-[11px]"
                  >
                    Recent Play
                  </TabsTrigger>
                  <TabsTrigger
                    value="leaderboard"
                    className="font-jost min-w-0 truncate rounded-md px-0.5 py-1.5 text-center text-[10px] font-bold leading-tight text-white/80 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 data-[state=active]:text-white sm:text-[11px]"
                  >
                    Leaderboard
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="recent-games" className="mt-3 min-h-[160px] focus-visible:outline-none">
                  <BlackjackRecentGames compact title="Recent Games" />
                </TabsContent>
                <TabsContent value="recent-play" className="mt-3 min-h-[160px] focus-visible:outline-none">
                  <BlackjackRecentPlays compact title="Recent Play" />
                </TabsContent>
                <TabsContent value="leaderboard" className="mt-3 min-h-[160px] focus-visible:outline-none">
                  <BlackjackTopPlayers />
                </TabsContent>
              </Tabs>
            </div>
          </div>
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
        {activeTab === 'sounds' && (
          <div className="space-y-3 text-sm">
            <h3 className="text-base font-semibold text-cyan-300/95">Sounds</h3>
            <p className="text-xs text-white/55 leading-relaxed">
              Master turns all audio off. You can keep background music while muting effects or dealer lines.
            </p>
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-[11px] text-white/70 font-medium uppercase tracking-wide">Master</span>
              <button
                type="button"
                onClick={() => onSoundEnabledChange(!soundEnabled)}
                className={`w-8 h-4.5 rounded-full relative transition-colors ${soundEnabled ? 'bg-cyan-600' : 'bg-white/15'}`}
                aria-pressed={soundEnabled}
              >
                <span
                  className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${soundEnabled ? 'left-[calc(100%-18px)]' : 'left-0.5'}`}
                />
              </button>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px] text-white/60 flex items-center gap-1.5">
                {dealerVoiceEnabled ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3 text-red-400" />}
                Dealer voice
              </span>
              <button
                type="button"
                onClick={() => onDealerVoiceChange(!dealerVoiceEnabled)}
                disabled={!soundEnabled}
                className={`w-8 h-4.5 rounded-full relative transition-colors ${dealerVoiceEnabled && soundEnabled ? 'bg-cyan-600' : 'bg-white/15'} disabled:opacity-40`}
                aria-pressed={dealerVoiceEnabled}
              >
                <span
                  className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${dealerVoiceEnabled && soundEnabled ? 'left-[calc(100%-18px)]' : 'left-0.5'}`}
                />
              </button>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px] text-white/60 flex items-center gap-1.5">
                <Volume2 className="w-3 h-3" />
                Sound effects
              </span>
              <button
                type="button"
                onClick={() => onSfxEnabledChange(!sfxEnabled)}
                disabled={!soundEnabled}
                className={`w-8 h-4.5 rounded-full relative transition-colors ${sfxEnabled && soundEnabled ? 'bg-cyan-600' : 'bg-white/15'} disabled:opacity-40`}
                aria-pressed={sfxEnabled}
              >
                <span
                  className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${sfxEnabled && soundEnabled ? 'left-[calc(100%-18px)]' : 'left-0.5'}`}
                />
              </button>
            </label>
            <div className="border-t border-white/10 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/70 font-medium uppercase tracking-wide flex items-center gap-1.5">
                  <Music className="w-3 h-3" />
                  Music
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onToggleMusic}
                    className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    title={isMusicPlaying ? 'Pause' : 'Play'}
                  >
                    {isMusicPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={onNextTrack}
                    className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    title="Next track"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-white/40 truncate" title={musicTrackDisplayName}>
                {musicTrackDisplayName}
              </div>
              <div className="flex items-center gap-2">
                <VolumeX className="w-3 h-3 text-white/30 shrink-0" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={musicVolume}
                  onChange={(e) => onMusicVolumeChange(Number(e.target.value))}
                  className="w-full h-1 rounded-full appearance-none bg-white/15 accent-cyan-500 cursor-pointer"
                  style={{ accentColor: '#06b6d4' }}
                />
                <Volume2 className="w-3 h-3 text-white/30 shrink-0" />
              </div>
            </div>
          </div>
        )}
        {activeTab === 'howto' && (
          <div className="text-sm text-white/90 space-y-4">
            <button
              type="button"
              onClick={() => setHowToVideoOpen(true)}
              className="inline-flex items-center gap-2 text-cyan-300 underline underline-offset-2 hover:text-cyan-200 font-medium transition-colors"
            >
              <PlayCircle className="w-4 h-4" />
              Watch: How to play Blackjack
            </button>
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
                  { }
                  <img src="/morbius/MorbiusLogo (3).png" alt="" width={16} height={16} className="object-contain" />
                  <IconChevronDown size={7} className="text-white/60" />
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
      <BlackjackHowToVideoModal open={howToVideoOpen} onOpenChange={setHowToVideoOpen} />
    </div>
  )
}
