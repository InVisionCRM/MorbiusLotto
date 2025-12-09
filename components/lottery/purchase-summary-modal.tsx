'use client'

import { useState, useEffect, useRef } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId } from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2, XCircle, Ticket, Coins, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LOTTERY_ADDRESS, PSSH_TOKEN_ADDRESS, TICKET_PRICE, TOKEN_DECIMALS } from '@/lib/contracts'
import { pulsechain } from '@/lib/chains'
import { useBuyTickets, useBuyTicketsForRounds } from '@/hooks/use-lottery-6of55'
import { ERC20_ABI } from '@/abi/erc20'

interface PurchaseSummaryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tickets: number[][]
  ticketQuantities: Record<number, number>
  onSuccess?: () => void
  onError?: (error: Error) => void
  roundsToPlay: number
  onRoundsChange: (rounds: number) => void
}

export function PurchaseSummaryModal({
  open,
  onOpenChange,
  tickets,
  ticketQuantities,
  onSuccess,
  onError,
  roundsToPlay,
  onRoundsChange,
}: PurchaseSummaryModalProps) {
  const { address } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const [step, setStep] = useState<'idle' | 'approving' | 'buying' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const paymentMethod: 'pssh' = 'pssh' // WPLS temporarily disabled

  // Expand tickets by their quantities (critical for multi-quantity purchases)
  const expandedTickets = tickets.flatMap((ticket, index) => {
    if (ticket.length !== 6) return []
    const quantity = ticketQuantities[index] || 1
    return Array(quantity).fill(ticket)
  })

  // Read pSSH balance
  const { data: psshBalance } = useReadContract({
    address: PSSH_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  })

  // Read pSSH allowance
  const [optimisticAllowance, setOptimisticAllowance] = useState<bigint | null>(null)

  const { data: psshAllowance, refetch: refetchPsshAllowance } = useReadContract({
    address: PSSH_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, LOTTERY_ADDRESS as `0x${string}`] : undefined,
    query: {
      enabled: !!address && paymentMethod === 'pssh',
      refetchInterval: 3000,
      staleTime: 0,
    },
  })

  // Approve contract
  const {
    writeContract: approve,
    data: approveHash,
    isPending: isApprovePending,
    error: approveError,
  } = useWriteContract()

  // Wait for approve transaction
  const {
    isLoading: isApproveLoading,
    isSuccess: isApproveSuccess
  } = useWaitForTransactionReceipt({
    hash: approveHash,
  })

  // Buy tickets with Morbius (pSSH alias)
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

  // Wait for buy transaction
  const buyHash = roundsToPlay > 1 ? buyMultiHash : buyPsshHash
  const {
    isLoading: isBuyLoading,
    isSuccess: isBuySuccess
  } = useWaitForTransactionReceipt({
    hash: buyHash,
  })

  // Calculate costs
  const ticketCount = expandedTickets.length
  const effectiveRounds = roundsToPlay < 1 ? 1 : roundsToPlay
  const totalEntries = ticketCount * effectiveRounds
  const psshCost = TICKET_PRICE * BigInt(ticketCount) * BigInt(effectiveRounds)
  const currentAllowance = optimisticAllowance ?? psshAllowance ?? BigInt(0)
  const requiredAmount = psshCost
  const needsApproval = currentAllowance < requiredAmount

  const currentBalance = psshBalance
  const hasEnoughBalance = currentBalance !== undefined && currentBalance >= psshCost

  // Calculate cost per ticket
  const costPerTicket = TICKET_PRICE

  // Handle approval success
  useEffect(() => {
    if (isApproveSuccess) {
      // Optimistically bump allowance to avoid UI being stuck if RPC refetch lags
      setOptimisticAllowance(requiredAmount)
      const timer = setTimeout(() => {
        refetchPsshAllowance()
        setOptimisticAllowance(null)
      }, 1000)
      setStep('idle')
      return () => clearTimeout(timer)
    }
  }, [isApproveSuccess, refetchPsshAllowance, requiredAmount])

  // Keep latest onSuccess callback in a ref to avoid effect loops
  const onSuccessRef = useRef<typeof onSuccess>(onSuccess)
  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])

  // Handle buy success
  const hasHandledBuySuccessRef = useRef(false)
  useEffect(() => {
    if (isBuySuccess && !hasHandledBuySuccessRef.current) {
      hasHandledBuySuccessRef.current = true
      setStep('success')
      onSuccessRef.current?.()
      // Auto-close after 3 seconds
      setTimeout(() => {
        onOpenChange(false)
        setStep('idle')
      }, 3000)
    }
    if (!isBuySuccess) {
      hasHandledBuySuccessRef.current = false
    }
  }, [isBuySuccess, onOpenChange])

  // Safety: if we are in buying state but nothing is pending/loading and no hash, reset
  useEffect(() => {
    if (step === 'buying' && !isBuyPsshPending && !isBuyMultiPending && !isBuyLoading && !buyHash) {
      const timer = setTimeout(() => {
        setStep('idle')
        if (!errorMessage) {
          setErrorMessage('Purchase did not start. Please try again.')
        }
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [step, isBuyPsshPending, isBuyMultiPending, isBuyLoading, buyHash, errorMessage])

  // Handle errors
  useEffect(() => {
    if (approveError) {
      setStep('error')
      const message = approveError.message.includes('rejected')
        ? 'Transaction rejected by user'
        : 'Approval failed'
      setErrorMessage(message)
      onError?.(approveError)
    }
  }, [approveError, onError])

  useEffect(() => {
    const buyError = roundsToPlay > 1 ? buyMultiError : buyPsshError
    if (buyError) {
      setStep('error')
      const message = buyError.message.includes('rejected')
        ? 'Transaction rejected by user'
        : buyError.message.includes('Round not open')
          ? 'Round is not open for ticket purchases'
          : 'Purchase failed'
      setErrorMessage(message)
      onError?.(buyError)
    }
  }, [buyPsshError, onError, roundsToPlay])

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep('idle')
      setErrorMessage('')
    }
  }, [open])

  const handleApprove = async () => {
    if (!address) return
    setStep('approving')
    setErrorMessage('')

    if (chainId !== pulsechain.id && switchChainAsync) {
      await switchChainAsync({ chainId: pulsechain.id })
    }

    const amount = requiredAmount

    approve({
      address: PSSH_TOKEN_ADDRESS as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [LOTTERY_ADDRESS as `0x${string}`, amount],
      chainId: pulsechain.id,
    })
  }

  const handleBuy = async () => {
    if (!address) {
      setErrorMessage('Please connect your wallet')
      return
    }
    if (ticketCount < 1) {
      setErrorMessage('Add at least one complete ticket before buying.')
      return
    }
    if (!hasEnoughBalance) {
      setErrorMessage('Insufficient Morbius balance for this purchase.')
      return
    }
    if (isProcessing) return

    setStep('buying')
    setErrorMessage('')

    if (chainId !== pulsechain.id && switchChainAsync) {
      await switchChainAsync({ chainId: pulsechain.id })
    }

    try {
      if (roundsToPlay > 1) {
        const offsets = Array.from({ length: effectiveRounds }, (_, i) => i)
        const groups = offsets.map(() => expandedTickets)
        buyTicketsForRounds(groups, offsets)
      } else {
        buyTickets(expandedTickets)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Purchase failed'
      setStep('error')
      setErrorMessage(message)
      onError?.(err as Error)
    }
  }

  const formatToken = (amount: bigint, tokenSymbol: string) => {
    const decimals = TOKEN_DECIMALS
    return parseFloat(formatUnits(amount, decimals)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals === 18 ? 4 : 2,
    })
  }

  const formatPssh = (amount: bigint) => formatToken(amount, 'Morbius')

  const isProcessing = isApprovePending || isApproveLoading || isBuyPsshPending || isBuyMultiPending || isBuyLoading

  const currentTokenSymbol = 'Morbius'
  const displayCost = psshCost

  // Group tickets by their original numbers with quantities for display
  const ticketGroups = tickets
    .map((ticket, index) => ({
      numbers: ticket,
      quantity: ticketQuantities[index] || 1,
      index,
    }))
    .filter(t => t.numbers.length === 6)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-black/95 border-white/10 backdrop-blur-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary" />
            Purchase Summary
          </DialogTitle>
          <DialogDescription>
            Review your tickets before purchasing
          </DialogDescription>
        </DialogHeader>

        {/* Payment Method (WPLS disabled) */}
        <div className="space-y-3 px-6">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            <span className="text-sm font-medium">Payment Method: Morbius</span>
            <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
              Best Rate
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            WPLS purchase is temporarily disabled. Please use Morbius to buy tickets.
          </p>
        </div>

        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
          {/* Ticket List */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Your Tickets</h3>
            <div className="space-y-2">
              {ticketGroups.map((group, idx) => {
                const cost = costPerTicket * BigInt(group.quantity) * BigInt(effectiveRounds)
                return (
                  <div
                    key={idx}
                    className="p-4 bg-black/40 border border-white/10 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Ticket {idx + 1}</span>
                        {group.quantity > 1 && (
                          <span className="text-sm text-white/60">× {group.quantity}</span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">
                          {formatPssh(cost)} <span className="text-sm text-white/60">Morbius</span>
                        </div>
                        {effectiveRounds > 1 && (
                          <div className="text-xs text-white/50">
                            Across {effectiveRounds} rounds
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.numbers.map((num) => (
                        <div
                          key={num}
                          className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-500/40 text-white font-bold text-sm ring-2 ring-green-600/40"
                        >
                          {num}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-2 pt-4 border-t border-white/10">
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Tickets:</span>
              <span className="font-semibold">{ticketCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Rounds to play:</span>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="roundsToPlay">
                  Rounds to play
                </label>
                <input
                  id="roundsToPlay"
                  type="number"
                  min={1}
                  max={10}
                  value={roundsToPlay}
                  onChange={(e) => onRoundsChange(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                  className="w-16 bg-black/40 border border-white/20 rounded px-2 py-1 text-right text-white text-sm"
                />
                <span className="text-white/50 text-xs">max 10</span>
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Total entries (tickets × rounds):</span>
              <span className="font-semibold">{totalEntries}</span>
            </div>

            <div className="pt-2 border-t border-white/10">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-lg">Total Cost:</span>
                <div className="text-right">
                  <div className="font-bold text-xl">
                    {formatToken(displayCost, currentTokenSymbol)} <span className="text-sm text-white/60">{currentTokenSymbol}</span>
                  </div>
                </div>
              </div>

              {/* WPLS auto-swap and savings indicator disabled */}
            </div>

            <div className="flex justify-between text-xs pt-2">
              <span className="text-white/60">Your {currentTokenSymbol} Balance:</span>
              <span className={hasEnoughBalance ? 'text-green-400' : 'text-red-400'}>
                {currentBalance ? formatToken(currentBalance, currentTokenSymbol) : '0'} {currentTokenSymbol}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {step === 'error' && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Success Message */}
          {step === 'success' && (
            <Alert className="border-green-500/50 bg-green-500/10">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              <AlertDescription className="text-green-400">
                Tickets purchased successfully! Good luck!
              </AlertDescription>
            </Alert>
          )}

          {/* Insufficient Balance Warning */}
          {!hasEnoughBalance && ticketCount > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Insufficient {currentTokenSymbol} balance. You need {formatToken(displayCost - (currentBalance || BigInt(0)), currentTokenSymbol)} more {currentTokenSymbol}.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-4 border-t border-white/10">
          {!address ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please connect your wallet to purchase tickets
              </AlertDescription>
            </Alert>
          ) : needsApproval && hasEnoughBalance ? (
            <Button
              onClick={handleApprove}
              disabled={isProcessing || step === 'success'}
              className="w-full"
              size="lg"
            >
              {step === 'approving' || (isApprovePending || isApproveLoading) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <Coins className="h-4 w-4 mr-2" />
                  Approve {currentTokenSymbol}
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleBuy}
              disabled={!hasEnoughBalance || isProcessing || step === 'success'}
              className="w-full"
              size="lg"
            >
              {step === 'buying' || isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Purchasing...
                </>
              ) : (
                <>
                  <Ticket className="h-4 w-4 mr-2" />
                  Buy {totalEntries} Entr{totalEntries === 1 ? 'y' : 'ies'} with {currentTokenSymbol}
                </>
              )}
            </Button>
          )}

          {needsApproval && (
            <p className="text-xs text-center text-white/60">
              You need to approve the lottery contract to spend your {currentTokenSymbol} tokens. This is a one-time approval.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

