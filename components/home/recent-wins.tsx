'use client'

import { useMemo } from 'react'
import { useLatestWins } from '@/hooks/use-latest-wins'
import { InfiniteMovingCards, type WinCardItem } from '@/components/ui/infinite-moving-cards'
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

function formatAmount(chips: number): string {
  if (!Number.isFinite(chips)) return '0 MORBIUS'
  return `${Math.round(chips).toLocaleString(undefined, { maximumFractionDigits: 0 })} MORBIUS`
}

function shortAddr(a: string): string {
  if (!a || a.length < 8) return a || 'Player'
  return `${a.slice(0, 4)}…${a.slice(-4)}`
}

/**
 * Fallback shown when the real feed has no recent activity (new platform, quiet
 * period, or local dev where chain/analytics aren't reachable). Real wins from
 * `useLatestWins()` take over automatically the moment any arrive. Static time
 * strings (no Date.now()) keep SSR and client markup identical.
 * To make the ticker real-only, delete this and restore the empty-feed guard.
 */
const FALLBACK_SEED: { key: string; game: string; href: string; amount: string; player: string; time: string }[] = [
  { key: 'poker', game: 'Poker', href: '/poker', amount: '18,250', player: '0x4d…2a01', time: '12s ago' },
  { key: 'plinko', game: 'Plinko', href: '/plinko2', amount: '12,500', player: '0xA1…1b2c', time: '34s ago' },
  { key: 'blackjack', game: 'Blackjack', href: '/BLACKJACK', amount: '3,400', player: '0x9f…99f8', time: '1m ago' },
  { key: 'keno', game: 'Keno', href: '/keno2', amount: '44,000', player: '0xfe…feed', time: '2m ago' },
  { key: 'crash', game: 'Crash', href: '/crash', amount: '9,800', player: '0xbe…ef00', time: '3m ago' },
  { key: 'mines', game: 'Mines', href: '/mines2', amount: '5,600', player: '0x77…cd12', time: '4m ago' },
  { key: 'roulette', game: 'Roulette', href: '/roulette2', amount: '7,200', player: '0x12…ab34', time: '6m ago' },
  { key: 'dice', game: 'Dice', href: '/dice2', amount: '2,150', player: '0x33…7788', time: '8m ago' },
]

export function RecentWins() {
  const { wins } = useLatestWins()

  // Stable ref across useLatestWins polling so the marquee isn't re-cloned/reset.
  const items = useMemo<WinCardItem[]>(() => {
    if (wins && wins.length > 0) {
      // Collapse consecutive wins from the same wallet so one hot player (e.g. plinko
      // spam) can't fill the marquee with back-to-back cards.
      const deduped: typeof wins = []
      let lastAddr = ''
      for (const w of wins) {
        const addr = (w.address || '').toLowerCase()
        if (addr && addr === lastAddr) continue
        deduped.push(w)
        lastAddr = addr
      }
      return deduped.slice(0, 16).map((w) => {
        const meta = GAME_META[w.game]
        return {
          id: w.id,
          game: meta?.label ?? w.game,
          amount: `+${formatAmount(w.amount)}`,
          player: w.username || shortAddr(w.address),
          href: meta?.href,
          art: <GameArt gameKey={w.game} />,
        }
      })
    }
    return FALLBACK_SEED.map((f) => ({
      id: `fb-${f.key}`,
      game: f.game,
      amount: `+${f.amount} MORBIUS`,
      player: f.player,
      href: f.href,
      art: <GameArt gameKey={f.key} />,
    }))
  }, [wins])

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Recent wins</span>
      </div>
      <InfiniteMovingCards items={items} variant="win" speed="slow" className="w-full" />
    </div>
  )
}
