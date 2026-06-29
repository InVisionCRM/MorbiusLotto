'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLatestWins } from '@/hooks/use-latest-wins'
import { GameArt } from './game-art'

/** Games shown in the feed → label + lobby route + GameArt key. */
const GAMES: { key: string; label: string; href: string }[] = [
  { key: 'plinko', label: 'Plinko', href: '/plinko2' },
  { key: 'keno', label: 'Keno', href: '/keno2' },
  { key: 'blackjack', label: 'Blackjack', href: '/BLACKJACK' },
  { key: 'mines', label: 'Mines', href: '/mines2' },
  { key: 'crash', label: 'Crash', href: '/crash' },
  { key: 'limbo', label: 'Limbo', href: '/limbo2' },
  { key: 'dice', label: 'Dice', href: '/dice2' },
  { key: 'roulette', label: 'Roulette', href: '/roulette2' },
  { key: 'towers', label: 'Towers', href: '/towers' },
  { key: 'chicken', label: 'Chicken', href: '/chicken' },
  { key: 'baccarat', label: 'Baccarat', href: '/baccarat' },
  { key: 'hilo', label: 'Hi-Lo', href: '/hilo' },
  { key: 'video-poker', label: 'Video Poker', href: '/video-poker' },
  { key: 'dragon-tiger', label: 'Dragon Tiger', href: '/dragon-tiger' },
]
const GAME_BY_KEY = Object.fromEntries(GAMES.map((g) => [g.key, g]))

const ROWS = 8
const ROW_H = 48 // px
const BIG_WIN = 20_000

interface Row {
  id: string
  gameKey: string
  game: string
  href?: string
  amount: number
  player: string
  big: boolean
}

function rand(n: number): number {
  return Math.floor(Math.random() * n)
}
function hex(n: number): string {
  let s = ''
  for (let i = 0; i < n; i++) s += '0123456789abcdef'[rand(16)]
  return s
}
function randAddr(): string {
  return `0x${hex(2)}…${hex(4)}`
}
const NAME_POOL = [
  'cryptowhale', 'degenking', 'luckyluke', 'moonshot', 'vibesonly', 'plinkogod',
  'highroller', 'satoshi_jr', 'wenlambo', 'apestrong', 'morbfan', 'rngjesus',
  'allin', 'tiltlord', 'greencandle', 'dottedline',
]
function randPlayer(): string {
  return Math.random() < 0.32 ? NAME_POOL[rand(NAME_POOL.length)] : randAddr()
}
/** Plausible win amount — mostly small, occasionally a big one, rounded nicely. */
function randAmount(): number {
  const r = Math.random()
  let v: number
  if (r < 0.6) v = 100 + Math.random() * 2400
  else if (r < 0.9) v = 2500 + Math.random() * 15000
  else v = 15000 + Math.random() * 120000
  const mag = Math.pow(10, Math.max(1, Math.floor(Math.log10(v)) - 1))
  return Math.max(50, Math.round(v / mag) * mag)
}

let SIM_ID = 0
function synth(): Row {
  const g = GAMES[rand(GAMES.length)]
  const amount = randAmount()
  return { id: `sim-${SIM_ID++}`, gameKey: g.key, game: g.label, href: g.href, amount, player: randPlayer(), big: amount >= BIG_WIN }
}

function formatAmount(chips: number): string {
  return Math.round(chips).toLocaleString('en-US', { maximumFractionDigits: 0 })
}
function shortAddr(a: string): string {
  if (!a || a.length < 8) return a || 'Player'
  return `${a.slice(0, 4)}…${a.slice(-4)}`
}

// Deterministic seed for SSR / first client render (no Math.random → no hydration mismatch).
const SEED: Row[] = [
  { id: 'seed-0', gameKey: 'plinko', game: 'Plinko', href: '/plinko2', amount: 12500, player: '0xa1…1b2c', big: false },
  { id: 'seed-1', gameKey: 'keno', game: 'Keno', href: '/keno2', amount: 44000, player: 'rngjesus', big: true },
  { id: 'seed-2', gameKey: 'mines', game: 'Mines', href: '/mines2', amount: 5600, player: '0x77…cd12', big: false },
  { id: 'seed-3', gameKey: 'crash', game: 'Crash', href: '/crash', amount: 9800, player: 'wenlambo', big: false },
  { id: 'seed-4', gameKey: 'blackjack', game: 'Blackjack', href: '/BLACKJACK', amount: 3400, player: '0x9f…99f8', big: false },
  { id: 'seed-5', gameKey: 'limbo', game: 'Limbo', href: '/limbo2', amount: 26000, player: 'highroller', big: true },
  { id: 'seed-6', gameKey: 'dice', game: 'Dice', href: '/dice2', amount: 2150, player: '0x33…7788', big: false },
  { id: 'seed-7', gameKey: 'towers', game: 'Towers', href: '/towers', amount: 6100, player: '0x55…9a0b', big: false },
]

