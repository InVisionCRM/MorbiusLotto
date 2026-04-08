'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { IconBrandTelegram, IconBrandX } from '@tabler/icons-react'
import { PaymentBadges } from '@/components/home/payment-badges'
import { cn } from '@/lib/utils'
import { homeSectionTitleClass, homeSectionTitleGradientClass } from '@/lib/home-section-typography'

type GameCard = {
  key: string
  href: string
  title: string
  image: string
  imageAlt: string
  titleClassName: string
  disabled: boolean
  customContent?: ReactNode
  accent: string
  accentGlow: string
}

export function GamesSection() {
  const gameCards: GameCard[] = [
    {
      key: 'blackjack',
      href: '/BLACKJACK',
      title: 'BlackJack',
      image: '/Games-Section/NlackJack-GS.png',
      imageAlt: 'BlackJack',
      titleClassName: 'text-2xl md:text-4xl font-jost leading-tight',
      disabled: false,
      accent: 'border-cyan-500/40',
      accentGlow: '0 0 40px rgba(6,182,212,0.35), 0 0 80px rgba(6,182,212,0.15)',
    },
    {
      key: 'multiplayer-blackjack',
      href: '/blackjack-multi',
      title: 'Multiplayer Blackjack',
      image: '/Games-Section/BlackJack-Multi-GS.png',
      imageAlt: 'Multiplayer Blackjack',
      titleClassName: 'text-xl md:text-2xl font-krona-one leading-tight',
      disabled: false,
      accent: 'border-cyan-500/40',
      accentGlow: '0 0 30px rgba(6,182,212,0.3), 0 0 60px rgba(6,182,212,0.1)',
    },
    {
      key: 'plinko',
      href: '/PLINKO',
      title: 'Plinko',
      image: '/Games-Section/Plinko-GS.png',
      imageAlt: 'Plinko',
      titleClassName: 'text-xl md:text-2xl font-autour-one',
      disabled: false,
      accent: 'border-cyan-500/40',
      accentGlow: '0 0 30px rgba(6,182,212,0.3), 0 0 60px rgba(6,182,212,0.1)',
    },
    {
      key: 'keno',
      href: '/keno',
      title: 'KENO',
      image: '/Games-Section/KENO-GS.png',
      imageAlt: 'KENO',
      titleClassName: 'text-xl md:text-2xl font-climate-crisis',
      disabled: false,
      accent: 'border-cyan-500/40',
      accentGlow: '0 0 30px rgba(6,182,212,0.3), 0 0 60px rgba(6,182,212,0.1)',
    },
    {
      key: 'poker',
      href: '/poker',
      title: "Texas Hold'em",
      image: '/Games-Section/TEXASHOLDEM-GS.png',
      imageAlt: "Texas Hold'em poker",
      titleClassName: 'text-xl md:text-2xl font-monoton',
      disabled: false,
      accent: 'border-cyan-500/40',
      accentGlow: '0 0 30px rgba(6,182,212,0.3), 0 0 60px rgba(6,182,212,0.1)',
    },
    {
      key: 'coming-soon',
      href: '',
      title: 'More Games Coming Soon',
      image: '/Games-Section/More-To-Come_GS.png',
      imageAlt: 'More games coming soon',
      titleClassName: 'text-lg md:text-xl font-jost leading-tight',
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
          game.disabled && 'cursor-not-allowed',
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
            )}
          />
        </div>

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

  const [featured, bj, plinko, keno, poker, comingSoon] = gameCards

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

          <Link href={poker.href} className="block">
            <CardBody game={poker} className="h-[140px] md:h-[180px]" />
          </Link>

          <div role="group" aria-label="More games coming soon">
            <CardBody game={comingSoon} className="h-[140px] md:h-[180px]" />
          </div>

        </div>
      </div>
    </main>
  )
}
