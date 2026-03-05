"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
// import { KenoTicket } from '@/components/CryptoKeno/keno-ticket'
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid'
import { DottedGlowBackground } from '@/components/ui/dotted-glow-background'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAccount } from 'wagmi'

type Stage = 'idle' | 'multiplier' | 'plus3' | 'drawing' | 'complete'
const MULTIPLIERS = [1, 2, 3, 5, 10]

interface LiveKenoBoardProps {
  roundId?: number
  winningNumbers?: number[]
  plus3Numbers?: number[]
  multiplier?: number
  bullsEyeNumber?: number
  active?: boolean
  onClose?: () => void
  nextDrawTime?: number
  onDrawComplete?: () => void
  onDrawProgress?: (drawn: number, total: number) => void
  tickets?: {
    ticketId: bigint
    numbers: number[]
    spotSize: number
    wager: string
    draws: number
    drawsRemaining: number
    firstRoundId: bigint
    roundTo: number
    isActive: boolean
    currentWin: string
    purchaseTimestamp?: number
    roundHistory?: {
      roundId: number
      winningNumbers: number[]
      matchedNumbers: number[]
      matchCount: number
      roundWin?: number
      roundPL?: number
    }[]
  }[]
  insertAfterYourNumbers?: React.ReactNode
}

const ALL_NUMBERS = Array.from({ length: 80 }, (_, i) => i + 1)

