'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Theme } from '@/lib/theme'

export function BlackjackPromoCard() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isHovering, setIsHovering] = useState(false)

  const handleMouseEnter = () => {
    setIsHovering(true)
    if (videoRef.current) {
      videoRef.current.muted = true
      videoRef.current.volume = 0
      videoRef.current.play().catch(() => {})
    }
  }

  const handleMouseLeave = () => {
    setIsHovering(false)
    videoRef.current?.pause()
    videoRef.current && (videoRef.current.currentTime = 0)
  }

  return (
    <Link
      href="/BLACKJACK"
      className="group/card block w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="relative overflow-hidden rounded-2xl w-full aspect-[4/3] max-w-[16rem] mx-auto transition-all duration-300 hover:scale-[1.02]"
        style={Theme.panel.base}
      >
        <div className="relative h-full w-full rounded-2xl overflow-hidden">
          {/* Static image (fallback / default) */}
          <Image
            src="/BlackJack/TourCards/BlackJack-now-live.jpg"
            alt="BlackJack Now Live"
            fill
            className="object-cover transition-opacity duration-300"
            style={{ opacity: isHovering ? 0 : 1 }}
          />
          {/* Video on hover */}
          <video
            ref={videoRef}
            src="/BlackJack/TourCards/BlackJack-now-live.mp4"
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
            style={{ opacity: isHovering ? 1 : 0 }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col items-center gap-4">
            <motion.span
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold text-white text-sm sm:text-base border border-white/80"
              style={{
                background: 'rgba(34, 211, 238, 0.25)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 24px rgba(34, 211, 238, 0.2), inset 0 1px 0 rgba(255,255,255,0.3)',
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              Play Now
            </motion.span>
          </div>
        </div>
      </div>
    </Link>
  )
}
