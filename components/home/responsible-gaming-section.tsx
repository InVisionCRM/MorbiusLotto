'use client'

import { motion } from 'framer-motion'
import { PauseCircle, Clock, Wallet, ShieldCheck, Gamepad2 } from 'lucide-react'

const CARDS = [
  {
    title: 'Self-exclusion & cool-off',
    text: 'Voluntarily step away for a set period. Take a break whenever you need it.',
    Icon: PauseCircle,
  },
  {
    title: 'Session time visibility',
    text: 'See how long you’ve been playing so you can stay in control.',
    Icon: Clock,
  },
  {
    title: 'Easy withdrawals',
    text: 'Withdraw your balance anytime from the game menu or by clicking reserve balance.',
    Icon: Wallet,
  },
  {
    title: 'No credit, no chasing',
    text: 'Play only with what you deposit—no borrowing or chasing losses.',
    Icon: ShieldCheck,
  },
  {
    title: 'Tools in every game',
    text: 'Clear access to responsible gaming info and tools (e.g. Responsible Gaming button in chat).',
    Icon: Gamepad2,
  },
]

const cardVariants = {
  hidden: { opacity: 0, y: 36 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, staggerDirection: 1 },
  },
}

export function ResponsibleGamingSection() {
  return (
    <section className="relative py-16 px-4 overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.06)_0%,transparent_60%)] pointer-events-none" />

      <div className="container mx-auto max-w-5xl relative z-10">
        <motion.div
          className="text-center mb-12 text-cyan-500/80"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-4xl md:text-5xl font-russo-one font-normal mb-4">
            Responsible Gaming
          </h2>
          <p className="text-xl text-white/80 font-bold font-prosto-one max-w-2xl mx-auto">
            We give you the tools to play responsibly and step away when you need to.
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {CARDS.map((card) => {
            const Icon = card.Icon
            return (
            <motion.div
              key={card.title}
              className="group relative rounded-2xl border border-cyan-500/30 p-5 md:p-6 overflow-hidden transition-all duration-300 hover:border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/10 hover:-translate-y-0.5"
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.9), rgba(40, 40, 40, 0.7))',
                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6), 0 1px 3px rgba(0, 0, 0, 0.4)',
              }}
              variants={cardVariants}
            >
              {/* Card accent glow on hover */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{
                  background: 'radial-gradient(circle at 50% 0%, rgba(34, 211, 238, 0.08) 0%, transparent 70%)',
                }}
              />
              <div className="relative">
                <Icon
                  className="w-10 h-10 md:w-12 md:h-12 mb-3 text-purple-400"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <h3 className="text-lg font-semibold text-cyan-300/95 mb-2 font-russo-one">
                  {card.title}
                </h3>
                <p className="text-white/85 text-sm md:text-base leading-relaxed">
                  {card.text}
                </p>
              </div>
            </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
