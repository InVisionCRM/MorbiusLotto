'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { formatEther } from 'viem'
import { type TopPlayerEntry } from '@/hooks/use-blackjack-stats'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'
import { Trophy, Medal, Award, TrendingUp, Target } from 'lucide-react'

const PANEL_STYLE = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

const CARD_HEIGHT = 'h-[64px]'

export const MOCK_TOP_PLAYER_ENTRIES: TopPlayerEntry[] = [
  { rank: 1, wallet_address: '0x1234567890abcdef1234567890abcdef12345678', total_games: 1247, total_bet: BigInt(500000e18), total_win: BigInt(520000e18), profit_loss: BigInt(20000e18), win_rate: 52.3 },
  { rank: 2, wallet_address: '0xabcdef1234567890abcdef1234567890abcdef12', total_games: 892, total_bet: BigInt(320000e18), total_win: BigInt(310000e18), profit_loss: BigInt(-10000e18), win_rate: 48.1 },
  { rank: 3, wallet_address: '0x9876543210fedcba9876543210fedcba98765432', total_games: 654, total_bet: BigInt(180000e18), total_win: BigInt(195000e18), profit_loss: BigInt(15000e18), win_rate: 55.8 },
  { rank: 4, wallet_address: '0xfedcba9876543210fedcba9876543210fedcba98', total_games: 421, total_bet: BigInt(95000e18), total_win: BigInt(92000e18), profit_loss: BigInt(-3000e18), win_rate: 49.2 },
  { rank: 5, wallet_address: '0x5555666677778888999900001111222233334444', total_games: 312, total_bet: BigInt(72000e18), total_win: BigInt(78000e18), profit_loss: BigInt(6000e18), win_rate: 53.4 },
]

/** Carousel item: category leader with clear labels */
export interface CarouselItem {
  categoryLabel: string
  playerShort: string
  displayValue: string
  href: string
}

export const MOCK_CAROUSEL_ITEMS: CarouselItem[] = [
  { categoryLabel: 'Most Games Played', playerShort: '...5678', displayValue: '1,247 games', href: '/player/0x1234' },
  { categoryLabel: 'Highest Wagered', playerShort: '...cdef', displayValue: '500,000 MORB', href: '/player/0xabcd' },
  { categoryLabel: 'Best Profit', playerShort: '...4321', displayValue: '+20,000 MORB', href: '/player/0x4321' },
  { categoryLabel: 'Best Win Rate', playerShort: '...7890', displayValue: '55.8%', href: '/player/0x7890' },
  { categoryLabel: 'Longest Win Streak', playerShort: '...abcd', displayValue: '12 wins', href: '/player/0xabcd' },
]

function formatMorbius(wei: bigint): string {
  return Math.floor(Number(formatEther(wei))).toLocaleString()
}

function shortAddress(addr: string): string {
  if (!addr || addr.length < 8) return addr
  return addr.slice(-4)
}

// ─── TopPlayers Table Layouts ───────────────────────────────────────────────

function TopPlayersTableA({ entries }: { entries: TopPlayerEntry[] }) {
  const [sel, setSel] = useState<string | null>(null)
  return (
    <>
      <div className="rounded-xl overflow-hidden" style={PANEL_STYLE}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 px-3 text-white/70 font-medium">#</th>
                <th className="text-left py-2 px-3 text-white/70 font-medium">Player</th>
                <th className="text-right py-2 px-3 text-white/70 font-medium">Games</th>
                <th className="text-right py-2 px-3 text-white/70 font-medium">Wagered</th>
                <th className="text-right py-2 px-3 text-white/70 font-medium">P/L</th>
                <th className="text-right py-2 px-3 text-white/70 font-medium">Win %</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.wallet_address} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 px-3">
                    <span className={e.rank <= 3 ? 'text-amber-300 font-bold' : 'text-white/60'}>{e.rank}</span>
                  </td>
                  <td className="py-2 px-3">
                    <button onClick={() => setSel(e.wallet_address)} className="text-cyan-400 hover:text-cyan-300 font-mono">
                      ...{shortAddress(e.wallet_address)}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-white/90">{e.total_games}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-white/80">{formatMorbius(e.total_bet)}</td>
                  <td className={`py-2 px-3 text-right tabular-nums ${e.profit_loss >= 0n ? 'text-emerald-400' : 'text-red-400'}`}>
                    {e.profit_loss >= 0n ? '+' : ''}{formatMorbius(e.profit_loss)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-white/80">{e.win_rate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <PlayerProfileModal isOpen={!!sel} onClose={() => setSel(null)} address={sel} />
    </>
  )
}

