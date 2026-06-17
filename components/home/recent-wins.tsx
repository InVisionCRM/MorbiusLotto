'use client'

import { useMemo } from 'react'
import { formatEther } from 'viem'
import { useLatestWins, type GameType } from '@/hooks/use-latest-wins'
import { InfiniteMovingCards, type WinCardItem } from '@/components/ui/infinite-moving-cards'
import { GameArt } from './game-art'

/** Map the on-chain win game label to a lobby game (art + route). */
const GAME_META: Record<GameType, { key: string; href: string }> = {
  Plinko: { key: 'plinko', href: '/plinko2' },
  Blackjack: { key: 'blackjack', href: '/BLACKJACK' },
  'Big Wheel': { key: 'wheel', href: '/wheel' },
  Lottery: { key: 'lottery', href: '/lottery' },
  Keno: { key: 'keno', href: '/keno2' },
}

function formatAmount(wei: bigint): string {
  const n = Number(formatEther(wei))
  if (!Number.isFinite(n)) return '0 MORBIUS'
  const v =
    n >= 1
      ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return `${v} MORBIUS`
}

function shortAddr(a: string): string {
  if (!a || a.length < 8) return a || 'Player'
  return `${a.slice(0, 4)}…${a.slice(-4)}`
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
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
  const items = useMemo<WinCardItem[]>(
    () =>
      wins && wins.length > 0
        ? wins.slice(0, 16).map((w) => {
            const meta = GAME_META[w.game]
            return {
              id: w.id,
              game: w.game,
              amount: `+${formatAmount(w.amount)}`,
              player: shortAddr(w.address),
              timeAgo: timeAgo(w.timestamp),
              href: meta?.href,
              art: meta ? <GameArt gameKey={meta.key} /> : undefined,
            }
          })
        : FALLBACK_SEED.map((f) => ({
            id: `fb-${f.key}`,
            game: f.game,
            amount: `+${f.amount} MORBIUS`,
            player: f.player,
            timeAgo: f.time,
            href: f.href,
            art: <GameArt gameKey={f.key} />,
          })),
    [wins],
  )

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
