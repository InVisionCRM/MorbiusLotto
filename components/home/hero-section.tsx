'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

const HERO_GLASS_BTN =
  'group relative isolate inline-flex items-center justify-center overflow-hidden rounded-full border border-white/40 font-orbitron bg-transparent backdrop-blur-xs background-refraction/15 px-6 py-3 text-lg font-semibold transition-colors duration-200 hover:border-cyan-300/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:px-7 sm:py-3.5 sm:text-base'

const HERO_BTN_LABEL =
  'text-white/95 text-md lg:text-3xl font-russo-one transition-all duration-200 group-hover:bg-gradient-to-r group-hover:bg-clip-text group-hover:text-transparent'

interface HeroSectionProps {
  onOpenPlayerProfile?: () => void
  onOpenAuthModal?: () => void
  showWelcome?: boolean
  welcomeName?: string | null
}

export function HeroSection({ onOpenPlayerProfile, onOpenAuthModal, showWelcome = false, welcomeName = null }: HeroSectionProps) {
  const [isReady, setIsReady] = useState(false)
  const readyTimerRef = useRef<number | null>(null)

  useEffect(() => {
    readyTimerRef.current = window.setTimeout(() => setIsReady(true), 80)
    return () => {
      if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current)
    }
  }, [])

  const ctaItems = [
    {
      kind: 'link',
      id: 'get-morbius',
      label: 'Get Morbius',
      labelTone: 'group-hover:from-cyan-300 group-hover:via-cyan-400 group-hover:to-teal-400',
      href: '/swap',
    },
    {
      kind: 'link',
      id: 'what-is-morbius',
      label: 'What is Morbius?',
      labelTone: 'group-hover:from-fuchsia-400 group-hover:via-purple-400 group-hover:to-indigo-400',
      href: '#what-is-morbius',
    },
    {
      kind: 'action',
      id: 'play-now',
      label: 'Play Now',
      labelTone: 'group-hover:from-emerald-400 group-hover:via-green-400 group-hover:to-lime-400',
      onClick: () => {
        const gamesSection = document.querySelector('main')
        gamesSection?.scrollIntoView({ behavior: 'smooth' })
      },
    },
    {
      kind: 'action',
      id: 'my-dashboard',
      label: 'My Dashboard',
      labelTone: 'group-hover:from-rose-500 group-hover:via-red-500 group-hover:to-orange-500',
      onClick: () => {
        if (onOpenPlayerProfile) {
          onOpenPlayerProfile()
          return
        }
        onOpenAuthModal?.()
      },
    },
  ] as const

  return (
    <section className="relative flex min-h-[100dvh] min-h-[100svh] w-full flex-col items-center justify-center overflow-hidden bg-neutral-950 px-4 pb-14 pt-0 sm:px-6 sm:pt-0">
      <div
        className="pointer-events-none absolute inset-0 z-[1] bg-cover bg-center bg-no-repeat opacity-80 bg-[url('/morbius/hero-small.jpeg')] md:bg-[url('/morbius/Morbius-glass-chip-16x9.jpeg')]"
        aria-hidden
      />

      <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/50 via-black/35 to-black/55" aria-hidden />

      <div className="absolute bottom-1/4 left-1/2 z-10 w-full max-w-4xl -translate-x-1/2 translate-y-[20px] px-2 text-center">
        <div className="mx-auto grid max-w-[360px] grid-cols-2 gap-3 sm:flex sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4">
          {ctaItems.map((item, index) =>
            item.kind === 'link' ? (
              <Link
                key={item.id}
                href={item.href}
                className={`${HERO_GLASS_BTN} hero-cta-item ${isReady ? 'hero-cta-item-visible' : 'hero-cta-item-hidden'}`}
                style={{ transitionDelay: `${520 + index * 160}ms` }}
              >
                <span className={`${HERO_BTN_LABEL} ${item.labelTone}`}>{item.label}</span>
              </Link>
            ) : (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={`${HERO_GLASS_BTN} hero-cta-item ${isReady ? 'hero-cta-item-visible' : 'hero-cta-item-hidden'}`}
                style={{ transitionDelay: `${520 + index * 160}ms` }}
              >
                <span className={`${HERO_BTN_LABEL} ${item.labelTone}`}>{item.label}</span>
              </button>
            )
          )}
        </div>
      </div>

      {showWelcome && welcomeName ? (
        <div className="pointer-events-none absolute left-4 top-4 z-10 w-[min(95vw,1000px)] px-2 text-left sm:left-8 sm:top-6 sm:px-0">
          <p
            className={`hero-typewriter-line hero-typewriter-welcome text-4xl font-black uppercase tracking-tight text-white sm:text-5xl lg:text-6xl ${
              isReady ? 'hero-typewriter-visible' : 'hero-typewriter-hidden'
            }`}
          >
            WELCOME BACK
          </p>
          <p
            className={`hero-typewriter-line hero-typewriter-name mt-2 text-4xl font-black uppercase tracking-tight text-purple-500/90 sm:text-5xl lg:text-6xl ${
              isReady ? 'hero-typewriter-visible' : 'hero-typewriter-hidden'
            }`}
          >
            {welcomeName}
          </p>
        </div>
      ) : (
        <h1 className="font-russo-one pointer-events-none absolute left-4 top-1/4 z-10 w-[min(92vw,1100px)] px-2 text-left sm:left-8 sm:px-0">
          <span
            className={`hero-title-line block text-4xl font-black uppercase leading-none tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.85)] sm:text-5xl md:text-6xl lg:text-7xl ${isReady ? 'hero-title-line-visible' : 'hero-title-line-hidden'}`}
            style={{ transitionDelay: '260ms' }}
          >
            DEFI GAMING,
          </span>
          <span
            className={`hero-title-line mt-1 block translate-x-6 text-4xl font-black uppercase leading-none tracking-tight text-purple-500 drop-shadow-[0_2px_16px_rgba(0,0,0,0.85)] sm:translate-x-10 sm:text-5xl md:text-6xl lg:text-7xl ${isReady ? 'hero-title-line-visible' : 'hero-title-line-hidden'}`}
            style={{ transitionDelay: '680ms' }}
          >
            DONE RIGHT
          </span>
        </h1>
      )}

      <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 justify-center sm:bottom-6">
        <div>
          <svg className="h-5 w-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>

    </section>
  )
}
