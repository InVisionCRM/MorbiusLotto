'use client'

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { RippleButton } from '@/components/ui/ripple-button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text'
import {
  LOTTERY_ADDRESS,
  TICKET_PRICE,
  MORBIUS_TOKEN_ADDRESS,
  TOKEN_DECIMALS,
  MIN_NUMBER,
  MAX_NUMBER,
  NUMBERS_PER_TICKET,
  WPLS_TOKEN_ADDRESS,
  PULSEX_V1_ROUTER_ADDRESS,
  WPLS_TO_MORBIUS_BUFFER_BPS,
} from '@/lib/contracts'
import { pulsechain } from '@/lib/chains'
import { ERC20_ABI } from '@/abi/erc20'
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2'
import { useBuyTickets, useBuyTicketsForRounds, useBuyTicketsWithPLS, useBuyTicketsWithPLSForRounds } from '@/hooks/use-lottery-6of55'
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { useWalletDetection } from '@/hooks/use-wallet-detection'
import { useNetworkValidation } from '@/hooks/use-network-validation'
import { useNativeBalance } from '@/hooks/use-native-balance'
import { useTokenApproval } from '@/hooks/use-token-approval'
import { usePlsQuote } from '@/hooks/use-pls-quote'
import { formatUnits, formatEther } from 'viem'
import { toast } from 'sonner'
import { LoaderOne } from '@/components/ui/loader'
import { cn } from '@/lib/utils'
import { Plus, Minus } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { SignaturePrompt } from '@/components/auth/SignaturePrompt'

interface TicketPurchaseBuilderProps {
  initialRounds?: number
  onSuccess?: () => void
  onError?: (error: Error) => void
  onStateChange?: (tickets: number[][], rounds: number) => void
}

