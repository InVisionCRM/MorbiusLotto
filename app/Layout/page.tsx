'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { History, BookOpen, Award, TrendingUp, Zap, ChevronLeft } from 'lucide-react'
import { Theme } from '@/lib/theme'
import {
  GameHistoryLayoutA,
  GameHistoryLayoutB,
  GameHistoryLayoutC,
  GameHistoryLayoutD,
  GameHistoryLayoutE,
  MOCK_HISTORY_ENTRIES,
} from '@/components/BLACKJACK/GameHistoryLayouts'
import {
  TopPlayersLayouts,
  CarouselLayouts,
  OverlayLayouts,
  MOCK_TOP_PLAYER_ENTRIES,
  MOCK_CAROUSEL_ITEMS,
} from '@/components/BLACKJACK/BlackjackTopPlayersLayouts'
import { BlackjackMobileActionBar } from '@/components/BLACKJACK/BlackjackMobileActionBar'
import { BettingPanelMobile } from '@/components/BLACKJACK/BettingPanelMobile'
import { Action } from '@/app/BLACKJACK/types'

const TABS = [
  { id: 'recent', label: 'Recent', icon: History },
  { id: 'wins', label: 'Global', icon: Zap },
  { id: 'chart', label: 'Chart', icon: TrendingUp },
  { id: 'howto', label: 'How to Play', icon: BookOpen },
  { id: 'tournaments', label: 'Tournaments', icon: Award },
] as const

type TabId = (typeof TABS)[number]['id']

const MOCK_CONTENT = {
  recent: (
    <div className="space-y-2 text-sm text-white/80">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex justify-between py-1.5 border-b border-white/10">
          <span>Game #{1000 + i}</span>
          <span className="text-emerald-400">+50 MORB</span>
        </div>
      ))}
    </div>
  ),
  wins: (
    <div className="space-y-2 text-sm text-white/80">
      <div className="flex gap-2 items-center py-1.5">
        <span className="text-cyan-400">0x1234…5678</span>
        <span className="text-amber-300">Blackjack!</span>
      </div>
      <div className="flex gap-2 items-center py-1.5">
        <span className="text-cyan-400">0xabcd…ef90</span>
        <span className="text-emerald-400">+120 MORB</span>
      </div>
    </div>
  ),
  chart: (
    <div
      className="w-full h-48 rounded-lg flex items-center justify-center text-white/50 text-sm"
      style={{
        background: 'linear-gradient(145deg, rgba(16, 26, 35, 0.8), rgba(35, 36, 41, 0.6))',
        border: '1px solid rgba(60, 60, 60, 0.5)',
      }}
    >
      Chart placeholder
    </div>
  ),
  howto: (
    <div className="text-sm text-white/90 space-y-3">
      <h3 className="text-cyan-300 font-semibold">Deposit & Withdraw</h3>
      <p className="text-white/80">Game menu → Deposit to send MORBIUS to your reserve.</p>
      <h3 className="text-cyan-300 font-semibold">Game Rules</h3>
      <p className="text-white/80">Get close to 21 without going over. Beat the dealer.</p>
    </div>
  ),
  tournaments: (
    <div className="space-y-2 text-sm text-white/80">
      <div className="p-2 rounded-lg bg-white/5 border border-cyan-500/20">
        <div className="font-medium text-cyan-300">Weekly High Roller</div>
        <div className="text-xs text-white/60">Prize: 10,000 MORB</div>
      </div>
      <div className="p-2 rounded-lg bg-white/5 border border-cyan-500/20">
        <div className="font-medium text-cyan-300">Daily Free Roll</div>
        <div className="text-xs text-white/60">Prize: 1,000 MORB</div>
      </div>
    </div>
  ),
}

const PANEL_STYLE = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 -3px 6px rgba(0, 0, 0, 0.8), inset 0 3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

