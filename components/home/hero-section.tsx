'use client'

import { useEffect, useRef, useState } from 'react'

const HERO_VIDEO_SRC = '/morbius/Morbiusio_Building_Entrance_Pan.mp4'

const SCRUB_FADE_START = 0.75

interface HeroSectionProps {
  showWelcome?: boolean
  welcomeName?: string | null
}

export function HeroSection({ showWelcome = false, welcomeName = null }: HeroSectionProps) {
  const outerRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const targetTimeRef = useRef<number>(0)

  const [mode, setMode] = useState<'pending' | 'desktop' | 'mobile'>('pending')
  const [overlayProgress, setOverlayProgress] = useState(0)
  const [mobileFinished, setMobileFinished] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const update = () => setMode(mq.matches ? 'desktop' : 'mobile')
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (mode !== 'desktop') return
    const outer = outerRef.current
    const video = videoRef.current
    if (!outer || !video) return

    let duration = video.duration
    const onLoaded = () => {
      duration = video.duration
      onScroll()
    }
    video.addEventListener('loadedmetadata', onLoaded)

    const applyTime = () => {
      rafRef.current = null
      if (!Number.isFinite(duration) || duration <= 0) return
      try {
        video.currentTime = targetTimeRef.current
      } catch {
        /* seek may throw mid-load; ignore */
      }
    }

    const onScroll = () => {
      const rect = outer.getBoundingClientRect()
      const total = outer.offsetHeight - window.innerHeight
      const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(total, 1))
      const progress = total > 0 ? scrolled / total : 0

      if (Number.isFinite(duration) && duration > 0) {
        targetTimeRef.current = Math.min(progress * duration, duration - 0.05)
        if (rafRef.current == null) rafRef.current = window.requestAnimationFrame(applyTime)
      }

      const overlay = progress <= SCRUB_FADE_START
        ? 0
        : Math.min((progress - SCRUB_FADE_START) / (1 - SCRUB_FADE_START), 1)
      setOverlayProgress(overlay)
    }

    video.pause()
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      video.removeEventListener('loadedmetadata', onLoaded)
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [mode])

  useEffect(() => {
    if (mode !== 'mobile') return
    const video = videoRef.current
    if (!video) return
    setMobileFinished(false)
    const onEnded = () => setMobileFinished(true)
    video.addEventListener('ended', onEnded)
    const tryPlay = () => {
      video.play().catch(() => {
        /* Safari may block until interaction; overlay still appears on scroll past hero */
      })
    }
    if (video.readyState >= 2) tryPlay()
    else video.addEventListener('loadeddata', tryPlay, { once: true })
    return () => {
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('loadeddata', tryPlay)
    }
  }, [mode])

  const isDesktop = mode === 'desktop'
  const showOverlay = isDesktop ? overlayProgress > 0.01 : mobileFinished
  const overlayOpacity = isDesktop ? overlayProgress : mobileFinished ? 1 : 0
  const ctaReady = isDesktop ? overlayProgress > 0.55 : mobileFinished
  const scrollHintOpacity = isDesktop
    ? Math.max(0, 1 - overlayProgress * 8)
    : mobileFinished
      ? 0
      : 1

  return (
    <div
      ref={outerRef}
      className="relative w-full bg-neutral-950"
      style={{ height: isDesktop ? '250vh' : undefined, minHeight: isDesktop ? undefined : '100dvh' }}
    >
      <section
        className="flex w-full flex-col items-center justify-center overflow-hidden bg-neutral-950 px-4 sm:px-6"
        style={{
          position: isDesktop ? 'sticky' : 'relative',
          top: isDesktop ? 0 : undefined,
          height: isDesktop ? '100vh' : '100dvh',
        }}
      >
        <video
          ref={videoRef}
          src={HERO_VIDEO_SRC}
          muted
          playsInline
          preload="auto"
          autoPlay={!isDesktop}
          className="pointer-events-none absolute inset-0 z-[1] h-full w-full bg-neutral-950 object-cover object-center"
        />

        <div
          className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/40 via-black/20 to-black/45 transition-opacity duration-200"
          style={{ opacity: 1 - overlayOpacity * 0.6 }}
          aria-hidden
        />

        <div
          className="pointer-events-none absolute inset-0 z-[3] bg-black transition-opacity duration-300"
          style={{ opacity: overlayOpacity }}
          aria-hidden
        />

        {showOverlay && showWelcome && welcomeName ? (
          <div className="pointer-events-none absolute left-4 top-4 z-10 w-[min(95vw,1000px)] px-2 text-left sm:left-8 sm:top-6 sm:px-0">
            <p
              className={`hero-typewriter-line hero-typewriter-welcome text-4xl font-black uppercase tracking-tight text-white sm:text-5xl lg:text-6xl ${
                ctaReady ? 'hero-typewriter-visible' : 'hero-typewriter-hidden'
              }`}
            >
              WELCOME BACK
            </p>
            <p
              className={`hero-typewriter-line hero-typewriter-name mt-2 text-4xl font-black uppercase tracking-tight text-purple-500/90 sm:text-5xl lg:text-6xl ${
                ctaReady ? 'hero-typewriter-visible' : 'hero-typewriter-hidden'
              }`}
            >
              {welcomeName}
            </p>
          </div>
        ) : null}

        {showOverlay && !(showWelcome && welcomeName) ? (
          <h1 className="font-russo-one pointer-events-none absolute left-4 top-1/4 z-10 w-[min(92vw,1100px)] px-2 text-left sm:left-8 sm:px-0 md:block">
            <span
              className={`hero-title-line block text-4xl font-black uppercase leading-none tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.85)] sm:text-5xl md:text-6xl lg:text-7xl ${ctaReady ? 'hero-title-line-visible' : 'hero-title-line-hidden'}`}
              style={{ transitionDelay: '120ms' }}
            >
              DEFI GAMING,
            </span>
            <span
              className={`hero-title-line mt-1 block translate-x-6 text-4xl font-black uppercase leading-none tracking-tight text-purple-500 drop-shadow-[0_2px_16px_rgba(0,0,0,0.85)] sm:translate-x-10 sm:text-5xl md:text-6xl lg:text-7xl ${ctaReady ? 'hero-title-line-visible' : 'hero-title-line-hidden'}`}
              style={{ transitionDelay: '420ms' }}
            >
              DONE RIGHT
            </span>
          </h1>
        ) : null}

        <div
          className="pointer-events-none absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 transition-opacity duration-500 sm:bottom-8"
          style={{ opacity: scrollHintOpacity }}
          aria-hidden
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60 sm:text-xs">
            Scroll
          </span>
          <div className="hero-scroll-hint flex h-9 w-6 items-start justify-center rounded-full border border-white/40 p-1 sm:h-10 sm:w-6">
            <span className="hero-scroll-hint-dot block h-1.5 w-1.5 rounded-full bg-white/80" />
          </div>
          <svg className="h-4 w-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>
    </div>
  )
}
