'use client'

import { InfiniteMovingCards } from '@/components/ui/infinite-moving-cards'
import type { ImageCardItem } from '@/components/ui/infinite-moving-cards'
import { Theme } from '@/lib/theme'

const PULSECHAIN_CARDS: ImageCardItem[] = [
  { src: '/BlackJack/BrandedTable/EMIT.png', name: 'EMIT' },
  { src: '/BlackJack/BrandedTable/GreenWick.png', name: 'Green Wick' },
  { src: '/BlackJack/BrandedTable/InternetMoney.png', name: 'Internet Money' },
  { src: '/BlackJack/BrandedTable/pTiger.png', name: 'pTiger' },
  { src: '/BlackJack/BrandedTable/PeaCock-2.png', name: 'PeaCock' },
  { src: '/BlackJack/BrandedTable/Liberty.png', name: 'Liquid Liberty' },
  { src: '/BlackJack/BrandedTable/PewPew.png', name: 'PewPew' },
  { src: '/BlackJack/BrandedTable/SuperStake.png', name: 'SuperStake' },
  { src: '/BlackJack/BrandedTable/CRVE.png', name: 'The CVRE Token' },
  { src: '/BlackJack/BrandedTable/BigRich.png', name: 'Big Rich' },
  { src: '/BlackJack/BrandedTable/WhaleBay.png', name: 'WHALE' },
  { name: 'Many More To Come!' },
]

export function PulseChainSection() {
  return (
    <section className="relative py-20 sm:py-24 px-4 sm:px-6 overflow-hidden">
      <div className="container mx-auto max-w-7xl relative z-10">
        <div className="text-center mb-10 sm:mb-12 px-2 sm:px-0">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-russo-one font-normal text-cyan-500 mb-2 break-words">
            We Support PulseChain!
          </h2>
          <p className="text-white/50 text-base sm:text-lg max-w-3xl mx-auto break-words hyphens-auto">
            We want to build relationships with the top projects on PulseChain. Here are some of the projects we align with and decided to make custom UI for! If you would like a custom table or slot machine (future release), please reach out to{' '}
            <a
              href="https://x.com/kccrypto369"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-2 break-all"
            >
              @kccrypto369
            </a>
            {' '}on x.com!
          </p>
        </div>

        <div className="w-full overflow-hidden px-2 sm:px-0">
          <InfiniteMovingCards
            items={PULSECHAIN_CARDS}
            variant="image"
            direction="left"
            speed="normal"
            pauseOnHover
            className="[mask-image:linear-gradient(to_right,transparent,white_10%,white_90%,transparent)]"
          />
        </div>
      </div>
    </section>
  )
}
