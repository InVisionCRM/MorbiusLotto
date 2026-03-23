'use client'

import { cn } from '@/lib/utils'
import {
  homeSectionHeading2Class,
  homeSectionSubtitleClass,
  homeSectionTitleClass,
  homeSectionTitleGradientClass,
} from '@/lib/home-section-typography'

const pumpTiresGradientClass =
  'inline-block bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text font-bold uppercase tracking-wide text-transparent'

const morbiusTokenGradientClass =
  'inline-block bg-gradient-to-r from-purple-300 via-violet-400 to-fuchsia-400 bg-clip-text font-semibold text-transparent'

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
        <h2 className={cn(homeSectionHeading2Class, 'mt-10 mb-5')}>
          <span className={homeSectionTitleGradientClass}>
            Not just a game, but a tokenomics engine.
          </span>
        </h2>
        <p className="max-w-2xl mx-auto text-xl font-medium leading-relaxed text-slate-300 md:text-2xl">
          <strong className="font-semibold text-white">Morbius</strong> is proof that a{' '}
          <strong className="font-semibold text-slate-100">meme coin</strong> can become something
          bigger. The platform is <strong className="font-semibold text-slate-100">for the community</strong>
          —more <strong className="font-semibold text-slate-100">utility</strong> for Morbius and{' '}
          <strong className="font-semibold text-slate-100">any token</strong>, especially launches on{' '}
          <span className={pumpTiresGradientClass}>PUMP.TIRES</span>. We push utility through{' '}
          <strong className="font-semibold text-slate-100">partnerships</strong> and{' '}
          <strong className="font-semibold text-slate-100">shipping product</strong>.{' '}
          <span className={morbiusTokenGradientClass}>$MORBIUS</span> is the in-game currency on{' '}
          <strong className="font-semibold text-cyan-200/90">morbius.io</strong> and the reward for{' '}
          <strong className="font-semibold text-slate-100">holders</strong> and{' '}
          <strong className="font-semibold text-slate-100">LP providers</strong>.
        </p>
      </div>
    </section>
  )
}
