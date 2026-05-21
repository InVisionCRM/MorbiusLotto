'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { homeSectionTitleClass, homeSectionTitleGradientClass } from '@/lib/home-section-typography'

type CategoryKey = 'poker' | 'blackjack' | 'originals'

type SubGame = {
  key: string
  href: string
  title: string
  tagline: string
  image: string
  badge?: string
}

type Category = {
  key: CategoryKey
  title: string
  kicker: string
  tagline: string
  image: string
  imageAlt: string
  games: SubGame[]
}

const CATEGORIES: Category[] = [
  {
    key: 'poker',
    title: 'Poker Room',
    kicker: "Texas Hold'em",
    tagline: 'Cash games, single-table tournaments, and full multi-table events.',
    image: '/Games-Section/TEXASHOLDEM-GS.png',
    imageAlt: 'Poker Room',
    games: [
      {
        key: 'cash',
        href: '/poker?tab=cash',
        title: 'Cash Game',
        tagline: 'Sit down, pick a table, play hands at your own pace.',
        image: '/morbius/Morbius_Poker.png',
      },
      {
        key: 'tournament',
        href: '/poker?tab=tournaments',
        title: 'Tournament',
        tagline: 'Single-table sit & gos — one winner, one final hand.',
        image: '/morbius/Morbius_Poker.png',
      },
      {
        key: 'mtt',
        href: '/poker/tournaments/create-mtt',
        title: 'Multi-Table Tournament',
        tagline: 'Hundreds of seats across tables. Last player standing takes it.',
        image: '/morbius/Morbius_Poker.png',
        badge: 'New',
      },
    ],
  },
  {
    key: 'blackjack',
    title: 'BlackJack',
    kicker: 'Hit. Stand. Double.',
    tagline: 'Play heads-up against the dealer, or pull up a seat at a live multiplayer table.',
    image: '/Games-Section/NlackJack-GS.png',
    imageAlt: 'BlackJack',
    games: [
      {
        key: 'blackjack',
        href: '/BLACKJACK',
        title: 'Blackjack',
        tagline: 'Solo session vs the dealer. Pure pace, no waiting.',
        image: '/Games-Section/NlackJack-GS.png',
      },
      {
        key: 'blackjack-multi',
        href: '/blackjack-multi',
        title: 'Multiplayer Blackjack',
        tagline: 'Up to seven seats. Real players, real reactions.',
        image: '/Games-Section/BlackJack-Multi-GS.png',
      },
    ],
  },
  {
    key: 'originals',
    title: 'Originals',
    kicker: 'Built in-house',
    tagline: 'Provably-fair house games — drop a ball, pick numbers, or chase the jackpot.',
    image: '/Games-Section/Plinko-GS.png',
    imageAlt: 'MORBIUS Originals',
    games: [
      {
        key: 'plinko',
        href: '/PLINKO',
        title: 'Plinko',
        tagline: 'Pick risk + rows. Drop. Watch physics decide.',
        image: '/Games-Section/Plinko-GS.png',
      },
      {
        key: 'keno',
        href: '/keno',
        title: 'Keno',
        tagline: 'Mark your numbers. Twenty draws settle it instantly.',
        image: '/Games-Section/KENO-GS.png',
      },
      {
        key: 'lottery',
        href: '/lottery',
        title: 'Lottery',
        tagline: '6-of-55 draws. Jackpot rolls until somebody hits.',
        image: '/morbius/Morbius_Lottery.png',
      },
    ],
  },
]

export function GamesSection() {
  const [openKey, setOpenKey] = useState<CategoryKey | null>(null)

  return (
    <main className="w-full px-4 py-6 md:py-8 relative z-10" id="games">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h2 className={cn(homeSectionTitleClass, 'mb-2')}>
            <span className={homeSectionTitleGradientClass}>Games</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {CATEGORIES.map((category, i) => {
            const featured = i === 0
            return (
              <CategoryCard
                key={category.key}
                category={category}
                featured={featured}
                className={cn(
                  featured
                    ? 'md:col-span-2 md:row-span-2 h-[320px] md:h-full'
                    : 'h-[200px] md:h-[206px]',
                )}
                onOpen={() => setOpenKey(category.key)}
              />
            )
          })}
        </div>
      </div>

      {CATEGORIES.map((category) => (
        <CategoryModal
          key={category.key}
          category={category}
          open={openKey === category.key}
          onOpenChange={(o) => setOpenKey(o ? category.key : null)}
        />
      ))}
    </main>
  )
}

