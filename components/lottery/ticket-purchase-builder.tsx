'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  LOTTERY_ADDRESS,
  TICKET_PRICE,
  PSSH_TOKEN_ADDRESS,
  TOKEN_DECIMALS,
  MIN_NUMBER,
  MAX_NUMBER,
  NUMBERS_PER_TICKET,
  MORBIUS_TOKEN_ADDRESS,
  WPLS_TOKEN_ADDRESS,
  PULSEX_V1_ROUTER_ADDRESS,
  WPLS_TO_MORBIUS_BUFFER_BPS,
} from '@/lib/contracts'
import { pulsechain } from '@/lib/chains'
import { ERC20_ABI } from '@/abi/erc20'
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2'
import { useBuyTickets, useBuyTicketsForRounds, useBuyTicketsWithPLS } from '@/hooks/use-lottery-6of55'
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { useWalletDetection } from '@/hooks/use-wallet-detection'
import { useNetworkValidation } from '@/hooks/use-network-validation'
import { useNativeBalance } from '@/hooks/use-native-balance'
import { formatUnits, formatEther } from 'viem'
import { toast } from 'sonner'
import { LoaderOne } from '@/components/ui/loader'
import { cn } from '@/lib/utils'
import { Trash2, Edit2, Plus, Minus, ChevronDown } from 'lucide-react'

