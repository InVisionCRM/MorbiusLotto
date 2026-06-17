'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { ArrowDownToLine, ArrowRight, CircleHelp, FileText, LayoutDashboard, Search, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GameArt } from './game-art'
import { RecentWins } from './recent-wins'

const PRIMARY_BTN =
  'inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-[13px] font-bold text-[#04222b] shadow-[0_10px_30px_-10px_rgba(6,182,212,0.7)] transition-colors hover:bg-cyan-400'
const OUTLINE_BTN =
  'inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2.5 text-[13px] font-bold text-slate-200 transition-colors hover:border-cyan-400/50 hover:text-white'

function fireEvent(name: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(name))
}

type GameTag = 'originals' | 'cards' | 'table' | 'live' | 'dice'

type Game = {
  key: string
  title: string
  /** Small uppercase label under the title, e.g. "MORBIUS ORIGINALS". */
  kicker: string
  href: string
  /** Display font family for this tile's title — each game gets its own. */
  font: string
  tags: GameTag[]
  badge?: string
}

// Wide display faces need a touch less size / tracking so long titles fit the tile.
const WIDE_FONTS = new Set(['"Bungee"', '"Bowlby One SC"'])

const GAMES: Game[] = [
  { key: 'blackjack', title: 'Blackjack', kicker: 'Card Game', href: '/BLACKJACK', font: '"Bowlby One SC"', tags: ['cards'] },
  { key: 'plinko', title: 'Plinko', kicker: 'Morbius Originals', href: '/plinko2', font: '"Titan One"', tags: ['originals'] },
  { key: 'mines', title: 'Mines', kicker: 'Morbius Originals', href: '/mines2', font: '"Bungee"', tags: ['originals'] },
  { key: 'keno', title: 'Keno', kicker: 'Morbius Originals', href: '/keno2', font: '"Monoton"', tags: ['originals'] },
  { key: 'poker', title: 'Poker', kicker: 'Live Table', href: '/poker', font: '"Rye"', tags: ['live', 'cards'] },
  { key: 'dice', title: 'Dice', kicker: 'Morbius Originals', href: '/dice2', font: '"Bangers"', tags: ['originals', 'dice'] },
  { key: 'crash', title: 'Crash', kicker: 'Morbius Originals', href: '/crash', font: '"Bungee"', tags: ['originals'], badge: 'New' },
  { key: 'chicken', title: 'Chicken', kicker: 'Morbius Originals', href: '/chicken', font: '"Bangers"', tags: ['originals'] },
  { key: 'limbo', title: 'Limbo', kicker: 'Morbius Originals', href: '/limbo2', font: '"Monoton"', tags: ['originals'] },
  { key: 'towers', title: 'Towers', kicker: 'Morbius Originals', href: '/towers', font: '"Titan One"', tags: ['originals'] },
  { key: 'roulette', title: 'Roulette', kicker: 'Table Game', href: '/roulette2', font: '"Rye"', tags: ['table'] },
  { key: 'baccarat', title: 'Baccarat', kicker: 'Table Game', href: '/baccarat', font: '"Shrikhand"', tags: ['table', 'cards'] },
  { key: 'hilo', title: 'Hi-Lo', kicker: 'Card Game', href: '/hilo', font: '"Lilita One"', tags: ['cards'] },
  { key: 'wheel', title: 'Wheel', kicker: 'Morbius Originals', href: '/wheel', font: '"Monoton"', tags: ['originals'] },
  { key: 'video-poker', title: 'Video Poker', kicker: 'Card Game', href: '/video-poker', font: '"Lilita One"', tags: ['cards'] },
  { key: 'dicex2', title: 'Dice X2', kicker: 'Morbius Originals', href: '/dicex2', font: '"Bungee"', tags: ['originals', 'dice'], badge: 'New' },
  { key: 'dragon-tiger', title: 'Dragon Tiger', kicker: 'Table Game', href: '/dragon-tiger', font: '"Rye"', tags: ['table', 'cards'], badge: 'New' },
  { key: 'andar-bahar', title: 'Andar Bahar', kicker: 'Table Game', href: '/andar-bahar', font: '"Rye"', tags: ['table', 'cards'], badge: 'New' },
  { key: 'pachinko', title: 'Pachinko', kicker: 'Morbius Originals', href: '/pachinko', font: '"Titan One"', tags: ['originals'], badge: 'New' },
  { key: 'cascade', title: 'Cascade', kicker: 'Morbius Originals', href: '/cascade', font: '"Monoton"', tags: ['originals'], badge: 'New' },
  { key: 'firewalk', title: 'Firewalk', kicker: 'Morbius Originals', href: '/firewalk', font: '"Bangers"', tags: ['originals'], badge: 'New' },
  { key: 'heist', title: 'Heist', kicker: 'Morbius Originals', href: '/heist', font: '"Bungee"', tags: ['originals'], badge: 'New' },
  { key: 'three-card-poker', title: 'Three Card Poker', kicker: 'Card Game', href: '/three-card-poker', font: '"Rye"', tags: ['cards'], badge: 'New' },
  { key: 'greed-dice', title: 'Greed Dice', kicker: 'Morbius Originals', href: '/greed-dice', font: '"Bangers"', tags: ['originals', 'dice'], badge: 'New' },
  { key: 'cipher', title: 'Cipher', kicker: 'Morbius Originals', href: '/cipher', font: '"Monoton"', tags: ['originals'], badge: 'New' },
  { key: 'craps', title: 'Craps', kicker: 'Table Game', href: '/craps', font: '"Rye"', tags: ['table', 'dice'] },
  { key: 'blackjack-multi', title: 'Multiplayer', kicker: 'Live Blackjack', href: '/blackjack-multi', font: '"Bowlby One SC"', tags: ['live', 'cards'] },
  { key: 'lottery', title: 'Lottery', kicker: 'Morbius Originals', href: '/lottery', font: '"Shrikhand"', tags: ['originals'] },
  { key: 'monte', title: 'Monte', kicker: 'Free Play', href: '/monte', font: '"Shrikhand"', tags: ['originals'] },
]

