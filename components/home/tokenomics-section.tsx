'use client'

import { useRef } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { Theme } from '@/lib/theme'
import { MorbiusBurnedDisplay } from '@/components/shared/MorbiusBurnedDisplay'
import { AnimatedBeam } from '@/components/ui/animated-beam'

const fadeIn = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
}

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } }
}

function TokenConversionCard() {
  const containerRef = useRef<HTMLDivElement>(null)
  const plsRef = useRef<HTMLDivElement>(null)
  const morbiusRef = useRef<HTMLDivElement>(null)

  return (
    <motion.div
      className="mb-16"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={fadeIn}
    >
      <div
        ref={containerRef}
        className="relative p-6 md:p-8 rounded-2xl"
        style={Theme.panel.base}
      >
          <h3 className="text-xl md:text-2xl font-russo-one font-normal text-white mb-6 text-center">
            Don't have any MORBIUS yet? No problem! You can just use PLS to bet! All bets made with PLS are converted to Morbius so it's a win-win for everyone.
          </h3>
          <div className="flex flex-row items-center justify-between">
            {/* PLS - Far Left */}
            <div ref={plsRef} className="flex flex-col items-center z-10">
              <div className="w-[4.5rem] h-[4.5rem] relative">
                <Image
                  src="/Pulse Branding/Logo/ball.png"
                  alt="PLS"
                  fill
                  className="object-contain"
                />
              </div>
              <span className="text-lg md:text-xl font-bold text-white font-poppins ">PLS</span>
              <span className="text-md md:text-lg text-blue-500 font-bold font-prosto-one">PulseChain</span>
            </div>

            {/* MORBIUS - Far Right */}
            <div ref={morbiusRef} className="flex flex-col items-center z-10">
              <div className="w-12 h-12 md:w-16 md:h-16 relative mb-2">
                <Image
                  src="/morbius/MorbiusLogo (3).png"
                  alt="MORBIUS"
                  fill
                  className="object-contain"
                />
              </div>
              <span className="text-lg md:text-xl font-bold text-white font-bold font-prosto-one">MORBIUS</span>
              <span className="text-md md:text-md text-purple-500 font-bold font-prosto-one">Gaming Token</span>
            </div>
          </div>

          {/* Animated Beam */}
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={plsRef}
            toRef={morbiusRef}
            pathColor="rgb(166, 0, 255)"
            pathWidth={5}
            gradientStartColor="rgb(4, 211, 243)"
            gradientStopColor="rgb(155, 4, 243)"
            duration={2.5}
            curvature={100}
          />

          <p className="text-center text-white text-lg font-bold font-prosto-one mt-6 pt-6 border-t border-white/10">
            Instant swap via PulseX DEX
          </p>
      </div>
    </motion.div>
  )
}

export function TokenomicsSection() {
  return (
    <section className="relative py-24 px-4 overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.08)_0%,transparent_50%)] pointer-events-none" />

      <div className="container mx-auto max-w-5xl relative z-10">
        {/* Header — matches other home sections */}
        <motion.div
          className="text-center mb-8"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeIn}
        >
          <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-cyan-500 mb-2">
            Tokenomics*
          </h2>
          <p className="text-white/50 text-sm mb-6">* Tokenomics are subject to change.</p>
          <MorbiusBurnedDisplay variant="card" className="mt-6" />
        </motion.div>

        {/* Every Game Burns Morbius */}
        <motion.div
          className="mb-16"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeIn}
        >
          <div className="text-center mb-8">
            <h3 className="text-3xl md:text-4xl font-russo-one font-normal text-white mb-2">
              Every Game Burns Morbius!
            </h3>
          </div>
        </motion.div>

        {/* Burn Rate Cards */}
        <motion.div
          className="grid grid-cols-3 md:grid-cols-3 gap-1 mb-16"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          {[
            { name: 'Plinko', href: '/PLINKO' },
            { name: 'Lottery', href: '/lottery' },
            { name: 'Keno', href: '/keno' },
          ].map((game) => (
            <motion.div key={game.name} variants={fadeIn}>
              <Link href={game.href}>
                <div className="h-full p-2 text-center rounded-2xl transition-colors" style={Theme.panel.base}>
                  <div className="text-4xl font-black border-3 border-white rounded-2xl bg-gradient-to-l from-purple-700 to-purple-1-0 via-purple-500/10 mb-2">
                    10%
                  </div>
                  <div className="text-lg font-medium text-white mb-1">{game.name}</div>
                  <div className="text-sm text-white/40">Burned per bet</div>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* Token Conversion */}
        <TokenConversionCard />

        {/* Bottom Statement */}
        <motion.p
          className="text-center text-white mt-16 text-lg max-w-2xl mx-auto"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          Not just a GAME. A <span className="text-purple-500 font-medium">tokenomics engine</span>.
        </motion.p>
      </div>
    </section>
  )
}