function TopPlayersTableB({ entries }: { entries: TopPlayerEntry[] }) {
  const [sel, setSel] = useState<string | null>(null)
  return (
    <>
      <div className="rounded-xl overflow-hidden border-2 border-cyan-500/30" style={PANEL_STYLE}>
        <div className="px-3 py-2 border-b border-cyan-500/20 bg-black/20">
          <h3 className="text-cyan-300 font-semibold text-sm">Leaderboard</h3>
        </div>
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          {entries.map((e) => (
            <div
              key={e.wallet_address}
              className="flex items-center gap-3 px-3 py-2.5 border-b border-white/5 hover:bg-cyan-500/10"
            >
              <span className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold ${
                e.rank === 1 ? 'bg-amber-500/30 text-amber-300' :
                e.rank === 2 ? 'bg-slate-400/30 text-slate-200' :
                e.rank === 3 ? 'bg-amber-700/30 text-amber-400' :
                'bg-white/10 text-white/70'
              }`}>
                {e.rank}
              </span>
              <button onClick={() => setSel(e.wallet_address)} className="flex-1 text-left font-mono text-cyan-400 hover:text-cyan-300 truncate">
                ...{shortAddress(e.wallet_address)}
              </button>
              <span className="tabular-nums text-white/80 text-sm">{e.total_games}</span>
              <span className={`tabular-nums text-sm w-20 text-right ${e.profit_loss >= 0n ? 'text-emerald-400' : 'text-red-400'}`}>
                {e.profit_loss >= 0n ? '+' : ''}{formatMorbius(e.profit_loss)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <PlayerProfileModal isOpen={!!sel} onClose={() => setSel(null)} address={sel} />
    </>
  )
}

function TopPlayersTableC({ entries }: { entries: TopPlayerEntry[] }) {
  const [sel, setSel] = useState<string | null>(null)
  return (
    <>
      <div className="rounded-xl overflow-hidden" style={PANEL_STYLE}>
        <div className="grid grid-cols-6 gap-2 px-3 py-2 bg-black/30 border-b border-white/10 text-xs font-semibold text-cyan-300/90">
          <span>#</span>
          <span className="col-span-2">Player</span>
          <span className="text-right">Games</span>
          <span className="text-right">P/L</span>
          <span className="text-right">Win %</span>
        </div>
        {entries.map((e, i) => (
          <div
            key={e.wallet_address}
            className={`grid grid-cols-6 gap-2 px-3 py-2 items-center ${i % 2 === 0 ? 'bg-white/5' : ''} hover:bg-cyan-500/10`}
          >
            <span className={e.rank <= 3 ? 'text-amber-300 font-bold' : 'text-white/60'}>{e.rank}</span>
            <span className="col-span-2">
              <button onClick={() => setSel(e.wallet_address)} className="text-cyan-400 hover:text-cyan-300 font-mono text-sm">
                ...{shortAddress(e.wallet_address)}
              </button>
            </span>
            <span className="text-right tabular-nums text-white/90">{e.total_games}</span>
            <span className={`text-right tabular-nums ${e.profit_loss >= 0n ? 'text-emerald-400' : 'text-red-400'}`}>
              {e.profit_loss >= 0n ? '+' : ''}{formatMorbius(e.profit_loss)}
            </span>
            <span className="text-right tabular-nums text-white/80">{e.win_rate.toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <PlayerProfileModal isOpen={!!sel} onClose={() => setSel(null)} address={sel} />
    </>
  )
}

function TopPlayersTableD({ entries }: { entries: TopPlayerEntry[] }) {
  const [sel, setSel] = useState<string | null>(null)
  return (
    <>
      <div className="space-y-2">
        {entries.map((e) => (
          <div
            key={e.wallet_address}
            className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:border-cyan-500/30 transition-colors"
            style={{ background: 'linear-gradient(145deg, rgba(20,20,20,0.6), rgba(40,40,40,0.4))' }}
          >
            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
              e.rank === 1 ? 'bg-amber-500/40 text-amber-200' :
              e.rank === 2 ? 'bg-slate-400/40 text-slate-200' :
              e.rank === 3 ? 'bg-amber-700/40 text-amber-300' :
              'bg-white/10 text-white/70'
            }`}>
              {e.rank}
            </div>
            <div className="flex-1 min-w-0">
              <button onClick={() => setSel(e.wallet_address)} className="font-mono text-cyan-400 hover:text-cyan-300 truncate block">
                ...{shortAddress(e.wallet_address)}
              </button>
              <div className="flex gap-3 mt-0.5 text-xs text-white/60">
                <span>{e.total_games} games</span>
                <span>{e.win_rate.toFixed(1)}% win</span>
              </div>
            </div>
            <div className="text-right">
              <span className={`font-semibold tabular-nums ${e.profit_loss >= 0n ? 'text-emerald-400' : 'text-red-400'}`}>
                {e.profit_loss >= 0n ? '+' : ''}{formatMorbius(e.profit_loss)}
              </span>
              <div className="text-xs text-white/50">MORBIUS</div>
            </div>
          </div>
        ))}
      </div>
      <PlayerProfileModal isOpen={!!sel} onClose={() => setSel(null)} address={sel} />
    </>
  )
}

