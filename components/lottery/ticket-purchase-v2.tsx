'use client'

import { useState, useEffect, useRef } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId } from 'wagmi'
import { formatUnits } from 'viem'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, XCircle, Ticket, Coins, AlertCircle } from 'lucide-react'
import { LOTTERY_ADDRESS, PSSH_TOKEN_ADDRESS, TICKET_PRICE, TOKEN_DECIMALS } from '@/lib/contracts'
import { pulsechain } from '@/lib/chains'
import { useBuyTickets } from '@/hooks/use-lottery-6of55'
import { ERC20_ABI } from '@/abi/erc20'

interface TicketPurchaseProps {
  tickets: number[][]
  onSuccess?: () => void
  onError?: (error: Error) => void
}

export function TicketPurchaseV2({
  tickets,
  onSuccess,
  onError,
}: TicketPurchaseProps) {
  const { address } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const [step, setStep] = useState<'idle' | 'approving' | 'buying' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const paymentMethod: 'pssh' = 'pssh' // WPLS disabled

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
  const { data: psshAllowance, refetch: refetchPsshAllowance } = useReadContract({
    address: PSSH_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, LOTTERY_ADDRESS as `0x${string}`] : undefined,
    query: {
      enabled: !!address,
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

  // Buy tickets with Morbius (pSSH)
  const {
    buyTickets,
    data: buyPsshHash,
    isPending: isBuyPsshPending,
    error: buyPsshError,
  } = useBuyTickets()

  // Wait for buy transaction
  const buyHash = buyPsshHash
  const {
    isLoading: isBuyLoading,
    isSuccess: isBuySuccess
  } = useWaitForTransactionReceipt({
    hash: buyHash,
  })

  // Calculate costs
  const ticketCount = tickets.length
  const psshCost = TICKET_PRICE * BigInt(ticketCount)

  const currentAllowance = psshAllowance
  const requiredAmount = psshCost
  const needsApproval = currentAllowance !== undefined && currentAllowance < requiredAmount

  // Check if user has enough balance
  const currentBalance = psshBalance
  const hasEnoughBalance = currentBalance !== undefined && currentBalance >= psshCost

  // Handle approval success
  useEffect(() => {
    if (isApproveSuccess) {
      const timer = setTimeout(() => {
        refetchPsshAllowance()
      }, 1000)
      setStep('idle')
      return () => clearTimeout(timer)
    }
  }, [isApproveSuccess, refetchPsshAllowance])

  // Keep latest onSuccess callback in a ref
  const onSuccessRef = useRef<typeof onSuccess | undefined>(undefined)
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
    const buyError = buyPsshError
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
  }, [buyPsshError, onError])

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
    setStep('buying')
    setErrorMessage('')

    if (chainId !== pulsechain.id && switchChainAsync) {
      await switchChainAsync({ chainId: pulsechain.id })
    }

    buyTickets(tickets)
  }

  const formatToken = (amount: bigint, tokenSymbol: string) => {
    const decimals = TOKEN_DECIMALS
    return parseFloat(formatUnits(amount, decimals)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals === 18 ? 4 : 2,
    })
  }

  const isProcessing = isApprovePending || isApproveLoading || isBuyPsshPending || isBuyLoading

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

  const currentTokenSymbol = 'Morbius'
  const displayCost = psshCost

  return (
    <Card className="p-6 space-y-6">
      {/* Payment Method (WPLS disabled) */}
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Coins className="h-4 w-4" />
          Payment Method: Morbius
        </label>
        <p className="text-xs text-muted-foreground">
          WPLS purchase is temporarily disabled. Please use Morbius to buy tickets.
        </p>
      </div>

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

          <div className="pt-2 border-t border-border">
            <div className="flex justify-between items-center">
              <span className="font-semibold">Total Cost:</span>
              <div className="text-right">
                <div className="font-bold text-lg">
                  {formatToken(displayCost, currentTokenSymbol)} <span className="text-sm text-muted-foreground">{currentTokenSymbol}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Your {currentTokenSymbol} Balance:</span>
            <span className={hasEnoughBalance ? 'text-green-500' : 'text-red-500'}>
              {currentBalance ? formatToken(currentBalance, currentTokenSymbol) : '0'} {currentTokenSymbol}
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
            Insufficient {currentTokenSymbol} balance. You need {formatToken(displayCost - (currentBalance || BigInt(0)), currentTokenSymbol)} more {currentTokenSymbol}.
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
                Buy {ticketCount} Ticket{ticketCount !== 1 ? 's' : ''} with {currentTokenSymbol}
              </>
            )}
          </Button>
        )}
      </div>

      {/* Help Text */}
      {needsApproval && (
        <p className="text-xs text-center text-muted-foreground">
          You need to approve the lottery contract to spend your {currentTokenSymbol} tokens. This is a one-time approval.
        </p>
      )}
    </Card>
  )
}