const FILTERS: { key: GameTag | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'originals', label: 'Originals' },
  { key: 'cards', label: 'Cards' },
  { key: 'table', label: 'Table' },
  { key: 'live', label: 'Live' },
]

export function GamesSection({ welcomeName }: { welcomeName?: string | null }) {
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<GameTag | 'all'>('all')

  const games = useMemo(() => {
    const q = query.trim().toLowerCase()
    return GAMES.filter((g) => {
      const matchesFilter = activeFilter === 'all' || g.tags.includes(activeFilter)
      const matchesQuery = q === '' || g.title.toLowerCase().includes(q)
      return matchesFilter && matchesQuery
    })
  }, [query, activeFilter])

  return (
    <main className="w-full px-4 pb-8 pt-4 md:pt-6 relative z-10" id="games">
      <div className="mx-auto max-w-7xl">
        <LobbyHero welcomeName={welcomeName} />

        <RecentWins />

        {/* Header: title + search */}
        <div className="mb-4 mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-russo-one text-2xl font-bold tracking-tight text-white md:text-3xl">Games</h2>

          <label className="relative w-full sm:w-72">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search games"
              aria-label="Search games"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-9 pr-3 text-[13px] text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:border-cyan-400/50 focus:bg-white/[0.05]"
            />
          </label>
        </div>

        {/* Filter chips */}
        <div className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = activeFilter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setActiveFilter(f.key)}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
                  active
                    ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200'
                    : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200',
                )}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Grid */}
        {games.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] py-16 text-center text-[13px] text-slate-400">
            No games match “{query}”.
          </div>
        ) : (
          <div
            id="games-grid"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6"
          >
            {games.map((game) => (
              <GameTile key={game.key} game={game} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function LobbyHero({ welcomeName }: { welcomeName?: string | null }) {
  const { address, isConnected } = useAccount()
  const { open: openConnectModal } = useAppKit()
  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-white/10"
      style={{
        background:
          'radial-gradient(120% 140% at 12% 0%, rgba(34,211,238,0.16), transparent 50%), linear-gradient(120deg, #0c1626 0%, #0a0f1a 55%, #090d16 100%)',
      }}
    >
      {/* faint grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '38px 38px',
          maskImage: 'radial-gradient(120% 120% at 80% 0%, #000 30%, transparent 75%)',
        }}
        aria-hidden
      />

      {/* cyan glow behind the logo */}
      <div
        className="pointer-events-none absolute left-[-80px] top-1/2 hidden h-[440px] w-[440px] -translate-y-1/2 rounded-full md:block"
        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.18), rgba(34,211,238,0.04) 44%, transparent 70%)' }}
        aria-hidden
      />

      {/* faded XL Morbius logo — far-left watermark */}
      <div
        className="pointer-events-none absolute left-0 top-1/2 z-0 hidden md:block"
        style={{
          height: 'clamp(320px, 40vw, 540px)',
          aspectRatio: '1 / 1',
          transform: 'translate(-20%, -50%)',
          backgroundImage: 'url("/morbius/OfficialMorbiusLogo.png")',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          opacity: 0.5,
          filter: 'brightness(1.4) saturate(1.1) drop-shadow(0 0 60px rgba(124,58,237,0.55))',
          WebkitMaskImage: 'linear-gradient(to right, #000 42%, rgba(0,0,0,0.3) 70%, transparent 88%)',
          maskImage: 'linear-gradient(to right, #000 42%, rgba(0,0,0,0.3) 70%, transparent 88%)',
        }}
        aria-hidden
      />

      <div className="relative flex flex-col gap-6 p-6 sm:p-8 md:flex-row md:items-stretch md:justify-between md:gap-8 md:p-10">
        <div className="flex flex-col justify-center md:w-[42%] md:shrink-0 md:pl-[70px] lg:pl-[90px]">
          <h1
            className="text-white"
            style={{ fontFamily: '"Mitr", sans-serif', fontWeight: 700, fontSize: 'clamp(26px, 4.2vw, 44px)', lineHeight: 1.04, letterSpacing: '-0.02em' }}
          >
            Welcome to{' '}
            <span className="bg-gradient-to-r from-cyan-300 to-cyan-500 bg-clip-text text-transparent">Morbius.io</span>
            {welcomeName && (
              <span className="mt-1.5 block text-cyan-200" style={{ fontSize: 'clamp(18px, 2.6vw, 28px)' }}>
                {welcomeName}
              </span>
            )}
          </h1>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <button type="button" onClick={() => fireEvent('sophie:open_deposit_withdraw')} className={PRIMARY_BTN}>
              <ArrowDownToLine size={16} />
              Deposit
            </button>
            {isConnected && address ? (
              <Link href={`/player/${address}`} className={OUTLINE_BTN}>
                <LayoutDashboard size={16} />
                My Dashboard
              </Link>
            ) : (
              <button type="button" onClick={() => openConnectModal?.()} className={OUTLINE_BTN}>
                <LayoutDashboard size={16} />
                My Dashboard
              </button>
            )}
            {/* Placeholder buttons — to be wired up later */}
            <button type="button" className={OUTLINE_BTN}>
              <FileText size={16} />
              Documentation
            </button>
            <button type="button" className={OUTLINE_BTN}>
              <CircleHelp size={16} />
              How to Play
            </button>
            <button type="button" className={OUTLINE_BTN}>
              <Zap size={16} />
              QuickStart
            </button>
          </div>
        </div>

        {/* Featured game quick-links — fill the right side */}
        <div className="hidden flex-1 items-stretch gap-3 md:flex lg:gap-4">
          <HeroFeatureCard
            href="/BLACKJACK"
            gameKey="blackjack"
            kicker="Classic Table"
            title="Blackjack"
            subtitle="Hit, stand, double — beat the dealer to 21."
            badge="Classic"
          />
          <HeroFeatureCard
            href="/poker"
            gameKey="poker"
            kicker="Texas Hold'em"
            title="Poker"
            subtitle="Live cash games & tournaments."
            badge="Live"
            live
          />
          <RotatingHotCard className="hidden min-[920px]:block" />
        </div>
      </div>
    </section>
  )
}

function HeroFeatureCard({
  href,
  gameKey,
  kicker,
  title,
  subtitle,
  badge,
  live = false,
  hot = false,
  className,
}: {
  href: string
  gameKey: string
  kicker: string
  title: string
  subtitle: string
  badge: string
  live?: boolean
  hot?: boolean
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-label={`Play ${title}`}
      className={cn(
        'group relative block h-full min-h-[230px] flex-1 overflow-hidden rounded-2xl border border-white/10 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70',
        className,
      )}
    >
      <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.05]">
        <GameArt gameKey={gameKey} />
      </div>
      {/* accent glow + legibility scrim */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(95% 65% at 50% 0%, rgba(34,211,238,0.16), transparent 62%)' }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(3,7,12,0.05) 0%, rgba(3,7,12,0.5) 50%, rgba(3,7,12,0.95) 100%)' }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.85), transparent)' }}
        aria-hidden
      />

      <div className="absolute left-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
        {(live || hot) && (
          <span className="relative flex h-1.5 w-1.5">
            <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full', hot ? 'bg-amber-400/70' : 'bg-emerald-400/70')} />
            <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', hot ? 'bg-amber-400' : 'bg-emerald-400')} />
          </span>
        )}
        {badge}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4 lg:p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/85">{kicker}</div>
        <h3
          className="mt-1 text-white"
          style={{ fontFamily: '"Mitr", sans-serif', fontWeight: 700, fontSize: 'clamp(22px, 2.3vw, 30px)', lineHeight: 1.04, letterSpacing: '-0.01em' }}
        >
          {title}
        </h3>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-slate-300/75">{subtitle}</p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-sm transition-colors group-hover:bg-cyan-500 group-hover:text-[#04222b]">
          Play now <ArrowRight size={13} />
        </span>
      </div>
    </Link>
  )
}

