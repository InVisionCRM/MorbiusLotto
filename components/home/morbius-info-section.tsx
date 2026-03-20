'use client'

import { cn } from '@/lib/utils'
import {
  homeSectionSubtitleClass,
  homeSectionTitleClass,
  homeSectionTitleGradientClass,
} from '@/lib/home-section-typography'

export function MorbiusInfoSection() {
  return (
    <section id="what-is-morbius" className="w-full max-w-2xl mx-auto px-4 py-12 md:py-16 scroll-mt-20">
      <div className="text-center mb-12 md:mb-16">
        <h2 className={cn(homeSectionTitleClass, 'mb-5')}>
          <span className="text-white">What is </span>
          <span className={homeSectionTitleGradientClass}>Morbius?</span>
        </h2>
        <p className={cn(homeSectionSubtitleClass, 'mt-4 max-w-2xl mx-auto')}>
          The Morbius token was created on Pump.Tires on PulseChain on November 11th, 2025. Holders of Morbius may see direct benefits from holding the token but it is not required to play any games on the site.
        </p>
        <h2 className={cn(homeSectionTitleClass, 'mt-10 mb-5')}>
          <span className={homeSectionTitleGradientClass}>
            Not just a game, but a tokenomics engine.
          </span>
        </h2>
        <p className="max-w-2xl mx-auto text-xl font-medium leading-relaxed text-slate-300 md:text-2xl">
          Morbius was created to prove the power of what a simple meme coin can become. The Morbius Platform is built for the community and to bring more utility to not only Morbius Token but anyones tokens, especially to those that were launched on Pump.Tires. We will try to garner the most utility possible through partnerships and building. Currently, $Morbius is the token used to play games on morbius.io and the rewards token given to holders and LP providers.
        </p>
      </div>
    </section>
  )
}
