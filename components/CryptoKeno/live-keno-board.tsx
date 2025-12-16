"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { KenoTicket } from '@/components/CryptoKeno/keno-ticket'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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
  tickets?: {
    ticketId: bigint
    numbers: number[]
    spotSize: number
    wager: string
    draws: number
    drawsRemaining: number
    firstRoundId: bigint
    roundTo: number
    addons: {
      multiplier: boolean
      bullsEye: boolean
      plus3: boolean
      progressive: boolean
    }
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
  tickets = [],
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

  const orderedWinning = useMemo(() => winningNumbers.filter((n) => n > 0), [winningNumbers])
  const orderedPlus3 = useMemo(() => plus3Numbers.filter((n) => n > 0), [plus3Numbers])
  const ticketIdsSignature = useMemo(() => tickets.map((t) => t.ticketId.toString()).join('|'), [tickets])
  const currentTicket = tickets[ticketIndex] ?? null
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
  }, [tickets.length, roundId, ticketIdsSignature])

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
        () => setDrawnNumbers((prev) => (prev.includes(num) ? prev : [...prev, num])),
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
    <Card className="relative overflow-hidden border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-950 to-black shadow-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.15),rgba(0,0,0,0))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,rgba(76,29,149,0.12),rgba(0,0,0,0))]" />

      {/* Compact round + close controls */}
      <div className="pointer-events-none absolute inset-0 z-50">
        {onClose && (
          <div className="pointer-events-auto absolute top-2 right-2 flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full bg-black/30 text-white hover:bg-black/50"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </Button>
          </div>
        )}
      </div>

      <div className="relative z-10 px-4 py-3">
        <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4 items-start">
          {/* Left Column - Main Draw Board */}
          <div className="relative flex flex-col gap-3 max-h-[840px] mt-4">
            {stage !== 'complete' && (
              <div className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 z-20">
                <div className="rounded-md bg-emerald-600/90 px-3 py-1 text-[11px] font-semibold text-white shadow">
                  Round {roundId ?? '-'}
                </div>
              </div>
            )}
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
                    'bg-green-500 border-white text-white'
                  )}
                >
                  {flyingBall.number.toString().padStart(2, '0')}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Board grid */}
            <div
              ref={gridRef}
              className={cn(
                "relative z-0 grid grid-cols-10 gap-2 rounded-xl border border-white/8 bg-white/5 p-3 pb-20 backdrop-blur transition-opacity",
                'opacity-100'
              )}
            >
              {ALL_NUMBERS.map((n) => {
                const isHit = drawnNumbers.includes(n)
                const isPlus3Hit = drawnPlus3.includes(n)
                const isBullsEye = bullsEyeNumber === n
                return (
                  <motion.div
                    key={n}
                    ref={(el) => { cellRefs.current[n] = el }}
                    layout
                    className={cn(
                      'relative flex h-9 items-center justify-center rounded-md border text-xs font-semibold transition',
                      isHit
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.5)]'
                        : isPlus3Hit
                          ? 'border-yellow-300 bg-yellow-500/20 text-yellow-100'
                          : 'border-white/10 bg-white/5 text-gray-200'
                    )}
                  >
                    {n.toString().padStart(2, '0')}
                    {isBullsEye && (
                      <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-blue-400 shadow-[0_0_0_2px_rgba(59,130,246,0.4)]" />
                    )}
                    {isHit && (
                      <motion.div
                        layoutId={`hit-${n}`}
                        className="absolute inset-0 rounded-md bg-emerald-400/10"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.2 }}
                      />
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
                    <div className="w-full h-full rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl overflow-hidden">
                      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <span />
                        <span>Drawing: <span className="text-slate-800">{roundId ?? '-'}</span></span>
                        <span className="text-[11px] text-slate-700">Kicker: <span className="font-bold text-slate-900">{multiplier ? `x${multiplier}` : '—'}</span></span>
                      </div>

                      <div className="grid grid-cols-5 gap-2 justify-items-center mb-3">
                        {displayNumbers.map((n, idx) => (
                          <motion.div
                            key={n}
                            initial={{ scale: 0.85, opacity: 0, rotateX: -45, y: 12 }}
                            animate={{ scale: 1, opacity: 1, rotateX: 0, y: 0 }}
                            exit={{ scale: 0.85, opacity: 0, rotateX: 25, y: -6 }}
                            transition={{ duration: 0.45, delay: idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
                            className="flex h-14 w-14 items-center justify-center rounded-full bg-purple-800/70 border border-purple-800/50 text-[15px] font-bold text-white shadow-[0_8px_16px_rgba(88,28,135,0.4)]"
                          >
                            {n.toString().padStart(2, '0')}
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
                        <div className="text-sm font-semibold text-slate-900">Awaiting Next Draw</div>
                        <div className="text-sm font-semibold text-slate-700">Next in {timeLabel}</div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>

            {/* Your Numbers anchored under grid inside left column */}
            {tickets && tickets.length > 0 ? (
              <div className="pt-2">
                <div className="relative flex w-full max-w-4xl flex-col gap-3 rounded-lg border border-purple-500/30 bg-purple-950/40 px-3 py-4 shadow-sm backdrop-blur">
                  <div className="absolute top-0 left-1 right-1 h-px bg-white/15" aria-hidden="true" />
                  <div className="flex w-full items-center justify-between px-1 pb-1 leading-tight">
                    {hasWonCurrentRound ? (
                      <Badge className="h-5 rounded-full bg-emerald-500/20 px-2 text-[11px] font-semibold text-emerald-100 border border-emerald-400/50">
                        
                      </Badge>
                    ) : (
                      <span className="h-5 px-2 text-[11px] text-transparent select-none" aria-hidden="true">
                        .
                      </span>
                    )}
                    <p className="flex-1 text-center text-sm font-semibold text-white leading-tight">Your Numbers</p>
                    <span className="text-[11px] text-gray-200 leading-tight ">
                      {currentTicket?.drawsRemaining ?? 0} left
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 p-0 text-white hover:bg-white/10 disabled:opacity-40"
                      onClick={() => setTicketIndex((i) => Math.max(0, i - 1))}
                      disabled={ticketIndex === 0}
                      aria-label="Previous ticket"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex flex-wrap justify-center gap-2 px-1">
                      {tickets[ticketIndex]?.numbers.map((n) => {
                        const isHit = drawnNumbers.includes(n)
                        const isBullsEye = bullsEyeNumber === n

                        return (
                          <motion.div
                            key={n}
                            layout
                            className={cn(
                              'relative flex h-9 w-9 items-center justify-center rounded-full border text-[12px] font-bold transition-all',
                              isHit
                                ? 'border-emerald-400 bg-emerald-500/40 text-emerald-100 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                                : 'border-purple-400 bg-purple-500/30 text-purple-100 shadow-[0_0_4px_rgba(168,85,247,0.4)]'
                            )}
                          >
                            {n.toString().padStart(2, '0')}
                            {isBullsEye && (
                              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_3px_rgba(59,130,246,0.8)]" />
                            )}
                            {isHit && (
                              <motion.div
                                className="absolute inset-0 rounded-full bg-emerald-400/25"
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ duration: 0.25 }}
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
                      onClick={() => setTicketIndex((i) => Math.min(tickets.length - 1, i + 1))}
                      disabled={ticketIndex >= tickets.length - 1}
                      aria-label="Next ticket"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Right Column - Ticket Details */}
          <div className="space-y-3 w-full lg:max-w-sm lg:ml-auto">
            {/* Full Ticket Details */}
            {tickets && tickets.length > 0 && (
              <div className="mt-4">
                <KenoTicket
                  key={`${tickets[ticketIndex].ticketId.toString()}-${roundId ?? 'r'}`}
                  ticketId={tickets[ticketIndex].ticketId}
                  numbers={tickets[ticketIndex].numbers}
                  spotSize={tickets[ticketIndex].spotSize}
                  wager={tickets[ticketIndex].wager}
                  draws={tickets[ticketIndex].draws}
                  drawsRemaining={tickets[ticketIndex].drawsRemaining}
                  firstRoundId={tickets[ticketIndex].firstRoundId}
                  roundTo={tickets[ticketIndex].roundTo}
                  addons={tickets[ticketIndex].addons}
                  isActive={tickets[ticketIndex].isActive}
                  currentWin={tickets[ticketIndex].currentWin}
                  purchaseTimestamp={tickets[ticketIndex].purchaseTimestamp}
                  roundHistory={tickets[ticketIndex].roundHistory}
                  index={ticketIndex}
                />
              </div>
            )}
          </div>
        </div>

      </div>
    </Card>
  )
}
