'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { PixelImage } from '@/components/ui/pixel-image'

const HERO_VIDEO_SRC = '/morbius-rocket.mp4' as const

/** Single tour card — full-bleed cover + slow pixel reveal after intro video. */
const HERO_TOUR_CARD_SRC = '/BlackJack/TourCards/TourCard1.png' as const
/** Pixel tiles fade in slowly (ms per tile + stagger cap). */
const HERO_PIXEL_FADE_MS = 1500
const HERO_PIXEL_MAX_DELAY_MS = 3000

const VIDEO_FADE_MS = 1200

/** Show headline layer this many ms before the video fade finishes (overlap). */
const LOGO_REVEAL_EARLY_MS = 2500

/** Shared hero CTA: glassmorphism, cyan edge, no drop/glow shadows. */
const HERO_GLASS_BTN =
  'inline-flex items-center justify-center rounded-full border border-cyan-500/45 bg-white/[0.07] px-6 py-3 text-sm font-semibold text-white/95 backdrop-blur-xl transition-colors duration-200 hover:bg-white/[0.14] hover:border-cyan-400/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:px-7 sm:py-3.5 sm:text-base shadow-none'

interface HeroSectionProps {
  onOpenPlayerProfile?: () => void
  onOpenAuthModal?: () => void
}

export function HeroSection({ onOpenPlayerProfile, onOpenAuthModal }: HeroSectionProps) {
  const [videoPhase, setVideoPhase] = useState<'playing' | 'fading' | 'done'>('playing')
  const [reducedMotion, setReducedMotion] = useState(false)
  useLayoutEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) {
      setReducedMotion(true)
      setVideoPhase('done')
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      const next = mq.matches
      setReducedMotion(next)
      if (next) setVideoPhase('done')
    }
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const handleVideoEnded = useCallback(() => {
    setVideoPhase((p) => (p === 'playing' ? 'fading' : p))
  }, [])

  const handleVideoError = useCallback(() => {
    setVideoPhase('done')
  }, [])

  // Reveal logo 0.5s before video fade ends so it starts coming in earlier
  useEffect(() => {
    if (videoPhase !== 'fading' || reducedMotion) return
    const delay = Math.max(0, VIDEO_FADE_MS - LOGO_REVEAL_EARLY_MS)
    const t = setTimeout(() => setVideoPhase('done'), delay)
    return () => clearTimeout(t)
  }, [videoPhase, reducedMotion])

  const handleFadeWrapperTransitionEnd = useCallback((e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== 'opacity') return
    setVideoPhase((p) => (p === 'fading' ? 'done' : p))
  }, [])

  return (
    <section className="relative flex min-h-[100dvh] min-h-[100svh] w-full flex-col items-center justify-center overflow-hidden bg-neutral-950 px-4 pb-14 pt-8 sm:px-6 sm:pt-10">
      {/* Scrim so headline + buttons stay readable */}
      <div
        className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/55 via-black/50 to-black/65"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-br from-slate-950/40 via-transparent to-purple-950/30"
        aria-hidden
      />

      {/* Full-bleed tour card — object-cover tiles, very slow pixel reveal, grayscale */}
      {videoPhase === 'done' && (
        <div
          className="pointer-events-none absolute inset-0 z-[3] overflow-hidden opacity-[0.5] md:opacity-[0.5]"
          aria-hidden
        >
          <PixelImage
            src={HERO_TOUR_CARD_SRC}
            grid="8x8"
            rounded={false}
            grayscaleAnimation
            colorPercent={20}
            colorRevealDelay={HERO_PIXEL_MAX_DELAY_MS}
            className="absolute inset-0 h-full w-full hover:!scale-100"
            pixelFadeInDuration={HERO_PIXEL_FADE_MS}
            maxAnimationDelay={HERO_PIXEL_MAX_DELAY_MS}
          />
        </div>
      )}

      {/* Accent: rotating chip — disabled per design */}
      {/*
      ...
      */}

      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center justify-center gap-y-2 px-2 text-center">
        {/*
          Video + headline share one fixed min-height stack so copy never jumps when the clip fades.
          Headline sits in the lower third of the video (overlap); position is unchanged after video ends.
        */}
        <div className="relative mx-auto w-full max-w-3xl min-h-[min(52vw,420px)] sm:min-h-[min(48vw,460px)]">
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 z-0 aspect-video w-full overflow-hidden transition-opacity ease-out select-none ${
              videoPhase === 'done' || reducedMotion ? 'opacity-0' : 'opacity-100'
            }`}
            style={{ transitionDuration: `${VIDEO_FADE_MS}ms` }}
            onTransitionEnd={handleFadeWrapperTransitionEnd}
            aria-hidden
          >
            {!reducedMotion && (
              <div
                className="h-full w-full"
                style={{
                  WebkitMaskImage:
                    'radial-gradient(ellipse 56% 52% at 50% 48%, #000 18%, #000 36%, transparent 74%)',
                  maskImage:
                    'radial-gradient(ellipse 56% 52% at 50% 48%, #000 18%, #000 36%, transparent 74%)',
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskSize: '100% 100%',
                  maskSize: '100% 100%',
                }}
              >
                <video
                  className="h-full w-full object-cover"
                  src={HERO_VIDEO_SRC}
                  autoPlay
                  muted
                  playsInline
                  preload="auto"
                  onEnded={handleVideoEnded}
                  onError={handleVideoError}
                />
              </div>
            )}
          </div>

          <h1 className="font-russo-one relative z-20 mx-auto mb-3 max-w-4xl px-1 pt-[clamp(11rem,31vw,17.5rem)] text-center sm:mb-4">
            <span className="block text-4xl font-black tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.85)] sm:text-5xl md:text-5xl lg:text-6xl">
              DEFI GAMING,
            </span>
            <span className="block text-4xl font-black tracking-tight text-purple-500 drop-shadow-[0_2px_16px_rgba(0,0,0,0.85)] sm:text-5xl md:text-5xl lg:text-6xl">
              DONE RIGHT
            </span>
          </h1>
        </div>

        <motion.div
          className="flex flex-row flex-wrap justify-center gap-3 sm:gap-4"
          initial={{ opacity: 1, y: 0 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Link href="/swap" className={HERO_GLASS_BTN}>
            Get Morbius
          </Link>

          <Link href="#what-is-morbius" className={HERO_GLASS_BTN}>
            What is Morbius?
          </Link>

          <button
            type="button"
            onClick={() => {
              const gamesSection = document.querySelector('main')
              gamesSection?.scrollIntoView({ behavior: 'smooth' })
            }}
            className={HERO_GLASS_BTN}
          >
            Play Now
          </button>

          <button
            type="button"
            onClick={() => {
              if (onOpenPlayerProfile) {
                onOpenPlayerProfile()
                return
              }
              onOpenAuthModal?.()
            }}
            className={HERO_GLASS_BTN}
          >
            My Dashboard
          </button>
        </motion.div>
      </div>

      <motion.div
        className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 justify-center sm:bottom-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: videoPhase === 'done' ? 1 : 0.35 }}
        transition={{ duration: 0.8, delay: videoPhase === 'done' ? 0.4 : 0, ease: 'easeOut' }}
      >
        <div className="animate-bounce">
          <svg className="h-5 w-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </motion.div>
    </section>
  )
}
