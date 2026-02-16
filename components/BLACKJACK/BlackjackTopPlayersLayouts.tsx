'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { formatEther } from 'viem'
import { InfiniteMovingCards, type ImageCardItem } from '@/components/ui/infinite-moving-cards'
import { type TopPlayerEntry } from '@/hooks/use-blackjack-stats'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'
import { Trophy, Medal, Award } from 'lucide-react'

const PANEL_STYLE = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

export const MOCK_TOP_PLAYER_ENTRIES: TopPlayerEntry[] = [
  { rank: 1, wallet_address: '0x1234567890abcdef1234567890abcdef12345678', total_games: 1247, total_bet: BigInt(500000e18), total_win: BigInt(520000e18), profit_loss: BigInt(20000e18), win_rate: 52.3 },
  { rank: 2, wallet_address: '0xabcdef1234567890abcdef1234567890abcdef12', total_games: 892, total_bet: BigInt(320000e18), total_win: BigInt(310000e18), profit_loss: BigInt(-10000e18), win_rate: 48.1 },
  { rank: 3, wallet_address: '0x9876543210fedcba9876543210fedcba98765432', total_games: 654, total_bet: BigInt(180000e18), total_win: BigInt(195000e18), profit_loss: BigInt(15000e18), win_rate: 55.8 },
  { rank: 4, wallet_address: '0xfedcba9876543210fedcba9876543210fedcba98', total_games: 421, total_bet: BigInt(95000e18), total_win: BigInt(92000e18), profit_loss: BigInt(-3000e18), win_rate: 49.2 },
  { rank: 5, wallet_address: '0x5555666677778888999900001111222233334444', total_games: 312, total_bet: BigInt(72000e18), total_win: BigInt(78000e18), profit_loss: BigInt(6000e18), win_rate: 53.4 },
]

export const MOCK_CAROUSEL_ITEMS: ImageCardItem[] = [
  { name: 'Most Games · ...5678', subtitle: '1,247 games · 2 weeks', href: '/player/0x1234' },
  { name: 'Top Wagered · ...cdef', subtitle: '500,000 MORBIUS · 1 month', href: '/player/0xabcd' },
  { name: 'Best P/L · ...4321', subtitle: '+20,000 MORBIUS · 3 days', href: '/player/0x4321' },
  { name: 'Win Rate · ...7890', subtitle: '55.8% · 1 week', href: '/player/0x7890' },
  { name: 'Win Streak · ...abcd', subtitle: '12 wins · Today', href: '/player/0xabcd' },
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

// ─── Carousel Layouts ───────────────────────────────────────────────────────

function CarouselLayoutA({ items }: { items: ImageCardItem[] }) {
  return (
    <div className="w-full py-2 rounded-xl overflow-hidden" style={PANEL_STYLE}>
      <InfiniteMovingCards
        items={items}
        variant="image"
        direction="left"
        speed="normal"
        pauseOnHover
        className="max-w-5xl mx-auto [&_span]:text-inherit [&_a]:cursor-pointer [&_ul]:py-1 [&_li]:h-[72px] [&_li]:md:h-[88px]"
      />
    </div>
  )
}

function CarouselLayoutB({ items }: { items: ImageCardItem[] }) {
  return (
    <div
      className="w-full py-3 rounded-xl overflow-hidden border-2 border-cyan-500/30"
      style={{ background: 'linear-gradient(180deg, rgba(15,23,42,0.95), rgba(15,23,42,0.85))' }}
    >
      <InfiniteMovingCards
        items={items}
        variant="image"
        direction="right"
        speed="slow"
        pauseOnHover
        className="max-w-5xl mx-auto [&_li]:min-w-[220px] [&_li]:border-2 [&_li]:border-cyan-500/20 [&_li]:rounded-xl [&_li]:h-[80px]"
      />
    </div>
  )
}

function CarouselLayoutC({ items }: { items: ImageCardItem[] }) {
  return (
    <div className="w-full py-3 rounded-xl overflow-hidden" style={PANEL_STYLE}>
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.15),transparent_70%)]" />
        <InfiniteMovingCards
          items={items}
          variant="image"
          direction="left"
          speed="fast"
          pauseOnHover
          className="max-w-5xl mx-auto [&_li]:bg-gradient-to-br [&_li]:from-slate-800/90 [&_li]:to-slate-900/90 [&_li]:border [&_li]:border-white/10 [&_li]:shadow-lg [&_li]:h-[84px] [&_li]:min-w-[200px]"
        />
      </div>
    </div>
  )
}

