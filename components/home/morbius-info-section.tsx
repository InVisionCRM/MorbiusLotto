'use client'

import { cn } from '@/lib/utils'
import {
  homeSectionHeading2Class,
  homeSectionSubtitleClass,
  homeSectionTitleClass,
  homeSectionTitleGradientClass,
} from '@/lib/home-section-typography'
import { useEffect, useRef, useState } from 'react'

/*
 * Build per-word animation data from the body text.
 * Words that need special styling are matched by exact string and given a className.
 */
type Word = { text: string; className?: string }

const BODY_TEXT =
  'Morbius is proof that a meme coin can become something bigger. The platform is for the community\u2014more utility for Morbius and any token, especially launches on PUMP.TIRES. We push utility through partnerships and shipping product. $MORBIUS is the in\u2011game currency on morbius.io and the reward for holders and LP providers.'

const WORD_STYLES: Record<string, string> = {
  Morbius: 'font-semibold text-white',
  meme: 'font-semibold text-slate-100',
  coin: 'font-semibold text-slate-100',
  'community\u2014more': 'font-semibold text-slate-100',
  utility: 'font-semibold text-slate-100',
  any: 'font-semibold text-slate-100',
  token: 'font-semibold text-slate-100',
  'PUMP.TIRES.': 'bg-cyan-500 bg-clip-text font-bold uppercase tracking-wide text-transparent',
  partnerships: 'font-semibold text-slate-100',
  shipping: 'font-semibold text-slate-100',
  'product.': 'font-semibold text-slate-100',
  $MORBIUS: 'bg-cyan-500 bg-clip-text font-semibold text-transparent',
  'morbius.io': 'font-semibold text-cyan-200/90',
  holders: 'font-semibold text-slate-100',
  LP: 'font-semibold text-slate-100',
  'providers.': 'font-semibold text-slate-100',
}

const BODY_WORDS: Word[] = BODY_TEXT.split(' ').map((w) => ({
  text: w,
  className: WORD_STYLES[w],
}))

function SlideUpBody({
  isVisible,
}: {
  isVisible: boolean
}) {
  return (
    <p className="max-w-2xl mx-auto text-xl font-medium leading-relaxed text-slate-300 md:text-2xl">
      {BODY_WORDS.map((word, i) => (
        <span key={i}>
          <span
            className={cn('slide-up-word', word.className)}
            data-visible={isVisible ? '' : undefined}
          >
            {word.text}
          </span>
          {i < BODY_WORDS.length - 1 ? ' ' : null}
        </span>
      ))}
    </p>
  )
}

export function MorbiusInfoSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const [contentVisible, setContentVisible] = useState(false)
  const [logoY, setLogoY] = useState(0)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setContentVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.25 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Parallax scroll for background logo
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        const vh = window.innerHeight
        const progress = 1 - (rect.bottom / (vh + rect.height))
        const y = (0.5 - progress) * 70
        setLogoY(y)
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <section
      ref={sectionRef}
      id="what-is-morbius"
      className="relative w-full max-w-2xl mx-auto px-4 py-12 md:py-16 scroll-mt-20 overflow-hidden"
    >
      {/* ── Parallax background logo ── */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 bottom-0 z-0 flex items-center justify-center"
        aria-hidden
      >
        <img
          src="/morbius/OfficialMorbiusLogo.png"
          alt=""
          className="w-[700px] max-w-[90vw] opacity-40 will-change-transform"
          style={{ transform: `translateY(${logoY}%)` }}
        />
      </div>

      <div className="relative z-10 text-center mb-12 md:mb-16">
        {/* ── Title: slide-up ── */}
        <h2
          className={cn(
            homeSectionTitleClass,
            'mb-5 slide-up-word',
          )}
          data-visible={contentVisible ? '' : undefined}
        >
          <span className="text-white">What is </span>
          <span className={homeSectionTitleGradientClass}>Morbius?</span>
        </h2>

        {/* ── Subtitle: slide-up ── */}
        <p
          className={cn(homeSectionSubtitleClass, 'mt-4 max-w-2xl mx-auto slide-up-word')}
          data-visible={contentVisible ? '' : undefined}
        >
          The Morbius token was created on Pump.Tires on PulseChain on November 11th, 2025.
          Holders of Morbius may see direct benefits from holding the token but it is not
          required to play any games on the site.
        </p>

        {/* ── Engine heading: slide-up ── */}
        <h2
          className={cn(homeSectionHeading2Class, 'mt-10 mb-5 slide-up-word')}
          data-visible={contentVisible ? '' : undefined}
        >
          <span className={homeSectionTitleGradientClass}>
            Not just a game, but a tokenomics engine.
          </span>
        </h2>

        {/* ── Body: slide-up (same timing as all content) ── */}
        <SlideUpBody isVisible={contentVisible} />
      </div>
    </section>
  )
}
