'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { IconBrandTelegram, IconBrandX } from '@tabler/icons-react'
import { PaymentBadges } from '@/components/home/payment-badges'
import { cn } from '@/lib/utils'
import { isAdminWallet } from '@/lib/admin'
import { homeSectionTitleClass, homeSectionTitleGradientClass } from '@/lib/home-section-typography'

type LivePresence = {
  poker: number
  blackjackMulti: number
  blackjack: number
  plinko: number
  keno: number
  lottery: number
  bigWheel: number
}

type PresenceKey = keyof LivePresence

const EMPTY_PRESENCE: LivePresence = {
  poker: 0,
  blackjackMulti: 0,
  blackjack: 0,
  plinko: 0,
  keno: 0,
  lottery: 0,
  bigWheel: 0,
}

function LivePlayersBadge({ count }: { count: number }) {
  return (
    <div
      className="pointer-events-none absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 rounded-full border border-emerald-500/45 bg-black/60 px-2 py-0.5 shadow-[0_0_12px_rgba(16,185,129,0.25)] backdrop-blur-sm"
      aria-label={`${count} connected in this game right now`}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50"
          style={{ animationDuration: '2.2s' }}
        />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.95)]" />
      </span>
      <span className="text-[10px] md:text-[11px] font-semibold tabular-nums text-emerald-100/95">
        {count.toLocaleString()} live
      </span>
    </div>
  )
}

type GameCard = {
  key: string
  href: string
  title: string
  image: string
  imageAlt: string
  titleClassName: string
  badge: string | null
  disabled: boolean
  presenceKey?: PresenceKey
  isGradientCard?: boolean
  customContent?: ReactNode
  accent: string
  accentGlow: string
}