function CarouselLayoutD({ items }: { items: ImageCardItem[] }) {
  return (
    <div className="w-full py-3 rounded-xl overflow-hidden" style={PANEL_STYLE}>
      <InfiniteMovingCards
        items={items}
        variant="image"
        direction="left"
        speed="normal"
        pauseOnHover
        className="max-w-5xl mx-auto [&_li]:bg-slate-800/80 [&_li]:border-l-4 [&_li]:border-l-cyan-500 [&_li]:rounded-r-lg [&_li]:h-[76px] [&_li]:min-w-[240px]"
      />
    </div>
  )
}

function CarouselLayoutE({ items }: { items: ImageCardItem[] }) {
  return (
    <div
      className="w-full py-3 rounded-xl overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, rgba(16,26,35,0.95), rgba(35,36,41,0.9))',
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.4), 0 0 20px rgba(34,211,238,0.08)',
        border: '1px solid rgba(34,211,238,0.2)',
      }}
    >
      <InfiniteMovingCards
        items={items}
        variant="image"
        direction="right"
        speed="normal"
        pauseOnHover
        className="max-w-5xl mx-auto [&_li]:backdrop-blur-sm [&_li]:bg-white/5 [&_li]:border [&_li]:border-white/20 [&_li]:rounded-xl [&_li]:h-[80px] [&_li]:min-w-[220px]"
      />
    </div>
  )
}

// ─── Overlay Layouts (horizontal scroll) ─────────────────────────────────────