const ROUTER_ABI = [
  {
    name: 'getAmountsIn',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const

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

  const [tickets, setTickets] = useState<number[][]>([])
  const [roundsByTicket, setRoundsByTicket] = useState<number[]>([])
  const [workingTicket, setWorkingTicket] = useState<number[]>([])
  const [workingRounds, setWorkingRounds] = useState(1)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'morbius' | 'pls'>('morbius')
  const [optimisticAllowance, setOptimisticAllowance] = useState<bigint | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [uiState, setUiState] = useState<'idle' | 'approving' | 'buying' | 'success' | 'error'>('idle')
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [successTxHash, setSuccessTxHash] = useState<string>('')
  const [successRoundsCount, setSuccessRoundsCount] = useState(0)

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
    onStateChangeRef.current?.(tickets, roundsByTicket[0] ?? initialRounds)
  }, [tickets, roundsByTicket, initialRounds])

  const { data: ticketPriceMorbiusData } = useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'ticketPriceMorbius',
  })

  const { data: ticketPricePlsData } = useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'ticketPricePls',
  })

  const { data: psshBalance, isLoading: isLoadingBalance, error: balanceError } = useReadContract({
    address: PSSH_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  })

  // Debug balance fetching
  console.log('💰 Balance fetch:', {
    address: address?.slice(0, 6) + '...',
    balance: psshBalance?.toString() ?? 'undefined',
    error: balanceError?.message,
    isLoading: isLoadingBalance,
    tokenAddress: PSSH_TOKEN_ADDRESS
  })

  // Use native PLS balance for PLS payments
  const { balance: nativePlsBalance, isLoading: isLoadingPlsBalance } = useNativeBalance(address)

  // Debug balance fetching
  useEffect(() => {
    console.log('💰 Balance fetch:', {
      address,
      psshBalance: psshBalance?.toString(),
      formatted: psshBalance ? formatUnits(psshBalance, TOKEN_DECIMALS) : 'N/A',
      isLoadingBalance,
      balanceError: balanceError?.message,
      tokenAddress: PSSH_TOKEN_ADDRESS
    })
  }, [psshBalance, address, isLoadingBalance, balanceError])

  const { data: psshAllowance, refetch: refetchPsshAllowance, error: allowanceError, isLoading: isLoadingAllowance } = useReadContract({
    address: PSSH_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, LOTTERY_ADDRESS as `0x${string}`] : undefined,
    query: { enabled: !!address, refetchInterval: 500, staleTime: 0 }, // Faster refresh for allowance changes
  })

  // Debug allowance fetching
  console.log('🔍 Allowance fetch:', {
    address: address?.slice(0, 6) + '...',
    allowance: psshAllowance?.toString() ?? 'undefined',
    error: allowanceError?.message,
    isLoading: isLoadingAllowance,
    tokenAddress: PSSH_TOKEN_ADDRESS,
    spenderAddress: LOTTERY_ADDRESS
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

  const {
    buyTicketsWithPLS,
    data: buyPlsHash,
    isPending: isBuyPlsPending,
    error: buyPlsError,
  } = useBuyTicketsWithPLS()

  const buyHash = paymentMethod === 'pls' ? buyPlsHash : (roundsByTicket.some((r) => r > 1) ? buyMultiHash : buyPsshHash)
  const { isLoading: isBuyLoading, isSuccess: isBuySuccess } = useWaitForTransactionReceipt({
    hash: buyHash,
  })

  const ticketCount = tickets.length
  const totalEntries = useMemo(
    () => roundsByTicket.reduce((acc, r) => acc + Math.max(1, Math.min(100, r || 1)), 0),
    [roundsByTicket]
  )
  const maxRounds = useMemo(() => (roundsByTicket.length ? Math.max(...roundsByTicket) : 1), [roundsByTicket])
  const pricePerTicket = (ticketPriceMorbiusData as bigint | undefined) ?? TICKET_PRICE
  const psshCost = pricePerTicket * BigInt(totalEntries || 0)

  // Dynamic PLS pricing: base cost + 50% tax + 20% buffer
  const { data: plsBaseQuote, error: plsQuoteError, isLoading: isLoadingPlsQuote } = useReadContract({
    address: PULSEX_V1_ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: 'getAmountsIn',
    args:
      paymentMethod === 'pls' && totalEntries > 0
        ? [psshCost, [WPLS_TOKEN_ADDRESS, MORBIUS_TOKEN_ADDRESS]]
        : undefined,
    query: {
      enabled: paymentMethod === 'pls' && totalEntries > 0,
      refetchInterval: 10000,
      retry: 3,
      retryDelay: 1000,
    },
  })

  const plsValueWei = useMemo(() => {
    if (!plsBaseQuote || !Array.isArray(plsBaseQuote)) {
      console.log('❌ PLS quote not available:', {
        plsBaseQuote,
        error: plsQuoteError?.message,
        isLoading: isLoadingPlsQuote,
        paymentMethod,
        totalEntries,
      })
      return BigInt(0)
    }

    const basePlsCost = plsBaseQuote[0] ?? BigInt(0)
    console.log('💰 PLS base cost for', totalEntries, 'entries:', basePlsCost.toString(), 'wei')

    if (basePlsCost === BigInt(0)) return BigInt(0)

    // Apply 50% tax (making PLS payments 50% more expensive)
    const taxedAmount = (basePlsCost * BigInt(15000)) / BigInt(10000)
    console.log('💰 PLS after 50% tax:', taxedAmount.toString(), 'wei')

    // Add 20% buffer for slippage and DEX fees
    const totalPlsRequired = (taxedAmount * BigInt(12000)) / BigInt(10000)
    console.log('💰 PLS final cost:', totalPlsRequired.toString(), 'wei')

    return totalPlsRequired
  }, [plsBaseQuote, totalEntries, plsQuoteError, isLoadingPlsQuote, paymentMethod])
  const currentAllowance = optimisticAllowance ?? psshAllowance ?? BigInt(0)
  // Only consider approval needed if we have loaded allowance data and it's insufficient
  const needsApproval = psshAllowance !== undefined && !isLoadingAllowance && currentAllowance < psshCost

  // Force approval check for debugging
  console.log('🔐 Allowance check:', {
    address: address?.slice(0, 6) + '...',
    contractAddress: LOTTERY_ADDRESS,
    allowance: psshAllowance?.toString() ?? 'undefined',
    currentAllowance: currentAllowance.toString(),
    psshCost: psshCost.toString(),
    needsApproval,
    isLoadingAllowance
  })
  const hasEnoughBalance = paymentMethod === 'pls'
    ? (nativePlsBalance !== undefined && nativePlsBalance >= plsValueWei)
    : (psshBalance !== undefined && psshBalance >= psshCost)
  const isProcessing = isApprovePending || isApproveLoading || isBuyPsshPending || isBuyMultiPending || isBuyPlsPending

  const canBuy =
    paymentMethod === 'morbius'
      ? ticketCount > 0 && hasEnoughBalance && !needsApproval
      : ticketCount > 0 && hasEnoughBalance
  const isApproveLoadingState = uiState === 'approving' || isApprovePending || isApproveLoading
  const isBuyLoadingState = uiState === 'buying' || isBuyLoading || isBuyPsshPending || isBuyMultiPending || isBuyPlsPending

  // Debug purchase conditions
  console.log('🛒 Purchase conditions:', {
    paymentMethod,
    ticketCount,
    totalEntries,
    psshCost: psshCost.toString(),
    plsValueWei: plsValueWei.toString(),
    plsValueDisplay: formatEther ? Number(formatEther(plsValueWei)).toFixed(4) : 'N/A',
    psshAllowance: psshAllowance?.toString() ?? 'undefined',
    optimisticAllowance: optimisticAllowance?.toString() ?? 'undefined',
    currentAllowance: currentAllowance.toString(),
    needsApproval,
    hasEnoughBalance,
    psshBalance: psshBalance?.toString() ?? 'undefined',
    nativePlsBalance: nativePlsBalance?.toString() ?? 'undefined',
    canBuy,
    isProcessing,
    address: address?.slice(0, 6) + '...',
    whichButton: (paymentMethod === 'morbius' && needsApproval && hasEnoughBalance) ? 'APPROVE' : 'BUY'
  })

  useEffect(() => {
    if (isApproveSuccess) {
      console.log('✅ Approval transaction successful - refreshing allowance')
      // Clear optimistic allowance and force refresh
      setOptimisticAllowance(null)
      refetchPsshAllowance()
      setUiState('idle')
    }
  }, [isApproveSuccess, refetchPsshAllowance])

  useEffect(() => {
    if (approveError) {
      console.error('❌ Approval failed:', approveError)
    }
  }, [approveError])

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

      setTickets([])
      setRoundsByTicket([])
      setWorkingTicket([])
      setWorkingRounds(1)
      onSuccessRef.current?.()
    }
    if (!isBuySuccess) {
      hasHandledBuySuccess.current = false
    }
  }, [isBuySuccess, buyHash, maxRounds])

  useEffect(() => {
    if (approveError) {
      setUiState('error')
      setErrorMessage(approveError.message.includes('rejected') ? 'Approval rejected' : 'Approval failed')
      onErrorRef.current?.(approveError)
    }
  }, [approveError])

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
      onErrorRef.current?.(err)
    }
  }, [buyMultiError, buyPsshError, maxRounds])

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
    // Approve a large amount to avoid needing approval again
    const approvalAmount = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935') // uint256.max

    console.log('✅ Approving MORBIUS:', {
      spender: LOTTERY_ADDRESS,
      amount: approvalAmount.toString(),
      currentAllowance: currentAllowance.toString()
    })

    approve({
      address: PSSH_TOKEN_ADDRESS as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [LOTTERY_ADDRESS as `0x${string}`, approvalAmount],
      chainId: pulsechain.id,
    })
  }

  const handleBuy = async () => {
    console.log('🛒 handleBuy called with:', {
      address,
      ticketCount,
      paymentMethod,
      hasEnoughBalance,
      tickets,
      roundsByTicket
    })

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
    if (paymentMethod === 'morbius' && !hasEnoughBalance) {
      setErrorMessage('Balance too low')
      setUiState('error')
      return
    }
    if (paymentMethod === 'pls' && plsValueWei === BigInt(0)) {
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

    try {
      if (isInternetMoney) {
        console.log('🌐 Preparing transaction for Internet Money wallet...')
      }

      if (paymentMethod === 'pls') {
        const valueWei = plsValueWei
        if (valueWei === BigInt(0)) {
          throw new Error('PLS amount is zero')
        }
        console.log('💰 Buying with PLS:', { tickets, valueWei: valueWei.toString() })

        // Note: The hook buyTicketsWithPLS already handles gas estimation
        // If we need custom gas, we'd need to modify the hook
        buyTicketsWithPLS(tickets, valueWei)
      } else {
        const boundedRounds = roundsByTicket.map((r) => Math.max(1, Math.min(100, r || 1)))
        const highest = boundedRounds.length ? Math.max(...boundedRounds) : 1
        console.log('🎫 Buying with MORBIUS:', { tickets, boundedRounds, highest })

        if (highest > 1) {
          const offsets = Array.from({ length: highest }, (_, i) => i)
          const groups = offsets.map((offset) =>
            tickets.filter((_, idx) => boundedRounds[idx] > offset)
          )
          console.log('📅 Buying for multiple rounds:', { groups, offsets })
          buyTicketsForRounds(groups, offsets)
        } else {
          console.log('🎫 Buying for current round:', tickets)
          buyTickets(tickets)
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

      setUiState('error')
      setErrorMessage(message)
      onErrorRef.current?.(err as Error)
    }
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

  const handleAddToCart = () => {
    if (workingTicket.length !== NUMBERS_PER_TICKET) {
      toast.error(`Select ${NUMBERS_PER_TICKET} numbers`)
      return
    }
    if (tickets.length >= 10) {
      toast.error('Maximum 10 tickets')
      return
    }

    if (editingIndex !== null) {
      // Update existing ticket
      setTickets((prev) => {
        const next = [...prev]
        next[editingIndex] = workingTicket
        return next
      })
      setRoundsByTicket((prev) => {
        const next = [...prev]
        next[editingIndex] = workingRounds
        return next
      })
      toast.success('Ticket updated')
      setEditingIndex(null)
    } else {
      // Add new ticket
      setTickets((prev) => [...prev, workingTicket])
      setRoundsByTicket((prev) => [...prev, workingRounds])
      toast.success('Ticket added')
    }

    setWorkingTicket([])
    setWorkingRounds(1)
  }

  const handleEditTicket = (index: number) => {
    setWorkingTicket(tickets[index])
    setWorkingRounds(roundsByTicket[index] || 1)
    setEditingIndex(index)
    toast.info('Editing ticket')
  }

  const handleRemoveTicket = (index: number) => {
    setTickets((prev) => prev.filter((_, i) => i !== index))
    setRoundsByTicket((prev) => prev.filter((_, i) => i !== index))
    if (editingIndex === index) {
      setEditingIndex(null)
      setWorkingTicket([])
      setWorkingRounds(1)
    }
    toast.success('Ticket removed')
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
    setWorkingTicket([])
    setWorkingRounds(1)
  }

  const canAddToCart = workingTicket.length === NUMBERS_PER_TICKET

  return (
    <Card className="relative overflow-hidden bg-black/70 border-white/10 shadow-2xl p-0 w-full max-w-full">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(79,70,229,0.08),transparent_38%),radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.08),transparent_30%)]" />

      <div className="relative flex flex-col lg:flex-row gap-4 p-4 min-h-0 overflow-x-hidden w-full">
        {/* LEFT PANEL - Builder */}
        <div className="flex-1 lg:flex-[3] space-y-4 min-w-0 w-full overflow-x-hidden">
          <h2 className="text-xl font-bold text-white">GET TICKETS</h2>

          {/* Number Grid */}
          <div className="w-full overflow-x-hidden">
            <div className="grid grid-cols-6 xs:grid-cols-7 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-11 gap-1.5 mb-3 w-full">
              {Array.from({ length: MAX_NUMBER }, (_, i) => i + MIN_NUMBER).map((num) => {
                const selected = workingTicket.includes(num)
                return (
                  <button
                    key={num}
                    onClick={() => toggleNumber(num)}
                    disabled={!selected && workingTicket.length >= NUMBERS_PER_TICKET}
                    className={cn(
                      'h-8 rounded border text-xs font-semibold transition-all',
                      selected
                        ? 'bg-white text-black border-white scale-105'
                        : 'bg-black/40 border-white/20 text-white hover:border-white/40 hover:bg-white/5'
                    )}
                  >
                    {num}
                  </button>
                )
              })}
            </div>

            {/* Selected Numbers Display */}
            <div className="bg-black/40 border border-white/10 rounded-lg p-2 mb-2">
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
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/30 text-white text-xs px-2 h-7"
                  onClick={handleQuickPick}
                >
                  Quick Pick
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/30 text-white text-xs px-2 h-7"
                  onClick={() => setWorkingTicket([])}
                  disabled={workingTicket.length === 0}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>

          {/* Rounds Selector */}
          <div className="space-y-2">
            <label className="text-white/70 text-sm">Rounds for this ticket</label>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-white/30 text-white h-8 w-8 p-0"
                onClick={() => setWorkingRounds(Math.max(1, workingRounds - 1))}
                disabled={workingRounds <= 1}
              >
                <Minus className="w-3 h-3" />
              </Button>
              <input
                type="number"
                min={1}
                max={100}
                value={workingRounds}
                onChange={(e) => setWorkingRounds(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                className="w-16 h-8 rounded border border-white/20 bg-black/40 text-white text-center font-semibold text-sm"
                title="Number of rounds for this ticket"
              />
              <Button
                size="sm"
                variant="outline"
                className="border-white/30 text-white h-8 w-8 p-0"
                onClick={() => setWorkingRounds(Math.min(100, workingRounds + 1))}
                disabled={workingRounds >= 100}
              >
                <Plus className="w-3 h-3" />
              </Button>
              <div className="flex gap-1 ml-auto">
                {[5, 10, 25, 50].map((v) => (
                  <Button
                    key={v}
                    size="sm"
                    variant="outline"
                    className="border-white/30 text-white text-xs px-2 h-7"
                    onClick={() => setWorkingRounds(v)}
                  >
                    {v}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Add to Cart Button */}
          <div className="flex gap-2">
            {editingIndex !== null && (
              <Button
                variant="outline"
                className="border-white/30 text-white"
                onClick={handleCancelEdit}
              >
                Cancel
              </Button>
            )}
            <Button
              className={cn(
                'flex-1 h-12 font-semibold',
                canAddToCart
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-white/10 text-white/50 cursor-not-allowed'
              )}
              disabled={!canAddToCart}
              onClick={handleAddToCart}
            >
              {editingIndex !== null ? 'Update Ticket' : '+ Add to Cart'}
            </Button>
          </div>

          {/* Scroll Down Arrow - Mobile Only */}
          {ticketCount > 0 && (
            <div className="flex justify-center py-4 lg:hidden">
              <div className="flex flex-col items-center gap-2 animate-bounce">
                <span className="text-white/70 text-xs font-medium">View Cart</span>
                <ChevronDown className="w-6 h-6 text-white/80" />
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL - Cart */}
        <div className="lg:flex-[2] lg:max-w-sm bg-black/40 rounded-lg p-4 flex flex-col min-w-0 w-full overflow-x-hidden">
          <h2 className="text-lg font-bold text-white mb-3">CONFIRM</h2>

          {/* Payment Method Selection - Text Labels */}
          <div className="mb-4 p-3 bg-white/5 rounded-lg">
            <div className="text-xs text-white/70 mb-2 font-medium text-center">Pay In...</div>
            <div className="flex items-center justify-center gap-4">
              <span
                className={cn(
                  'cursor-pointer transition-all duration-300 px-2 py-1 rounded text-xl',
                  paymentMethod === 'morbius'
                    ? 'mitr-semibold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent'
                    : 'mitr-regular text-white/70 hover:text-white'
                )}
                onClick={() => setPaymentMethod('morbius')}
              >
                MORBIUS
              </span>
              <span className="text-white/50 text-xl">/</span>
              <span
                className={cn(
                  'cursor-pointer transition-all duration-300 px-2 py-1 rounded text-xl',
                  paymentMethod === 'pls'
                    ? 'mitr-semibold bg-gradient-to-r from-pink-400 via-red-400 to-purple-500 bg-clip-text text-transparent'
                    : 'mitr-regular text-white/70 hover:text-white'
                )}
                onClick={() => setPaymentMethod('pls')}
              >
                PLS
              </span>
            </div>
          </div>

          {/* Cart Items */}
          <div className="flex-1 space-y-2 mb-4 overflow-y-auto max-h-[300px]">
            {tickets.length === 0 ? (
              <div className="text-center py-12 text-white/50">
                <p className="text-sm">No tickets yet</p>
                <p className="text-xs mt-2">Add tickets to get started</p>
              </div>
            ) : (
              tickets.map((ticket, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'p-2 rounded border transition-all',
                    editingIndex === idx
                      ? 'border-green-500/50 bg-green-500/10'
                      : 'border-white/10 bg-white/5'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white/60 text-xs font-semibold">Ticket #{idx + 1}</span>
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => handleEditTicket(idx)}
                        className="p-1 hover:bg-white/10 rounded text-white/60 hover:text-white transition-colors"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleRemoveTicket(idx)}
                        className="p-1 hover:bg-white/10 rounded text-white/60 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {ticket.map((num) => (
                      <span
                        key={num}
                        className="h-5 min-w-5 px-1 flex items-center justify-center rounded bg-white/10 text-white text-xs font-semibold"
                      >
                        {num}
                      </span>
                    ))}
                  </div>
                  <div className="text-white/60 text-xs">
                    {roundsByTicket[idx] || 1} round{(roundsByTicket[idx] || 1) > 1 ? 's' : ''}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Summary */}
          <div className="space-y-2 border-t border-white/10 pt-3">
            <div className="flex justify-between text-xs">
              <span className="text-white/70">Tickets</span>
              <span className="text-white font-semibold">{ticketCount}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/70">Total Entries</span>
              <span className="text-white font-semibold">{totalEntries}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/70">Cost</span>
              <span className="text-white font-semibold">
                {paymentMethod === 'pls' ? (
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
                  `${formatToken(psshCost)} MORBIUS`
                )}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/70">Balance</span>
              <span
                className={cn(
                  'font-semibold',
                  hasEnoughBalance ? 'text-emerald-400' : 'text-amber-400'
                )}
                title={`Raw: ${paymentMethod === 'pls' ? nativePlsBalance?.toString() : psshBalance?.toString() || 'undefined'} | Address: ${address || 'not connected'}`}
              >
                {paymentMethod === 'pls' ? (
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
                  ) : psshBalance !== undefined ? (
                    `${formatToken(psshBalance)} MORBIUS`
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
              <Alert className="border-emerald-400/40 bg-emerald-500/10">
                <AlertDescription className="text-emerald-200 text-sm">Success! Good luck!</AlertDescription>
              </Alert>
            )}
            {/* PLS Quote Error Warning */}
            {paymentMethod === 'pls' && plsQuoteError && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">
                  Unable to fetch PLS price quote. Try using MORBIUS or refreshing the page.
                </AlertDescription>
              </Alert>
            )}
            {paymentMethod === 'pls' && isLoadingPlsQuote && ticketCount > 0 && (
              <Alert className="border-blue-400/40 bg-blue-500/10">
                <AlertDescription className="text-blue-200 text-sm">Loading PLS price...</AlertDescription>
              </Alert>
            )}

            {/* Buy/Approve Button */}
            {paymentMethod === 'morbius' && needsApproval ? (
              <Button
                className={cn(
                  'w-full h-12 font-semibold',
                  isProcessing ? 'bg-white/20 text-white' : 'bg-green-500 text-white hover:bg-green-600'
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
                className={cn(
                  'w-full h-12 font-semibold',
                  isProcessing || !canBuy ? 'bg-white/20 text-white' : 'bg-green-500 text-white hover:bg-green-600'
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
                  paymentMethod === 'pls' ? 'Buy with PLS' : 'Buy Now'
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="bg-slate-900 border-white/20 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-center text-emerald-400">
              Purchase Successful!
            </DialogTitle>
            <DialogDescription className="text-white/80 text-center pt-2">
              Your lottery tickets have been purchased
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Rounds Purchased */}
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="text-sm text-white/60 mb-1">Rounds Purchased</div>
              <div className="text-3xl font-black text-emerald-400">
                {successRoundsCount} {successRoundsCount === 1 ? 'Round' : 'Rounds'}
              </div>
            </div>

            {/* Transaction Hash */}
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="text-sm text-white/60 mb-2">Transaction Hash</div>
              <div className="font-mono text-xs text-white/80 break-all">
                {successTxHash}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500"
                onClick={() => {
                  window.open(`https://scan.pulsechain.box/tx/${successTxHash}`, '_blank')
                }}
              >
                View Txn
              </Button>
              <Button
                variant="outline"
                className="flex-1 bg-white/10 hover:bg-white/20 text-white border-white/20"
                onClick={() => setShowSuccessModal(false)}
              >
                OK
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

