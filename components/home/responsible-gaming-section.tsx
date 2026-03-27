'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { homeSectionSubtitleClass, homeSectionTitleClass, homeSectionTitleGradientClass } from '@/lib/home-section-typography'
import { PauseCircle, Clock, Wallet, ShieldCheck, Gamepad2, MessageCircle } from 'lucide-react'

const X_LINK = 'https://x.com/morbiusfinance'
const TELEGRAM_LINK = 'https://t.me/morbiusfinance'

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
  {
    title: '24/7 Community Support',
    Icon: MessageCircle,
    content: (
      <>
        Our community and team are here around the clock. Reach out on{' '}
        <a
          href={TELEGRAM_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 hover:text-cyan-300  -offset-2"
        >
          Telegram
        </a>{' '}
        or{' '}
        <a
          href={X_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 hover:text-cyan-300  -offset-2"
        >
          X
        </a>{' '}
        for help, questions, or just to connect.
      </>
    ),
  },
]

function FeatureCard({
  title,
  description,
  icon,
  index,
}: {
  title: string
  description: ReactNode
  icon: ReactNode
  index: number
}) {
  return (
    <div
      className={cn(
        'flex flex-col py-6 md:py-8 relative group/feature border-cyan-500/20 md:border-r md:border-b',
        index % 3 === 0 && 'md:border-l',
        index >= 3 && 'md:border-b-0',
      )}
    >
      <div className="opacity-0 group-hover/feature:opacity-100 transition duration-200 absolute inset-0 h-full w-full bg-gradient-to-t from-cyan-950/35 to-transparent pointer-events-none" />
      <div className="mb-4 relative z-10 px-5 md:px-6 text-purple-400">{icon}</div>
      <div className="text-lg font-semibold mb-2 relative z-10 px-5 md:px-6">
        <div className="absolute left-0 inset-y-0 h-6 group-hover/feature:h-8 w-1 rounded-tr-full rounded-br-full bg-cyan-500/40 group-hover/feature:bg-cyan-400 transition-all duration-200 origin-center" />
        <span className="group-hover/feature:translate-x-2 transition duration-200 inline-block text-cyan-300/95 font-russo-one">
          {title}
        </span>
      </div>
      <p className="text-sm text-white/85 leading-relaxed relative z-10 px-5 md:px-6 max-w-sm">{description}</p>
    </div>
  )
}

export function ResponsibleGamingSection() {
  return (
    <section className="relative py-10 px-4 overflow-hidden">
      <div className="container mx-auto max-w-5xl">
        <motion.div
          className="text-center mb-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
        >
          <h2 className={cn(homeSectionTitleClass, 'mb-2')}>
            <span className={homeSectionTitleGradientClass}>Responsible Gaming</span>
          </h2>
          <p className={cn(homeSectionSubtitleClass, 'text-base md:text-lg')}>
            We give you the tools to play responsibly and step away when you need to.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 border border-cyan-500/20 rounded-2xl overflow-hidden">
          {CARDS.map((card, index) => {
            const Icon = card.Icon
            return (
              <FeatureCard
                key={card.title}
                index={index}
                title={card.title}
                description={'content' in card && card.content ? card.content : card.text}
                icon={<Icon className="w-10 h-10 md:w-12 md:h-12" strokeWidth={1.5} aria-hidden />}
              />
            )
          })}
        </div>
      </div>
    </section>
  )
}
