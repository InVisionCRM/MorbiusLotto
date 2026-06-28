'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useLatestWins } from '@/hooks/use-latest-wins'
import { GameArt } from './game-art'

/** Map a game key (derived from the chip-ledger payout reason) to its display label + lobby route. */
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

const ROWS = 9

function formatAmount(chips: number): string {
  if (!Number.isFinite(chips)) return '0'
  return Math.round(chips).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function shortAddr(a: string): string {
  if (!a || a.length < 8) return a || 'Player'
  return `${a.slice(0, 4)}…${a.slice(-4)}`
}

function relTime(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

interface Row {
  id: string
  gameKey: string
  game: string
  href?: string
  amount: number
  player: string
  at: number
}

/** Static fallback when the live feed is empty (new platform / quiet period / local dev). */
const FALLBACK: Row[] = [
  { id: 'fb-plinko', gameKey: 'plinko', game: 'Plinko', href: '/plinko2', amount: 12500, player: '0xA1…1b2c', at: 0 },
  { id: 'fb-keno', gameKey: 'keno', game: 'Keno', href: '/keno2', amount: 44000, player: '0xfe…feed', at: 0 },
  { id: 'fb-blackjack', gameKey: 'blackjack', game: 'Blackjack', href: '/BLACKJACK', amount: 3400, player: '0x9f…99f8', at: 0 },
  { id: 'fb-crash', gameKey: 'crash', game: 'Crash', href: '/crash', amount: 9800, player: '0xbe…ef00', at: 0 },
  { id: 'fb-mines', gameKey: 'mines', game: 'Mines', href: '/mines2', amount: 5600, player: '0x77…cd12', at: 0 },
  { id: 'fb-roulette', gameKey: 'roulette', game: 'Roulette', href: '/roulette2', amount: 7200, player: '0x12…ab34', at: 0 },
  { id: 'fb-dice', gameKey: 'dice', game: 'Dice', href: '/dice2', amount: 2150, player: '0x33…7788', at: 0 },
  { id: 'fb-towers', gameKey: 'towers', game: 'Towers', href: '/towers', amount: 6100, player: '0x55…9a0b', at: 0 },
  { id: 'fb-chicken', gameKey: 'chicken', game: 'Chicken', href: '/chicken', amount: 1800, player: '0x21…ccaa', at: 0 },
]

export function RecentWins() {
  const { wins } = useLatestWins()

  const rows = useMemo<Row[]>(() => {
    if (wins && wins.length > 0) {
      // Show every win, newest first (same player repeatedly is normal and
      // expected in a live feed) — just guard against exact duplicate ids.
      const seenIds = new Set<string>()
      const out: Row[] = []
      for (const w of wins) {
        if (w.id && seenIds.has(w.id)) continue
        seenIds.add(w.id)
        const meta = GAME_META[w.game]
        out.push({
          id: w.id,
          gameKey: w.game,
          game: meta?.label ?? (w.game || 'Game'),
          href: meta?.href,
          amount: w.amount,
          player: w.username || shortAddr(w.address),
          at: w.timestamp,
        })
        if (out.length >= ROWS) break
      }
      return out
    }
    return FALLBACK.slice(0, ROWS)
  }, [wins])

  // Flash rows that are new since the last update (the "keeps updating" feel).
  const seen = useRef<Set<string>>(new Set())
  const firstRender = useRef(true)
  const isNew = (id: string) => !firstRender.current && !seen.current.has(id)
  useEffect(() => {
    rows.forEach((r) => seen.current.add(r.id))
    firstRender.current = false
  }, [rows])

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Recent wins</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.9),rgba(11,16,26,0.92))]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 font-semibold sm:px-4">Game</th>
              <th className="px-3 py-2 font-semibold sm:px-4">Player</th>
              <th className="hidden px-3 py-2 text-right font-semibold sm:table-cell sm:px-4">Time</th>
              <th className="px-3 py-2 text-right font-semibold sm:px-4">Payout</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={[
                  'border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]',
                  isNew(r.id) ? 'recent-row-in' : '',
                ].join(' ')}
              >
                <td className="px-3 py-2 sm:px-4">
                  <a
                    href={r.href ?? '#'}
                    className="flex items-center gap-2.5"
                    {...(r.href ? {} : { 'aria-disabled': true, onClick: (e) => e.preventDefault() })}
                  >
                    <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/40">
                      <GameArt gameKey={r.gameKey} />
                    </span>
                    <span className="truncate font-medium text-white/90 hover:text-white">{r.game}</span>
                  </a>
                </td>
                <td className="max-w-[8rem] truncate px-3 py-2 text-slate-400 sm:px-4">{r.player}</td>
                <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-500 sm:table-cell sm:px-4">
                  {r.at ? `${relTime(r.at)} ago` : '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums text-amber-300 sm:px-4">
                  +{formatAmount(r.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
