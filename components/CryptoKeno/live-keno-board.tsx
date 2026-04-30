"use client"

import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
// import { KenoTicket } from '@/components/CryptoKeno/keno-ticket'
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAccount } from 'wagmi'

type Stage = 'idle' | 'drawing' | 'complete'

interface LiveKenoBoardProps {
  roundId?: number
  winningNumbers?: number[]
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

/** Plinko-style embossed fill + soft edge (avoids `surface-panel` inset border reading as black). */
const KENO_EMBOSSED_PANEL: CSSProperties = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px solid rgba(0, 0, 0, 0.1)',
}

/** Poker lobby card rim + glow — replaces default bento purple refraction on this page. */
const KENO_BENTO_POKER_SURFACE: CSSProperties = {
  boxShadow:
    '0 0 80px rgba(34,211,238,0.07), 0 2px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(34,211,238,0.1)',
}

export function LiveKenoBoard({
  roundId,
  winningNumbers = [],
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
  const [flyingBall, setFlyingBall] = useState<{ number: number; x: number; y: number } | null>(null)
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([])
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [ticketIndex, setTicketIndex] = useState(0)
  const [showExpiredTickets, setShowExpiredTickets] = useState(false)

  const { address } = useAccount()

  const orderedWinning = useMemo(() => winningNumbers.filter((n) => n > 0), [winningNumbers])

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

  const launchBall = (num: number) => {
    const container = gridRef.current
    const target = cellRefs.current[num]
    if (!container || !target) {
      setFlyingBall({ number: num, x: 0, y: 0 })
      return
    }
    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    // Use container center plus target center for precise landing, accounting for scroll offsets
    const centerX = containerRect.left + containerRect.width / 2
    const centerY = containerRect.top + containerRect.height / 2
    const targetX = targetRect.left + targetRect.width / 2 - centerX
    const targetY = targetRect.top + targetRect.height / 2 - centerY - 15 // shift up for start/end alignment
    setFlyingBall({ number: num, x: targetX, y: targetY })
  }

  const startSequence = () => {
    if (!active || orderedWinning.length === 0) return
    clearTimers()
    setDrawnNumbers([])
    setStage('drawing')
    let delay = 0

    // Main draw
    orderedWinning.forEach((num, idx) => {
      const startAt = delay + idx * 2500 // ~1 minute total
      schedule(() => launchBall(num), startAt)
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
    delay = afterNumbers + 1000

    schedule(() => {
      setStage('complete')
      onDrawComplete?.()
    }, delay)
  }

  useEffect(() => {
    if (active) startSequence()
    return clearTimers
     
  }, [active, orderedWinning.join(','), roundId])

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
      className="relative overflow-hidden rounded-xl border-0 bg-transparent text-white shadow-none"
      style={KENO_EMBOSSED_PANEL}
    >
      {/* Radial gradient overlay */}


      <div className="relative z-10 rounded-xl border border-[rgba(0,0,0,0.1)] px-4 py-3">
        <BentoGrid className="max-w-none grid-cols-1 auto-rows-auto gap-3">
          <BentoGridItem
            title={
              <span className="font-russo-one text-2xl md:text-3xl tracking-wide text-white drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">
                KENO
              </span>
            }
            className="relative overflow-hidden !border-white/25 !bg-black/30"
            style={KENO_BENTO_POKER_SURFACE}
            header={
              <>
                {/* Flying ball overlay */}
                <AnimatePresence>
                  {flyingBall && (
                    <motion.div
                      key={flyingBall.number}
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
              style={KENO_EMBOSSED_PANEL}
            >
              {ALL_NUMBERS.map((n) => {
                const isHit = drawnNumbers.includes(n)
                const isBullsEye = bullsEyeNumber === n
                const drawIndex = drawnNumbers.indexOf(n)
                return (
                  <motion.div
                    key={n}
                    ref={(el) => { cellRefs.current[n] = el }}
                    layout
                    className={cn(
                      'relative h-9 border text-xs font-semibold transition overflow-hidden',
                      isHit
                        ? 'border-cyan-500/80 text-cyan-100 shadow-[0_0_0_1px_rgba(6,182,212,0.5)]'
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
                    <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                      {n.toString().padStart(2, '0')}
                    </span>
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
                      className="h-full w-full overflow-hidden rounded-2xl p-3 text-white backdrop-blur-md"
                      style={KENO_EMBOSSED_PANEL}
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
                            className="relative h-14 w-14 rounded-full text-[15px] font-bold text-white backdrop-blur-xl"
                            style={{
                              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.06) 100%)',
                              boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.25), inset 0 -1px 1px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.15)',
                              border: '1px solid rgba(255, 255, 255, 0.22)',
                            }}
                          >
                            <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                              {n.toString().padStart(2, '0')}
                            </span>
                          </motion.div>
                        ))}
                      </div>

                      {bullsEyeNumber && (
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
            className="relative overflow-hidden !border-white/25 !bg-black/30"
            style={KENO_BENTO_POKER_SURFACE}
            description={`${currentTicket?.drawsRemaining ?? 0} draws remaining`}
          >
            <div className="relative z-10 min-h-[4.5rem] rounded-lg bg-black/20 p-3 ring-1 ring-white/10">
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
                          'relative h-14 w-14 rounded-full border-2 text-xl font-bold transition-all duration-700 ease-out',
                          isHit
                            ? 'border-purple-400 text-purple-100 shadow-[0_0_4px_rgba(168,85,247,0.7)] bg-purple-500/20'
                            : 'border-cyan-400 text-cyan-100 shadow-[0_0_4px_rgba(34,211,238,0.8)] bg-slate-900/90'
                        )}
                      >
                        <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 tabular-nums">
                          {n.toString().padStart(2, '0')}
                        </span>
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