function OverlayLayoutA({ entries }: { entries: TopPlayerEntry[] }) {
  const ref = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState(false)

  useEffect(() => {
    if (!containerRef.current || !ref.current) return
    Array.from(ref.current.children).forEach((el) => ref.current?.appendChild(el.cloneNode(true)))
    containerRef.current.style.setProperty('--animation-duration', '35s')
    setStart(true)
  }, [])

  return (
    <div
      ref={containerRef}
      className="scroller overflow-hidden rounded-lg [mask-image:linear-gradient(to_right,transparent,white_15%,white_85%,transparent)]"
      style={PANEL_STYLE}
    >
      <ul ref={ref} className={`flex w-max gap-2 py-2 px-2 ${start ? 'animate-scroll' : ''} hover:[animation-play-state:paused]`}>
        {entries.map((e) => (
          <li key={e.wallet_address} className="shrink-0">
            <Link
              href={`/player/${e.wallet_address}`}
              className="block px-3 py-1.5 rounded-md bg-white/5 border border-white/10 hover:border-cyan-500/30 text-white text-xs font-mono"
            >
              <span className="text-amber-400/90 font-bold">#{e.rank}</span>
              <span className="mx-1.5 text-white/70">·</span>
              <span>...{shortAddress(e.wallet_address)}</span>
              <span className="ml-1.5 text-white/50">{e.total_games}g</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function OverlayLayoutB({ entries }: { entries: TopPlayerEntry[] }) {
  const ref = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState(false)

  useEffect(() => {
    if (!containerRef.current || !ref.current) return
    Array.from(ref.current.children).forEach((el) => ref.current?.appendChild(el.cloneNode(true)))
    containerRef.current.style.setProperty('--animation-duration', '40s')
    setStart(true)
  }, [])

  const rankStyle = (r: number) => {
    if (r === 1) return 'border-amber-400/80 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
    if (r === 2) return 'border-slate-300/80 shadow-[0_0_10px_rgba(203,213,225,0.3)]'
    if (r === 3) return 'border-amber-700/80 shadow-[0_0_10px_rgba(180,83,9,0.35)]'
    return 'border-white/20'
  }

  return (
    <div
      ref={containerRef}
      className="scroller overflow-hidden rounded-xl [mask-image:linear-gradient(to_right,transparent,white_15%,white_85%,transparent)]"
      style={PANEL_STYLE}
    >
      <ul ref={ref} className={`flex w-max gap-3 py-2.5 px-3 ${start ? 'animate-scroll' : ''} hover:[animation-play-state:paused]`}>
        {entries.map((e) => (
          <li key={e.wallet_address} className="shrink-0 w-[110px]">
            <Link
              href={`/player/${e.wallet_address}`}
              className={`block rounded-lg border-2 bg-gradient-to-b from-slate-800/95 to-slate-900/95 px-2.5 py-2 text-white transition-opacity hover:opacity-95 ${rankStyle(e.rank)}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400/90">#{e.rank}</span>
                <span className="text-xs font-mono truncate">...{shortAddress(e.wallet_address)}</span>
              </div>
              <div className="mt-1 text-[10px] tabular-nums text-white/70">
                {e.total_games} games · {e.win_rate.toFixed(0)}%
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function OverlayLayoutC({ entries }: { entries: TopPlayerEntry[] }) {
  const ref = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState(false)

  useEffect(() => {
    if (!containerRef.current || !ref.current) return
    Array.from(ref.current.children).forEach((el) => ref.current?.appendChild(el.cloneNode(true)))
    containerRef.current.style.setProperty('--animation-duration', '38s')
    setStart(true)
  }, [])

  return (
    <div
      ref={containerRef}
      className="scroller overflow-hidden rounded-xl [mask-image:linear-gradient(to_right,transparent,white_15%,white_85%,transparent)]"
      style={{
        background: 'linear-gradient(145deg, rgba(16,26,35,0.95), rgba(35,36,41,0.9))',
        border: '1px solid rgba(34,211,238,0.25)',
        boxShadow: 'inset 0 0 30px rgba(34,211,238,0.05)',
      }}
    >
      <ul ref={ref} className={`flex w-max gap-2.5 py-2 px-3 ${start ? 'animate-scroll' : ''} hover:[animation-play-state:paused]`}>
        {entries.map((e) => (
          <li key={e.wallet_address} className="shrink-0">
            <Link
              href={`/player/${e.wallet_address}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/80 border border-cyan-500/20 hover:border-cyan-500/50 text-white"
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                e.rank === 1 ? 'bg-amber-500/40 text-amber-200' :
                e.rank === 2 ? 'bg-slate-400/40' :
                e.rank === 3 ? 'bg-amber-700/40 text-amber-300' :
                'bg-white/10 text-white/70'
              }`}>
                {e.rank}
              </span>
              <div>
                <div className="text-xs font-mono text-cyan-300">...{shortAddress(e.wallet_address)}</div>
                <div className="text-[10px] text-white/50">{e.total_games} · {e.win_rate.toFixed(0)}%</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function OverlayLayoutD({ entries }: { entries: TopPlayerEntry[] }) {
  const ref = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState(false)

  useEffect(() => {
    if (!containerRef.current || !ref.current) return
    Array.from(ref.current.children).forEach((el) => ref.current?.appendChild(el.cloneNode(true)))
    containerRef.current.style.setProperty('--animation-duration', '42s')
    setStart(true)
  }, [])

  return (
    <div ref={containerRef} className="scroller overflow-hidden rounded-lg [mask-image:linear-gradient(to_right,transparent,white_15%,white_85%,transparent)]" style={PANEL_STYLE}>
      <ul ref={ref} className={`flex w-max gap-2 py-2 px-2 ${start ? 'animate-scroll' : ''} hover:[animation-play-state:paused]`}>
        {entries.map((e) => (
          <li key={e.wallet_address} className="shrink-0">
            <Link
              href={`/player/${e.wallet_address}`}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded border-l-4 border-l-cyan-500 bg-slate-800/60 hover:bg-slate-700/60 text-white"
            >
              <Medal className={`w-4 h-4 shrink-0 ${e.rank <= 3 ? 'text-amber-400' : 'text-white/40'}`} />
              <span className="text-xs font-mono">...{shortAddress(e.wallet_address)}</span>
              <span className="text-[10px] text-white/50 tabular-nums">{e.total_games}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function OverlayLayoutE({ entries }: { entries: TopPlayerEntry[] }) {
  const ref = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState(false)

  useEffect(() => {
    if (!containerRef.current || !ref.current) return
    Array.from(ref.current.children).forEach((el) => ref.current?.appendChild(el.cloneNode(true)))
    containerRef.current.style.setProperty('--animation-duration', '36s')
    setStart(true)
  }, [])

  return (
    <div
      ref={containerRef}
      className="scroller overflow-hidden rounded-xl [mask-image:linear-gradient(to_right,transparent,white_15%,white_85%,transparent)]"
      style={{
        background: 'linear-gradient(145deg, rgba(20,20,20,0.9), rgba(40,40,40,0.7))',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5), 0 0 24px rgba(34,211,238,0.06)',
      }}
    >
      <ul ref={ref} className={`flex w-max gap-2.5 py-2.5 px-3 ${start ? 'animate-scroll' : ''} hover:[animation-play-state:paused]`}>
        {entries.map((e) => (
          <li key={e.wallet_address} className="shrink-0">
            <Link
              href={`/player/${e.wallet_address}`}
              className="flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm bg-white/5 border border-white/10 hover:border-cyan-500/40 text-white"
            >
              <Award className={`w-4 h-4 shrink-0 ${e.rank <= 3 ? 'text-amber-400/90' : 'text-white/40'}`} />
              <div>
                <div className="text-xs font-mono text-white/90">...{shortAddress(e.wallet_address)}</div>
                <div className="text-[10px] text-cyan-400/80 tabular-nums">{e.profit_loss >= 0n ? '+' : ''}{formatMorbius(e.profit_loss)} MORB</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
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
