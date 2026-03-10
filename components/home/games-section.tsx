import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { PaymentBadges } from '@/components/home/payment-badges'

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' as const }
  }
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 }
  }
}

export function GamesSection() {
  return (
    <main className="w-full px-4 py-6 md:py-8 relative z-10 overflow-hidden" id="games">
      {/* Static background */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.06] pointer-events-none"
        style={{ backgroundImage: 'url(/BlackJack/TourCards/TourCard2.png)' }}
        aria-hidden
      />
      {/* Section header — matches other home sections */}
      <motion.div
        className="relative z-10 text-center mb-8"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "0%" }}
        variants={fadeInUp}
      >
        <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-cyan-500 mb-2">
          Games
        </h2>
      </motion.div>

      {/* Games Grid — 2 cols min, 4 max; tight gaps; scroll animation */}
      <motion.div
        className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2 max-w-6xl mx-auto"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
        variants={staggerContainer}
      >

        {/* Lottery Card */}
        <motion.div variants={fadeInUp}>
          <Link href="/lottery" className="group block">
            <div className="relative overflow-hidden rounded-xl w-full aspect-square max-w-xs transition-all duration-300 hover:scale-105 bg-white/5 backdrop-blur-md border border-white/10">
              <div className="relative h-full w-full rounded-xl overflow-hidden">
                <Image
                  src="/morbius/Lottoscreenshot.png"
                  alt="Mega Morbius Lotto"
                  fill
                  className="object-cover opacity-30 group-hover:opacity-100 transition-opacity duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <PaymentBadges />
                <div className="absolute inset-0 flex items-center justify-center">
                  <h3 className="text-lg sm:text-xl lg:text-2xl font-monoton text-white drop-shadow-lg">Lotto</h3>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>

        {/* Keno Card */}
        <motion.div variants={fadeInUp}>
          <Link href="/keno" className="group block">
            <div className="relative overflow-hidden rounded-xl w-full aspect-square max-w-xs transition-all duration-300 hover:scale-105 bg-white/5 backdrop-blur-md border border-white/10">
              <div className="relative h-full w-full rounded-xl overflow-hidden">
                <Image
                  src="/morbius/KENOscreenshot.png"
                  alt="KENO"
                  fill
                  className="object-cover opacity-30 group-hover:opacity-100 transition-opacity duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <PaymentBadges />
                <div className="absolute inset-0 flex items-center justify-center">
                  <h3 className="text-lg sm:text-xl lg:text-2xl font-climate-crisis text-white drop-shadow-lg">KENO</h3>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>

        {/* Plinko Card */}
        <motion.div variants={fadeInUp}>
          <Link href="/PLINKO" className="group block">
            <div className="relative overflow-hidden rounded-xl w-full aspect-square max-w-xs transition-all duration-300 hover:scale-105 bg-white/5 backdrop-blur-md border border-white/10">
              <div className="absolute top-1.5 right-1.5 z-10 bg-gradient-to-r from-cyan-400 to-purple-500 text-white font-bold text-xs px-1.5 py-0.5 rounded-full shadow-lg border border-cyan-300/50">
                NEW!
              </div>
              <div className="relative h-full w-full rounded-xl overflow-hidden">
                <Image
                  src="/morbius/plinkoscreenshot.png"
                  alt="Plinko"
                  fill
                  className="object-cover opacity-30 group-hover:opacity-100 transition-opacity duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <PaymentBadges />
                <div className="absolute inset-0 flex items-center justify-center">
                  <h3 className="text-lg sm:text-xl lg:text-2xl font-autour-one text-white drop-shadow-lg">Plinko</h3>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>

        {/* BlackJack Card */}
        <motion.div variants={fadeInUp}>
          <Link href="/BLACKJACK" className="group block">
            <div className="relative overflow-hidden rounded-xl w-full aspect-square max-w-xs transition-all duration-300 hover:scale-105 bg-white/5 backdrop-blur-md border border-white/10">
              <div className="absolute top-1.5 right-1.5 z-10 bg-gradient-to-r from-cyan-400 to-purple-500 text-white font-bold text-xs px-1.5 py-0.5 rounded-full shadow-lg border border-cyan-300/50">
                NEW!
              </div>
              <div className="relative h-full w-full rounded-xl overflow-hidden">
                <Image
                  src="/BlackJack/TableBackground1.png"
                  alt="BlackJack"
                  fill
                  className="object-cover opacity-30 group-hover:opacity-100 transition-opacity duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <PaymentBadges />
                <div className="absolute inset-0 flex items-center justify-center">
                  <h3 className="text-lg sm:text-xl lg:text-2xl font-jost text-white drop-shadow-lg">BlackJack</h3>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>

      </motion.div>
    </main>
  )
}