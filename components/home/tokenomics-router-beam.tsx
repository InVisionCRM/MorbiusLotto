'use client'

import { useRef } from 'react'
import {
  IconCards,
  IconCircleDot,
  IconGauge,
  IconLayoutGrid,
  IconSpade,
  IconTicket,
} from '@tabler/icons-react'

import { AnimatedBeam, BeamHubIconSlot } from '@/components/ui/animated-beam'
import { cn } from '@/lib/utils'

const ICON_OUTER = 26
const STROKE = 2

const iconWhite = 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]'

const beamPaint = {
  pathColor: 'rgba(34, 211, 238, 0.32)',
  pathWidth: 3,
  pathOpacity: 0.5,
  gradientStartColor: 'rgb(34, 211, 238)',
  gradientStopColor: 'rgb(168, 85, 247)',
  duration: 2.8,
} as const

const grad = {
  plinko: 'bg-gradient-to-br from-sky-400 via-sky-500 to-blue-700 border-sky-200/50',
  blackjack: 'bg-gradient-to-br from-rose-500 via-rose-600 to-red-900 border-rose-200/45',
  lottery: 'bg-gradient-to-br from-amber-400 via-orange-500 to-amber-800 border-amber-200/50',
  keno: 'bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-900 border-violet-200/45',
  wheel: 'bg-gradient-to-br from-orange-400 via-amber-500 to-orange-800 border-orange-200/50',
  poker: 'bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-900 border-emerald-200/45',
  holder:
    'size-[5.25rem] border-cyan-200/55 bg-gradient-to-br from-cyan-400 via-teal-600 to-violet-700 p-0 shadow-[inset_0_2px_12px_rgba(255,255,255,0.2),0_0_40px_-6px_rgba(34,211,238,0.55),0_16px_40px_rgba(0,0,0,0.35)] sm:size-28 sm:min-h-28 sm:min-w-28',
} as const

/**
 * Hub-and-spoke beam demo for tokenomics bento: six games → HOLDER hub.
 */
export function TokenomicsRouterBeamHub({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const div1Ref = useRef<HTMLDivElement>(null)
  const div2Ref = useRef<HTMLDivElement>(null)
  const div3Ref = useRef<HTMLDivElement>(null)
  const div4Ref = useRef<HTMLDivElement>(null)
  const div5Ref = useRef<HTMLDivElement>(null)
  const div6Ref = useRef<HTMLDivElement>(null)
  const div7Ref = useRef<HTMLDivElement>(null)

  const outerSlot =
    'size-[3.35rem] min-h-[3.35rem] min-w-[3.35rem] sm:size-14 sm:min-h-14 sm:min-w-14'

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex h-[300px] w-full items-center justify-center overflow-hidden p-3 sm:h-[340px] sm:p-6',
        className
      )}
    >
      <div className="flex size-full max-h-[240px] max-w-lg flex-col items-stretch justify-between gap-5 sm:max-h-[260px] sm:gap-7">
        <div className="flex flex-row items-center justify-between gap-1">
          <BeamHubIconSlot ref={div1Ref} title="Plinko" className={cn(outerSlot, grad.plinko)}>
            <IconCircleDot size={ICON_OUTER} stroke={STROKE} className={iconWhite} aria-hidden />
          </BeamHubIconSlot>
          <BeamHubIconSlot ref={div5Ref} title="Blackjack" className={cn(outerSlot, grad.blackjack)}>
            <IconSpade size={ICON_OUTER} stroke={STROKE} className={iconWhite} fill="currentColor" aria-hidden />
          </BeamHubIconSlot>
        </div>
        <div className="flex flex-row items-center justify-between gap-0.5 sm:gap-1">
          <BeamHubIconSlot ref={div2Ref} title="Lottery" className={cn(outerSlot, grad.lottery)}>
            <IconTicket size={ICON_OUTER} stroke={STROKE} className={iconWhite} aria-hidden />
          </BeamHubIconSlot>
          <BeamHubIconSlot
            ref={div4Ref}
            className={cn(grad.holder)}
            title="Holder rewards"
          >
            <span
              className={cn(
                'select-none text-center font-black uppercase tracking-[0.2em] text-white',
                'text-sm drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] sm:text-base sm:tracking-[0.28em]'
              )}
            >
              HOLDER
            </span>
          </BeamHubIconSlot>
          <BeamHubIconSlot ref={div6Ref} title="Keno" className={cn(outerSlot, grad.keno)}>
            <IconLayoutGrid size={ICON_OUTER} stroke={STROKE} className={iconWhite} aria-hidden />
          </BeamHubIconSlot>
        </div>
        <div className="flex flex-row items-center justify-between gap-1">
          <BeamHubIconSlot ref={div3Ref} title="Big Wheel" className={cn(outerSlot, grad.wheel)}>
            <IconGauge size={ICON_OUTER} stroke={STROKE} className={iconWhite} aria-hidden />
          </BeamHubIconSlot>
          <BeamHubIconSlot ref={div7Ref} title="Poker" className={cn(outerSlot, grad.poker)}>
            <IconCards size={ICON_OUTER} stroke={STROKE} className={iconWhite} aria-hidden />
          </BeamHubIconSlot>
        </div>
      </div>

      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div1Ref}
        toRef={div4Ref}
        curvature={-75}
        endYOffset={-10}
        {...beamPaint}
        delay={0}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div2Ref}
        toRef={div4Ref}
        {...beamPaint}
        delay={0.12}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div3Ref}
        toRef={div4Ref}
        curvature={75}
        endYOffset={10}
        {...beamPaint}
        delay={0.24}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div5Ref}
        toRef={div4Ref}
        curvature={-75}
        endYOffset={-10}
        reverse
        {...beamPaint}
        delay={0.08}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div6Ref}
        toRef={div4Ref}
        reverse
        {...beamPaint}
        delay={0.2}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div7Ref}
        toRef={div4Ref}
        curvature={75}
        endYOffset={10}
        reverse
        {...beamPaint}
        delay={0.28}
      />
    </div>
  )
}
