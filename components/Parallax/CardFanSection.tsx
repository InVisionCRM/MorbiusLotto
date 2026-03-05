'use client'

import { useRef } from 'react'
import { useScroll } from 'motion/react'
import { effects } from '@/lib/effects'

const CARD_FAN_INDEX = 16 // "17. Card Fan" in effects array

export function CardFanSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  const CardFanComponent = effects[CARD_FAN_INDEX].Component

  return (
    <div
      ref={containerRef}
      className="relative h-[200vh] w-full border-b border-white/10"
    >
      <div className="sticky top-0 h-screen w-full flex flex-col overflow-hidden">
        <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-gradient-to-b from-slate-950 to-slate-900">
          <div
            className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_70%,transparent_100%)]"
            aria-hidden
          />
          <CardFanComponent progress={scrollYProgress} />
        </div>
      </div>
    </div>
  )
}
