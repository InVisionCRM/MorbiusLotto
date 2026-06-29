'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLatestWins } from '@/hooks/use-latest-wins'
import { GameArt } from './game-art'

/** Game key → label + lobby route (for display + the icon). */
const GAME_META: Record<string, { label: string; href: string }> = {
  blackjack: { label: 'Blackjack', href: '/BLACKJACK' },
  'blackjack-multi': { label: 'Blackjack', href: '/blackjack-multi' },
  plinko: { label: 'Plinko', href: '/plinko2' },
  keno: { label: 'Keno', href: '/keno2' },
  'video-poker': { label: 'Video Poker', href: '/video-poker' },
  limbo: { label: 'Limbo', href: '/limbo2' },
  mines: { label: 'Mines', href: '/mines2' },
  hilo: { label: 'Hi-Lo', href: '/hilo' },
  dice: { label: 'Dice', href: '/dice2' },
  dicex2: { label: 'Dice x2', href: '/dicex2' },
  craps: { label: 'Craps', href: '/craps' },
  baccarat: { label: 'Baccarat', href: '/baccarat' },
  crash: { label: 'Crash', href: '/crash' },
  roulette: { label: 'Roulette', href: '/roulette2' },
  towers: { label: 'Towers', href: '/towers' },
  chicken: { label: 'Chicken', href: '/chicken' },
  'dragon-tiger': { label: 'Dragon Tiger', href: '/dragon-tiger' },
  'andar-bahar': { label: 'Andar Bahar', href: '/andar-bahar' },
  pachinko: { label: 'Pachinko', href: '/pachinko' },
  cascade: { label: 'Cascade', href: '/cascade' },
  firewalk: { label: 'Firewalk', href: '/firewalk' },
  heist: { label: 'Heist', href: '/heist' },
  'three-card-poker': { label: 'Three Card Poker', href: '/three-card-poker' },
  'greed-dice': { label: 'Greed Dice', href: '/greed-dice' },
  cipher: { label: 'Cipher', href: '/cipher' },
}

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
type DisplayRow = Row & { key: string }

function formatAmount(chips: number): string {
  return Math.round(chips).toLocaleString('en-US', { maximumFractionDigits: 0 })
}
function shortAddr(a: string): string {
  if (!a || a.length < 8) return a || 'Player'
  return `${a.slice(0, 4)}…${a.slice(-4)}`
}
function prettify(key: string): string {
  return key ? key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Game'
}
function toRow(w: { id: string; game: string; amount: number; username: string | null; address: string }): Row {
  const meta = GAME_META[w.game]
  return {
    id: w.id,
    gameKey: w.game,
    game: meta?.label ?? prettify(w.game),
    href: meta?.href,
    amount: w.amount,
    player: w.username || shortAddr(w.address),
    big: w.amount >= BIG_WIN,
  }
}

export function RecentWins() {
  const { wins } = useLatestWins()

  const [display, setDisplay] = useState<DisplayRow[]>([])
  const poolRef = useRef<Row[]>([]) // real wins, newest first (the time-window list)
  const cursorRef = useRef(0) // rotation pointer into the pool
  const seqRef = useRef(0) // makes display keys unique even when a win repeats
  const seenRef = useRef<Set<string>>(new Set())

  const withKey = (r: Row): DisplayRow => ({ ...r, key: `${r.id}#${seqRef.current++}` })

  // Keep the pool in sync with the live feed; surface genuinely-new wins at the
  // top immediately. (Honest: every row is a real win from the feed.)
  useEffect(() => {
    if (!wins) return
    const rows = wins.filter((w) => w.amount > 0).map(toRow)
    poolRef.current = rows

    const newOnes = rows.filter((r) => r.id && !seenRef.current.has(r.id))
    rows.forEach((r) => seenRef.current.add(r.id))

    setDisplay((prev) => {
      if (prev.length === 0) {
        // First fill: newest N from the window.
        cursorRef.current = Math.min(ROWS, rows.length)
        return rows.slice(0, ROWS).map(withKey)
      }
      if (newOnes.length === 0) return prev
      // Pop new real wins on top, newest last-in-array first.
      const incoming = newOnes.slice(0, ROWS).reverse().map(withKey).reverse()
      return [...incoming, ...prev].slice(0, ROWS)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wins])

  // Rotate through the real time-window list so the feed keeps moving even
  // between fresh wins. No fabricated rows — it cycles your real history.
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      if (!alive) return
      const pool = poolRef.current
      if (pool.length > 0) {
        const item = pool[cursorRef.current % pool.length]
        cursorRef.current = (cursorRef.current + 1) % pool.length
        setDisplay((prev) => [withKey(item), ...prev].slice(0, ROWS))
      }
      timer = setTimeout(tick, 2600 + Math.random() * 1800)
    }
    timer = setTimeout(tick, 2600)
    return () => {
      alive = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const empty = display.length === 0

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
        <div className="grid grid-cols-[1.5fr_1fr_auto] items-center gap-2 border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:px-4">
          <span>Game</span>
          <span>Player</span>
          <span className="text-right">Payout</span>
        </div>

        <div className="relative" style={{ height: ROWS * ROW_H }}>
          {empty ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-500">
              No wins yet — be the first.
            </div>
          ) : (
            <AnimatePresence initial={false} mode="popLayout">
              {display.map((r) => (
                <motion.div
                  key={r.key}
                  layout
                  initial={{ opacity: 0, y: -ROW_H * 0.7 }}
                  animate={{ opacity: 1, y: 0, backgroundColor: ['rgba(16,185,129,0.16)', 'rgba(0,0,0,0)'] }}
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
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#090d16] to-transparent" />
        </div>
      </div>
    </div>
  )
}
