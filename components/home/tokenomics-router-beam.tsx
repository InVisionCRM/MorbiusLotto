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

/** Cyan glass treatment for game nodes (holder hub uses `grad.holder` unchanged). */
const gameCircleGlass = cn(
  'border-2 border-cyan-400/40 bg-gradient-to-br from-cyan-400/20 via-slate-800/35 to-slate-950/55',
  'backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-8px_24px_rgba(34,211,238,0.08),0_4px_20px_rgba(0,0,0,0.45)]',
  'ring-1 ring-inset ring-cyan-300/20'
)

const grad = {
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
          <BeamHubIconSlot ref={div1Ref} title="Plinko" className={cn(outerSlot, gameCircleGlass)}>
            <IconCircleDot size={ICON_OUTER} stroke={STROKE} className={iconWhite} aria-hidden />
          </BeamHubIconSlot>
          <BeamHubIconSlot ref={div5Ref} title="Blackjack" className={cn(outerSlot, gameCircleGlass)}>
            <IconSpade size={ICON_OUTER} stroke={STROKE} className={iconWhite} fill="currentColor" aria-hidden />
          </BeamHubIconSlot>
        </div>
        <div className="flex flex-row items-center justify-between gap-0.5 sm:gap-1">
          <BeamHubIconSlot ref={div2Ref} title="Lottery" className={cn(outerSlot, gameCircleGlass)}>
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
          <BeamHubIconSlot ref={div6Ref} title="Keno" className={cn(outerSlot, gameCircleGlass)}>
            <IconLayoutGrid size={ICON_OUTER} stroke={STROKE} className={iconWhite} aria-hidden />
          </BeamHubIconSlot>
        </div>
        <div className="flex flex-row items-center justify-between gap-1">
          <BeamHubIconSlot ref={div3Ref} title="Big Wheel" className={cn(outerSlot, gameCircleGlass)}>
            <IconGauge size={ICON_OUTER} stroke={STROKE} className={iconWhite} aria-hidden />
          </BeamHubIconSlot>
          <BeamHubIconSlot ref={div7Ref} title="Poker" className={cn(outerSlot, gameCircleGlass)}>
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
