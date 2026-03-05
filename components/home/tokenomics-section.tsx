'use client'

import { useRef, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { MorbiusBurnedDisplay } from '@/components/shared/MorbiusBurnedDisplay'
import { AnimatedBeam } from '@/components/ui/animated-beam'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { NumberTicker } from '@/components/ui/number-ticker'
import { getApiUrlOptional } from '@/lib/api-urls'
import { formatEther } from 'viem'

const fadeIn = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
}

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } }
}

// ── Total Morbius Earned display ──

function MorbiusEarnedDisplay({ className = '' }: { className?: string }) {
  const [totalEarned, setTotalEarned] = useState<bigint>(0n)
  const [isLoading, setIsLoading] = useState(true)
  const apiBase = getApiUrlOptional()

  useEffect(() => {
    if (!apiBase) { setIsLoading(false); return }

    fetch(`${apiBase}/api/merkle/epochs`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const sum = data.reduce(
            (acc: bigint, e: { total_reward_amount?: string }) =>
              acc + BigInt(e.total_reward_amount || '0'),
            0n
          )
          setTotalEarned(sum)
        }
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))
  }, [apiBase])

  // Start at 1M baseline to account for old model + on-chain distributed
  const BASE_EARNED = 1_000_000
  const earnedTokens = BASE_EARNED + Math.floor(Number(formatEther(totalEarned)))

  return (
    <div className={`text-center ${className}`}>
      <div className="flex items-center justify-center gap-2 mb-2">
        <span className="text-white/60 text-sm font-bold uppercase tracking-wider">Total Earned</span>
      </div>
      <div className="flex items-center justify-center gap-2">
        {isLoading ? (
          <span className="text-3xl font-black text-cyan-400 animate-pulse">Loading...</span>
        ) : (
          <NumberTicker
            value={earnedTokens}
            className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500"
            springConfig={{ damping: 120, stiffness: 10 }}
          />
        )}
      </div>
    </div>
  )
}

// ── Game data ───────────────────────────────────────────────────────────────

const GAMES = [
  { name: 'Plinko', href: '/PLINKO', icon: 'fa-circle' },
  { name: 'Blackjack', shortName: ['Black', 'jack'], href: '/BLACKJACK', char: '♠' },
  { name: 'Lottery', href: '/lottery', icon: 'fa-ticket-alt' },
  { name: 'Keno', href: '/keno', icon: 'fa-th' },
]

