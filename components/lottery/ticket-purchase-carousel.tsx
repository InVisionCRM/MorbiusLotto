'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselApi,
} from '@/components/ui/carousel'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button as MovingBorderButton } from '@/components/ui/moving-border'
import {
  LOTTERY_ADDRESS,
  PSSH_TOKEN_ADDRESS,
  TICKET_PRICE,
  TOKEN_DECIMALS,
  MIN_NUMBER,
  MAX_NUMBER,
  NUMBERS_PER_TICKET,
} from '@/lib/contracts'
import { pulsechain } from '@/lib/chains'
import { ERC20_ABI } from '@/abi/erc20'
import { useBuyTickets, useBuyTicketsForRounds } from '@/hooks/use-lottery-6of55'
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { formatUnits } from 'viem'
import { toast } from 'sonner'
import { LoaderOne } from '@/components/ui/loader'
import { cn } from '@/lib/utils'

type PurchaseStep = 0 | 1 | 2

interface TicketPurchaseCarouselProps {
  initialRounds?: number
  onSuccess?: () => void
  onError?: (error: Error) => void
  onStateChange?: (tickets: number[][], rounds: number) => void
}

export function TicketPurchaseCarousel({
  initialRounds = 1,
  onSuccess,
  onError,
  onStateChange,
}: TicketPurchaseCarouselProps) {
  const { address } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()

  const [tickets, setTickets] = useState<number[][]>([])
  const [roundsByTicket, setRoundsByTicket] = useState<number[]>([])
  const [step, setStep] = useState<PurchaseStep>(0)
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null)
  const [optimisticAllowance, setOptimisticAllowance] = useState<bigint | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [uiState, setUiState] = useState<'idle' | 'approving' | 'buying' | 'success' | 'error'>('idle')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [roundsStepIndex, setRoundsStepIndex] = useState(0)
  const [workingTicket, setWorkingTicket] = useState<number[]>([])
  const saveLabel = tickets.length > 0 ? 'Add More' : 'Save'

  const onSuccessRef = useRef<typeof onSuccess>(onSuccess)
  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])

  // keep rounds array in sync with tickets length (only when tickets length changes)
  useEffect(() => {
    const next = tickets.map((_, idx) => {
      const current = roundsByTicket[idx]
      if (!current || Number.isNaN(current)) return Math.max(1, Math.min(100, initialRounds))
      return Math.max(1, Math.min(100, current))
    })
    // shallow compare to avoid loops
    const changed =
      next.length !== roundsByTicket.length ||
      next.some((val, i) => val !== roundsByTicket[i])
    if (changed) {
      setRoundsByTicket(next)
    }
  }, [tickets, initialRounds, roundsByTicket])

  // keep step index within bounds when tickets change
  useEffect(() => {
    setRoundsStepIndex((idx) => Math.min(idx, Math.max(tickets.length - 1, 0)))
  }, [tickets.length])

  // notify parent on state change (tickets or rounds)
  useEffect(() => {
    onStateChange?.(tickets, roundsByTicket[0] ?? initialRounds)
  }, [tickets, roundsByTicket, onStateChange, initialRounds])

  useEffect(() => {
    if (carouselApi) {
      carouselApi.scrollTo(step)
    }
  }, [step, carouselApi])

  const { data: psshBalance } = useReadContract({
    address: PSSH_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  })

  const { data: psshAllowance, refetch: refetchPsshAllowance } = useReadContract({
    address: PSSH_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, LOTTERY_ADDRESS as `0x${string}`] : undefined,
    query: { enabled: !!address, refetchInterval: 3000, staleTime: 0 },
  })

  const {
    writeContract: approve,
    data: approveHash,
    isPending: isApprovePending,
    error: approveError,
  } = useWriteContract()

  const { isLoading: isApproveLoading, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  })

  const {
    buyTickets,
    data: buyPsshHash,
    isPending: isBuyPsshPending,
    error: buyPsshError,
  } = useBuyTickets()

  const {
    buyTicketsForRounds,
    data: buyMultiHash,
    isPending: isBuyMultiPending,
    error: buyMultiError,
  } = useBuyTicketsForRounds()

  const buyHash = roundsByTicket.some((r) => r > 1) ? buyMultiHash : buyPsshHash
  const { isLoading: isBuyLoading, isSuccess: isBuySuccess } = useWaitForTransactionReceipt({
    hash: buyHash,
  })

  const ticketCount = tickets.length
  const totalEntries = useMemo(
    () => roundsByTicket.reduce((acc, r) => acc + Math.max(1, Math.min(100, r || 1)), 0),
    [roundsByTicket]
  )
  const maxRounds = useMemo(() => (roundsByTicket.length ? Math.max(...roundsByTicket) : 1), [roundsByTicket])
  const psshCost = TICKET_PRICE * BigInt(totalEntries || 0)
  const currentAllowance = optimisticAllowance ?? psshAllowance ?? BigInt(0)
  const needsApproval = currentAllowance < psshCost
  const hasEnoughBalance = psshBalance !== undefined && psshBalance >= psshCost
  const isProcessing = isApprovePending || isApproveLoading || isBuyPsshPending || isBuyMultiPending || isBuyLoading

  useEffect(() => {
    if (isApproveSuccess) {
      setOptimisticAllowance(psshCost)
      const t = setTimeout(() => {
        refetchPsshAllowance()
        setOptimisticAllowance(null)
      }, 800)
      setUiState('idle')
      return () => clearTimeout(t)
    }
  }, [isApproveSuccess, psshCost, refetchPsshAllowance])

  const hasHandledBuySuccess = useRef(false)
  useEffect(() => {
    if (isBuySuccess && !hasHandledBuySuccess.current) {
      hasHandledBuySuccess.current = true
      setUiState('success')
      onSuccessRef.current?.()
    }
    if (!isBuySuccess) {
      hasHandledBuySuccess.current = false
    }
  }, [isBuySuccess])

  useEffect(() => {
    if (approveError) {
      setUiState('error')
      setErrorMessage(approveError.message.includes('rejected') ? 'Approval rejected' : 'Approval failed')
      onError?.(approveError)
    }
  }, [approveError, onError])

  useEffect(() => {
    const err = maxRounds > 1 ? buyMultiError : buyPsshError
    if (err) {
      setUiState('error')
      setErrorMessage(
        err.message.includes('rejected')
          ? 'Purchase rejected'
          : err.message.includes('Round not open')
            ? 'Round not open'
            : 'Purchase failed'
      )
      onError?.(err)
    }
  }, [buyMultiError, buyPsshError, onError, maxRounds])

  const handleApprove = async () => {
    if (!address) return
    setUiState('approving')
    setErrorMessage('')
    if (chainId !== pulsechain.id && switchChainAsync) {
      await switchChainAsync({ chainId: pulsechain.id })
    }
    approve({
      address: PSSH_TOKEN_ADDRESS as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [LOTTERY_ADDRESS as `0x${string}`, psshCost],
      chainId: pulsechain.id,
    })
  }

  const handleBuy = async () => {
    if (!address) {
      setErrorMessage('Connect wallet')
      setUiState('error')
      return
    }
    if (ticketCount < 1) {
      setErrorMessage('Add a ticket')
      setUiState('error')
      return
    }
    if (!hasEnoughBalance) {
      setErrorMessage('Balance too low')
      setUiState('error')
      return
    }
    setUiState('buying')
    setErrorMessage('')
    if (chainId !== pulsechain.id && switchChainAsync) {
      await switchChainAsync({ chainId: pulsechain.id })
    }
    try {
      const boundedRounds = roundsByTicket.map((r) => Math.max(1, Math.min(100, r || 1)))
      const highest = boundedRounds.length ? Math.max(...boundedRounds) : 1
      if (highest > 1) {
        const offsets = Array.from({ length: highest }, (_, i) => i)
        const groups = offsets.map((offset) =>
          tickets.filter((_, idx) => boundedRounds[idx] > offset)
        )
        buyTicketsForRounds(groups, offsets)
      } else {
        buyTickets(tickets)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Purchase failed'
      setUiState('error')
      setErrorMessage(message)
      onError?.(err as Error)
    }
  }

  const formatToken = (amount: bigint) =>
    parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: TOKEN_DECIMALS === 18 ? 4 : 2,
    })

  const hasWorkingComplete = workingTicket.length === NUMBERS_PER_TICKET
  const canNext = ticketCount > 0 || hasWorkingComplete
  const allRoundsSet = roundsByTicket.length === ticketCount && roundsByTicket.every((r) => r >= 1 && r <= 100)
  const canBuy = ticketCount > 0 && hasEnoughBalance && !needsApproval && allRoundsSet
  const isApproveLoadingState = uiState === 'approving' || isApprovePending || isApproveLoading
  const isBuyLoadingState = uiState === 'buying' || isBuyLoading || isBuyPsshPending || isBuyMultiPending

  const toggleNumber = (num: number) => {
    setWorkingTicket((prev) => {
      if (prev.includes(num)) {
        return prev.filter((n) => n !== num)
      }
      if (prev.length >= NUMBERS_PER_TICKET) return prev
      return [...prev, num].sort((a, b) => a - b)
    })
  }

  const handleSaveTicket = (closeAfter?: boolean) => {
    if (workingTicket.length !== NUMBERS_PER_TICKET) return
    setTickets((prev) => {
      if (prev.length >= 10) return prev
      return [...prev, workingTicket]
    })
    toast.success('Ticket saved')
    setWorkingTicket([])
    if (closeAfter) setPickerOpen(false)
  }

  const handleClearWorking = () => setWorkingTicket([])

  const handleQuickPick = () => {
    const nums: number[] = []
    while (nums.length < NUMBERS_PER_TICKET) {
      const n = Math.floor(Math.random() * MAX_NUMBER) + MIN_NUMBER
      if (!nums.includes(n)) nums.push(n)
    }
    setWorkingTicket(nums.sort((a, b) => a - b))
  }

  return (
    <Card className="relative overflow-hidden bg-black/70 border-white/10 shadow-2xl p-0 max-w-full">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(79,70,229,0.12),transparent_38%),radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.12),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(236,72,153,0.12),transparent_40%)]" />
      <div className="relative p-4 md:p-6 space-y-6 overflow-x-hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap" />

        <Carousel opts={{ loop: false, align: 'start' }} setApi={setCarouselApi} className="relative overflow-hidden">
          <CarouselContent className="pb-12">
            {/* Step 0: Pick */}
            <CarouselItem className="basis-full px-2 md:px-0">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 md:p-6 backdrop-blur-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="h-9 w-9 rounded-full bg-white/15 text-white flex items-center justify-center font-bold text-lg">1</span>
                    <h3 className="text-xl md:text-2xl font-black text-white">Pick Numbers</h3>
                  </div>
                  <Badge className="bg-white/10 text-white border-white/20">Step 1</Badge>
                </div>

                <div className="flex justify-center">
                  <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-white/15 text-white border border-white/20 px-6">
                        Pick Numbers
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-black/95 border-white/10 max-w-xl">
                      <DialogHeader>
                        <DialogTitle className="text-white">Pick numbers</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2 text-xs text-white/80 min-h-[40px]">
                          {workingTicket.map((n) => (
                            <span
                              key={n}
                              className="h-9 min-w-9 px-3 flex items-center justify-center rounded-full bg-green-500/75 border border-white text-white font-semibold"
                            >
                              {n}
                            </span>
                          ))}
                          {workingTicket.length === 0 && <span className="text-white/50">Select {NUMBERS_PER_TICKET} numbers</span>}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="border-white/30 text-white" onClick={handleQuickPick}>
                            Quick pick
                          </Button>
                          <Button size="sm" variant="outline" className="border-white/30 text-white" onClick={handleClearWorking} disabled={workingTicket.length === 0}>
                            Clear
                          </Button>
                        </div>
                        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-11 gap-2 max-h-[320px] overflow-y-auto">
                          {Array.from({ length: MAX_NUMBER }, (_, i) => i + MIN_NUMBER).map((num) => {
                            const selected = workingTicket.includes(num)
                            return (
                              <button
                                key={num}
                                onClick={() => toggleNumber(num)}
                                disabled={!selected && workingTicket.length >= NUMBERS_PER_TICKET}
                                className={cn(
                                  'h-10 rounded border text-sm',
                                  selected ? 'bg-white text-black border-white' : 'bg-black/40 border-white/20 text-white hover:border-white/40'
                                )}
                              >
                                {num}
                              </button>
                            )
                          })}
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2">
                          <div className="text-xs text-white/60">
                            {workingTicket.length}/{NUMBERS_PER_TICKET} selected · {tickets.length}/10 tickets
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-white/20 text-white border-white/30"
                              disabled={workingTicket.length !== NUMBERS_PER_TICKET || tickets.length >= 10}
                              onClick={() => handleSaveTicket(false)}
                            >
                              {tickets.length > 0 ? 'Add More' : 'Save'}
                            </Button>
                            {tickets.length > 0 && (
                              <Button
                                size="sm"
                                className={cn(
                                  'border-white/30',
                                  ticketCount > 0 ? 'bg-green-500 text-white' : 'bg-white/20 text-white'
                                )}
                                onClick={() => {
                                  setPickerOpen(false)
                                  setStep(1)
                                }}
                              >
                                Next
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-white/60">Tickets ready: {ticketCount}</div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="border-white/30 text-white" disabled>
                      Back
                    </Button>
                    <Button
                      size="sm"
                      className={cn('border-white/30', canNext ? 'bg-green-500 text-white' : 'bg-white/20 text-white')}
                      disabled={!canNext}
                      onClick={() => {
                        if (hasWorkingComplete && ticketCount < 10) {
                          handleSaveTicket(false)
                        }
                        setStep(1)
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            </CarouselItem>

            {/* Step 1: Rounds per ticket */}
            <CarouselItem className="basis-full px-2 md:px-0">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 md:p-6 backdrop-blur-xl space-y-5 text-center">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="h-9 w-9 rounded-full bg-white/15 text-white flex items-center justify-center font-bold text-lg">2</span>
                    <h3 className="text-xl md:text-2xl font-black text-white">Rounds</h3>
                  </div>
                  <Badge className="bg-white/10 text-white border-white/20">Step 2</Badge>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4 flex flex-col items-center">
                  <div className="text-sm text-white/80">
                    Ticket {Math.min(roundsStepIndex + 1, Math.max(ticketCount, 1))} of {Math.max(ticketCount, 1)}
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center text-sm text-white">
                    {(tickets[roundsStepIndex] ?? []).map((n) => (
                      <span
                        key={n}
                        className="h-10 min-w-10 px-3 flex items-center justify-center rounded-full bg-green-500/75 border border-white text-white font-semibold"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-col items-center gap-3 w-full">
                    <span className="text-white/70 text-sm">Rounds</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={roundsByTicket[roundsStepIndex] ?? 1}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(100, Number(e.target.value) || 1))
                        setRoundsByTicket((prev) => {
                          const next = [...prev]
                          next[roundsStepIndex] = val
                          return next
                        })
                      }}
                      className="w-24 rounded border border-white/20 bg-black/40 px-3 py-2 text-white text-sm text-center"
                    />
                    <div className="flex flex-wrap justify-center gap-2">
                      {[5, 10, 25, 50, 100].map((v) => (
                        <Button
                          key={v}
                          size="sm"
                          variant="outline"
                          className="border-white/30 text-white"
                          onClick={() =>
                            setRoundsByTicket((prev) => {
                              const next = [...prev]
                              next[roundsStepIndex] = v
                              return next
                            })
                          }
                        >
                          {v}
                        </Button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/30 text-white"
                        onClick={() => {
                          const current = roundsByTicket[roundsStepIndex] ?? 1
                          setRoundsByTicket((prev) => prev.map(() => current || 1))
                          toast.success('Applied to all tickets')
                        }}
                        disabled={ticketCount <= 1}
                      >
                        Apply to all
                      </Button>
                      <Button
                        size="sm"
                        className="bg-white/20 text-white border-white/30"
                        onClick={() => {
                          const nextIndex = Math.min(roundsStepIndex + 1, Math.max(ticketCount - 1, 0))
                          setRoundsStepIndex(nextIndex)
                        }}
                        disabled={ticketCount <= 1}
                      >
                        Next ticket
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-white/60">Set rounds per ticket.</div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="border-white/30 text-white" onClick={() => setStep(0)}>
                      Back
                    </Button>
                    <Button
                      size="sm"
                      className={cn('border-white/30', ticketCount > 0 ? 'bg-green-500 text-white' : 'bg-white/20 text-white')}
                      disabled={ticketCount === 0}
                      onClick={() => setStep(2)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            </CarouselItem>

            {/* Step 2: Review & Buy */}
            <CarouselItem className="basis-full px-2 md:px-0">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 md:p-6 backdrop-blur-xl space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="h-9 w-9 rounded-full bg-white/15 text-white flex items-center justify-center font-bold text-lg">3</span>
                    <h3 className="text-xl md:text-2xl font-black text-white">Review & Buy</h3>
                  </div>
                  <Badge className="bg-white/10 text-white border-white/20">Step 3</Badge>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                    <div className="text-sm text-white/80">Tickets</div>
                    <div className="space-y-2 text-xs text-white/80">
                      {tickets.map((t, idx) => (
                        <div key={idx} className="flex items-center justify-between border border-white/10 rounded-lg px-3 py-2">
                          <span className="flex flex-wrap gap-1">
                            {t.map((n) => (
                              <span key={n} className="px-2 py-1 rounded bg-white/10 text-white">
                                {n}
                              </span>
                            ))}
                          </span>
                          <span className="text-white/60">Rounds: {roundsByTicket[idx] ?? 1}</span>
                        </div>
                      ))}
                      {tickets.length === 0 && <div className="text-white/50">No tickets yet.</div>}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                    <Stat label="Total entries" value={totalEntries.toString()} />
                    <Stat label="Total cost" value={ticketCount > 0 ? `${formatToken(psshCost)} Morbius` : '—'} />
                    <Stat
                      label="Balance"
                      value={
                        psshBalance !== undefined
                          ? `${formatToken(psshBalance)} Morbius`
                          : '—'
                      }
                      tone={hasEnoughBalance ? 'good' : 'bad'}
                    />

                    {uiState === 'error' && errorMessage && (
                      <Alert variant="destructive">
                        <AlertDescription>{errorMessage}</AlertDescription>
                      </Alert>
                    )}
                    {uiState === 'success' && (
                      <Alert className="border-emerald-400/40 bg-emerald-500/10">
                        <AlertDescription className="text-emerald-200">Success. Good luck!</AlertDescription>
                      </Alert>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <Button variant="outline" size="sm" className="border-white/30 text-white" onClick={() => setStep(1)}>
                        Back
                      </Button>
                      {needsApproval && hasEnoughBalance ? (
                        <Button
                          size="sm"
                          className={cn(
                            'h-12 px-6 border-white/30',
                            isProcessing ? 'bg-white/20 text-white' : 'bg-green-500 text-white'
                          )}
                          disabled={isProcessing || ticketCount === 0}
                          onClick={handleApprove}
                        >
                          {isApproveLoadingState ? (
                            <span className="flex items-center gap-2">
                              <LoaderOne />
                              Approving...
                            </span>
                          ) : (
                            'Approve'
                          )}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className={cn(
                            'h-12 px-6 border-white/30',
                            isProcessing || !canBuy ? 'bg-white/20 text-white' : 'bg-green-500 text-white'
                          )}
                          disabled={!canBuy || isProcessing}
                          onClick={handleBuy}
                        >
                          {isBuyLoadingState ? (
                            <span className="flex items-center gap-2">
                              <LoaderOne />
                              Processing...
                            </span>
                          ) : (
                            'Buy'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CarouselItem>
          </CarouselContent>
          <CarouselPrevious className="left-2 md:-left-10 bg-white/10 hover:bg-white/20 border-none" />
          <CarouselNext className="right-2 md:-right-10 bg-white/10 hover:bg-white/20 border-none" />
        </Carousel>
      </div>
    </Card>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between">
      <span className="text-white/70 text-sm">{label}</span>
      <span
        className={cn(
          'text-white font-semibold',
          tone === 'good' && 'text-emerald-200',
          tone === 'bad' && 'text-amber-200'
        )}
      >
        {value}
      </span>
    </div>
  )
}