export function RecentWins() {
  const { wins } = useLatestWins()
  const [display, setDisplay] = useState<Row[]>(SEED)

  // Real wins waiting to be surfaced (newest first) + ids already queued.
  const realQueue = useRef<Row[]>([])
  const seenReal = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!wins || wins.length === 0) return
    const fresh: Row[] = []
    for (const w of wins) {
      if (!w.id || seenReal.current.has(w.id)) continue
      seenReal.current.add(w.id)
      const meta = GAME_BY_KEY[w.game]
      fresh.push({
        id: w.id,
        gameKey: w.game,
        game: meta?.label ?? (w.game || 'Game'),
        href: meta?.href,
        amount: w.amount,
        player: w.username || shortAddr(w.address),
        big: w.amount >= BIG_WIN,
      })
    }
    if (fresh.length) realQueue.current = [...fresh, ...realQueue.current].slice(0, 40)
  }, [wins])

  // Self-driving ticker: every ~2–4s, push a new row on top (real if one is
  // waiting, otherwise a synthesized one) so the feed is always rotating.
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    // Keep the deterministic seed for the first paint, then let the ticker
    // cycle it out one row at a time (smoother than swapping all rows at once).
    const tick = () => {
      if (!alive) return
      setDisplay((prev) => {
        const next = realQueue.current.shift() ?? synth()
        return [next, ...prev].slice(0, ROWS)
      })
      timer = setTimeout(tick, 2000 + Math.random() * 2200)
    }
    timer = setTimeout(tick, 1600)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300">Recent wins</span>
        </div>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
          Live
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.92),rgba(9,13,22,0.95))] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)]">
        {/* header */}
        <div className="grid grid-cols-[1.5fr_1fr_auto] items-center gap-2 border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:px-4">
          <span>Game</span>
          <span>Player</span>
          <span className="text-right">Payout</span>
        </div>

        {/* rotating rows */}
        <div className="relative" style={{ height: ROWS * ROW_H }}>
          <AnimatePresence initial={false} mode="popLayout">
            {display.map((r) => (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0, y: -ROW_H * 0.7 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  backgroundColor: ['rgba(16,185,129,0.16)', 'rgba(0,0,0,0)'],
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.5,
                  ease: [0.2, 0.8, 0.2, 1],
                  backgroundColor: { duration: 1.1, ease: 'easeOut' },
                }}
                className="grid grid-cols-[1.5fr_1fr_auto] items-center gap-2 border-b border-white/[0.05] px-3 sm:px-4"
                style={{ height: ROW_H }}
              >
                <a
                  href={r.href ?? '#'}
                  className="flex min-w-0 items-center gap-2.5"
                  {...(r.href ? {} : { 'aria-disabled': true, onClick: (e: React.MouseEvent) => e.preventDefault() })}
                >
                  <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40 ring-1 ring-white/5">
                    <GameArt gameKey={r.gameKey} />
                  </span>
                  <span className="truncate text-[13px] font-semibold text-white/90">{r.game}</span>
                </a>
                <span className="truncate text-[13px] text-slate-400">{r.player}</span>
                <span
                  className={[
                    'flex items-center justify-end gap-1 whitespace-nowrap text-right text-[13px] font-bold tabular-nums',
                    r.big ? 'text-amber-300 drop-shadow-[0_0_8px_rgba(245,197,66,0.45)]' : 'text-emerald-300',
                  ].join(' ')}
                >
                  <span aria-hidden className="text-[9px]">▲</span>
                  {formatAmount(r.amount)}
                  <span className="hidden text-[10px] font-medium text-slate-500 sm:inline">MORBIUS</span>
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          {/* soft fade at the bottom edge to suggest a continuous flow */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#090d16] to-transparent" />
        </div>
      </div>
    </div>
  )
}