export function TicketPurchaseBuilder({
  initialRounds = 1,
  onSuccess,
  onError,
  onStateChange,
}: TicketPurchaseBuilderProps) {
  const { address } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()

  // Enhanced wallet detection and network validation
  const {
    isInternetMoney,
    getSafeGasEstimate,
    clearWalletCache,
    isMobile
  } = useWalletDetection()
  const { isOnPulseChain, switchToPulseChain } = useNetworkValidation()

  const [workingTicket, setWorkingTicket] = useState<number[]>([])
  const [workingRounds, setWorkingRounds] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState<'MORBIUS' | 'PLS'>('MORBIUS')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [uiState, setUiState] = useState<'idle' | 'approving' | 'buying' | 'success' | 'error'>('idle')
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [successTxHash, setSuccessTxHash] = useState<string>('')
  const [successRoundsCount, setSuccessRoundsCount] = useState(0)
  const [showSignaturePrompt, setShowSignaturePrompt] = useState(false)

  // Authentication hook
  const { signMessageAsync } = useAuth()

  // Handle signature confirmation for high-value transactions
  const handleSignatureConfirm = async (): Promise<boolean> => {
    try {
      const totalCost = paymentMethod === 'PLS' ? plsValueWei : MORBIUSCost
      const amount = paymentMethod === 'PLS'
        ? `${formatEther(totalCost)} PLS`
        : `${formatUnits(totalCost, TOKEN_DECIMALS)} MORBIUS`

      const transactionMessage = `Confirm Lottery Purchase\n\nAmount: ${amount}\nTickets: 1\nRounds: ${workingRounds}\n\nThis action cannot be undone.`

      await signMessageAsync({ message: transactionMessage })

      // If signature succeeds, proceed with purchase
      await executePurchaseAfterSignature()
      return true
    } catch (error) {
      console.error('Signature failed:', error)
      setErrorMessage('Transaction cancelled')
      setUiState('error')
      return false
    }
  }

  // Execute purchase after signature confirmation
  const executePurchaseAfterSignature = async () => {
    try {
      if (isInternetMoney) {
        console.log('🌐 Preparing transaction for Internet Money wallet...')
      }

      if (workingTicket.length !== NUMBERS_PER_TICKET) {
        throw new Error(`Select ${NUMBERS_PER_TICKET} numbers`)
      }

      const ticket = [workingTicket]
      const boundedRounds = Math.max(1, Math.min(100, workingRounds))

      if (paymentMethod === 'PLS') {
        const valueWei = plsValueWei
        if (valueWei === BigInt(0)) {
          throw new Error('PLS amount is zero')
        }

        console.log('💰 Buying with PLS:', { ticket, rounds: boundedRounds, valueWei: valueWei.toString() })

        if (boundedRounds > 1) {
          // Multi-round purchase with PLS
          const offsets = Array.from({ length: boundedRounds }, (_, i) => i)
          const groups = offsets.map(() => ticket)
          console.log('🚨 MULTI-ROUND PLS PURCHASE:', {
            totalTickets: 1,
            rounds: boundedRounds,
            groups: groups.map(g => g.length),
            offsets,
            plsValue: valueWei.toString(),
            plsValueEther: (Number(valueWei) / 1e18).toFixed(4),
          })
          buyTicketsWithPLSForRounds(groups, offsets, valueWei)
        } else {
          // Single round purchase with PLS
          console.log('🎫 Buying for current round with PLS:', ticket)
          buyTicketsWithPLS(ticket, valueWei)
        }
      } else {
        console.log('🎫 Buying with MORBIUS:', { ticket, rounds: boundedRounds })

        if (boundedRounds > 1) {
          const offsets = Array.from({ length: boundedRounds }, (_, i) => i)
          const groups = offsets.map(() => ticket)
          console.log('📅 Buying for multiple rounds:', { groups, offsets })
          buyTicketsForRounds(groups, offsets)
        } else {
          console.log('🎫 Buying for current round:', ticket)
          buyTickets(ticket)
        }
      }
    } catch (err) {
      console.error('❌ Purchase error:', err)
      let message = err instanceof Error ? err.message : 'Purchase failed'

      // Special handling for Internet Money wallet errors
      if (isInternetMoney && err instanceof Error) {
        if (err.message.includes('gas') || err.message.includes('estimation')) {
          console.log('🌐 Gas estimation failed for Internet Money - clearing cache')
          message = 'Connection issue detected. Please try again.'
          clearWalletCache()

          // Suggest retry after cache clear
          setTimeout(() => {
            toast.info('Connection refreshed. You can try purchasing again.')
          }, 2000)
        } else if (err.message.includes('network') || err.message.includes('chain')) {
          message = 'Please ensure Internet Money is connected to PulseChain network.'
        }
      }

      setErrorMessage(message)
      setUiState('error')
      onErrorRef.current?.(err instanceof Error ? err : new Error(message))
    }
  }

  const onSuccessRef = useRef<typeof onSuccess>(onSuccess)
  const onErrorRef = useRef<typeof onError>(onError)
  const onStateChangeRef = useRef<typeof onStateChange>(onStateChange)
  
  useEffect(() => {
    onSuccessRef.current = onSuccess
    onErrorRef.current = onError
    onStateChangeRef.current = onStateChange
  }, [onSuccess, onError, onStateChange])

  // Notify parent on state change
  useEffect(() => {
    onStateChangeRef.current?.([workingTicket], workingRounds)
  }, [workingTicket, workingRounds])


  const { data: MORBIUSBalance, isLoading: isLoadingBalance, error: balanceError } = useReadContract({
    address: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  })

  // Debug balance fetching
  console.log('💰 Balance fetch:', {
    address: address?.slice(0, 6) + '...',
    balance: MORBIUSBalance?.toString() ?? 'undefined',
    error: balanceError?.message,
    isLoading: isLoadingBalance,
    tokenAddress: MORBIUS_TOKEN_ADDRESS
  })

  // Use native PLS balance for PLS payments
  const { balance: nativePlsBalance, isLoading: isLoadingPlsBalance } = useNativeBalance(address)

  // Debug balance fetching
  useEffect(() => {
    console.log('💰 Balance fetch:', {
      address,
      MORBIUSBalance: MORBIUSBalance?.toString(),
      formatted: MORBIUSBalance ? formatUnits(MORBIUSBalance, TOKEN_DECIMALS) : 'N/A',
      isLoadingBalance,
      balanceError: balanceError?.message,
      tokenAddress: MORBIUS_TOKEN_ADDRESS
    })
  }, [MORBIUSBalance, address, isLoadingBalance, balanceError])

  // Calculate costs first (needed for hooks)
  const ticketCount = workingTicket.length === NUMBERS_PER_TICKET ? 1 : 0
  const totalEntries = useMemo(
    () => (workingTicket.length === NUMBERS_PER_TICKET ? Math.max(1, Math.min(100, workingRounds)) : 0),
    [workingTicket.length, workingRounds]
  )
  const maxRounds = workingRounds

  const { data: ticketPriceMORBIUSData } = useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'ticketPriceMORBIUS',
  })
  const pricePerTicket = (ticketPriceMORBIUSData as bigint | undefined) ?? TICKET_PRICE
  const MORBIUSCost = pricePerTicket * BigInt(totalEntries || 0)

  // Token approval hook
  const {
    allowance: MORBIUSAllowance,
    needsApproval,
    isLoadingAllowance,
    approve,
    isApproving,
    isApprovalSuccess,
    approvalError,
  } = useTokenApproval({
    tokenAddress: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
    spenderAddress: LOTTERY_ADDRESS as `0x${string}`,
    requiredAmount: MORBIUSCost,
    userAddress: address,
    enabled: paymentMethod === 'MORBIUS',
  })

  // PLS quote hook
  const {
    plsValue: plsValueWei,
    isLoading: isLoadingPlsQuote,
    error: plsQuoteError,
    usingFallback: isUsingFallbackPrice,
  } = usePlsQuote({
    morbiusCost: MORBIUSCost,
    enabled: paymentMethod === 'PLS',
  })

  const {
    buyTickets,
    data: buyMORBIUSHash,
    isPending: isBuyMORBIUSPending,
    error: buyMORBIUSError,
  } = useBuyTickets()

  const {
    buyTicketsForRounds,
    data: buyMultiHash,
    isPending: isBuyMultiPending,
    error: buyMultiError,
  } = useBuyTicketsForRounds()

  const {
    buyTicketsWithPLS,
    data: buyPlsHash,
    isPending: isBuyPlsPending,
    error: buyPlsError,
  } = useBuyTicketsWithPLS()

  const {
    buyTicketsWithPLSForRounds,
    data: buyPlsMultiHash,
    isPending: isBuyPlsMultiPending,
    error: buyPlsMultiError,
  } = useBuyTicketsWithPLSForRounds()

  const buyHash = paymentMethod === 'PLS'
    ? (workingRounds > 1 ? buyPlsMultiHash : buyPlsHash)
    : (workingRounds > 1 ? buyMultiHash : buyMORBIUSHash)
  const { isLoading: isBuyLoading, isSuccess: isBuySuccess } = useWaitForTransactionReceipt({
    hash: buyHash,
  })

  // Balance checks
  const hasEnoughBalance = paymentMethod === 'PLS'
    ? (nativePlsBalance !== undefined && nativePlsBalance >= plsValueWei)
    : (MORBIUSBalance !== undefined && MORBIUSBalance >= MORBIUSCost)
  const isProcessing = isApproving || isBuyMORBIUSPending || isBuyMultiPending || isBuyPlsPending || isBuyPlsMultiPending

  const canBuy =
    workingTicket.length === NUMBERS_PER_TICKET &&
    (paymentMethod === 'MORBIUS'
      ? hasEnoughBalance && !needsApproval
      : hasEnoughBalance)
  const isApproveLoadingState = uiState === 'approving' || isApproving
  const isBuyLoadingState = uiState === 'buying' || isBuyLoading || isBuyMORBIUSPending || isBuyMultiPending || isBuyPlsPending

  // Debug purchase conditions
  console.log('🛒 Purchase conditions:', {
    paymentMethod,
    ticketCount,
    totalEntries,
    MORBIUSCost: MORBIUSCost.toString(),
    plsValueWei: plsValueWei.toString(),
    plsValueDisplay: formatEther ? Number(formatEther(plsValueWei)).toFixed(4) : 'N/A',
    MORBIUSAllowance: MORBIUSAllowance?.toString() ?? 'undefined',
    needsApproval,
    hasEnoughBalance,
    MORBIUSBalance: MORBIUSBalance?.toString() ?? 'undefined',
    nativePlsBalance: nativePlsBalance?.toString() ?? 'undefined',
    canBuy,
    isProcessing,
    address: address?.slice(0, 6) + '...',
    whichButton: (paymentMethod === 'MORBIUS' && needsApproval && hasEnoughBalance) ? 'APPROVE' : 'BUY',
    isUsingFallbackPrice,
  })

  // Handle approval success
  useEffect(() => {
    if (isApprovalSuccess) {
      console.log('✅ Approval transaction successful')
      setUiState('idle')
    }
  }, [isApprovalSuccess])

  // Handle approval error
  useEffect(() => {
    if (approvalError) {
      console.error('❌ Approval failed:', approvalError)
      setUiState('error')
      setErrorMessage(approvalError.message.includes('rejected') ? 'Approval rejected' : 'Approval failed')
      onErrorRef.current?.(approvalError)
    }
  }, [approvalError])

  const hasHandledBuySuccess = useRef(false)
  useEffect(() => {
    if (isBuySuccess && !hasHandledBuySuccess.current) {
      hasHandledBuySuccess.current = true
      setUiState('success')

      // Show success modal if we have buyHash
      if (buyHash) {
        setSuccessTxHash(buyHash)
        setSuccessRoundsCount(maxRounds)
        setShowSuccessModal(true)
      }

      setWorkingTicket([])
      setWorkingRounds(1)
      setWorkingTicket([])
      setWorkingRounds(1)
      onSuccessRef.current?.()
    }
    if (!isBuySuccess) {
      hasHandledBuySuccess.current = false
    }
  }, [isBuySuccess, buyHash, maxRounds])

  useEffect(() => {
    const err = maxRounds > 1 ? buyMultiError : buyMORBIUSError
    if (err) {
      setUiState('error')
      setErrorMessage(
        err.message.includes('rejected')
          ? 'Purchase rejected'
          : err.message.includes('Round not open')
            ? 'Round not open'
            : 'Purchase failed'
      )
      onErrorRef.current?.(err)
    }
  }, [buyMultiError, buyMORBIUSError, maxRounds])

  useEffect(() => {
    if (buyPlsError) {
      setUiState('error')
      setErrorMessage(buyPlsError.message.includes('rejected') ? 'Purchase rejected' : 'Purchase failed')
      onErrorRef.current?.(buyPlsError)
    }
  }, [buyPlsError])

  const handleApprove = async () => {
    if (!address) return
    setUiState('approving')
    setErrorMessage('')
    if (chainId !== pulsechain.id && switchChainAsync) {
      await switchChainAsync({ chainId: pulsechain.id })
    }

    console.log('✅ Approving MORBIUS for lottery contract')
    approve()
  }

  const handleBuy = async () => {
    console.log('🛒 handleBuy called with:', {
      address,
      workingTicket,
      workingRounds,
      paymentMethod,
      hasEnoughBalance,
    })

    if (!address) {
      setErrorMessage('Connect wallet')
      setUiState('error')
      return
    }
    if (workingTicket.length !== NUMBERS_PER_TICKET) {
      setErrorMessage(`Select ${NUMBERS_PER_TICKET} numbers`)
      setUiState('error')
      return
    }
    if (paymentMethod === 'MORBIUS' && !hasEnoughBalance) {
      setErrorMessage('Balance too low')
      setUiState('error')
      return
    }
    if (paymentMethod === 'PLS' && plsValueWei === BigInt(0)) {
      const errorDetail = plsQuoteError
        ? `PLS price quote failed: ${plsQuoteError.message.slice(0, 100)}`
        : 'Unable to fetch PLS price quote. Please try MORBIUS payment or refresh.'
      setErrorMessage(errorDetail)
      setUiState('error')
      console.error('❌ PLS quote error:', plsQuoteError)
      return
    }
    setUiState('buying')
    setErrorMessage('')

    // Check network first
    if (!isOnPulseChain) {
      console.log('🔄 Switching to PulseChain...')
      try {
        await switchToPulseChain()
        // Wait a moment for network switch to complete
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (error) {
        console.error('Failed to switch network:', error)
        setErrorMessage('Please switch to PulseChain network manually in your wallet.')
        setUiState('error')
        return
      }
    }

    // Check if signature verification is needed for high-value transactions
    const totalCost = paymentMethod === 'PLS' ? plsValueWei : MORBIUSCost
    const isHighValue = Number(totalCost) > 100 * 10**18 // > 100 MORBIUS or equivalent PLS

    if (isHighValue) {
      setShowSignaturePrompt(true)
      return // Wait for signature confirmation
    }

    // If we reach here, either it's not a high-value transaction or signature was already confirmed
    await executePurchaseAfterSignature()
  }

  const formatToken = (amount: bigint) =>
    parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })

  const toggleNumber = (num: number) => {
    setWorkingTicket((prev) => {
      if (prev.includes(num)) {
        return prev.filter((n) => n !== num)
      }
      if (prev.length >= NUMBERS_PER_TICKET) return prev
      return [...prev, num].sort((a, b) => a - b)
    })
  }

  const handleQuickPick = () => {
    const nums: number[] = []
    while (nums.length < NUMBERS_PER_TICKET) {
      const n = Math.floor(Math.random() * MAX_NUMBER) + MIN_NUMBER
      if (!nums.includes(n)) nums.push(n)
    }
    setWorkingTicket(nums.sort((a, b) => a - b))
  }


  return (
    <>
    <Card
      className="relative overflow-hidden p-0 w-full max-w-full min-h-[610px]"
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
        border: '1px inset rgba(60, 60, 60, 0.5)',
      }}
    >

      <div className="relative flex flex-col gap-4 p-4 min-h-0 overflow-x-hidden w-full">
        {/* Builder Panel */}
        <div className="flex-1 space-y-4 min-w-0 w-full overflow-x-hidden">
          {/* Number Grid */}
          <div className="w-full overflow-x-hidden">
            <div className="grid grid-cols-6 xs:grid-cols-7 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-11 gap-0 p-0 rounded-0 mb-3 w-full">
              {Array.from({ length: MAX_NUMBER }, (_, i) => i + MIN_NUMBER).map((num) => {
                const selected = workingTicket.includes(num)
                return (
                  <button
                    key={num}
                    onClick={() => toggleNumber(num)}
                    disabled={!selected && workingTicket.length >= NUMBERS_PER_TICKET}
                    className={cn(
                      'h-8 rounded-0 text-xs font-semibold transition-all cursor-pointer p-0',
                      selected
                        ? 'bg-white text-black border border-white scale-105'
                        : 'text-white hover:border-white/40'
                    )}
                    style={!selected ? {
                      background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                      boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                      border: '1px inset rgba(60, 60, 60, 0.5)',
                    } : undefined}
                  >
                    {num}
                  </button>
                )
              })}
            </div>

            {/* Selected Numbers Display */}
            <div
              className="rounded-lg p-2 mb-2"
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                border: '1px inset rgba(60, 60, 60, 0.5)',
              }}
            >
              <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center mb-2">
                {workingTicket.length > 0 ? (
                  workingTicket.map((n) => (
                    <span
                      key={n}
                      className="h-7 min-w-7 px-2 flex items-center justify-center rounded-full bg-white text-black font-bold text-sm"
                    >
                      {n}
                    </span>
                  ))
                ) : (
                  <span className="text-white/50 text-sm">Select {NUMBERS_PER_TICKET} numbers</span>
                )}
                <span className="ml-auto text-white/60 text-xs">
                  {workingTicket.length}/{NUMBERS_PER_TICKET}
                </span>
              </div>

              {/* Quick Actions - Inline */}
              <div className="flex gap-2">
                <RippleButton
                  size="sm"
                  variant="outline"
                  className="border-white/30 text-white text-xs px-2 h-7"
                  onClick={handleQuickPick}
                >
                  Quick Pick
                </RippleButton>
                <RippleButton
                  size="sm"
                  variant="outline"
                  className="border-white/30 text-white text-xs px-2 h-7"
                  onClick={() => setWorkingTicket([])}
                  disabled={workingTicket.length === 0}
                >
                  Clear
                </RippleButton>
              </div>
            </div>
          </div>

          {/* Rounds Selector */}
          {/* <div className="space-y-2">
            <label className="text-white/70 text-sm">Rounds for this ticket</label>
            <div className="flex items-center gap-2">
              <RippleButton
                size="sm"
                variant="outline"
                className="border-white/30 text-white h-8 w-8 p-0"
                onClick={() => setWorkingRounds(Math.max(1, workingRounds - 1))}
                disabled={workingRounds <= 1}
              >
                <Minus className="w-3 h-3" />
              </RippleButton>
              <input
                type="number"
                min={1}
                max={100}
                value={workingRounds}
                onChange={(e) => setWorkingRounds(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                className="w-16 h-8 rounded border border-white/20 bg-gradient-to-br from-slate-950 to-slate-900/40 text-white text-center font-semibold text-sm"
                title="Number of rounds for this ticket"
              />
              <RippleButton
                size="sm"
                variant="outline"
                className="border-white/30 text-white h-8 w-8 p-0"
                onClick={() => setWorkingRounds(Math.min(100, workingRounds + 1))}
                disabled={workingRounds >= 100}
              >
                <Plus className="w-3 h-3" />
              </RippleButton>
              <div className="flex gap-1 ml-auto">
                {[5, 10, 25, 50].map((v) => (
                  <RippleButton
                    key={v}
                    size="sm"
                    variant="outline"
                    className="border-white/30 text-white text-xs px-2 h-7"
                    onClick={() => setWorkingRounds(v)}
                  >
                    {v}
                  </RippleButton>
                ))}
              </div>
            </div>
          </div> */}

          {/* Payment Method Selection - Text Labels */}
          <div
            className="mb-4 p-3 rounded-lg"
            style={{
              background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
              border: '1px inset rgba(60, 60, 60, 0.5)',
            }}
          >
            <div className="text-xs text-white/70 mb-2 font-medium text-center">Pay In...</div>
            <div className="flex items-center justify-center gap-4">
              <span
                className={cn(
                  'cursor-pointer transition-all duration-300 px-2 py-1 rounded text-xl',
                  paymentMethod === 'MORBIUS'
                    ? 'mitr-semibold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent'
                    : 'mitr-regular text-white/70 hover:text-white'
                )}
                onClick={() => setPaymentMethod('MORBIUS')}
              >
                MORBIUS
              </span>
              <span className="text-white/50 text-xl">/</span>
              <span
                className={cn(
                  'cursor-pointer transition-all duration-300 px-2 py-1 rounded text-xl inline-flex items-center gap-1',
                  paymentMethod === 'PLS'
                    ? 'mitr-semibold bg-gradient-to-r from-pink-400 via-red-400 to-purple-500 bg-clip-text text-transparent'
                    : 'mitr-regular text-white/70 hover:text-white'
                )}
                onClick={() => setPaymentMethod('PLS')}
              >
                <Image
                  src="/Pulse Branding/Logo/ball1.png"
                  alt="PulseChain"
                  width={16}
                  height={16}
                  className="flex-shrink-0"
                />
                PLS
              </span>
            </div>
          </div>

          {/* Purchase Summary */}
          <div className="space-y-2 border-t border-white/10 pt-3">
            <div className="flex justify-between text-xs">
              <span className="text-white/70">Rounds</span>
              <span className="text-white font-semibold">{workingRounds}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/70">Total Entries</span>
              <span className="text-white font-semibold">{totalEntries}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/70">Cost</span>
              <span className="text-white font-semibold">
                {paymentMethod === 'PLS' ? (
                  isLoadingPlsQuote ? (
                    'Loading...'
                  ) : plsQuoteError ? (
                    <span className="text-red-400">Error</span>
                  ) : plsValueWei === BigInt(0) ? (
                    <span className="text-amber-400">Quote unavailable</span>
                  ) : (
                    `${Number(formatEther(plsValueWei)).toFixed(4)} PLS`
                  )
                ) : (
                  `${formatToken(MORBIUSCost)} MORBIUS`
                )}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/70">Balance</span>
              <span
                className={cn(
                  'font-semibold',
                  hasEnoughBalance ? 'text-cyan-500' : 'text-amber-400'
                )}
                title={`Raw: ${paymentMethod === 'PLS' ? nativePlsBalance?.toString() : MORBIUSBalance?.toString() || 'undefined'} | Address: ${address || 'not connected'}`}
              >
                {paymentMethod === 'PLS' ? (
                  isLoadingPlsBalance ? (
                    'Loading...'
                  ) : nativePlsBalance !== undefined ? (
                    `${Number(formatEther(nativePlsBalance)).toFixed(4)} PLS`
                  ) : (
                    `— ${address ? '(fetching...)' : '(connect wallet)'}`
                  )
                ) : (
                  isLoadingBalance ? (
                    'Loading...'
                  ) : MORBIUSBalance !== undefined ? (
                    `${formatToken(MORBIUSBalance)} MORBIUS`
                  ) : (
                    `— ${address ? '(fetching...)' : '(connect wallet)'}`
                  )
                )}
              </span>
            </div>

            {/* Error/Success Messages */}
            {uiState === 'error' && errorMessage && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">{errorMessage}</AlertDescription>
              </Alert>
            )}
            {uiState === 'success' && (
              <Alert className="border-cyan-500/40 bg-cyan-500/10">
                <AlertDescription className="text-cyan-200 text-sm">Success! Good luck!</AlertDescription>
              </Alert>
            )}
            {/* PLS Quote Error Warning */}
            {paymentMethod === 'PLS' && plsQuoteError && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">
                  Unable to fetch PLS price quote. Try using MORBIUS or refreshing the page.
                </AlertDescription>
              </Alert>
            )}
            {paymentMethod === 'PLS' && isLoadingPlsQuote && workingTicket.length === NUMBERS_PER_TICKET && (
              <Alert className="border-blue-400/40 bg-blue-500/10">
                <AlertDescription className="text-blue-200 text-sm">Loading PLS price...</AlertDescription>
              </Alert>
            )}

            {/* Buy/Approve Button */}
            {paymentMethod === 'MORBIUS' && needsApproval ? (
              <RippleButton
                className={cn(
                  'w-full h-12 font-semibold',
                  isProcessing ? 'text-white/40 [-webkit-text-stroke:0.1px_black] font-bold' : 'bg-cyan-500 text-white hover:bg-cyan-600'
                )}
                disabled={isProcessing || workingTicket.length !== NUMBERS_PER_TICKET}
                onClick={handleApprove}
              >
                {isApproveLoadingState ? (
                  <span className="flex items-center gap-2">
                    <LoaderOne />
                    Approving...
                  </span>
                ) : (
                  <AnimatedShinyText className="text-white/40 [-webkit-text-stroke:0.1px_black] font-bold">Approve</AnimatedShinyText>
                )}
              </RippleButton>
            ) : (
              <RippleButton
                className={cn(
                  'w-full h-12 font-semibold',
                  isProcessing || !canBuy ? 'text-white/40 [-webkit-text-stroke:0.1px_black] font-bold ' : 'bg-cyan-500 text-white hover:bg-cyan-600'
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
                  <AnimatedShinyText className="text-white/40 [-webkit-text-stroke:0.1px_black] font-bold">
                    {paymentMethod === 'PLS' ? 'Buy with PLS' : 'Buy Now'}
                  </AnimatedShinyText>
                )}
              </RippleButton>
            )}
          </div>
        </div>
      </div>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="bg-slate-900 border-white/20 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-center text-cyan-500">
              Purchase Successful!
            </DialogTitle>
            <DialogDescription className="text-white/80 text-center pt-2">
              Your lottery tickets have been purchased
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Rounds Purchased */}
            <div
              className="rounded-lg p-4"
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                border: '1px inset rgba(60, 60, 60, 0.5)',
              }}
            >
              <div className="text-sm text-white/60 mb-1">Rounds Purchased</div>
              <div className="text-3xl font-black text-cyan-500">
                {successRoundsCount} {successRoundsCount === 1 ? 'Round' : 'Rounds'}
              </div>
            </div>

            {/* Transaction Hash */}
            <div
              className="rounded-lg p-4"
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                border: '1px inset rgba(60, 60, 60, 0.5)',
              }}
            >
              <div className="text-sm text-white/60 mb-2">Transaction Hash</div>
              <div className="font-mono text-xs text-white/80 break-all">
                {successTxHash}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <RippleButton
                variant="outline"
                className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white border-cyan-500"
                onClick={() => {
                  window.open(`https://scan.pulsechain.com/tx/${successTxHash}`, '_blank')
                }}
              >
                View Txn
              </RippleButton>
              <RippleButton
                variant="outline"
                className="flex-1 bg-white/10 hover:bg-white/20 text-white border-white/20"
                onClick={() => setShowSuccessModal(false)}
              >
                OK
              </RippleButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>

    {/* Signature Prompt for High-Value Transactions */}
    <SignaturePrompt
      open={showSignaturePrompt}
      onOpenChange={setShowSignaturePrompt}
      onConfirm={handleSignatureConfirm}
      onCancel={() => {
        setShowSignaturePrompt(false)
        setUiState('idle')
      }}
      isSigning={false}
      title="Confirm Large Purchase"
      description="This transaction exceeds our security threshold. Please sign to confirm your purchase."
      action="Confirm Purchase"
      amount={`${paymentMethod === 'PLS' ? formatEther(plsValueWei) + ' PLS' : formatUnits(MORBIUSCost, TOKEN_DECIMALS) + ' MORBIUS'}`}
      risk="high"
    />
    </>
  )
}
