'use client'

import { motion } from 'framer-motion'
import { BlackjackPromoCard } from './blackjack-promo-card'
import { BlackjackTournamentsCard } from './blackjack-tournaments-card'

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
}

export function BlackjackSection() {
  return (
    <section className="w-full px-4 py-8 relative z-10">
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-5xl mx-auto items-stretch"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '0%' }}
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: { staggerChildren: 0.15 },
          },
        }}
      >
        <motion.div variants={fadeInUp} className="flex justify-center md:justify-end">
          <BlackjackPromoCard />
        </motion.div>
        <motion.div variants={fadeInUp} className="flex justify-center md:justify-start">
          <BlackjackTournamentsCard />
        </motion.div>
      </motion.div>
    </section>
  )
}
