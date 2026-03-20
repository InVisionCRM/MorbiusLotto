'use client'

import Image from 'next/image'
import Link from 'next/link'
import { PaymentBadges } from '@/components/home/payment-badges'
import { cn } from '@/lib/utils'
import { homeSectionTitleClass, homeSectionTitleGradientClass } from '@/lib/home-section-typography'

export function GamesSection() {
  return (
    <main className="w-full px-4 py-6 md:py-8 relative z-10 overflow-hidden" id="games">
      <div className="relative">
        <div className="text-center mb-8">
          <h2 className={cn(homeSectionTitleClass, 'mb-2')}>
            <span className={homeSectionTitleGradientClass}>Games</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-2 max-w-6xl mx-auto">
          <Link href="/lottery" className="group block">
            <div className="relative overflow-hidden rounded-xl w-full aspect-square max-w-xs transition-all duration-300 hover:scale-105 bg-white/5 backdrop-blur-md border border-white/10">
              <div className="relative h-full w-full rounded-xl overflow-hidden">
                <Image
                  src="/morbius/Lottoscreenshot.png"
                  alt="Mega Morbius Lotto"
                  fill
                  className="object-cover opacity-30 group-hover:opacity-100 transition-opacity duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <PaymentBadges />
                <div className="absolute inset-0 flex items-center justify-center">
                  <h3 className="text-lg sm:text-xl lg:text-2xl font-monoton text-white drop-shadow-lg">Lotto</h3>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/keno" className="group block">
            <div className="relative overflow-hidden rounded-xl w-full aspect-square max-w-xs transition-all duration-300 hover:scale-105 bg-white/5 backdrop-blur-md border border-white/10">
              <div className="relative h-full w-full rounded-xl overflow-hidden">
                <Image
                  src="/morbius/KENOscreenshot.png"
                  alt="KENO"
                  fill
                  className="object-cover opacity-30 group-hover:opacity-100 transition-opacity duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <PaymentBadges />
                <div className="absolute inset-0 flex items-center justify-center">
                  <h3 className="text-lg sm:text-xl lg:text-2xl font-climate-crisis text-white drop-shadow-lg">KENO</h3>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/PLINKO" className="group block">
            <div className="relative overflow-hidden rounded-xl w-full aspect-square max-w-xs transition-all duration-300 hover:scale-105 bg-white/5 backdrop-blur-md border border-white/10">
              <div className="absolute top-1.5 right-1.5 z-10 bg-gradient-to-r from-cyan-400 to-purple-500 text-white font-bold text-xs px-1.5 py-0.5 rounded-full shadow-lg border border-cyan-300/50">
                NEW!
              </div>
              <div className="relative h-full w-full rounded-xl overflow-hidden">
                <Image
                  src="/morbius/plinkoscreenshot.png"
                  alt="Plinko"
                  fill
                  className="object-cover opacity-30 group-hover:opacity-100 transition-opacity duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <PaymentBadges />
                <div className="absolute inset-0 flex items-center justify-center">
                  <h3 className="text-lg sm:text-xl lg:text-2xl font-autour-one text-white drop-shadow-lg">Plinko</h3>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/BLACKJACK" className="group block">
            <div className="relative overflow-hidden rounded-xl w-full aspect-square max-w-xs transition-all duration-300 hover:scale-105 bg-white/5 backdrop-blur-md border border-white/10">
              <div className="absolute top-1.5 right-1.5 z-10 bg-gradient-to-r from-cyan-400 to-purple-500 text-white font-bold text-xs px-1.5 py-0.5 rounded-full shadow-lg border border-cyan-300/50">
                NEW!
              </div>
              <div className="relative h-full w-full rounded-xl overflow-hidden">
                <Image
                  src="/BlackJack/TableBackground1.png"
                  alt="BlackJack"
                  fill
                  className="object-cover opacity-30 group-hover:opacity-100 transition-opacity duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <PaymentBadges />
                <div className="absolute inset-0 flex items-center justify-center">
                  <h3 className="text-lg sm:text-xl lg:text-2xl font-jost text-white drop-shadow-lg">BlackJack</h3>
                </div>
              </div>
            </div>
          </Link>

          <div
            className="group block cursor-not-allowed"
            role="group"
            aria-label="Multiplayer Blackjack — under construction"
          >
            <div className="relative overflow-hidden rounded-xl w-full aspect-square max-w-xs bg-white/5 backdrop-blur-md border border-white/10 border-dashed border-amber-500/35">
              <div className="absolute top-1.5 right-1.5 z-10 bg-black/50 text-amber-200/95 font-semibold text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md border border-amber-500/40">
                Under construction
              </div>
              <div className="relative h-full w-full rounded-xl overflow-hidden">
                <Image
                  src="/BlackJack/TableBackground1.png"
                  alt=""
                  fill
                  className="object-cover opacity-20 grayscale"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/30" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center">
                  <h3 className="text-base sm:text-lg lg:text-xl font-jost text-white drop-shadow-lg leading-tight">
                    Multiplayer Blackjack
                  </h3>
                  <p className="text-[10px] sm:text-xs text-amber-200/90 font-medium uppercase tracking-wide">
                    Under construction
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div
            className="group block cursor-not-allowed"
            role="group"
            aria-label="Texas Hold'em — under construction"
          >
            <div className="relative overflow-hidden rounded-xl w-full aspect-square max-w-xs bg-white/5 backdrop-blur-md border border-white/10 border-dashed border-amber-500/35">
              <div className="absolute top-1.5 right-1.5 z-10 bg-black/50 text-amber-200/95 font-semibold text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md border border-amber-500/40">
                Under construction
              </div>
              <div className="relative h-full w-full rounded-xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.12),transparent_65%)]" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center">
                  <h3 className="text-base sm:text-lg lg:text-xl font-jost text-white drop-shadow-lg leading-tight">
                    Texas Hold&apos;em
                  </h3>
                  <p className="text-[10px] sm:text-xs text-amber-200/90 font-medium uppercase tracking-wide">
                    Under construction
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