export function LiveKenoBoard({
  roundId,
  winningNumbers = [],
  plus3Numbers = [],
  multiplier = 1,
  bullsEyeNumber,
  active = false,
  onClose,
  nextDrawTime,
  onDrawComplete,
  onDrawProgress,
  tickets = [],
  insertAfterYourNumbers,
}: LiveKenoBoardProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const timeouts = useRef<number[]>([])
  const [stage, setStage] = useState<Stage>('idle')
  const [flyingBall, setFlyingBall] = useState<{ number: number; x: number; y: number; plus3?: boolean } | null>(null)
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([])
  const [drawnPlus3, setDrawnPlus3] = useState<number[]>([])
  const [wheelAngle, setWheelAngle] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [ticketIndex, setTicketIndex] = useState(0)
  const [showExpiredTickets, setShowExpiredTickets] = useState(false)

  const { address } = useAccount()

  const orderedWinning = useMemo(() => winningNumbers.filter((n) => n > 0), [winningNumbers])
  const orderedPlus3 = useMemo(() => plus3Numbers.filter((n) => n > 0), [plus3Numbers])

  // Filter tickets based on expired toggle. While a draw is active, always show all tickets so
  // "Your Numbers" stays visible during the entire animation regardless of drawsRemaining value.
  const filteredTickets = useMemo(() => {
    if (active || showExpiredTickets) return tickets
    return tickets.filter(t => t.drawsRemaining > 0)
  }, [tickets, showExpiredTickets, active])

  const ticketIdsSignature = useMemo(() => filteredTickets.map((t) => t.ticketId.toString()).join('|'), [filteredTickets])
  const currentTicket = filteredTickets[ticketIndex] ?? null

  // Auto-dismiss post-draw overlay after 5 seconds so layout stays stable
  useEffect(() => {
    if (stage !== 'complete') return
    const t = window.setTimeout(() => {
      setStage('idle')
      onClose?.()
    }, 5000)
    return () => window.clearTimeout(t)
  }, [stage, onClose])
  const displayNumbers = useMemo(
    () => (drawnNumbers.length ? drawnNumbers : orderedWinning).slice(0, 20),
    [drawnNumbers, orderedWinning]
  )
  const displayPlus3 = useMemo(
    () => (drawnPlus3.length ? drawnPlus3 : orderedPlus3).slice(0, 3),
    [drawnPlus3, orderedPlus3]
  )
  const hasWonCurrentRound = useMemo(() => {
    if (!currentTicket || !roundId || !currentTicket.roundHistory) return false
    const entry = currentTicket.roundHistory.find((r) => r.roundId === roundId)
    return Boolean(entry && ((entry.roundWin ?? 0) > 0 || (entry.roundPL ?? 0) > 0))
  }, [currentTicket, roundId])
  const timeLabel = useMemo(() => {
    if (secondsLeft === null) return '—'
    const m = Math.floor(secondsLeft / 60)
    const s = secondsLeft % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }, [secondsLeft])

  useEffect(() => {
    setTicketIndex(0)
  }, [filteredTickets.length, roundId, ticketIdsSignature, showExpiredTickets])

  const clearTimers = () => {
    timeouts.current.forEach((t) => clearTimeout(t))
    timeouts.current = []
  }

  const schedule = (fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay)
    timeouts.current.push(id)
  }

  const launchBall = (num: number, isPlus3 = false) => {
    const container = gridRef.current
    const target = cellRefs.current[num]
    if (!container || !target) {
      setFlyingBall({ number: num, x: 0, y: 0, plus3: isPlus3 })
      return
    }
    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    // Use container center plus target center for precise landing, accounting for scroll offsets
    const centerX = containerRect.left + containerRect.width / 2
    const centerY = containerRect.top + containerRect.height / 2
    const targetX = targetRect.left + targetRect.width / 2 - centerX
    const targetY = targetRect.top + targetRect.height / 2 - centerY - 15 // shift up for start/end alignment
    setFlyingBall({ number: num, x: targetX, y: targetY, plus3: isPlus3 })
  }

  const startSequence = () => {
    if (!active || orderedWinning.length === 0) return
    clearTimers()
    setDrawnNumbers([])
    setDrawnPlus3([])
    setStage('multiplier')
    setSpinning(true)
    const safeMultiplier = MULTIPLIERS.includes(multiplier) ? multiplier : 1
    const seg = 360 / MULTIPLIERS.length
    const targetIndex = MULTIPLIERS.indexOf(safeMultiplier)
    const targetAngle = 720 + targetIndex * seg + seg / 2 // two full spins then land
    setWheelAngle(targetAngle)

    let delay = 0
    // Hold multiplier wheel
    delay += 2400
    schedule(() => setSpinning(false), delay - 400)

    // Main draw
    schedule(() => setStage('drawing'), delay)
    orderedWinning.forEach((num, idx) => {
      const startAt = delay + idx * 2500 // ~1 minute total
      schedule(() => launchBall(num, false), startAt)
      schedule(
        () => setDrawnNumbers((prev) => {
          if (prev.includes(num)) return prev
          const next = [...prev, num]
          onDrawProgress?.(next.length, orderedWinning.length)
          return next
        }),
        startAt + 1200
      )
    })

    const afterNumbers = delay + orderedWinning.length * 2500

    // Plus 3 reveal after main draw
    if (orderedPlus3.length) {
      schedule(() => setStage('plus3'), afterNumbers)
      orderedPlus3.forEach((num, idx) => {
        const startAt = afterNumbers + idx * 1600
        schedule(() => launchBall(num, true), startAt)
        schedule(() => setDrawnPlus3((prev) => [...prev, num]), startAt + 1000)
      })
      delay = afterNumbers + orderedPlus3.length * 1600 + 500
    } else {
      delay = afterNumbers + 1000
    }

    schedule(() => {
      setStage('complete')
      onDrawComplete?.()
    }, delay)
  }

  useEffect(() => {
    if (active) startSequence()
    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, orderedWinning.join(','), orderedPlus3.join(','), roundId])

  useEffect(() => {
    if (!nextDrawTime) {
      setSecondsLeft(null)
      return
    }
    const tick = () => {
      const now = Math.floor(Date.now() / 1000)
      setSecondsLeft(Math.max(0, nextDrawTime - now))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [nextDrawTime])

  return (
    <Card
      className="relative overflow-hidden"
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
        border: '1px inset rgba(60, 60, 60, 0.5)',
      }}
    >
      {/* Radial gradient overlay */}


      <div className="relative z-10 px-4 py-3">
        <BentoGrid className="max-w-none">
          <BentoGridItem
            title={
              <span className="font-russo-one text-2xl md:text-3xl tracking-wide text-white drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">
                KENO
              </span>
            }
            className="md:row-start-1 md:col-span-2"
            header={
              <>
                {/* Flying ball overlay */}
                <AnimatePresence>
                  {flyingBall && (
                    <motion.div
                      key={`${flyingBall.number}-${flyingBall.plus3 ? 'p' : 'w'}`}
                      initial={{ scale: 2, x: 0, y: 0, opacity: 1 }}
                      animate={{
                        scale: [2, 2, 0.35],
                        x: [0, 0, flyingBall.x],
                        y: [0, 0, flyingBall.y],
                        opacity: [1, 1, 0],
                      }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.8, ease: 'easeInOut', times: [0, 0.4, 1] }}
                      className={cn(
                        'pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex h-32 w-32 items-center justify-center rounded-full border text-4xl font-black shadow-2xl',
                        'bg-cyan-500 border-white text-white'
                      )}
                    >
                      {flyingBall.number.toString().padStart(2, '0')}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            }
          >
            <div
              ref={gridRef}
              className={cn(
                "relative z-0 grid grid-cols-10 gap-0 p-0 pb-3 pt-3 backdrop-blur transition-opacity",
                'opacity-100'
              )}
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                border: '1px inset rgba(60, 60, 60, 0.5)',
              }}
            >
              {ALL_NUMBERS.map((n) => {
                const isHit = drawnNumbers.includes(n)
                const isPlus3Hit = drawnPlus3.includes(n)
                const isBullsEye = bullsEyeNumber === n
                const drawIndex = drawnNumbers.indexOf(n)
                return (
                  <motion.div
                    key={n}
                    ref={(el) => { cellRefs.current[n] = el }}
                    layout
                    className={cn(
                      'relative flex h-9 items-center justify-center border text-xs font-semibold transition overflow-hidden',
                      isHit
                        ? 'border-cyan-500/80 text-cyan-100 shadow-[0_0_0_1px_rgba(6,182,212,0.5)]'
                        : isPlus3Hit
                          ? 'border-yellow-300 bg-yellow-500/20 text-yellow-100'
                          : 'border-white/10 bg-white/5 text-gray-200'
                    )}
                  >
                    {isHit && (
                      <motion.div
                        layoutId={`hit-${n}`}
                        className="absolute inset-0 rounded-md bg-cyan-500/30"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.4, delay: drawIndex * 0.04 }}
                      />
                    )}
                    <span className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{n.toString().padStart(2, '0')}</span>
                    {isBullsEye && (
                      <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-blue-400 shadow-[0_0_0_2px_rgba(59,130,246,0.4)] z-10" />
                    )}
                  </motion.div>
                )
              })}

              {/* Post-draw overlay */}
              <AnimatePresence>
                {stage === 'complete' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center"
                  >
                    <div
                      className="w-full h-full rounded-2xl backdrop-blur-md p-3 text-white overflow-hidden"
                      style={{
                        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                        border: '1px inset rgba(60, 60, 60, 0.5)',
                      }}
                    >
                      {/* Radial gradient overlay */}
                      <div className="relative">
                      <div className="grid grid-cols-5 gap-2 justify-items-center mb-3">
                        {displayNumbers.map((n, idx) => (
                          <motion.div
                            key={n}
                            initial={{ scale: 0.85, opacity: 0, rotateX: -45, y: 12 }}
                            animate={{ scale: 1, opacity: 1, rotateX: 0, y: 0 }}
                            exit={{ scale: 0.85, opacity: 0, rotateX: 25, y: -6 }}
                            transition={{ duration: 0.45, delay: idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
                            className="relative flex h-14 w-14 items-center justify-center rounded-full text-[15px] font-bold text-white backdrop-blur-xl"
                            style={{
                              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.06) 100%)',
                              boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.25), inset 0 -1px 1px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.15)',
                              border: '1px solid rgba(255, 255, 255, 0.22)',
                            }}
                          >
                            <span className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{n.toString().padStart(2, '0')}</span>
                          </motion.div>
                        ))}
                      </div>

                      {(displayPlus3.length > 0 || bullsEyeNumber) && (
                        <div className="mb-3 text-center">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Add-ons</p>
                          <div className="flex flex-wrap items-center justify-center gap-3">
                            {bullsEyeNumber ? (
                              <div className="flex h-9 items-center gap-2 rounded-full bg-blue-100 px-3 text-[12px] font-bold text-blue-700 shadow-sm">
                                <span className="uppercase text-[11px]">Bulls-Eye</span>
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-200 text-[11px] font-black text-blue-800">
                                  {bullsEyeNumber.toString().padStart(2, '0')}
                                </span>
                              </div>
                            ) : null}
                            {displayPlus3.length > 0 && (
                              <div className="flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-[12px] font-bold text-rose-700 shadow-sm">
                                <span className="uppercase text-[11px]">Plus 3</span>
                                <div className="flex items-center gap-1">
                                  {displayPlus3.map((n, idx) => (
                                    <span
                                      key={`${n}-${idx}`}
                                      className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-200 text-[11px] font-black text-rose-800 shadow-[0_2px_6px_rgba(244,63,94,0.25)]"
                                    >
                                      {n.toString().padStart(2, '0')}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="mt-2 border-t border-slate-200 pt-2 text-center space-y-1">
                        <div className="text-4xl font-semibold text-cyan-500">Next in {timeLabel}</div>
                      </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </BentoGridItem>

          <BentoGridItem
            title="Your Numbers"
            className="md:row-start-2 md:col-span-2 relative overflow-hidden"
            description={`${currentTicket?.drawsRemaining ?? 0} draws remaining`}
          >
            <DottedGlowBackground
              className="rounded-lg"
              gap={10}
              radius={5}
              color="rgba(117, 42, 188, 0.63)"
              glowColor="rgba(241, 248, 255, 0.23)"
              opacity={0.6}
              backgroundOpacity={0.7}
              edgeFadeOpacity={1}
              speedScale={0.3}
              speedMin={0.05}
              speedMax={1}
            />
            <div className="relative z-10">
            {filteredTickets && filteredTickets.length > 0 ? (
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 p-0 text-white hover:bg-white/10 disabled:opacity-40"
                  onClick={() => setTicketIndex((i) => Math.max(0, i - 1))}
                  disabled={ticketIndex === 0}
                  aria-label="Previous ticket"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex flex-wrap justify-center gap-2 px-1">
                  {filteredTickets[ticketIndex]?.numbers.map((n) => {
                    const isHit = drawnNumbers.includes(n)
                    const isBullsEye = bullsEyeNumber === n

                    return (
                      <motion.div
                        key={n}
                        layout
                        className={cn(
                          'relative flex h-14 w-14 items-center justify-center rounded-full border-2 text-xl font-bold transition-all duration-700 ease-out',
                          isHit
                            ? 'border-purple-400 text-purple-100 shadow-[0_0_4px_rgba(168,85,247,0.7)] bg-purple-500/20'
                            : 'border-cyan-400 text-cyan-100 shadow-[0_0_4px_rgba(34,211,238,0.8)] bg-slate-900/90'
                        )}
                      >
                        {n.toString().padStart(2, '0')}
                        {isBullsEye && (
                          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_3px_rgba(59,130,246,0.8)]" />
                        )}
                        {isHit && (
                          <motion.div
                            className="absolute inset-0 rounded-full bg-purple-500/30"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                          />
                        )}
                      </motion.div>
                    )
                  })}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 p-0 text-white hover:bg-white/10 disabled:opacity-40"
                  onClick={() => setTicketIndex((i) => Math.min(filteredTickets.length - 1, i + 1))}
                  disabled={ticketIndex >= filteredTickets.length - 1}
                  aria-label="Next ticket"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="text-center text-white/60">No active tickets</div>
            )}
            </div>
          </BentoGridItem>

          {/* Insert content after "Your Numbers" (e.g., ticket builder on mobile) */}
          {insertAfterYourNumbers && (
            <div className="lg:hidden md:col-span-2 md:row-start-3">
              {insertAfterYourNumbers}
            </div>
          )}
        </BentoGrid>

      </div>
    </Card>
  )
}
