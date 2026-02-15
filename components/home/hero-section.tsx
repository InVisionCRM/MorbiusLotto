'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { DottedGlowBackground } from '@/components/ui/dotted-glow-background'
import { Theme } from '@/lib/theme'

export function HeroSection() {

  return (
    <section className="relative w-full min-h-[100svh] flex flex-col items-center justify-center overflow-hidden px-6 pt-16 pb-24" style={{ background: Theme.greyGradient.background }}>
      {/* Background Image with top-to-bottom fade */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: 'url(/BlackJack/TableBackground3.png)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 60%)',
        }}
      />

      {/* Dotted Glow Background */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2, ease: "easeOut" }}
        className="absolute inset-0"
      >
        <DottedGlowBackground
          className="pointer-events-none z-0"
          gap={20}
          radius={2}
          color="rgba(6, 182, 212, 0.6)"
          glowColor="rgba(6, 182, 212, 1.0)"
          opacity={0.5}
          backgroundOpacity={0}
          edgeFadeOpacity={0.9}
          speedMin={0.3}
          speedMax={1.0}
          speedScale={0.7}
        />
      </motion.div>

      {/* Hero Content */}
      <div className="relative z-10 text-center w-full max-w-4xl mx-auto">
        {/* Logo */}
        <motion.div
          className="mb-4"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
        >
          <Image
            src="/morbius/MorbiusLogo (3).png"
            alt="Morbius"
            width={160}
            height={160}
            className="mx-auto w-80 h-80 object-contain"
            priority
          />
        </motion.div>

        {/* Main Headline */}
        <motion.h1
          className="font-russo-one mb-4"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
        >
          <span className="block text-5xl sm:text-5xl md:text-5xl lg:text-6xl font-black text-white tracking-tight">
            DEFI GAMING
          </span>
          <span className="block text-5xl sm:text-5xl md:text-5xl lg:text-6xl font-black text-purple-500 tracking-tight">
            DONE RIGHT
          </span>
        </motion.h1>

        {/* Buttons */}
        <motion.div
          className="flex flex-row gap-4 justify-center"
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

          <button
            onClick={() => {
              const gamesSection = document.querySelector('main');
              gamesSection?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-6 py-3 bg-gradient-to-b from-purple-600 to-purple-800 text-white font-semibold text-sm sm:text-base rounded-full hover:from-cyan-500 hover:to-cyan-700 transition-all duration-300 hover:scale-105 shadow-lg shadow-purple-500/20"
          >
            Play Now
          </button>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
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
