'use client'

import { useState, useEffect, useRef } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId } from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, XCircle, Ticket, Coins, AlertCircle } from 'lucide-react'
import { LOTTERY_ADDRESS, PSSH_TOKEN_ADDRESS, WPLS_TOKEN_ADDRESS, TICKET_PRICE } from '@/lib/contracts'
import { pulsechain } from '@/lib/chains'
import { useBuyTickets } from '@/hooks/use-lottery-6of55'
import { ERC20_ABI } from '@/abi/erc20'

interface TicketPurchaseProps {
  tickets: number[][]
  onSuccess?: () => void
  onError?: (error: Error) => void
  freeTicketCredits?: number
}

export function TicketPurchase({
  tickets,
  onSuccess,
  onError,
  freeTicketCredits = 0
}: TicketPurchaseProps) {
  const { address } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const [step, setStep] = useState<'idle' | 'approving' | 'buying' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<'pssh' | 'wpls'>('pssh')

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

  // Read WPLS balance
  const { data: wplsBalance } = useReadContract({
    address: WPLS_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  })

  // Read pSSH allowance
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

  // Read WPLS allowance
  const { data: wplsAllowance, refetch: refetchWplsAllowance } = useReadContract({
    address: WPLS_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, LOTTERY_ADDRESS as `0x${string}`] : undefined,
    query: {
      enabled: !!address && paymentMethod === 'wpls',
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

  // Buy tickets
  const {
    buyTickets,
    data: buyHash,
    isPending: isBuyPending,
    error: buyError,
  } = useBuyTickets()

  // Wait for buy transaction
  const {
    isLoading: isBuyLoading,
    isSuccess: isBuySuccess
  } = useWaitForTransactionReceipt({
    hash: buyHash,
  })

  // Calculate costs
  const ticketCount = tickets.length
  const freeTicketsToUse = Math.min(freeTicketCredits, ticketCount)
  const ticketsToPay = ticketCount - freeTicketsToUse
  const totalCost = TICKET_PRICE * BigInt(ticketsToPay)
  const currentAllowance = paymentMethod === 'pssh' ? psshAllowance : wplsAllowance
  const needsApproval = currentAllowance !== undefined && currentAllowance < totalCost

  // Check if user has enough balance
  const currentBalance = paymentMethod === 'pssh' ? psshBalance : wplsBalance
  const hasEnoughBalance = currentBalance !== undefined && currentBalance >= totalCost

  // Handle approval success
  useEffect(() => {
    if (isApproveSuccess) {
      // Wait a bit for blockchain state to update, then refetch
      const timer = setTimeout(() => {
        if (paymentMethod === 'pssh') {
          refetchPsshAllowance()
        } else {
          refetchWplsAllowance()
        }
      }, 1000)
      setStep('idle')
      return () => clearTimeout(timer)
    }
  }, [isApproveSuccess, refetchPsshAllowance, refetchWplsAllowance, paymentMethod])

  // Keep latest onSuccess callback in a ref to avoid effect loops
  const onSuccessRef = useRef<typeof onSuccess | undefined>(undefined)
  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])

  // Handle buy success (run once per success transition)
  const hasHandledBuySuccessRef = useRef(false)
  useEffect(() => {
    if (isBuySuccess && !hasHandledBuySuccessRef.current) {
      hasHandledBuySuccessRef.current = true
      setStep('success')
      onSuccessRef.current?.()
    }
    if (!isBuySuccess) {
      hasHandledBuySuccessRef.current = false
    }
  }, [isBuySuccess])

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
  }, [buyError, onError])

  const handleApprove = async () => {
    if (!address) return
    setStep('approving')
    setErrorMessage('')

    // Ensure correct network before prompting wallet
    if (chainId !== pulsechain.id && switchChainAsync) {
      await switchChainAsync({ chainId: pulsechain.id })
    }

    approve({
      address: PSSH_TOKEN_ADDRESS as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [LOTTERY_ADDRESS as `0x${string}`, totalCost],
      chainId: pulsechain.id,
    })
  }

  const handleBuy = async () => {
    setStep('buying')
    setErrorMessage('')

    // Ensure correct network before prompting wallet
    if (chainId !== pulsechain.id && switchChainAsync) {
      await switchChainAsync({ chainId: pulsechain.id })
    }

    buyTickets(tickets)
  }

  const formatPssh = (amount: bigint) => {
    return parseFloat(formatUnits(amount, 9)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  const isProcessing = isApprovePending || isApproveLoading || isBuyPending || isBuyLoading

  if (!address) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Please connect your wallet to purchase tickets
        </AlertDescription>
      </Alert>
    )
  }

  if (tickets.length === 0) {
    return (
      <Card className="p-6 bg-black/40 border-white/10">
        <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
          <p className="text-sm">
          Select at least one complete ticket to continue
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6 space-y-6">
      {/* Purchase Summary */}
      <div className="space-y-3">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Ticket className="h-5 w-5 text-primary" />
          Purchase Summary
        </h3>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Tickets:</span>
            <span className="font-semibold">{ticketCount}</span>
          </div>

          {freeTicketsToUse > 0 && (
            <>
              <div className="flex justify-between text-green-500">
                <span>Free Tickets Applied:</span>
                <span className="font-semibold">-{freeTicketsToUse}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tickets to Pay:</span>
                <span className="font-semibold">{ticketsToPay}</span>
              </div>
            </>
          )}

          <div className="pt-2 border-t border-border">
            <div className="flex justify-between items-center">
              <span className="font-semibold">Total Cost:</span>
              <div className="text-right">
                <div className="font-bold text-lg">
                  {formatPssh(totalCost)} <span className="text-sm text-muted-foreground">pSSH</span>
                </div>
                {freeTicketsToUse > 0 && (
                  <div className="text-xs text-muted-foreground line-through">
                    {formatPssh(TICKET_PRICE * BigInt(ticketCount))} pSSH
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Your Balance:</span>
            <span className={hasEnoughBalance ? 'text-green-500' : 'text-red-500'}>
              {currentBalance ? formatPssh(currentBalance) : '0'} {paymentMethod === 'pssh' ? 'pSSH' : 'WPLS'}
            </span>
          </div>
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
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-green-500">
            Tickets purchased successfully! Good luck!
          </AlertDescription>
        </Alert>
      )}

      {/* Insufficient Balance Warning */}
      {!hasEnoughBalance && ticketsToPay > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Insufficient {paymentMethod === 'pssh' ? 'pSSH' : 'WPLS'} balance. You need {formatPssh(totalCost - (currentBalance || BigInt(0)))} more {paymentMethod === 'pssh' ? 'pSSH' : 'WPLS'}.
          </AlertDescription>
        </Alert>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        {needsApproval && hasEnoughBalance ? (
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
                Approve {formatPssh(totalCost)} pSSH
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
            {step === 'buying' || (isBuyPending || isBuyLoading) ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Purchasing...
              </>
            ) : (
              <>
                <Ticket className="h-4 w-4 mr-2" />
                Buy {ticketCount} Ticket{ticketCount !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        )}

      </div>

      {/* Help Text */}
      {needsApproval && (
        <p className="text-xs text-center text-muted-foreground">
          You need to approve the lottery contract to spend your pSSH tokens. This is a one-time approval.
        </p>
      )}
    </Card>
  )
}
