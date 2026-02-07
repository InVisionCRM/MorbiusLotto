import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { PaymentBadges } from '@/components/home/payment-badges'
import { CometCard } from '@/components/ui/comet-card'

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' }
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
    <main className="w-full px-1 py-1 relative z-10">
      {/* Section header — matches other home sections */}
      <motion.div
        className="text-center mb-8"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "0%" }}
        variants={fadeInUp}
      >
        <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-cyan-500 mb-2">
          Games
        </h2>
      </motion.div>

      {/* Games Grid */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 lg:gap-8 max-w-6xl mx-auto relative"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={staggerContainer}
      >

        {/* Lottery Card */}
        <motion.div variants={fadeInUp}>
          <CometCard>
          <Link href="/lottery" className="group block">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-900/20 to-purple-600/20 backdrop-blur-sm border border-purple-500/30 hover:border-transparent transition-all duration-300 hover:scale-105 w-full aspect-square max-w-xs group-hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] before:absolute before:inset-0 before:rounded-2xl before:p-[2px] before:bg-gradient-to-r before:from-cyan-500 before:via-purple-500 before:to-cyan-500 before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-300">
            <div className="relative h-full w-full rounded-2xl overflow-hidden">
              <Image
                src="/morbius/Lottoscreenshot.png"
                alt="Mega Morbius Lotto"
                fill
                className="object-cover opacity-60 group-hover:opacity-70 transition-opacity duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <PaymentBadges />
              <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 lg:p-6">
                <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-white mb-1 sm:mb-2">Mega Morbius Lotto</h3>
                <p className="text-white/60 text-sm sm:text-base">Pick 6 numbers and win big prizes</p>
              </div>
            </div>
          </div>
        </Link>
        </CometCard>
        </motion.div>

        {/* Keno Card */}
        <motion.div variants={fadeInUp}>
          <CometCard>
          <Link href="/keno" className="group block">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-900/20 to-cyan-600/20 backdrop-blur-sm border border-cyan-500/30 hover:border-transparent transition-all duration-300 hover:scale-105 w-full aspect-square max-w-xs group-hover:shadow-[0_0_30px_rgba(34,211,238,0.4)] before:absolute before:inset-0 before:rounded-2xl before:p-[2px] before:bg-gradient-to-r before:from-cyan-500 before:via-purple-500 before:to-cyan-500 before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-300">
            <div className="relative h-full w-full rounded-2xl overflow-hidden">
              <Image
                src="/morbius/KENOscreenshot.png"
                alt="Crypto Keno"
                fill
                className="object-cover opacity-60 group-hover:opacity-70 transition-opacity duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <PaymentBadges />
              <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 lg:p-6">
                <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-white mb-1 sm:mb-2">Crypto Keno</h3>
                <p className="text-white/60 text-sm sm:text-base">Choose your spots and hit the jackpot</p>
              </div>
            </div>
          </div>
        </Link>
        </CometCard>
        </motion.div>

        {/* Plinko Card */}
        <motion.div variants={fadeInUp}>
          <CometCard>
          <Link href="/PLINKO" className="group block">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-900/20 to-cyan-600/20 backdrop-blur-sm border border-cyan-500/30 hover:border-transparent transition-all duration-300 hover:scale-105 w-full aspect-square max-w-xs group-hover:shadow-[0_0_30px_rgba(34,211,238,0.4)] before:absolute before:inset-0 before:rounded-2xl before:p-[2px] before:bg-gradient-to-r before:from-cyan-500 before:via-purple-500 before:to-cyan-500 before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-300">
            {/* NEW! Badge */}
            <div className="absolute top-2 right-2 z-10 bg-gradient-to-r from-cyan-400 to-purple-500 text-white font-bold text-xs px-2 py-1 rounded-full shadow-lg border border-cyan-300/50">
              NEW!
            </div>
            <div className="relative h-full w-full rounded-2xl overflow-hidden">
              <Image
                src="/morbius/plinkoscreenshot.png"
                alt="Plinko"
                fill
                className="object-cover opacity-60 group-hover:opacity-70 transition-opacity duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <PaymentBadges />
              <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 lg:p-6">
                <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-white mb-1 sm:mb-2">Plinko</h3>
                <p className="text-white/60 text-sm sm:text-base">Drop the ball and watch it bounce to victory</p>
              </div>
            </div>
          </div>
        </Link>
        </CometCard>
        </motion.div>

        {/* BlackJack Card */}
        <motion.div variants={fadeInUp}>
          <CometCard>
          <div className="group block relative">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-900/20 to-purple-600/20 backdrop-blur-sm border border-purple-500/30 w-full aspect-square max-w-xs">
            <div className="relative h-full w-full rounded-2xl overflow-hidden">
              <Image
                src="/BlackJack/TableBackground1.png"
                alt="BlackJack"
                fill
                className="object-cover opacity-40 transition-opacity duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <PaymentBadges />
              
              {/* Under Construction Overlay */}
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-20">
                <div className="text-center px-4">
                  <div className="text-3xl sm:text-4xl mb-3">🚧</div>
                  <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-white mb-2">Under Construction</h3>
                  <p className="text-white/70 text-sm sm:text-base">Blackjack is being updated</p>
                </div>
              </div>
              
              <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 lg:p-6 z-10">
                <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-white mb-1 sm:mb-2">BlackJack</h3>
                <p className="text-white/60 text-sm sm:text-base">Get 21 or beat the dealer</p>
              </div>
            </div>
          </div>
        </div>
        </CometCard>
        </motion.div>

        {/* Dice Card - Coming Soon */}
        <motion.div variants={fadeInUp}>
          <CometCard>
          <div className="group block relative">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-900/10 to-purple-900/20 backdrop-blur-md border border-cyan-500/20 w-full aspect-square max-w-xs">
            <div className="relative h-full w-full rounded-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl sm:text-5xl lg:text-6xl mb-2 sm:mb-4 opacity-20">🎲</div>
                  <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-white/40 mb-1 sm:mb-2">Dice</h3>
                  <p className="text-white/60 text-base sm:text-lg font-semibold">Coming Soon</p>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 lg:p-6">
                <p className="text-white/40 text-center text-sm sm:text-base">Roll for high scores and big wins</p>
              </div>
            </div>
          </div>
        </div>
        </CometCard>
        </motion.div>

      </motion.div>
    </main>
  )
}