export function GamesSection() {
  const { address } = useAccount()
  const isAdmin = isAdminWallet(address)
  const { data: presence = EMPTY_PRESENCE } = useQuery({
    queryKey: ['livePresence'],
    queryFn: async (): Promise<LivePresence> => {
      const res = await fetch('/api/analytics/live-presence')
      if (!res.ok) return EMPTY_PRESENCE
      const json = (await res.json()) as Partial<LivePresence>
      return {
        poker: Number(json.poker) || 0,
        blackjackMulti: Number(json.blackjackMulti) || 0,
        blackjack: Number(json.blackjack) || 0,
        plinko: Number(json.plinko) || 0,
        keno: Number(json.keno) || 0,
        lottery: Number(json.lottery) || 0,
        bigWheel: Number(json.bigWheel) || 0,
      }
    },
    refetchInterval: 15_000,
    staleTime: 5_000,
  })

  const gameCards: GameCard[] = [
    {
      key: 'blackjack',
      href: '/BLACKJACK',
      title: 'BlackJack',
      image: '/BlackJack/TableBackground1.png',
      imageAlt: 'BlackJack',
      titleClassName: 'text-2xl md:text-4xl font-jost leading-tight',
      badge: 'NEW!',
      disabled: false,
      presenceKey: 'blackjack',
      accent: 'border-cyan-500/40',
      accentGlow: '0 0 40px rgba(6,182,212,0.35), 0 0 80px rgba(6,182,212,0.15)',
    },
    {
      key: 'multiplayer-blackjack',
      href: '/blackjack-multi',
      title: 'Multiplayer Blackjack',
      image: '/morbius/multi-blackjack-screenshot.png',
      imageAlt: 'Multiplayer Blackjack',
      titleClassName: 'text-xl md:text-2xl font-krona-one leading-tight',
      badge: 'NEW!',
      disabled: false,
      presenceKey: 'blackjackMulti',
      accent: 'border-cyan-500/40',
      accentGlow: '0 0 30px rgba(6,182,212,0.3), 0 0 60px rgba(6,182,212,0.1)',
    },
    {
      key: 'plinko',
      href: '/PLINKO',
      title: 'Plinko',
      image: '/morbius/plinkoscreenshot.png',
      imageAlt: 'Plinko',
      titleClassName: 'text-xl md:text-2xl font-autour-one',
      badge: 'NEW!',
      disabled: false,
      presenceKey: 'plinko',
      accent: 'border-cyan-500/40',
      accentGlow: '0 0 30px rgba(6,182,212,0.3), 0 0 60px rgba(6,182,212,0.1)',
    },
    {
      key: 'keno',
      href: '/keno',
      title: 'KENO',
      image: '/morbius/KENOscreenshot.png',
      imageAlt: 'KENO',
      titleClassName: 'text-xl md:text-2xl font-climate-crisis',
      badge: null,
      disabled: false,
      presenceKey: 'keno',
      accent: 'border-cyan-500/40',
      accentGlow: '0 0 30px rgba(6,182,212,0.3), 0 0 60px rgba(6,182,212,0.1)',
    },
    {
      key: 'lotto',
      href: '/lottery',
      title: 'Lotto',
      image: '/morbius/Lottoscreenshot.png',
      imageAlt: 'Mega Morbius Lotto',
      titleClassName: 'text-xl md:text-2xl font-monoton',
      badge: null,
      disabled: false,
      presenceKey: 'lottery',
      accent: 'border-cyan-500/40',
      accentGlow: '0 0 30px rgba(6,182,212,0.3), 0 0 60px rgba(6,182,212,0.1)',
    },
    {
      key: 'coming-soon',
      href: '',
      title: 'More Games Coming Soon',
      image: '/Marketing%20/Hero-Background.jpeg',
      imageAlt: 'More games coming soon',
      titleClassName: 'text-lg md:text-xl font-jost leading-tight',
      badge: null,
      disabled: true,
      accent: 'border-white/10',
      accentGlow: '',
      customContent: (
        <div className="mt-2 flex flex-col items-start gap-2">
          <p className="max-w-[16rem] text-[11px] md:text-xs text-cyan-100/80 leading-relaxed">
            Got a game idea? Reach out on X or Telegram.
          </p>
          <div className="flex items-center gap-2">
            <a
              href="https://x.com/morbius_io"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Morbius on X"
              className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-black/50 border border-cyan-400/40 text-cyan-200 hover:text-white hover:border-cyan-300 transition-colors"
            >
              <IconBrandX size={16} />
            </a>
            <a
              href="https://t.me/morbius_cash"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Morbius on Telegram"
              className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-black/50 border border-cyan-400/40 text-cyan-200 hover:text-white hover:border-cyan-300 transition-colors"
            >
              <IconBrandTelegram size={16} />
            </a>
          </div>
        </div>
      ),
    },
  ]

  function CardBody({ game, className }: { game: GameCard; className?: string }) {
    return (
      <div
        className={cn(
          'group relative overflow-hidden rounded-2xl border bg-slate-900 transition-all duration-300',
          game.accent,
          !game.disabled && 'cursor-pointer hover:scale-[1.02]',
          game.disabled && 'opacity-80 cursor-not-allowed',
          className,
        )}
        style={
          !game.disabled
            ? {
                boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
              }
            : undefined
        }
        onMouseEnter={(e) => {
          if (!game.disabled && game.accentGlow) {
            (e.currentTarget as HTMLElement).style.boxShadow = game.accentGlow
          }
        }}
        onMouseLeave={(e) => {
          if (!game.disabled) {
            (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 24px rgba(0,0,0,0.4)'
          }
        }}
      >
        {/* Background image */}
        <div className="absolute inset-0">
          <Image
            src={game.image}
            alt={game.imageAlt}
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            className={cn(
              'object-cover transition-transform duration-500',
              !game.disabled && 'group-hover:scale-105',
              game.disabled && 'opacity-35 grayscale',
            )}
          />
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

        {/* Accent shimmer on hover */}
        {!game.disabled && (
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-t from-transparent via-transparent to-white/[0.03]" />
        )}

        {/* Live badge */}
        {game.presenceKey != null && !game.disabled && (
          <LivePlayersBadge count={presence[game.presenceKey]} />
        )}

        {/* NEW badge */}
        {game.badge && (
          <div className="absolute top-2.5 right-2.5 z-20 text-[10px] md:text-xs px-2 py-1 rounded-full shadow-lg border bg-gradient-to-r from-cyan-400 to-blue-500 text-white border-cyan-300/50 font-bold">
            {game.badge}
          </div>
        )}

        {/* Payment badges */}
        {!game.disabled && <PaymentBadges />}

        {/* Title + content — bottom left */}
        <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 z-10">
          <h3 className={cn('text-white drop-shadow-lg', game.titleClassName)}>{game.title}</h3>
          {game.customContent}
        </div>
      </div>
    )
  }

  const [featured, bj, plinko, keno, lotto, comingSoon] = gameCards

  return (
    <main className="w-full px-4 py-6 md:py-8 relative z-10" id="games">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h2 className={cn(homeSectionTitleClass, 'mb-2')}>
            <span className={homeSectionTitleGradientClass}>Games</span>
          </h2>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">

          {/* Featured — spans 2 cols and 2 rows on desktop */}
          <div className="col-span-2 md:col-span-2 md:row-span-2">
            <Link href={featured.href} className="block h-full">
              <CardBody game={featured} className="h-[240px] md:h-full" />
            </Link>
          </div>

          {/* BlackJack — right column top */}
          <Link href={bj.href} className="block">
            <CardBody game={bj} className="h-[115px] md:h-[235px]" />
          </Link>

          {/* Plinko — right column bottom */}
          <Link href={plinko.href} className="block">
            <CardBody game={plinko} className="h-[115px] md:h-[235px]" />
          </Link>

          {/* Bottom row — 3 cards */}
          <Link href={keno.href} className="block">
            <CardBody game={keno} className="h-[140px] md:h-[180px]" />
          </Link>

          <Link href={lotto.href} className="block">
            <CardBody game={lotto} className="h-[140px] md:h-[180px]" />
          </Link>

          <div role="group" aria-label="More games coming soon">
            <CardBody game={comingSoon} className="h-[140px] md:h-[180px]" />
          </div>

        </div>
      </div>
    </main>
  )
}