function TopPlayersTableE({ entries }: { entries: TopPlayerEntry[] }) {
  const [sel, setSel] = useState<string | null>(null)
  return (
    <>
      <div className="rounded-xl overflow-hidden border border-cyan-500/20" style={PANEL_STYLE}>
        <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-b border-cyan-500/20">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h3 className="text-cyan-200 font-semibold">Top Players</h3>
        </div>
        <div className="divide-y divide-white/5">
          {entries.map((e) => (
            <div key={e.wallet_address} className="flex items-center gap-4 px-4 py-3 hover:bg-white/5">
              <span className={`flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${
                e.rank === 1 ? 'bg-amber-500/30 text-amber-300 ring-1 ring-amber-400/50' :
                e.rank === 2 ? 'bg-slate-400/30 text-slate-200' :
                e.rank === 3 ? 'bg-amber-700/30 text-amber-400' :
                'bg-white/5 text-white/70'
              }`}>
                {e.rank}
              </span>
              <button onClick={() => setSel(e.wallet_address)} className="flex-1 text-left font-mono text-sm text-cyan-400 hover:text-cyan-300">
                ...{shortAddress(e.wallet_address)}
              </button>
              <div className="flex items-center gap-4 text-sm">
                <span className="tabular-nums text-white/70 w-12">{e.total_games}</span>
                <span className="tabular-nums text-white/60 w-16">{e.win_rate.toFixed(1)}%</span>
                <span className={`tabular-nums font-medium w-20 text-right ${e.profit_loss >= 0n ? 'text-emerald-400' : 'text-red-400'}`}>
                  {e.profit_loss >= 0n ? '+' : ''}{formatMorbius(e.profit_loss)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <PlayerProfileModal isOpen={!!sel} onClose={() => setSel(null)} address={sel} />
    </>
  )
}

// ─── Carousel Layouts (5 concepts, clear labels, fixed h-[64px]) ────────────────

function CarouselScroller({ items, direction, children }: { items: CarouselItem[]; direction: 'left' | 'right'; children: (item: CarouselItem) => React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState(false)
  useEffect(() => {
    if (!containerRef.current || !ref.current) return
    Array.from(ref.current.children).forEach((el) => ref.current?.appendChild(el.cloneNode(true)))
    containerRef.current.style.setProperty('--animation-duration', '40s')
    containerRef.current.style.setProperty('--animation-direction', direction === 'left' ? 'forwards' : 'reverse')
    setStart(true)
  }, [direction])
  return (
    <div ref={containerRef} className="scroller overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_15%,white_85%,transparent)]">
      <ul ref={ref} className={`flex flex-nowrap w-max gap-3 py-2 ${start ? 'animate-scroll' : ''} hover:[animation-play-state:paused]`}>
        {items.map((item) => (
          <li key={item.href + item.categoryLabel} className="shrink-0">
            {children(item)}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CarouselLayoutA({ items }: { items: CarouselItem[] }) {
  return (
    <div className="w-full py-2 rounded-xl overflow-hidden" style={PANEL_STYLE}>
      <CarouselScroller items={items} direction="left">
        {(item) => (
          <Link href={item.href} className={`flex flex-col justify-center px-4 rounded-lg bg-slate-800/80 border border-white/10 hover:border-cyan-500/30 ${CARD_HEIGHT} min-w-[200px]`}>
            <span className="text-[10px] uppercase tracking-wider text-cyan-400/90 font-medium">{item.categoryLabel}</span>
            <span className="text-sm font-mono text-white mt-0.5">Player {item.playerShort}</span>
            <span className="text-xs text-white/70 tabular-nums mt-0.5">{item.displayValue}</span>
          </Link>
        )}
      </CarouselScroller>
    </div>
  )
}

function CarouselLayoutB({ items }: { items: CarouselItem[] }) {
  return (
    <div className="w-full py-2 rounded-xl overflow-hidden border-2 border-cyan-500/30" style={PANEL_STYLE}>
      <CarouselScroller items={items} direction="right">
        {(item) => (
          <Link href={item.href} className={`flex items-center gap-3 px-4 rounded-lg bg-black/30 border-l-4 border-l-cyan-500 hover:bg-slate-800/50 ${CARD_HEIGHT} min-w-[240px]`}>
            <Trophy className="w-6 h-6 text-amber-400/80 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-cyan-300 truncate">{item.categoryLabel}</div>
              <div className="text-sm font-mono text-white/90 truncate">{item.playerShort}</div>
            </div>
            <span className="text-sm font-bold tabular-nums text-white shrink-0">{item.displayValue}</span>
          </Link>
        )}
      </CarouselScroller>
    </div>
  )
}

function CarouselLayoutC({ items }: { items: CarouselItem[] }) {
  return (
    <div className="w-full py-2 rounded-xl overflow-hidden" style={PANEL_STYLE}>
      <CarouselScroller items={items} direction="left">
        {(item) => (
          <Link href={item.href} className={`flex items-center justify-between px-4 rounded-lg bg-gradient-to-r from-slate-800/90 to-slate-900/80 hover:from-cyan-900/30 hover:to-slate-900/80 ${CARD_HEIGHT} min-w-[220px]`}>
            <div>
              <span className="text-lg font-bold tabular-nums text-white">{item.displayValue}</span>
              <div className="text-[10px] text-white/60 mt-0.5">by {item.playerShort}</div>
            </div>
            <span className="text-[10px] uppercase text-cyan-400/80 font-medium text-right max-w-[100px]">{item.categoryLabel}</span>
          </Link>
        )}
      </CarouselScroller>
    </div>
  )
}

function CarouselLayoutD({ items }: { items: CarouselItem[] }) {
  return (
    <div className="w-full py-2 rounded-xl overflow-hidden" style={PANEL_STYLE}>
      <CarouselScroller items={items} direction="left">
        {(item) => (
          <Link href={item.href} className={`flex items-center gap-3 px-4 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/40 ${CARD_HEIGHT} min-w-[200px]`}>
            <Target className="w-5 h-5 text-cyan-400/70 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-mono text-white truncate">{item.playerShort}</div>
              <div className="text-[10px] text-white/60 truncate">{item.categoryLabel}</div>
            </div>
            <span className="text-sm font-semibold tabular-nums text-cyan-300 shrink-0">{item.displayValue}</span>
          </Link>
        )}
      </CarouselScroller>
    </div>
  )
}

function CarouselLayoutE({ items }: { items: CarouselItem[] }) {
  return (
    <div className="w-full py-2 rounded-xl overflow-hidden" style={PANEL_STYLE}>
      <CarouselScroller items={items} direction="right">
        {(item) => (
          <Link href={item.href} className={`flex items-center gap-3 px-4 rounded-lg bg-slate-800/90 border border-cyan-500/20 hover:border-cyan-500/50 ${CARD_HEIGHT} min-w-[260px] w-max flex-shrink-0 flex-nowrap`}>
            <TrendingUp className="w-5 h-5 text-emerald-400/80 shrink-0" />
            <div className="flex flex-col justify-center min-w-0">
              <div className="text-xs text-white/70 whitespace-nowrap">{item.playerShort} leads with</div>
              <div className="text-sm font-bold text-white whitespace-nowrap">{item.displayValue}</div>
            </div>
            <span className="text-[10px] text-cyan-400/80 uppercase shrink-0 whitespace-nowrap">{item.categoryLabel}</span>
          </Link>
        )}
      </CarouselScroller>
    </div>
  )
}

// ─── Overlay Layouts (5 concepts, clear labels, fixed h-[64px]) ───────────────

function OverlayScroller({ entries, children }: { entries: TopPlayerEntry[]; children: (e: TopPlayerEntry) => React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState(false)
  useEffect(() => {
    if (!containerRef.current || !ref.current) return
    Array.from(ref.current.children).forEach((el) => ref.current?.appendChild(el.cloneNode(true)))
    containerRef.current.style.setProperty('--animation-duration', '38s')
    containerRef.current.style.setProperty('--animation-direction', 'forwards')
    setStart(true)
  }, [])
  return (
    <div ref={containerRef} className="scroller overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_15%,white_85%,transparent)]">
      <ul ref={ref} className={`flex flex-nowrap w-max gap-3 py-2 ${start ? 'animate-scroll' : ''} hover:[animation-play-state:paused]`}>
        {entries.map((e) => (
          <li key={e.wallet_address} className="shrink-0">
            {children(e)}
          </li>
        ))}
      </ul>
    </div>
  )
}

function OverlayLayoutA({ entries, transparent }: { entries: TopPlayerEntry[]; transparent?: boolean }) {
  return (
    <div className="rounded-xl overflow-hidden" style={transparent ? undefined : PANEL_STYLE}>
      <OverlayScroller entries={entries}>
        {(e) => (
          <Link href={`/player/${e.wallet_address}`} className={`flex items-center gap-3 px-4 rounded-lg bg-slate-800/80 border border-white/10 hover:border-cyan-500/30 ${CARD_HEIGHT} min-w-[200px]`}>
            <span className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold shrink-0 ${e.rank <= 3 ? 'bg-amber-500/30 text-amber-300' : 'bg-white/10 text-white/70'}`}>
              #{e.rank}
            </span>
            <span className="text-sm font-mono text-white">...{shortAddress(e.wallet_address)}</span>
            <span className="text-xs text-white/60 tabular-nums ml-auto">{e.total_games} games played</span>
          </Link>
        )}
      </OverlayScroller>
    </div>
  )
}

function OverlayLayoutB({ entries, transparent }: { entries: TopPlayerEntry[]; transparent?: boolean }) {
  return (
    <div className="rounded-xl overflow-hidden border-2 border-cyan-500/30" style={transparent ? undefined : PANEL_STYLE}>
      <OverlayScroller entries={entries}>
        {(e) => (
          <Link href={`/player/${e.wallet_address}`} className={`flex items-center gap-3 px-4 rounded-lg bg-black/30 hover:bg-slate-800/50 ${CARD_HEIGHT} min-w-[220px]`}>
            <span className={`tabular-nums font-bold text-sm shrink-0 ${e.profit_loss >= 0n ? 'text-emerald-400' : 'text-red-400'}`}>
              {e.profit_loss >= 0n ? '+' : ''}{formatMorbius(e.profit_loss)}
            </span>
            <span className="text-xs text-white/60">MORB profit</span>
            <span className="text-sm font-mono text-cyan-300 ml-auto">...{shortAddress(e.wallet_address)}</span>
            <span className="text-[10px] text-white/50">Rank #{e.rank}</span>
          </Link>
        )}
      </OverlayScroller>
    </div>
  )
}

function OverlayLayoutC({ entries, transparent }: { entries: TopPlayerEntry[]; transparent?: boolean }) {
  return (
    <div className="rounded-xl overflow-hidden" style={transparent ? undefined : PANEL_STYLE}>
      <OverlayScroller entries={entries}>
        {(e) => (
          <Link href={`/player/${e.wallet_address}`} className={`flex flex-col justify-center px-4 rounded-lg bg-gradient-to-r from-slate-800/90 to-slate-900/80 hover:from-cyan-900/20 ${CARD_HEIGHT} min-w-[180px] w-max flex-shrink-0 flex-nowrap`}>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-amber-400/90 font-bold">#{e.rank}</span>
              <span className="text-sm font-mono text-white">...{shortAddress(e.wallet_address)}</span>
            </div>
            <div className="text-[10px] text-white/60 mt-0.5 whitespace-nowrap">
              {e.total_games} games · {e.win_rate.toFixed(1)}% win rate · {e.profit_loss >= 0n ? '+' : ''}{formatMorbius(e.profit_loss)} MORB
            </div>
          </Link>
        )}
      </OverlayScroller>
    </div>
  )
}

function OverlayLayoutD({ entries, transparent }: { entries: TopPlayerEntry[]; transparent?: boolean }) {
  return (
    <div className="rounded-xl overflow-hidden" style={transparent ? undefined : PANEL_STYLE}>
      <OverlayScroller entries={entries}>
        {(e) => (
          <Link href={`/player/${e.wallet_address}`} className={`flex items-center gap-3 px-4 rounded-lg border-l-4 border-l-cyan-500 bg-slate-800/60 hover:bg-slate-700/60 ${CARD_HEIGHT} min-w-[200px]`}>
            <Medal className={`w-5 h-5 shrink-0 ${e.rank <= 3 ? 'text-amber-400' : 'text-white/40'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-mono text-white truncate">...{shortAddress(e.wallet_address)}</div>
              <div className="text-[10px] text-white/60">Rank {e.rank} · {e.total_games} games · {e.win_rate.toFixed(0)}% wins</div>
            </div>
          </Link>
        )}
      </OverlayScroller>
    </div>
  )
}

function OverlayLayoutE({ entries, transparent }: { entries: TopPlayerEntry[]; transparent?: boolean }) {
  return (
    <div className="rounded-xl overflow-hidden" style={transparent ? undefined : PANEL_STYLE}>
      <OverlayScroller entries={entries}>
        {(e) => (
          <Link href={`/player/${e.wallet_address}`} className={`flex items-center gap-3 px-4 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/40 ${CARD_HEIGHT} min-w-[240px]`}>
            <Award className={`w-5 h-5 shrink-0 ${e.rank <= 3 ? 'text-amber-400/90' : 'text-white/40'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-mono text-white truncate">...{shortAddress(e.wallet_address)}</div>
              <div className="text-[10px] text-white/60">#{e.rank} · {e.total_games} games · {e.win_rate.toFixed(1)}% win rate</div>
            </div>
            <span className={`text-sm font-semibold tabular-nums shrink-0 ${e.profit_loss >= 0n ? 'text-emerald-400' : 'text-red-400'}`}>
              {e.profit_loss >= 0n ? '+' : ''}{formatMorbius(e.profit_loss)}
            </span>
          </Link>
        )}
      </OverlayScroller>
    </div>
  )
}

// ─── Exports for Layout page ───────────────────────────────────────────────

export const TopPlayersLayouts = {
  A: TopPlayersTableA,
  B: TopPlayersTableB,
  C: TopPlayersTableC,
  D: TopPlayersTableD,
  E: TopPlayersTableE,
}

export const CarouselLayouts = {
  A: CarouselLayoutA,
  B: CarouselLayoutB,
  C: CarouselLayoutC,
  D: CarouselLayoutD,
  E: CarouselLayoutE,
}

export const OverlayLayouts = {
  A: OverlayLayoutA,
  B: OverlayLayoutB,
  C: OverlayLayoutC,
  D: OverlayLayoutD,
  E: OverlayLayoutE,
}