/** Games the "Hot" hero card softly rotates through. */
const HOT_GAMES = [
  { href: '/crash', gameKey: 'crash', kicker: 'Morbius Originals', title: 'Crash', subtitle: 'Ride the multiplier, cash out in time.' },
  { href: '/plinko2', gameKey: 'plinko', kicker: 'Morbius Originals', title: 'Plinko', subtitle: 'Drop the ball, chase the buckets.' },
  { href: '/mines2', gameKey: 'mines', kicker: 'Morbius Originals', title: 'Mines', subtitle: 'Dodge the bombs, bank your win.' },
  { href: '/keno2', gameKey: 'keno', kicker: 'Morbius Originals', title: 'Keno', subtitle: 'Mark your numbers, hit the draw.' },
  { href: '/dice2', gameKey: 'dice', kicker: 'Morbius Originals', title: 'Dice', subtitle: 'Pick your odds, roll to win.' },
  { href: '/limbo2', gameKey: 'limbo', kicker: 'Morbius Originals', title: 'Limbo', subtitle: 'Set a target, beat the multiplier.' },
] as const

/** The 3rd hero card — softly fades to a new game every few seconds. */
function RotatingHotCard({ className }: { className?: string }) {
  const [idx, setIdx] = useState(0)
  const [fading, setFading] = useState(false)
  useEffect(() => {
    let swap: ReturnType<typeof setTimeout>
    const id = setInterval(() => {
      setFading(true) // fade out
      swap = setTimeout(() => {
        setIdx((i) => (i + 1) % HOT_GAMES.length) // swap while invisible
        setFading(false) // fade back in
      }, 500)
    }, 4500)
    return () => {
      clearInterval(id)
      clearTimeout(swap)
    }
  }, [])
  const g = HOT_GAMES[idx]
  return (
    <div className={cn('relative flex-1', className)}>
      <div className="h-full transition-opacity duration-500 ease-in-out" style={{ opacity: fading ? 0 : 1 }}>
        <HeroFeatureCard {...g} badge="Hot" hot />
      </div>
    </div>
  )
}