// Layout 1: Vertical icon rail (icons on left, content on right)
function LayoutA({ activeTab, setActiveTab }: { activeTab: TabId; setActiveTab: (id: TabId) => void }) {
  return (
    <div className="flex w-full h-72 rounded-xl overflow-hidden" style={PANEL_STYLE}>
      <div className="flex flex-col w-14 shrink-0 bg-black/20 border-r border-white/10">
        {TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center transition-colors ${
              activeTab === id ? 'bg-cyan-500/20 text-cyan-400 border-l-2 border-cyan-500' : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon className="w-5 h-5" />
          </button>
        ))}
      </div>
      <div className="flex-1 flex flex-col min-w-0 p-4 overflow-auto">
        <h3 className="text-cyan-300 font-semibold mb-3">{TABS.find((t) => t.id === activeTab)?.label}</h3>
        {MOCK_CONTENT[activeTab]}
      </div>
    </div>
  )
}

// Layout 2: Pill tabs (rounded segmented control)
function LayoutB({ activeTab, setActiveTab }: { activeTab: TabId; setActiveTab: (id: TabId) => void }) {
  return (
    <div className="flex flex-col w-full h-72 rounded-xl overflow-hidden" style={PANEL_STYLE}>
      <div className="flex gap-1 p-2 bg-black/20 rounded-t-xl">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all ${
              activeTab === id
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/30'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 p-4 overflow-auto">{MOCK_CONTENT[activeTab]}</div>
    </div>
  )
}

// Layout 3: Compact icon-only tabs with dropdown label
function LayoutC({ activeTab, setActiveTab }: { activeTab: TabId; setActiveTab: (id: TabId) => void }) {
  return (
    <div className="flex flex-col w-full h-72 rounded-xl overflow-hidden" style={PANEL_STYLE}>
      <div className="flex items-center gap-1 px-2 py-2 bg-black/20 border-b border-white/10">
        <div className="flex gap-0.5">
          {TABS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`p-2 rounded-lg transition-colors ${
                activeTab === id ? 'bg-cyan-500/30 text-cyan-400' : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
              title={TABS.find((t) => t.id === id)?.label}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <span className="ml-2 text-sm font-medium text-cyan-300 truncate">
          {TABS.find((t) => t.id === activeTab)?.label}
        </span>
      </div>
      <div className="flex-1 p-4 overflow-auto">{MOCK_CONTENT[activeTab]}</div>
    </div>
  )
}

// Layout 4: Accordion (vertical expandable sections)
function LayoutD({ activeTab, setActiveTab }: { activeTab: TabId; setActiveTab: (id: TabId) => void }) {
  return (
    <div className="flex flex-col w-full h-72 rounded-xl overflow-hidden" style={PANEL_STYLE}>
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <div key={id} className="rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                activeTab === id ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/80 hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="font-medium">{label}</span>
              <ChevronLeft
                className={`w-4 h-4 ml-auto transition-transform ${activeTab === id ? 'rotate-[-90deg]' : 'rotate-90'}`}
              />
            </button>
            {activeTab === id && (
              <div className="px-3 pb-3 pt-1 border-t border-white/10 bg-black/20">{MOCK_CONTENT[id]}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Layout 5: Card grid (each tab as a card, content below selected)
function LayoutE({ activeTab, setActiveTab }: { activeTab: TabId; setActiveTab: (id: TabId) => void }) {
  return (
    <div className="flex flex-col w-full h-72 rounded-xl overflow-hidden" style={PANEL_STYLE}>
      <div className="grid grid-cols-5 gap-2 p-3 bg-black/20">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all ${
              activeTab === id
                ? 'bg-cyan-600/40 border-2 border-cyan-500/50 text-cyan-200'
                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-xs font-medium truncate w-full text-center">{label}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 p-4 overflow-auto border-t border-white/10">{MOCK_CONTENT[activeTab]}</div>
    </div>
  )
}

export default function LayoutPage() {
  const [activeA, setActiveA] = useState<TabId>('chart')
  const [activeB, setActiveB] = useState<TabId>('chart')
  const [activeC, setActiveC] = useState<TabId>('chart')
  const [activeD, setActiveD] = useState<TabId>('chart')
  const [activeE, setActiveE] = useState<TabId>('chart')
  const [historySort, setHistorySort] = useState<'newest' | 'oldest' | 'profit'>('newest')

  // Demo state for action bar + betting panel layouts
  const [demoBet, setDemoBet] = useState('5000')
  const noop = () => {}
  const noopAction = (_a: Action) => {}
  const ACTION_PROPS = {
    onAction: noopAction,
    onRebetAndDeal: noop,
    onStartGame: noop,
    onDoubleDownChips: noop,
    onSplitChips: noop,
    isPlaying: false,
    canHit: true,
    canStand: true,
    canDoubleDown: true,
    canSplit: true,
    canDeal: true,
    chipStackLength: 3,
    lastBetAmount: '5000',
    soundEnabled: false,
    alwaysVisible: true,
  }
  const BETTING_PROPS = {
    onStartGame: (_bet: bigint, _seed: string) => {},
    isPlaying: false,
    reserveBalance: BigInt('100000000000000000000000'),
    onBetAmountChange: (v: string) => setDemoBet(v),
    currentBetAmount: demoBet,
    lastBetAmount: '5000',
    onRebet: noop,
    onHalfBet: noop,
    onDoubleBet: noop,
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(10, 15, 20))',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/BLACKJACK"
            className="text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-2"
          >
            <ChevronLeft className="w-5 h-5" />
            Back to Blackjack
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Blackjack Sidebar Layout Options</h1>
        <p className="text-white/60 text-sm mb-8">
          Five different layout approaches for the Blackjack sidebar. Pick one to apply to the main game.
        </p>

        <div className="space-y-12">
          {/* Layout A */}
          <section>
            <h2 className="text-lg font-semibold text-cyan-300 mb-3">Layout A — Vertical Icon Rail</h2>
            <p className="text-white/60 text-sm mb-4">
              Icons stacked vertically on the left; content fills the right. Minimal, app-like.
            </p>
            <div className="max-w-sm">
              <LayoutA activeTab={activeA} setActiveTab={setActiveA} />
            </div>
          </section>

          {/* Layout B */}
          <section>
            <h2 className="text-lg font-semibold text-cyan-300 mb-3">Layout B — Pill Tabs</h2>
            <p className="text-white/60 text-sm mb-4">
              Rounded pill-style segmented control. Modern, touch-friendly.
            </p>
            <div className="max-w-sm">
              <LayoutB activeTab={activeB} setActiveTab={setActiveB} />
            </div>
          </section>

          {/* Layout C */}
          <section>
            <h2 className="text-lg font-semibold text-cyan-300 mb-3">Layout C — Compact Icon Bar</h2>
            <p className="text-white/60 text-sm mb-4">
              Icon-only tabs with active label. Saves vertical space.
            </p>
            <div className="max-w-sm">
              <LayoutC activeTab={activeC} setActiveTab={setActiveC} />
            </div>
          </section>

          {/* Layout D */}
          <section>
            <h2 className="text-lg font-semibold text-cyan-300 mb-3">Layout D — Accordion</h2>
            <p className="text-white/60 text-sm mb-4">
              Vertical accordion; expand one section at a time. Good for mobile.
            </p>
            <div className="max-w-sm">
              <LayoutD activeTab={activeD} setActiveTab={setActiveD} />
            </div>
          </section>

          {/* Layout E */}
          <section>
            <h2 className="text-lg font-semibold text-cyan-300 mb-3">Layout E — Card Grid</h2>
            <p className="text-white/60 text-sm mb-4">
              Each tab as a card; content below. Visual, dashboard-style.
            </p>
            <div className="max-w-sm">
              <LayoutE activeTab={activeE} setActiveTab={setActiveE} />
            </div>
          </section>
        </div>

        {/* Game History Layout Options */}
        <div className="pt-16 mt-16 border-t border-white/20">
          <h1 className="text-2xl font-bold text-white mb-2">Game History Layout Options</h1>
          <p className="text-white/60 text-sm mb-8">
            Five different layouts for the Blackjack game history. Full-width, mobile-friendly, with both player and dealer totals shown.
          </p>

          <div className="space-y-12">
            <section>
              <h2 className="text-lg font-semibold text-cyan-300 mb-3">History Layout A — Stacked Rows</h2>
              <p className="text-white/60 text-sm mb-4">
                Mobile-first stacked layout. Meta info on top, You vs Dealer with totals below. Full width.
              </p>
              <div className="w-full max-w-2xl">
                <GameHistoryLayoutA history={MOCK_HISTORY_ENTRIES} sortBy={historySort} onSortChange={setHistorySort} />
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-cyan-300 mb-3">History Layout B — Two-Column Cards</h2>
              <p className="text-white/60 text-sm mb-4">
                Each entry as a card with You | Dealer side by side. Clear separation.
              </p>
              <div className="w-full max-w-2xl">
                <GameHistoryLayoutB history={MOCK_HISTORY_ENTRIES} sortBy={historySort} onSortChange={setHistorySort} />
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-cyan-300 mb-3">History Layout C — Compact List</h2>
              <p className="text-white/60 text-sm mb-4">
                Single row per entry: Result, time, bet, P/L, You vs Dealer totals. Tap to expand for cards.
              </p>
              <div className="w-full max-w-2xl">
                <GameHistoryLayoutC history={MOCK_HISTORY_ENTRIES} sortBy={historySort} onSortChange={setHistorySort} />
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-cyan-300 mb-3">History Layout D — Battle Layout</h2>
              <p className="text-white/60 text-sm mb-4">
                You vs Dealer with large totals. Cards centered, totals prominent.
              </p>
              <div className="w-full max-w-2xl">
                <GameHistoryLayoutD history={MOCK_HISTORY_ENTRIES} sortBy={historySort} onSortChange={setHistorySort} />
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-cyan-300 mb-3">History Layout E — Table Grid</h2>
              <p className="text-white/60 text-sm mb-4">
                Table-like with columns: Result | Time | Bet | P/L | You | Dealer. Horizontal scroll on small screens.
              </p>
              <div className="w-full max-w-2xl">
                <GameHistoryLayoutE history={MOCK_HISTORY_ENTRIES} sortBy={historySort} onSortChange={setHistorySort} />
              </div>
            </section>
          </div>
        </div>

        {/* Top Players Layout Options */}
        <div className="pt-16 mt-16 border-t border-white/20">
          <h1 className="text-2xl font-bold text-white mb-2">Blackjack Top Players Layout Options</h1>
          <p className="text-white/60 text-sm mb-8">
            Five different designs for the Top Players table, Carousel, and Overlay. Pick one of each to apply to the main game.
          </p>

          {/* Top Players Table */}
          <div className="mb-12">
            <h2 className="text-xl font-semibold text-cyan-300 mb-6">Top Players Table</h2>
            <div className="space-y-12">
              <section>
                <h3 className="text-base font-semibold text-white/90 mb-2">Table A — Compact Minimal</h3>
                <p className="text-white/60 text-sm mb-4">Clean table with minimal borders. Rank highlights for top 3.</p>
                <div className="max-w-xl">
                  <TopPlayersLayouts.A entries={MOCK_TOP_PLAYER_ENTRIES} />
                </div>
              </section>
              <section>
                <h3 className="text-base font-semibold text-white/90 mb-2">Table B — Card Rows with Header</h3>
                <p className="text-white/60 text-sm mb-4">Cyan-bordered panel with row-based layout. Rank badges for podium.</p>
                <div className="max-w-xl">
                  <TopPlayersLayouts.B entries={MOCK_TOP_PLAYER_ENTRIES} />
                </div>
              </section>
              <section>
                <h3 className="text-base font-semibold text-white/90 mb-2">Table C — Grid with Alternating Rows</h3>
                <p className="text-white/60 text-sm mb-4">Grid layout with zebra striping. Compact header.</p>
                <div className="max-w-xl">
                  <TopPlayersLayouts.C entries={MOCK_TOP_PLAYER_ENTRIES} />
                </div>
              </section>
              <section>
                <h3 className="text-base font-semibold text-white/90 mb-2">Table D — Card Per Player</h3>
                <p className="text-white/60 text-sm mb-4">Each player as a bordered card with circular rank badge. More visual.</p>
                <div className="max-w-md">
                  <TopPlayersLayouts.D entries={MOCK_TOP_PLAYER_ENTRIES} />
                </div>
              </section>
              <section>
                <h3 className="text-base font-semibold text-white/90 mb-2">Table E — Dashboard with Trophy</h3>
                <p className="text-white/60 text-sm mb-4">Gradient header with trophy icon. Clean row layout with ring on #1.</p>
                <div className="max-w-xl">
                  <TopPlayersLayouts.E entries={MOCK_TOP_PLAYER_ENTRIES} />
                </div>
              </section>
            </div>
          </div>

          {/* Carousel — Category leaders (Most Games, Highest Wagered, etc.) */}
          <div className="mb-12">
            <h2 className="text-xl font-semibold text-cyan-300 mb-6">Top Players Carousel</h2>
            <p className="text-white/60 text-sm mb-6">Shows category leaders with clear labels: metric name, player address, value. All cards 64px height.</p>
            <div className="space-y-12">
              <section>
                <h3 className="text-base font-semibold text-white/90 mb-2">Carousel A — Metric-First</h3>
                <p className="text-white/60 text-sm mb-4">Category label on top (e.g. &quot;Most Games Played&quot;), then Player ...5678, then value.</p>
                <div className="w-full">
                  <CarouselLayouts.A items={MOCK_CAROUSEL_ITEMS} />
                </div>
              </section>
              <section>
                <h3 className="text-base font-semibold text-white/90 mb-2">Carousel B — Trophy + Value</h3>
                <p className="text-white/60 text-sm mb-4">Trophy icon, category label, player, value on right. Right scroll.</p>
                <div className="w-full">
                  <CarouselLayouts.B items={MOCK_CAROUSEL_ITEMS} />
                </div>
              </section>
              <section>
                <h3 className="text-base font-semibold text-white/90 mb-2">Carousel C — Value Prominent</h3>
                <p className="text-white/60 text-sm mb-4">Big value (e.g. &quot;1,247 games&quot;), &quot;by ...5678&quot;, category label on right.</p>
                <div className="w-full">
                  <CarouselLayouts.C items={MOCK_CAROUSEL_ITEMS} />
                </div>
              </section>
              <section>
                <h3 className="text-base font-semibold text-white/90 mb-2">Carousel D — Target + Player</h3>
                <p className="text-white/60 text-sm mb-4">Target icon, player address, category, value. Left accent bar.</p>
                <div className="w-full">
                  <CarouselLayouts.D items={MOCK_CAROUSEL_ITEMS} />
                </div>
              </section>
              <section>
                <h3 className="text-base font-semibold text-white/90 mb-2">Carousel E — Sentence Style</h3>
                <p className="text-white/60 text-sm mb-4">&quot;...5678 leads with 1,247 games&quot; — reads like a headline.</p>
                <div className="w-full">
                  <CarouselLayouts.E items={MOCK_CAROUSEL_ITEMS} />
                </div>
              </section>
            </div>
          </div>

          {/* Overlay — Ranked players scroll */}
          <div>
            <h2 className="text-xl font-semibold text-cyan-300 mb-6">Top Players Overlay (Horizontal Scroll)</h2>
            <p className="text-white/60 text-sm mb-6">Shows ranked players with clear labels: rank, address, games played, win rate, profit. All cards 64px height.</p>
            <div className="space-y-12">
              <section>
                <h3 className="text-base font-semibold text-white/90 mb-2">Overlay A — Rank + Games Played</h3>
                <p className="text-white/60 text-sm mb-4">Rank badge, player address, &quot;X games played&quot;.</p>
                <div className="w-full max-w-2xl">
                  <OverlayLayouts.A entries={MOCK_TOP_PLAYER_ENTRIES} />
                </div>
              </section>
              <section>
                <h3 className="text-base font-semibold text-white/90 mb-2">Overlay B — Profit-First</h3>
                <p className="text-white/60 text-sm mb-4">Profit/loss prominent, &quot;MORB profit&quot;, player, rank.</p>
                <div className="w-full max-w-2xl">
                  <OverlayLayouts.B entries={MOCK_TOP_PLAYER_ENTRIES} />
                </div>
              </section>
              <section>
                <h3 className="text-base font-semibold text-white/90 mb-2">Overlay C — Full Stats Line</h3>
                <p className="text-white/60 text-sm mb-4">Rank, player, then &quot;X games · Y% win rate · ±Z MORB&quot; on one line.</p>
                <div className="w-full max-w-2xl">
                  <OverlayLayouts.C entries={MOCK_TOP_PLAYER_ENTRIES} />
                </div>
              </section>
              <section>
                <h3 className="text-base font-semibold text-white/90 mb-2">Overlay D — Medal + Rank/Games/Wins</h3>
                <p className="text-white/60 text-sm mb-4">Medal icon, player, &quot;Rank X · Y games · Z% wins&quot;.</p>
                <div className="w-full max-w-2xl">
                  <OverlayLayouts.D entries={MOCK_TOP_PLAYER_ENTRIES} />
                </div>
              </section>
              <section>
                <h3 className="text-base font-semibold text-white/90 mb-2">Overlay E — Award + P/L on Right</h3>
                <p className="text-white/60 text-sm mb-4">Award icon, player, rank/games/win rate, profit on right.</p>
                <div className="w-full max-w-2xl">
                  <OverlayLayouts.E entries={MOCK_TOP_PLAYER_ENTRIES} />
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* Betting Panel + Action Bar Combo Layouts */}
        <div className="pt-16 mt-16 border-t border-white/20">
          <h1 className="text-2xl font-bold text-white mb-2">Betting Panel + Action Bar Combo Layouts</h1>
          <p className="text-white/60 text-sm mb-8">
            Different grid arrangements of BettingPanelMobile and BlackjackMobileActionBar.
            Focused on mobile (&lt;768px) and md (768px+) breakpoints.
          </p>

          <div className="space-y-16">
            {/* Combo F — Stacked Full Width */}
            <section>
              <h2 className="text-lg font-semibold text-cyan-300 mb-1">Combo F — Stacked Full Width</h2>
              <p className="text-white/60 text-sm mb-4">
                Classic mobile stack: betting input on top, action buttons below. Both full width. Same layout at all breakpoints.
              </p>
              <div className="w-full max-w-md rounded-xl overflow-hidden" style={PANEL_STYLE}>
                <BettingPanelMobile {...BETTING_PROPS} />
                <BlackjackMobileActionBar {...ACTION_PROPS} />
              </div>
            </section>

            {/* Combo G — Side by Side at md */}
            <section>
              <h2 className="text-lg font-semibold text-cyan-300 mb-1">Combo G — Side by Side at md</h2>
              <p className="text-white/60 text-sm mb-4">
                Stacked on mobile; at md, betting panel (left 55%) and action bar (right 45%) sit side by side.
                Actions become a 2x2 grid at md to fit the narrower column.
              </p>
              <div className="w-full max-w-2xl rounded-xl overflow-hidden" style={PANEL_STYLE}>
                <div className="flex flex-col md:flex-row">
                  <div className="w-full md:w-[55%] md:border-r md:border-white/10">
                    <BettingPanelMobile {...BETTING_PROPS} />
                  </div>
                  <div className="w-full md:w-[45%] flex items-center">
                    <BlackjackMobileActionBar {...ACTION_PROPS} />
                  </div>
                </div>
              </div>
            </section>

            {/* Combo H — Unified Card */}
            <section>
              <h2 className="text-lg font-semibold text-cyan-300 mb-1">Combo H — Unified Card</h2>
              <p className="text-white/60 text-sm mb-4">
                Everything inside one embossed card. Betting input up top with a subtle divider,
                action buttons below. At md, the card stays centered at max-w-md for a focused feel.
              </p>
              <div className="w-full max-w-md mx-auto rounded-xl overflow-hidden border-2 border-cyan-500/30" style={PANEL_STYLE}>
                <div className="px-3 pt-3 pb-1">
                  <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">Place Your Bet</span>
                </div>
                <BettingPanelMobile {...BETTING_PROPS} />
                <div className="mx-3 border-t border-white/10" />
                <div className="px-1 pt-1 pb-2">
                  <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest px-3">Actions</span>
                  <BlackjackMobileActionBar {...ACTION_PROPS} />
                </div>
              </div>
            </section>

            {/* Combo I — Actions Top, Bet Bottom */}
            <section>
              <h2 className="text-lg font-semibold text-cyan-300 mb-1">Combo I — Actions Top, Bet Bottom</h2>
              <p className="text-white/60 text-sm mb-4">
                Reverse order: action buttons sit at the top for thumb reach; betting input below.
                At md, wraps in a wider container (max-w-lg) with more padding.
              </p>
              <div className="w-full max-w-md md:max-w-lg rounded-xl overflow-hidden" style={PANEL_STYLE}>
                <div className="md:p-2">
                  <BlackjackMobileActionBar {...ACTION_PROPS} />
                  <div className="mx-3 border-t border-white/10 my-1" />
                  <BettingPanelMobile {...BETTING_PROPS} />
                </div>
              </div>
            </section>

            {/* Combo J — 3-Column Grid at md */}
            <section>
              <h2 className="text-lg font-semibold text-cyan-300 mb-1">Combo J — 3-Column Grid at md</h2>
              <p className="text-white/60 text-sm mb-4">
                On mobile: stacked. At md: 3-column grid where betting panel spans 2 columns
                and action buttons sit in a compact single column with a vertical stack.
              </p>
              <div className="w-full max-w-3xl rounded-xl overflow-hidden" style={PANEL_STYLE}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
                  <div className="md:col-span-2 md:border-r md:border-white/10">
                    <div className="p-2">
                      <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest px-2">Bet Amount</span>
                    </div>
                    <BettingPanelMobile {...BETTING_PROPS} />
                  </div>
                  <div className="md:col-span-1 flex flex-col justify-center">
                    <div className="p-2 md:p-0">
                      <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest px-3 md:px-2">Game Actions</span>
                    </div>
                    <BlackjackMobileActionBar {...ACTION_PROPS} />
                  </div>
                </div>
              </div>
            </section>

            {/* Combo K — Inline Bar (always horizontal) */}
            <section>
              <h2 className="text-lg font-semibold text-cyan-300 mb-1">Combo K — Inline Bar</h2>
              <p className="text-white/60 text-sm mb-4">
                Always horizontal: betting input left, action buttons right. Minimal vertical footprint.
              </p>
              <div className="w-full rounded-xl overflow-hidden" style={PANEL_STYLE}>
                <div className="flex flex-row items-stretch">
                  <div className="w-1/2 border-r border-white/10 flex items-center">
                    <BettingPanelMobile {...BETTING_PROPS} />
                  </div>
                  <div className="w-1/2 flex items-center">
                    <BlackjackMobileActionBar {...ACTION_PROPS} />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