function CategoryCard({
  category,
  featured = false,
  className,
  onOpen,
}: {
  category: Category
  featured?: boolean
  className?: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-white/10 text-left transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70',
        className,
      )}
      style={{
        boxShadow: '0 14px 40px -22px rgba(6,182,212,0.25)',
      }}
    >
      <div className="absolute inset-0">
        <Image
          src={category.image}
          alt={category.imageAlt}
          fill
          sizes={featured ? '(max-width: 768px) 100vw, 66vw' : '(max-width: 768px) 100vw, 33vw'}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      </div>

      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(2,4,9,0.05) 0%, rgba(2,4,9,0.55) 55%, rgba(2,4,9,0.92) 100%)',
        }}
        aria-hidden
      />

      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(34,211,238,0.7), transparent)',
        }}
        aria-hidden
      />

      <div className={cn('absolute z-10', featured ? 'top-5 left-5' : 'top-3 left-3')}>
        <div
          className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-cyan-300"
          style={{ letterSpacing: '0.2em' }}
        >
          <Sparkles size={10} />
          {category.kicker}
        </div>
      </div>

      <div className={cn('absolute bottom-0 left-0 right-0 z-10', featured ? 'p-6 md:p-8' : 'p-4')}>
        <h3
          className="text-white"
          style={{
            fontFamily: '"Mitr", sans-serif',
            fontWeight: 700,
            fontSize: featured ? 'clamp(40px, 6vw, 72px)' : 'clamp(22px, 2.6vw, 30px)',
            lineHeight: 0.95,
            letterSpacing: '-0.02em',
          }}
        >
          {category.title}
        </h3>
        {featured && (
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-slate-200/80">
            {category.tagline}
          </p>
        )}
        <div
          className={cn(
            'inline-flex items-center gap-1.5 font-bold uppercase text-cyan-300 transition-transform duration-200 group-hover:translate-x-0.5',
            featured ? 'mt-4 text-[12px]' : 'mt-2 text-[10px]',
          )}
          style={{ letterSpacing: featured ? '0.25em' : '0.22em' }}
        >
          Choose mode
          <ArrowRight size={featured ? 15 : 12} />
        </div>
      </div>
    </button>
  )
}

function CategoryModal({
  category,
  open,
  onOpenChange,
}: {
  category: Category
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl border-white/10 p-0 sm:rounded-2xl"
        style={{
          background:
            'radial-gradient(ellipse at top, rgba(6,182,212,0.10), transparent 60%), linear-gradient(180deg, #050a14 0%, #020409 100%)',
        }}
      >
        <DialogTitle className="sr-only">{category.title}</DialogTitle>

        <div className="px-6 pt-8 pb-2 sm:px-10 sm:pt-10">
          <div
            className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-cyan-300"
            style={{ letterSpacing: '0.2em' }}
          >
            <Sparkles size={10} />
            {category.kicker}
          </div>
          <h2
            className="mt-4 text-white"
            style={{
              fontFamily: '"Mitr", sans-serif',
              fontWeight: 700,
              fontSize: 'clamp(32px, 5vw, 52px)',
              lineHeight: 0.95,
              letterSpacing: '-0.02em',
            }}
          >
            {category.title}
          </h2>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-slate-400">
            {category.tagline}
          </p>
        </div>

        <div
          className={cn(
            'grid gap-3 px-6 pb-8 sm:px-10 sm:pb-10 mt-6',
            category.games.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3',
          )}
        >
          {category.games.map((game) => (
            <SubGameCard key={game.key} game={game} onSelect={() => onOpenChange(false)} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SubGameCard({ game, onSelect }: { game: SubGame; onSelect: () => void }) {
  return (
    <Link
      href={game.href}
      onClick={onSelect}
      className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-white/10 p-5 text-left transition-all hover:-translate-y-1 hover:border-cyan-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
      style={{
        background: 'linear-gradient(155deg, #0c1929 0%, #0a0f1a 60%, #0d1117 100%)',
        boxShadow: '0 14px 40px -22px rgba(6,182,212,0.25)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity group-hover:opacity-100"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.7), transparent)',
        }}
        aria-hidden
      />

      <div className="relative h-28 w-full overflow-hidden rounded-xl border border-white/5">
        <Image
          src={game.image}
          alt={game.title}
          fill
          sizes="(max-width: 640px) 100vw, 240px"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(2,4,9,0.0) 40%, rgba(2,4,9,0.6) 100%)',
          }}
          aria-hidden
        />
      </div>

      {game.badge && (
        <div
          className="absolute top-3 right-3 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-cyan-300"
          style={{ letterSpacing: '0.18em' }}
        >
          {game.badge}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <h3
          className="text-white"
          style={{
            fontFamily: '"Mitr", sans-serif',
            fontWeight: 700,
            fontSize: 'clamp(18px, 2vw, 22px)',
            lineHeight: 1.05,
            letterSpacing: '-0.01em',
          }}
        >
          {game.title}
        </h3>
        <p className="text-[12.5px] leading-relaxed text-slate-400">{game.tagline}</p>
      </div>

      <div className="mt-auto flex items-center justify-between pt-1">
        <span
          className="text-[10px] font-bold uppercase text-cyan-300/80"
          style={{ letterSpacing: '0.22em' }}
        >
          Play
        </span>
        <ArrowRight
          size={16}
          className="shrink-0 text-cyan-400 transition-transform group-hover:translate-x-1"
        />
      </div>
    </Link>
  )
}