function GameTile({ game }: { game: Game }) {
  const wide = WIDE_FONTS.has(game.font)
  return (
    <Link href={game.href} aria-label={`${game.title} — ${game.kicker}`} className="group block focus:outline-none">
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-cyan-400/50 group-focus-visible:ring-2 group-focus-visible:ring-cyan-400/70">
        {/* generated art */}
        <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.06]">
          <GameArt gameKey={game.key} />
        </div>

        {/* hover hairline */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.85), transparent)' }}
          aria-hidden
        />

        {/* badge */}
        {game.badge && (
          <div
            className="absolute right-2.5 top-2.5 rounded-full bg-cyan-400 px-2 py-0.5 text-[9px] font-bold uppercase text-[#04222b] shadow"
            style={{ letterSpacing: '0.12em' }}
          >
            {game.badge}
          </div>
        )}

        {/* scrim + title */}
        <div
          className="absolute inset-x-0 bottom-0 px-3 pb-2.5 pt-10"
          style={{ background: 'linear-gradient(180deg, rgba(5,8,14,0) 0%, rgba(5,8,14,0.55) 42%, rgba(5,8,14,0.93) 100%)' }}
        >
          <h3
            className="truncate text-white"
            style={{
              fontFamily: `${game.font}, "Mitr", sans-serif`,
              fontSize: wide ? 'clamp(13px, 1.5vw, 18px)' : 'clamp(15px, 1.7vw, 21px)',
              lineHeight: 1.05,
              letterSpacing: wide ? '0' : '0.01em',
              textShadow: '0 2px 10px rgba(0,0,0,0.65)',
            }}
          >
            {game.title}
          </h3>
          <div
            className="mt-0.5 truncate text-[9px] font-bold uppercase text-slate-300/70 transition-colors group-hover:text-cyan-300/80"
            style={{ letterSpacing: '0.16em' }}
          >
            {game.kicker}
          </div>
        </div>
      </div>
    </Link>
  )
}