export function TokenomicsSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef1 = useRef<HTMLDivElement>(null)
  const gameRef2 = useRef<HTMLDivElement>(null)
  const gameRef3 = useRef<HTMLDivElement>(null)
  const gameRef4 = useRef<HTMLDivElement>(null)
  const walletRef = useRef<HTMLDivElement>(null)

  const gameRefs = [gameRef1, gameRef2, gameRef3, gameRef4]

  return (
    <section className="relative w-full min-h-screen py-16 md:py-20 px-4 overflow-hidden">
      <BackgroundBeams className="absolute inset-0 z-0 pointer-events-none" />
      <div className="container mx-auto max-w-5xl relative z-10">
        <motion.div
          className="text-center mb-12 md:mb-16"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeIn}
        >
          <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-cyan-500 mb-6">
            Be the House!
          </h2>
          <div className="grid grid-cols-4 gap-3 max-w-3xl mx-auto mb-6">
            {[
              { label: 'Distribution', pct: '1.25%', sub: 'MORBIUS holders' },
              { label: 'Burn', pct: '0.5%', sub: '' },
              { label: 'Platform', pct: '1.75%', sub: '' },
              { label: 'LP distribution', pct: '1.5%', sub: 'Liquidity Providers' },
            ].map(({ label, pct, sub }) => (
              <div
                key={label}
                className="rounded-xl border border-cyan-500/30 bg-white/5 backdrop-blur-md px-4 py-3 text-center"
              >
                <div className="text-cyan-400 font-semibold text-sm">{label}</div>
                <div className="text-cyan-300 font-bold text-lg">{pct}</div>
                {sub ? <div className="text-cyan-500/80 text-xs mt-0.5">{sub}</div> : null}
              </div>
            ))}
          </div>
          <p className="text-white/50 text-xs mb-6 leading-relaxed">5% total fee on wagers and withdraws</p>
          <h3 className="text-2xl md:text-3xl font-russo-one font-normal text-white mb-8">
            Every Game Burns <span className="text-purple-500">Morbius</span>! Every Game Earns <span className="text-purple-500">Morbius</span>!
          </h3>
          <div className="grid grid-cols-2 gap-8 max-w-xl mx-auto mt-8">
            <MorbiusBurnedDisplay variant="card" showLogo={false} springConfig={{ damping: 120, stiffness: 10 }} />
            <MorbiusEarnedDisplay />
          </div>
        </motion.div>

        <motion.div
          className="mb-8"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeIn}
        >
        {/* Game Cards + Beams + Wallet */}
        <div ref={containerRef} className="relative min-h-[34rem] md:min-h-[42rem]">
          {/* Fee Structure Cards */}
          <motion.div
            className="grid grid-cols-4 gap-3 mb-0"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            {GAMES.map((game, idx) => (
              <motion.div key={game.name} variants={fadeIn} ref={gameRefs[idx]}>
                <Link href={game.href}>
                  <div className="h-full p-4 text-center rounded-2xl border border-purple-500/20 bg-slate-950/20 backdrop-blur-md hover:bg-white/[0.05] transition-colors">
                    {/* Game icon */}
                    <div className="flex items-center justify-center mb-3">
                      {'char' in game ? (
                        <span className="text-2xl bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent font-black">
                          {game.char}
                        </span>
                      ) : (
                        <i
                          className={`fas ${game.icon} text-2xl bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent`}
                          aria-hidden
                        />
                      )}
                    </div>
                    <div className="text-sm sm:text-lg font-bold text-white font-poppins text-center">
                      {'shortName' in game ? (
                        <>
                          <span className="sm:hidden">{(game as { shortName: string[] }).shortName[0]}<br />{(game as { shortName: string[] }).shortName[1]}</span>
                          <span className="hidden sm:inline">{game.name}</span>
                        </>
                      ) : game.name}
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>

          {/* Wallet - Bottom center */}
          <div className="flex flex-col items-center mt-40 md:mt-56 z-10 relative">
            <div ref={walletRef} className="flex flex-col items-center">
              <motion.div
                className="w-32 h-32 md:w-40 md:h-40 flex items-center justify-center"
                animate={{
                  scale: [1, 1.12, 1],
                  color: ['rgb(34, 211, 238)', 'rgb(168, 85, 247)', 'rgb(34, 211, 238)'],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <Wallet className="w-24 h-24 md:w-32 md:h-32" strokeWidth={1.5} fill="currentColor" fillOpacity={0.75} style={{ color: 'inherit' }} />
              </motion.div>
              <span className="text-xl md:text-2xl font-bold text-white font-poppins">Your Wallet</span>
            </div>
          </div>

          {/* Animated Beams - from each game card to wallet */}
          {gameRefs.map((ref, i) => (
            <AnimatedBeam
              key={i}
              containerRef={containerRef}
              fromRef={ref}
              toRef={walletRef}
              pathColor="rgba(0, 229, 255, 0.31)"
              pathWidth={9}
              gradientStartColor="rgb(4, 211, 243)"
              gradientStopColor="rgb(155, 4, 243)"
              duration={1.2 + i * 0.2}
              delay={i * 0.01}
              curvature={50 + i * 1}
              vertical
              startFromBottom
              endAtTop
            />
          ))}

          {/* CTA Button */}
          <div className="text-center mt-8">
            <Link href="/staking">
              <motion.button
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-lg font-bold font-prosto-one hover:from-cyan-400 hover:to-purple-500 transition-all"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
              >
                Claim Your Rewards Now!
              </motion.button>
            </Link>
          </div>
        </div>
      </motion.div>
      </div>
    </section>
  )
}
