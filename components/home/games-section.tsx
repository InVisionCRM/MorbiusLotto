'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { IconBrandTelegram, IconBrandX } from '@tabler/icons-react'
import { Carousel } from '@/components/ui/apple-cards-carousel'
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

  const baseCardClassName =
    'relative overflow-hidden rounded-3xl h-72 w-52 md:h-[30rem] md:w-96 transition-all duration-300 bg-gradient-to-br from-slate-900 to-slate-800 border border-cyan-500/30 shadow-2xl'

  const gameCards: Array<{
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
  }> = [
    {
      key: 'multiplayer-blackjack',
      href: '/blackjack-multi',
      title: 'Multiplayer Blackjack',
      image: '/morbius/multi-blackjack-screenshot.png',
      imageAlt: 'Multiplayer Blackjack',
      titleClassName: 'text-lg md:text-2xl font-krona-one leading-tight',
      badge: 'NEW!' as string | null,
      disabled: false,
      presenceKey: 'blackjackMulti',
    },
    {
      key: 'blackjack',
      href: '/BLACKJACK',
      title: 'BlackJack',
      image: '/BlackJack/TableBackground1.png',
      imageAlt: 'BlackJack',
      titleClassName: 'text-xl md:text-3xl font-jost',
      badge: 'NEW!' as string | null,
      disabled: false,
      presenceKey: 'blackjack',
    },
    {
      key: 'plinko',
      href: '/PLINKO',
      title: 'Plinko',
      image: '/morbius/plinkoscreenshot.png',
      imageAlt: 'Plinko',
      titleClassName: 'text-xl md:text-3xl font-autour-one',
      badge: 'NEW!' as string | null,
      disabled: false,
      presenceKey: 'plinko',
    },
    {
      key: 'keno',
      href: '/keno',
      title: 'KENO',
      image: '/morbius/KENOscreenshot.png',
      imageAlt: 'KENO',
      titleClassName: 'text-xl md:text-3xl font-climate-crisis',
      badge: null as string | null,
      disabled: false,
      presenceKey: 'keno',
    },
    {
      key: 'lotto',
      href: '/lottery',
      title: 'Lotto',
      image: '/morbius/Lottoscreenshot.png',
      imageAlt: 'Mega Morbius Lotto',
      titleClassName: 'text-xl md:text-3xl font-monoton',
      badge: null as string | null,
      disabled: false,
      presenceKey: 'lottery',
    },
    {
      key: 'coming-soon',
      href: '',
      title: 'More Games Coming Soon',
      image: '/Marketing%20/Hero-Background.jpeg',
      imageAlt: 'More games coming soon',
      titleClassName: 'text-lg md:text-2xl font-jost leading-tight',
      badge: null as string | null,
      disabled: true,
      customContent: (
        <div className="mt-2 flex flex-col items-center gap-2 text-center">
          <p className="max-w-[16rem] text-[11px] md:text-xs text-cyan-100/90 leading-relaxed">
            Got a game you really want to see on Morbius? Reach out to us directly on X.com or Telegram and
            we will do our best to get it added!
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

  const items = gameCards.map((game) => {
    const cardBody = (
      <div className={cn(baseCardClassName, game.disabled && 'opacity-90 cursor-not-allowed')}>
        {game.presenceKey != null && !game.disabled ? (
          <LivePlayersBadge count={presence[game.presenceKey]} />
        ) : null}
        {game.badge ? (
          <div
            className={cn(
              'absolute top-2.5 right-2.5 md:top-3 md:right-3 z-20 text-[10px] md:text-xs px-2 py-1 rounded-full shadow-lg border',
              game.disabled
                ? 'bg-black/55 text-amber-200/95 border-amber-500/40 font-semibold'
                : 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white border-cyan-300/50 font-bold',
            )}
          >
            {game.badge}
          </div>
        ) : null}

        <div className="absolute inset-0">
          {game.isGradientCard ? (
            <div className="h-full w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
          ) : (
            <Image
              src={game.image}
              alt={game.imageAlt}
              fill
              sizes="(max-width: 768px) 208px, 384px"
              className={cn(
                'object-cover',
                game.disabled ? 'opacity-40 grayscale' : 'opacity-95',
              )}
            />
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
        {game.isGradientCard ? (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.2),transparent_65%)]" />
        ) : null}

        {!game.disabled ? <PaymentBadges /> : null}

        <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <h3 className={cn('text-white drop-shadow-lg', game.titleClassName)}>{game.title}</h3>
          {'customContent' in game && game.customContent ? game.customContent : null}
        </div>
      </div>
    )

    if (game.disabled || !game.href) {
      return (
        <div
          key={game.key}
          className="block"
          role="group"
          aria-label={`${game.title} — under construction`}
        >
          {cardBody}
        </div>
      )
    }

    return (
      <Link key={game.key} href={game.href} className="block">
        {cardBody}
      </Link>
    )
  })

  return (
    <main className="w-full px-4 py-6 md:py-8 relative z-10 overflow-hidden" id="games">
      <div className="relative">
        <div className="text-center mb-8">
          <h2 className={cn(homeSectionTitleClass, 'mb-2')}>
            <span className={homeSectionTitleGradientClass}>Games</span>
          </h2>
        </div>

        <Carousel items={items} />
      </div>
    </main>
  )
}
