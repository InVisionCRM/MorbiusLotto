'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { homeSectionTitleClass, homeSectionTitleGradientClass } from '@/lib/home-section-typography'

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.896-.424-1.391.258-2.2.177-.22 3.246-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  )
}

const edgeSpring = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 14,
  mass: 0.85,
}

export function SocialsSection() {
  const reduceMotion = useReducedMotion()

  const iconClass =
    'w-[5.5rem] h-[5.5rem] sm:w-28 sm:h-28 md:w-36 md:h-36 lg:w-40 lg:h-40'

  return (
    <section className="pt-6 pb-16 md:pb-24 px-4 overflow-x-clip">
      <div className="container mx-auto max-w-4xl">
        <div className="rounded-2xl p-8 md:p-10">
          <div className="text-center mb-10 md:mb-12">
            <h2 className={cn(homeSectionTitleClass)}>
              <span className={homeSectionTitleGradientClass}>Join the Community</span>
            </h2>
          </div>

          <div className="flex justify-center items-center gap-16 md:gap-24 lg:gap-32">
            <motion.a
              href="https://x.com/morbius_io"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center gap-5 will-change-transform"
              initial={
                reduceMotion
                  ? false
                  : { x: '-92vw', opacity: 0, scale: 0.88, rotate: -10 }
              }
              animate={{ x: 0, opacity: 1, scale: 1, rotate: 0 }}
              transition={{ ...edgeSpring, delay: 0.06 }}
            >
              <div className="text-purple-500 group-hover:text-cyan-400 transition-colors duration-300 drop-shadow-[0_0_32px_rgba(34,211,238,0.35)]">
                <svg className={iconClass} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
              <span className="text-lg md:text-xl font-medium text-white group-hover:text-cyan-400 transition-colors duration-300">
                X.com
              </span>
            </motion.a>

            <motion.a
              href="https://t.me/morbius_cash"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center gap-5 will-change-transform"
              initial={
                reduceMotion
                  ? false
                  : { x: '92vw', opacity: 0, scale: 0.88, rotate: 10 }
              }
              animate={{ x: 0, opacity: 1, scale: 1, rotate: 0 }}
              transition={{ ...edgeSpring, delay: 0.18 }}
            >
              <div className="text-purple-500 group-hover:text-cyan-400 transition-colors duration-300 drop-shadow-[0_0_32px_rgba(34,211,238,0.35)]">
                <TelegramIcon className={iconClass} />
              </div>
              <span className="text-lg md:text-xl font-medium text-white group-hover:text-cyan-400 transition-colors duration-300">
                Telegram
              </span>
            </motion.a>
          </div>
        </div>
      </div>
    </section>
  )
}
