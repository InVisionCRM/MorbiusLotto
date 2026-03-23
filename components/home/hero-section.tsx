'use client'

import Link from 'next/link'
import { EncryptedText } from '@/components/ui/encrypted-text'

/** ms between each revealed character for MORBIUS / .IO (lower = faster) */
const REVEAL_DELAY = 120

/** Shared hero CTA: glassmorphism, cyan edge, no drop/glow shadows. */
const HERO_GLASS_BTN =
  'group inline-flex items-center justify-center rounded-full border border-cyan-500/45 bg-white/[0.07] px-6 py-3 text-sm font-semibold backdrop-blur-xl transition-colors duration-200 hover:bg-white/[0.14] hover:border-cyan-400/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:px-7 sm:py-3.5 sm:text-base shadow-none'

/** Label: white by default; on button hover, gradient fill (per-button colors below). */
const HERO_BTN_LABEL =
  'text-white/95 transition-all duration-200 group-hover:bg-gradient-to-r group-hover:bg-clip-text group-hover:text-transparent'

interface HeroSectionProps {
  onOpenPlayerProfile?: () => void
  onOpenAuthModal?: () => void
}

export function HeroSection({ onOpenPlayerProfile, onOpenAuthModal }: HeroSectionProps) {
  return (
    <section className="relative flex min-h-[100dvh] min-h-[100svh] w-full flex-col items-center justify-center overflow-hidden bg-neutral-950 px-4 pb-14 pt-8 sm:px-6 sm:pt-10">
      {/* Hero background — card-suit pattern; folder name is "Marketing " (trailing space) */}
      <div
        className="pointer-events-none absolute inset-0 z-[1] bg-cover bg-center bg-no-repeat opacity-25"
        style={{ backgroundImage: "url('/Marketing%20/Hero-Background.jpeg')" }}
        aria-hidden
      />
      {/* Scrim */}
      <div
        className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/55 via-black/50 to-black/65"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-br from-slate-950/40 via-transparent to-purple-950/30"
        aria-hidden
      />

      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center justify-center gap-y-10 px-2 text-center sm:gap-y-12 md:gap-y-14">
        <div className="relative mx-auto w-full max-w-3xl">
          {/* MORBIUS.IO — encrypted text, starts immediately */}
          <div className="mx-auto text-center select-none">
            <div className="flex items-baseline justify-center" style={{ fontFamily: '"Orbitron", sans-serif' }}>
              <EncryptedText
                text="MORBIUS"
                revealDelayMs={REVEAL_DELAY}
                flipDelayMs={40}
                className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-normal tracking-tight"
                encryptedClassName="text-purple-400/60"
                revealedClassName="bg-gradient-to-r from-purple-400 via-purple-500 to-purple-600 bg-clip-text text-transparent"
              />
              <EncryptedText
                text=".IO"
                revealDelayMs={REVEAL_DELAY}
                flipDelayMs={40}
                className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-normal tracking-tight"
                encryptedClassName="text-white/40"
                revealedClassName="text-white"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-row flex-wrap justify-center gap-3 sm:gap-4">
          <Link href="/swap" className={HERO_GLASS_BTN}>
            <span
              className={`${HERO_BTN_LABEL} group-hover:from-cyan-300 group-hover:via-cyan-400 group-hover:to-teal-400`}
            >
              Get Morbius
            </span>
          </Link>

          <Link href="#what-is-morbius" className={HERO_GLASS_BTN}>
            <span
              className={`${HERO_BTN_LABEL} group-hover:from-fuchsia-400 group-hover:via-purple-400 group-hover:to-indigo-400`}
            >
              What is Morbius?
            </span>
          </Link>

          <button
            type="button"
            onClick={() => {
              const gamesSection = document.querySelector('main')
              gamesSection?.scrollIntoView({ behavior: 'smooth' })
            }}
            className={HERO_GLASS_BTN}
          >
            <span
              className={`${HERO_BTN_LABEL} group-hover:from-emerald-400 group-hover:via-green-400 group-hover:to-lime-400`}
            >
              Play Now
            </span>
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
            <span
              className={`${HERO_BTN_LABEL} group-hover:from-rose-500 group-hover:via-red-500 group-hover:to-orange-500`}
            >
              My Dashboard
            </span>
          </button>
        </div>
      </div>

      <h1 className="font-russo-one pointer-events-none absolute top-20 left-1/2 z-10 w-full max-w-4xl -translate-x-1/2 px-4 text-center">
        <span className="block text-lg font-black tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.85)]">
          DEFI GAMING,
        </span>
        <span className="block text-lg font-black tracking-tight text-purple-500 drop-shadow-[0_2px_16px_rgba(0,0,0,0.85)]">
          DONE RIGHT
        </span>
      </h1>

      <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 justify-center sm:bottom-6">
        <div className="animate-bounce">
          <svg className="h-5 w-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>
    </section>
  )
}
