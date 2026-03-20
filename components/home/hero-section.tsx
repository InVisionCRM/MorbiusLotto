'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Theme } from '@/lib/theme'

interface HeroSectionProps {
  onOpenPlayerProfile?: () => void
  onOpenAuthModal?: () => void
}

export function HeroSection({ onOpenPlayerProfile, onOpenAuthModal }: HeroSectionProps) {

  return (
    <section
      className="relative w-full min-h-[100dvh] min-h-[100svh] flex flex-col items-center justify-center overflow-hidden px-4 sm:px-6 pt-0 pb-14"
      style={{ background: Theme.greyGradient.background }}
    >
      {/* Tour card backdrop at 5% opacity */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.05] z-0"
        style={{ backgroundImage: 'url(/BlackJack/TourCards/TourCard5.png)' }}
      />
      {/* Background: chip rotates in front of tour card image */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          maskImage: 'linear-gradient(to bottom, black 30%, transparent 50%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 30%, transparent 50%)',
        }}
      >
        <motion.div
          className="absolute flex inset-0 bg-contain bg-center bg-no-repeat opacity-50"
          style={{
            backgroundImage: 'url(/PokerChips/bluepokerchip010.png)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Hero Content - centered with responsive offset (no fixed px) */}
      <div className="flex flex-col gap-y-2 items-center justify-center z-10 text-center w-full max-w-4xl mx-auto -mt-[8vh] sm:-mt-[6vh]">
        {/* Logo - responsive size, backdrop + shadow so it stands out against the chip */}
        <motion.div
          className="mb-2 sm:mb-4 relative"
          initial={{ y: -89, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.3, ease: "easeOut" }}
        >
          <Image
            src="/morbius/MorbiusLogo (3).png"
            alt="Morbius"
            width={160}
            height={160}
            className="relative z-10 mx-2 sm:mx-5 w-48 h-48 sm:w-64 sm:h-64 md:w-72 md:h-72 lg:w-80 lg:h-80 object-contain drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] drop-shadow-[0_0_40px_rgba(34,211,238,0.15)]"
            priority
          />
        </motion.div>

        {/* Main Headline */}
        <motion.h1
          className="font-russo-one mb-3 sm:mb-4"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
        >
          <span className="block text-4xl sm:text-5xl md:text-5xl lg:text-6xl font-black text-white tracking-tight">
            DEFI GAMING
          </span>
          <span className="block text-4xl sm:text-5xl md:text-5xl lg:text-6xl font-black text-purple-500 tracking-tight">
            DONE RIGHT
          </span>
        </motion.h1>

        {/* Buttons */}
        <motion.div
          className="flex flex-row gap-3 sm:gap-4 justify-center flex-wrap"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.4, ease: "easeOut" }}
        >
          <Link
            href="/swap"
            className="px-6 py-3 bg-gradient-to-b from-cyan-600 to-cyan-800 text-white font-semibold text-sm sm:text-base rounded-full hover:from-purple-500 hover:to-purple-700 transition-all duration-300 hover:scale-105 shadow-lg shadow-cyan-500/20"
          >
            Get Morbius
          </Link>

          <Link
            href="#what-is-morbius"
            className="px-6 py-3 bg-white/10 border border-white/20 text-white font-semibold text-sm sm:text-base rounded-full hover:bg-white/20 hover:border-cyan-500/50 transition-all duration-300 hover:scale-105"
          >
            What is Morbius?
          </Link>

          <button
            onClick={() => {
              const gamesSection = document.querySelector('main');
              gamesSection?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-6 py-3 bg-gradient-to-b from-purple-600 to-purple-800 text-white font-semibold text-sm sm:text-base rounded-full hover:from-cyan-500 hover:to-cyan-700 transition-all duration-300 hover:scale-105 shadow-lg shadow-purple-500/20"
          >
            Play Now
          </button>

          <button
            onClick={() => {
              if (onOpenPlayerProfile) {
                onOpenPlayerProfile()
                return
              }
              onOpenAuthModal?.()
            }}
            className="px-6 py-3 bg-gradient-to-b from-slate-800 to-slate-900 border border-cyan-500/30 text-white font-semibold text-sm sm:text-base rounded-full hover:from-slate-700 hover:to-slate-800 hover:border-cyan-400/50 transition-all duration-300 hover:scale-105 shadow-lg shadow-cyan-900/20"
          >
            My Dashboard
          </button>
        </motion.div>
      </div>

      {/* Scroll Indicator - fixed to bottom of section so it's consistent everywhere */}
      <motion.div
        className="absolute bottom-5 sm:bottom-6 left-1/2 -translate-x-1/2 z-10 flex justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 2, ease: "easeOut" }}
      >
        <div className="animate-bounce">
          <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </motion.div>

    </section>
  )
}
