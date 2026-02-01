'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'

const ACES = [
  { src: '/BlackJack/Cards/PNG/AC.png', alt: 'Ace of Clubs', from: 'left' },
  { src: '/BlackJack/Cards/PNG/AD.png', alt: 'Ace of Diamonds', from: 'top' },
  { src: '/BlackJack/Cards/PNG/AH.png', alt: 'Ace of Hearts', from: 'right' },
  { src: '/BlackJack/Cards/PNG/AS.png', alt: 'Ace of Spades', from: 'bottom' },
] as const

const OFF = 180
const CARD_W = 80
const CARD_H = 112

function getKeyframes(from: string) {
  switch (from) {
    case 'left':
      return { x: [-OFF, 0, 0, OFF], y: [0, 0, 0, 0] }
    case 'right':
      return { x: [OFF, 0, 0, -OFF], y: [0, 0, 0, 0] }
    case 'top':
      return { x: [0, 0, 0, 0], y: [-OFF, 0, 0, OFF] }
    case 'bottom':
      return { x: [0, 0, 0, 0], y: [OFF, 0, 0, -OFF] }
    default:
      return { x: [0, 0, 0, 0], y: [0, 0, 0, 0] }
  }
}

const positions = [
  { left: '15%', top: '20%' },
  { right: '15%', top: '20%' },
  { left: '15%', bottom: '20%' },
  { right: '15%', bottom: '20%' },
]

export function AcesParallaxSection() {
  return (
    <section className="relative py-16 min-h-[360px] overflow-hidden">
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center" aria-hidden>
        {ACES.map((ace, i) => {
          const keyframes = getKeyframes(ace.from)
          const pos = positions[i]
          return (
            <motion.div
              key={ace.src}
              className="absolute w-20 h-28 md:w-24 md:h-[calc(24*1.4)]"
              style={{
                ...pos,
                zIndex: 2,
              }}
              initial={{ opacity: 0 }}
              whileInView={{
                opacity: [0, 1, 1, 0],
                x: keyframes.x,
                y: keyframes.y,
                transition: {
                  duration: 3.2,
                  times: [0, 0.2, 0.55, 1],
                  delay: i * 0.15,
                  ease: [0.22, 1, 0.36, 1],
                },
              }}
              viewport={{ once: true, margin: '-60px', amount: 0.1 }}
            >
              <Image
                src={ace.src}
                alt={ace.alt}
                width={CARD_W}
                height={CARD_H}
                className="w-full h-full object-contain drop-shadow-xl"
              />
            </motion.div>
          )
        })}
      </div>
      <div className="relative z-0 h-48 w-full" aria-hidden />
    </section>
  )
}
