'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn, triggerSuccessConfetti } from '@/lib/utils'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, usePublicClient, useReadContract, useReadContracts } from 'wagmi'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatEther, parseEther, decodeEventLog } from 'viem'
import {
  KENO_ADDRESS,
  WPLS_TOKEN_ADDRESS,
  MORBIUS_TOKEN_ADDRESS,
  PULSEX_V1_ROUTER_ADDRESS,
} from '@/lib/contracts'
import { KENO_ABI } from '@/lib/keno-abi'
import { LiveKenoBoard } from '@/components/CryptoKeno/live-keno-board'
import { KenoPrizePoolModal } from '@/components/CryptoKeno/keno-prize-pool-modal'
import KenoTopPlayers from '@/components/CryptoKeno/KenoTopPlayers'
import { KenoRecentPlays } from '@/components/CryptoKeno/KenoRecentPlays'
import { GlobalKenoHistoryTable } from '@/components/CryptoKeno/GlobalKenoHistoryTable'
import Footer from '@/components/PLINKO/Footer'
import { GameFAQ } from '@/components/shared/GameFAQ'
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text'
import { NumberTicker } from '@/components/ui/number-ticker'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { PlayerProfileModal } from '@/components/shared/PlayerProfileModal'
import { useKenoPlayerStats } from '@/hooks/use-keno-results'
import { AdSpace } from '@/components/shared/AdSpace'

const ALL_NUMBERS = Array.from({ length: 80 }, (_, i) => i + 1)

// Must match CryptoKeno.sol _initDefaultPaytables (max wager 100k, top prize 25x @ 10/10 = 2.5M cap)
const PAYTABLE: Record<number, Record<number, number>> = {
  1: { 1: 2 },
  2: { 2: 3 },
  3: { 2: 2, 3: 4 },
  4: { 2: 1, 3: 3, 4: 7 },
  5: { 3: 2, 4: 7, 5: 10 },
  6: { 3: 1, 4: 5, 5: 10, 6: 12 },
  7: { 3: 1, 4: 5, 5: 9, 6: 12, 7: 15 },
  8: { 4: 2, 5: 5, 6: 7, 7: 12, 8: 17 },
  9: { 4: 2, 5: 4, 6: 7, 7: 10, 8: 15, 9: 20 },
  10: { 0: 3, 5: 2, 6: 5, 7: 12, 8: 15, 9: 20, 10: 25 },
}

const ERC20_ABI = [
  { constant: true, inputs: [{ name: '_owner', type: 'address' }, { name: '_spender', type: 'address' }], name: 'allowance', outputs: [{ name: 'remaining', type: 'uint256' }], type: 'function' },
  { constant: false, inputs: [{ name: '_spender', type: 'address' }, { name: '_value', type: 'uint256' }], name: 'approve', outputs: [{ name: 'success', type: 'bool' }], type: 'function' },
] as const

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

type KenoTicket = {
  ticketId: bigint
  spotSize: number
  wager: bigint
  playerNumbers: number[]
  winningNumbers: number[]
  hits: number
  grossPayout: bigint
  netPayout: bigint
  timestamp: number
  paidWithPLS: boolean
}

type LastResult = {
  ticketId: bigint
  spotSize: number
  wager: bigint
  playerNumbers: number[]
  winningNumbers: number[]
  hits: number
  grossPayout: bigint
  netPayout: bigint
}

const decodeNumbers = (bitmap: bigint): number[] => {
  const arr: number[] = []
  for (let i = 1; i <= 80; i++) {
    const bit = BigInt(1) << BigInt(i - 1)
    if ((bitmap & bit) !== BigInt(0)) arr.push(i)
  }
  return arr
}

function KenoIntroScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const duration = 2500
    const fallbackTimeout = setTimeout(() => {
      setTimeout(onComplete, 200)
    }, duration)
    return () => clearTimeout(fallbackTimeout)
  }, [onComplete])

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(10, 15, 20))',
      }}
      suppressHydrationWarning
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-6">
        <div className="w-[300px] shrink-0">
          <AdSpace slot="loading" width={300} height={100} showCta={true} />
        </div>
        <div className="flex flex-col items-center gap-[30px]">
        <div className="grid grid-cols-5 gap-1 shrink-0">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="w-8 h-8 rounded bg-gradient-to-br from-cyan-500 to-purple-700 flex items-center justify-center text-white text-xs font-bold"
              style={{
                animation: 'kenoCellIn 0.35s ease-out both',
                animationDelay: `${i * 0.05}s`,
              }}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <div className="text-center shrink-0">
          <div className="text-white text-xl font-bold animate-pulse mb-2">
            PICKING NUMBERS...
          </div>
          <div className="text-gray-400 text-sm">
            Preparing Keno
          </div>
        </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes kenoCellIn {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

export default function KenoPage() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  const [showIntro, setShowIntro] = useState(true)
  const handleIntroComplete = useCallback(() => setShowIntro(false), [])

  // Game state
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([])
  const [spotSize, setSpotSize] = useState(8)
  const [wager, setWager] = useState(1000)
  const [paymentMethod, setPaymentMethod] = useState<'MORBIUS' | 'PLS'>('MORBIUS')
  const [showPrizePool, setShowPrizePool] = useState(false)
  const [playerProfileOpen, setPlayerProfileOpen] = useState(false)
  const [playerProfileGame, setPlayerProfileGame] = useState<'plinko' | 'keno'>('keno')
  const [isNumberPickerCollapsed, setIsNumberPickerCollapsed] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)

  // Result from last play
  const [lastResult, setLastResult] = useState<LastResult | null>(null)
  // True once the LiveKenoBoard draw animation finishes — only then reveal win/loss
  const [drawComplete, setDrawComplete] = useState(false)
  // How many balls have been drawn so far during animation
  const [drawnCount, setDrawnCount] = useState(0)

  const kenoStats = useKenoPlayerStats(address ?? undefined)

  // Recent tickets
  const [recentTickets, setRecentTickets] = useState<KenoTicket[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)

  // Pending approval state for two-step MORBIUS flow
  const [pendingApproval, setPendingApproval] = useState<{ wagerWei: bigint } | null>(null)

  // Allowance reads
  const { data: allowanceResult } = useReadContracts({
    contracts: address
      ? [
          { address: MORBIUS_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, KENO_ADDRESS] },
        ]
      : [],
  })

  // Contract reserve
  const { data: contractReserve } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'getContractReserve',
    query: { refetchInterval: 15000 },
  })

  // Max wager
  const { data: maxWagerData } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'maxWagerPerDraw',
  })

  const MORBIUSAllowanceWei = useMemo(() => {
    type ReadValue = { result?: bigint } | bigint | undefined
    const res = allowanceResult as ReadValue[] | undefined
    const v = res && res[0]
    if (typeof v === 'bigint') return v
    if (v && typeof v === 'object' && 'result' in v && typeof v.result === 'bigint') return v.result
    return BigInt(0)
  }, [allowanceResult])

  const totalCostWei = useMemo(() => parseEther(wager.toString()), [wager])

  // PLS quote
  const { data: wplsQuote } = useReadContract({
    address: PULSEX_V1_ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: 'getAmountsIn',
    args:
      paymentMethod !== 'MORBIUS' && totalCostWei > BigInt(0)
        ? [totalCostWei, [WPLS_TOKEN_ADDRESS, MORBIUS_TOKEN_ADDRESS]]
        : undefined,
    query: {
      enabled: paymentMethod !== 'MORBIUS' && totalCostWei > BigInt(0),
      refetchInterval: 10000,
    },
  })

  const wplsRequiredWei = useMemo(() => {
    const quote = Array.isArray(wplsQuote) ? (wplsQuote as bigint[])[0] ?? BigInt(0) : BigInt(0)
    if (quote === BigInt(0)) return BigInt(0)
    // Apply 50% tax + 20% buffer (matches contract logic)
    const taxed = (quote * BigInt(15000)) / BigInt(10000)
    return (taxed * BigInt(12000)) / BigInt(10000)
  }, [wplsQuote])

  // Write hooks
  const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending, error: approveError } = useWriteContract()
  const { writeContractAsync: writePlayAsync, isPending: isPlayPending, error: playError } = useWriteContract()

  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed, error: approveConfirmError } = useWaitForTransactionReceipt({ hash: approveHash })

  // Number toggle
  const handleToggleNumber = (n: number) => {
    setSelectedNumbers((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n)
      if (prev.length >= spotSize) return prev
      return [...prev, n]
    })
  }

  const quickPick = () => {
    const pool = [...ALL_NUMBERS]
    const picks: number[] = []
    while (picks.length < spotSize && pool.length) {
      const idx = Math.floor(Math.random() * pool.length)
      picks.push(pool.splice(idx, 1)[0])
    }
    setSelectedNumbers(picks)
  }

  // Parse KenoPlayed event from tx receipt
  const parseKenoResult = useCallback((receipt: any, playerNums: number[]): LastResult | null => {
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: KENO_ABI,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName === 'KenoPlayed') {
          const args = decoded.args as any
          return {
            ticketId: args.ticketId,
            spotSize: Number(args.spotSize),
            wager: args.wager,
            playerNumbers: playerNums,
            winningNumbers: [], // will be filled from ticket data
            hits: Number(args.hits),
            grossPayout: args.grossPayout,
            netPayout: args.netPayout,
          }
        }
      } catch {
        // not our event, skip
      }
    }
    return null
  }, [])

  // Fetch winning numbers from ticket after getting result
  const enrichResultWithWinningNumbers = useCallback(async (result: LastResult): Promise<LastResult> => {
    if (!publicClient) return result
    try {
      const ticketData = await publicClient.readContract({
        address: KENO_ADDRESS,
        abi: KENO_ABI,
        functionName: 'getTicket',
        args: [result.ticketId],
      }) as any
      const winningNumbers = (ticketData.winningNumbers as number[])
        .map((n: any) => Number(n))
        .filter((n: number) => n > 0)
      return { ...result, winningNumbers }
    } catch (err) {
      console.error('Failed to fetch ticket winning numbers', err)
      return result
    }
  }, [publicClient])

  // Main play handler
  const handlePlay = async () => {
    if (!isConnected || !address) {
      toast.error('Connect wallet to play.')
      return
    }
    if (selectedNumbers.length !== spotSize) {
      toast.error(`Pick ${spotSize} numbers before playing.`)
      return
    }

    const numbersArg = [...selectedNumbers].sort((a, b) => a - b).map((n) => Number(n))
    const wagerWei = parseEther(wager.toString())

    if (paymentMethod === 'PLS') {
      try {
        if (wplsRequiredWei === BigInt(0)) {
          toast.error('Unable to quote PLS required. Please try again.')
          return
        }
        setIsPlaying(true)
        setDrawComplete(false)
        setDrawnCount(0)
        const hash = await writePlayAsync({
          address: KENO_ADDRESS,
          abi: KENO_ABI,
          functionName: 'playKenoWithPLS',
          args: [numbersArg, spotSize],
          value: wplsRequiredWei,
        } as any)
        const receipt = await publicClient?.waitForTransactionReceipt({ hash })
        if (receipt) {
          let result = parseKenoResult(receipt, numbersArg)
          if (result) {
            result = await enrichResultWithWinningNumbers(result)
            setLastResult(result)
            if (result.netPayout > BigInt(0)) triggerSuccessConfetti()
            loadRecentTickets()
          }
        }
        toast.success('Keno played!')
      } catch (err: any) {
        console.error(err)
        if (!err?.message?.includes('User rejected') && !err?.message?.includes('user rejected')) {
          toast.error(err?.shortMessage || err?.message || 'Play failed')
        }
      } finally {
        setIsPlaying(false)
      }
      return
    }

    // MORBIUS path
    if (MORBIUSAllowanceWei < wagerWei) {
      // Need approval first — use two-step flow to preserve user-gesture context
      setPendingApproval({ wagerWei })
      writeApprove({
        address: MORBIUS_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [KENO_ADDRESS, wagerWei],
      } as any)
      return
    }

    // Sufficient allowance — play directly
    try {
      setIsPlaying(true)
      setDrawComplete(false)
      setDrawnCount(0)
      const hash = await writePlayAsync({
        address: KENO_ADDRESS,
        abi: KENO_ABI,
        functionName: 'playKeno',
        args: [numbersArg, spotSize, wagerWei],
      } as any)
      const receipt = await publicClient?.waitForTransactionReceipt({ hash })
      if (receipt) {
        let result = parseKenoResult(receipt, numbersArg)
        if (result) {
          result = await enrichResultWithWinningNumbers(result)
          setLastResult(result)
          if (result.netPayout > BigInt(0)) triggerSuccessConfetti()
          loadRecentTickets()
        }
      }
      toast.success('Keno played!')
    } catch (err: any) {
      console.error(err)
      if (!err?.message?.includes('User rejected') && !err?.message?.includes('user rejected')) {
        toast.error(err?.shortMessage || err?.message || 'Play failed')
      }
    } finally {
      setIsPlaying(false)
    }
  }

  // After approval confirmed, user needs to click Play again (two-step per wagmi pattern)
  useEffect(() => {
    if (isApproveConfirmed && pendingApproval) {
      toast.success('Approved! Click Play Now to continue.')
      setPendingApproval(null)
    }
  }, [isApproveConfirmed, pendingApproval])

  // Load recent tickets
  const loadRecentTickets = useCallback(async () => {
    if (!publicClient || !address) return
    setLoadingTickets(true)
    try {
      const ticketIds = await publicClient.readContract({
        address: KENO_ADDRESS,
        abi: KENO_ABI,
        functionName: 'getAllPlayerTickets',
        args: [address],
      }) as bigint[]

      if (ticketIds.length === 0) {
        setRecentTickets([])
        setLoadingTickets(false)
        return
      }

      // Get last 20 tickets (most recent)
      const recentIds = ticketIds.slice(-20)

      const ticketDataArr = await publicClient.readContract({
        address: KENO_ADDRESS,
        abi: KENO_ABI,
        functionName: 'getTickets',
        args: [recentIds],
      }) as any[]

      const tickets: KenoTicket[] = ticketDataArr.map((td: any, idx: number) => ({
        ticketId: recentIds[idx],
        spotSize: Number(td.spotSize),
        wager: td.wager,
        playerNumbers: decodeNumbers(td.numbersBitmap),
        winningNumbers: (td.winningNumbers as number[]).map((n: any) => Number(n)).filter((n: number) => n > 0),
        hits: Number(td.hits),
        grossPayout: td.grossPayout,
        netPayout: td.netPayout,
        timestamp: Number(td.timestamp),
        paidWithPLS: td.paidWithPLS,
      }))

      setRecentTickets(tickets.reverse())
    } catch (err) {
      console.error('Failed to load tickets', err)
    } finally {
      setLoadingTickets(false)
    }
  }, [publicClient, address])

  // Load tickets on connect
  useEffect(() => {
    if (address && publicClient) loadRecentTickets()
  }, [address, publicClient, loadRecentTickets])

  // Error toasts
  useEffect(() => {
    if (approveError) toast.error(approveError.message || 'Approval failed.')
  }, [approveError])
  useEffect(() => {
    if (playError) {
      const msg = (playError as any)?.shortMessage || playError.message || 'Play failed.'
      if (!msg.includes('User rejected') && !msg.includes('user rejected')) {
        toast.error(msg)
      }
    }
  }, [playError])
  useEffect(() => {
    if (approveConfirmError) toast.error(approveConfirmError.message || 'Approval failed.')
  }, [approveConfirmError])

  const handlePlayAgain = () => {
    setLastResult(null)
    setDrawComplete(false)
    setDrawnCount(0)
  }

  const busy = isApprovePending || isApproveConfirming || isPlayPending || isPlaying

  if (showIntro) {
    return <KenoIntroScreen onComplete={handleIntroComplete} />
  }

  // Shared ticket builder JSX (used for both mobile and desktop)
  const ticketBuilder = (
    <div className="space-y-4 min-w-0 w-full overflow-x-hidden">
      <h2 className="text-xl font-bold text-white text-center">PLAY KENO</h2>

      {/* Spot Selection & Payout Table - 2 Column */}
      <div className="grid grid-cols-2 gap-4">
        {/* Spot Size Selection */}
        <div
          className="space-y-1 p-3 rounded-lg relative"
          style={{
            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
            boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
            border: '1px inset rgba(60, 60, 60, 0.5)',
          }}
        >
          <div className="relative z-10 space-y-1">
          <label className="text-white/70 text-sm">How many spots? (1-10)</label>
          <div className="grid grid-cols-4 gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
              <button
                key={num}
                onClick={() => setSpotSize(num)}
                className={cn(
                  "w-full h-8 rounded-lg font-semibold text-sm transition-all hover:opacity-80",
                  spotSize === num ? "text-cyan-500" : "text-gray-300"
                )}
                style={
                  spotSize === num
                    ? {
                        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5), 0 0 12px rgba(34, 197, 94, 0.3)',
                        border: '1px inset rgba(60, 60, 60, 0.5)',
                      }
                    : {
                        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                        border: '1px inset rgba(60, 60, 60, 0.5)',
                      }
                }
              >
                {num}
              </button>
            ))}
          </div>
          </div>
        </div>

        {/* Payout Table for Selected Spot Size */}
        <div
          className="rounded-lg p-3 relative"
          style={{
            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
            boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
            border: '1px inset rgba(60, 60, 60, 0.5)',
          }}
        >
          <div className="relative">
          <h3 className="text-sm font-bold text-cyan-500 mb-2 text-center">{spotSize}-Spot Payouts</h3>
          <div className="space-y-1">
            {Object.entries(PAYTABLE[spotSize] || {}).map(([matches, payout]) => (
              <div key={matches} className="flex justify-between items-center text-xs">
                <span className="text-white/70">
                  {matches === '0' ? 'No Match' : `Match ${matches}${spotSize > 1 ? ` of ${spotSize}` : ''}`}
                </span>
                <span className="text-cyan-500 font-semibold">
                  {payout}x
                </span>
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>

      {/* Wager */}
      <div className="space-y-2 mb-4">
        <label className="block text-sm font-medium text-gray-300">Wager</label>
        <div className="grid grid-cols-4 gap-1.5">
          {[2500, 10000, 25000].map((preset) => (
            <button
              key={preset}
              onClick={() => setWager(preset)}
              className={cn(
                "w-full py-2.5 text-sm rounded-none transition-all hover:opacity-80",
                wager === preset ? "text-cyan-500" : "text-white/70"
              )}
              style={
                wager === preset
                  ? {
                      background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                      boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5), 0 0 8px rgba(6, 182, 212, 0.2)',
                      border: '1px inset rgba(60, 60, 60, 0.5)',
                    }
                  : {
                      background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                      boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                      border: '1px inset rgba(60, 60, 60, 0.5)',
                    }
              }
            >
              {preset.toLocaleString()}
            </button>
          ))}
          <Input
            type="number"
            step="1000"
            min="1000"
            max="100000"
            value={wager}
            onChange={(e) => setWager(parseFloat(e.target.value) || 0)}
            placeholder="Custom"
            className="text-white relative col-span-1"
            style={{
              background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
              border: '1px inset rgba(60, 60, 60, 0.5)',
            }}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white text-center">PICK YOUR NUMBERS</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={quickPick}
            className="h-12 font-semibold rounded-xl transition-all relative backdrop-blur-xl hover:bg-white/[0.12]"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%)',
              boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.2), inset 0 -1px 1px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
            }}
          >
            <span className="relative z-10 text-cyan-400/70 hover:text-cyan-400/90">Quick Pick</span>
          </button>
          <button
            onClick={() => setSelectedNumbers([])}
            className="h-12 font-semibold rounded-xl transition-all relative backdrop-blur-xl hover:bg-white/[0.12]"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%)',
              boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.2), inset 0 -1px 1px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
            }}
          >
            <span className="relative z-10 text-red-400/70 hover:text-red-400/90">Clear</span>
          </button>
        </div>
      </div>

      {/* Number Selection Section - Collapsible */}
      <div className="space-y-2">
        {isNumberPickerCollapsed ? (
          <button
            onClick={() => setIsNumberPickerCollapsed(false)}
            className="w-full h-12 font-semibold rounded-xl transition-all relative backdrop-blur-xl hover:bg-white/[0.12]"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%)',
              boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.2), inset 0 -1px 1px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
            }}
          >
            <span className="text-blue-400/70 hover:text-blue-400/90">PICK YOUR OWN NUMBERS</span>
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-white/70">Select {spotSize} number{spotSize !== 1 ? 's' : ''} from 1-80</h4>
              <button
                onClick={() => setIsNumberPickerCollapsed(true)}
                className="text-white/70 hover:text-white text-sm font-medium"
              >
                Collapse
              </button>
            </div>
          <div className="w-full overflow-x-hidden">
            <div className="grid grid-cols-4 gap-1.5 mb-3 w-full">
          {ALL_NUMBERS.map((n) => {
            const active = selectedNumbers.includes(n)
            return (
              <button
                key={n}
                onClick={() => handleToggleNumber(n)}
                disabled={!active && selectedNumbers.length >= spotSize}
                className={cn(
                  'h-8 rounded text-xs font-semibold transition-all cursor-pointer',
                  active
                    ? 'bg-white text-black border-white text-md scale-115'
                    : 'text-white hover:opacity-80'
                )}
                style={
                  !active
                    ? {
                        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                        border: '1px inset rgba(60, 60, 60, 0.5)',
                      }
                    : undefined
                }
              >
                {n}
              </button>
            )
          })}
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  )

  // Shared confirm panel JSX
  const confirmPanel = (
    <div
      className="rounded-lg p-4 flex flex-col min-w-0 w-full overflow-x-hidden relative"
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
        border: '1px inset rgba(60, 60, 60, 0.5)',
      }}
    >
      <div className="relative z-10">

      <div className="mb-4">
        <h2 className="text-lg font-bold text-white text-center mb-3">PLAY WITH</h2>
      </div>

      {/* Payment Method Selection */}
      <div
        className="mb-4 w-full rounded-lg relative min-h-[88px] grid grid-cols-2 gap-0 overflow-hidden"
        style={{
          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
          boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
          border: '1px inset rgba(60, 60, 60, 0.5)',
        }}
      >
        <button
          type="button"
          onClick={() => setPaymentMethod('MORBIUS')}
          className={cn(
            'w-full h-full min-h-[88px] flex items-center justify-center transition-all duration-300 text-2xl font-semibold',
            paymentMethod === 'MORBIUS'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          )}
        >
          MORBIUS
        </button>
        <button
          type="button"
          onClick={() => setPaymentMethod('PLS')}
          className={cn(
            'w-full h-full min-h-[88px] flex items-center justify-center transition-all duration-300 text-2xl font-semibold',
            paymentMethod === 'PLS'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          )}
        >
          PLS
        </button>
      </div>

      {/* Summary */}
      <div
        className="space-y-2 border-t border-white/10 pt-3 mb-4 relative"
        style={{
          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
          boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
          border: '1px inset rgba(60, 60, 60, 0.5)',
          borderRadius: '0.5rem',
          padding: '0.75rem',
        }}
      >
        <div className="relative">
        <div className="flex justify-between text-xs">
          <span className="text-white/70">Spot Size</span>
          <span className="text-white font-semibold">{spotSize}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-white/70">Wager</span>
          <span className="text-white font-semibold">{wager.toLocaleString()} MORBIUS</span>
        </div>
        <div className="flex justify-between text-xs pt-2 border-t border-white/10">
          <span className="text-white/70">Total Cost</span>
          <span className="text-white font-semibold">
            {paymentMethod === 'PLS' ? (
              `~${Number(formatEther(wplsRequiredWei)).toFixed(0)} PLS`
            ) : (
              `${wager.toLocaleString()} MORBIUS`
            )}
          </span>
        </div>
        </div>
      </div>

      {/* Play Button */}
      {!isConnected ? (
        <ConnectButton />
      ) : (
        <Button
          className={cn(
            'w-full h-12 font-semibold hover:opacity-80',
            (busy || selectedNumbers.length !== spotSize)
              ? 'text-white/40 [-webkit-text-stroke:0.1px_black] font-bold'
              : 'text-white'
          )}
          style={
            !(busy || selectedNumbers.length !== spotSize)
              ? {
                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.9), rgba(22, 163, 74, 0.85))',
                  boxShadow: '0 4px 0 rgba(21, 128, 61, 0.8), 0 6px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                  border: '1px solid rgba(74, 222, 128, 0.5)',
                }
              : undefined
          }
          disabled={busy || selectedNumbers.length !== spotSize}
          onClick={handlePlay}
        >
          {isApprovePending || isApproveConfirming ? (
            <AnimatedShinyText className="text-white/40 [-webkit-text-stroke:0.1px_black] font-bold">Approving...</AnimatedShinyText>
          ) : isPlayPending || isPlaying ? (
            <AnimatedShinyText className="text-white/40 [-webkit-text-stroke:0.1px_black] font-bold">Playing...</AnimatedShinyText>
          ) : selectedNumbers.length !== spotSize ? (
            `Select ${spotSize - selectedNumbers.length} more number${spotSize - selectedNumbers.length !== 1 ? 's' : ''}`
          ) : (
            <AnimatedShinyText className="text-white [-webkit-text-stroke:0.1px_black] font-bold">
              {paymentMethod === 'PLS' ? 'Play with PLS' : 'Play Now'}
            </AnimatedShinyText>
          )}
        </Button>
      )}
      </div>
    </div>
  )

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.95))',
      }}
    >
      <GlobalMainNav
        onShowKenoPrizePool={() => setShowPrizePool(true)}
        onOpenPlayerProfile={address ? (game) => { setPlayerProfileGame(game); setPlayerProfileOpen(true); } : undefined}
      >
      <main className="px-2 sm:px-4 md:px-6 pb-16 pt-4 md:pt-2 w-full max-w-full overflow-x-hidden">
        <div className="flex flex-col md:grid md:grid-cols-2 gap-6">
          {/* LEFT COLUMN: Live board always visible — min-height keeps layout stable when overlay shows/hides */}
          <div className="flex flex-col gap-6 order-1 md:order-none min-h-[520px] md:min-h-[580px]">
            {/* Live Keno Board — fixed min-height so overlay doesn't change column size */}
            <div id="live-keno-board" className="min-h-[380px] flex flex-col">
              <LiveKenoBoard
                winningNumbers={lastResult?.winningNumbers ?? []}
                active={!!lastResult}
                onDrawComplete={() => setDrawComplete(true)}
                onDrawProgress={(drawn, total) => setDrawnCount(drawn)}
                tickets={lastResult ? [{
                  ticketId: lastResult.ticketId,
                  numbers: lastResult.playerNumbers,
                  spotSize: lastResult.spotSize,
                  wager: Number(formatEther(lastResult.wager)).toFixed(0),
                  draws: 1,
                  // Keep drawsRemaining at 1 during animation so "Your Numbers" stays visible;
                  // the filteredTickets filter in LiveKenoBoard also bypasses this when active=true
                  drawsRemaining: drawComplete ? 0 : 1,
                  firstRoundId: BigInt(0),
                  roundTo: 0,
                  isActive: !drawComplete,
                  currentWin: drawComplete ? Number(formatEther(lastResult.netPayout)).toFixed(0) : '0',
                }] : selectedNumbers.length > 0 ? [{
                  ticketId: BigInt(0),
                  numbers: selectedNumbers,
                  spotSize,
                  wager: wager.toString(),
                  draws: 1,
                  drawsRemaining: 1,
                  firstRoundId: BigInt(0),
                  roundTo: 0,
                  isActive: true,
                  currentWin: '0',
                }] : []}
              />
            </div>

            {/* Result / drawing status card */}
            {lastResult && !drawComplete && (
              <Card
                className="relative overflow-hidden"
                style={{
                  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                  border: '1px inset rgba(60, 60, 60, 0.5)',
                }}
              >
                <div className="p-4 flex flex-col items-center gap-3 text-center">
                  <p className="font-russo-one text-xl tracking-wide text-white drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">
                    Drawing Numbers
                  </p>
                  <p className="text-sm text-white/60">
                    {drawnCount} of 20 balls drawn
                  </p>
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-cyan-500 transition-all duration-500"
                      style={{ width: `${(drawnCount / 20) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-white/40">Results revealed when drawing completes</p>
                </div>
              </Card>
            )}
            {/* Mobile ticket builder */}
            <div className="md:hidden">
              <Card
                className="relative overflow-hidden p-0 w-full max-w-full"
                style={{
                  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                  border: '1px inset rgba(60, 60, 60, 0.5)',
                }}
              >
                <div className="relative flex flex-col gap-4 p-4 min-h-0 overflow-x-hidden w-full">
                  {ticketBuilder}
                  {confirmPanel}
                </div>
                {lastResult && !drawComplete && (
                  <div
                    className="absolute inset-0 z-20 flex flex-col rounded-lg"
                    style={{
                      background: 'linear-gradient(325deg, rgba(16, 20, 24, 0.98), rgba(24, 28, 32, 0.98))',
                    }}
                  >
                    <div className="flex-1 min-h-0 p-3 grid grid-cols-3 grid-rows-3 gap-2 border-b border-white/10">
                      {[
                        { label: 'Balls left', value: <NumberTicker value={20 - drawnCount} animateOnChange direction="down" startValue={20} className="font-russo-one text-2xl md:text-3xl font-black tabular-nums text-white drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" /> },
                        { label: 'Drawn', value: `${drawnCount} / 20` },
                        { label: 'Spot', value: lastResult?.spotSize ?? '—' },
                        { label: 'Wager', value: lastResult ? `${Number(formatEther(lastResult.wager)).toLocaleString()}` : '—' },
                        { label: 'Total plays', value: kenoStats.totalPlays.toString() },
                        { label: 'Wagered', value: Number(formatEther(kenoStats.totalWagered)).toLocaleString() },
                        { label: 'Total won', value: Number(formatEther(kenoStats.totalWon)).toLocaleString() },
                        { label: 'Win rate', value: `${kenoStats.winRate.toFixed(1)}%` },
                        { label: 'P/L', value: (kenoStats.profitLoss >= 0n ? '+' : '') + Number(formatEther(kenoStats.profitLoss >= 0n ? kenoStats.profitLoss : -kenoStats.profitLoss)).toLocaleString(), highlight: true },
                      ].map((stat, i) => (
                        <div
                          key={i}
                          className="flex flex-col items-center justify-center rounded-lg p-2 min-h-0"
                          style={{
                            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(60, 60, 60, 0.5)',
                          }}
                        >
                          <span className="text-cyan-300/80 text-[10px] font-bold uppercase tracking-wider truncate w-full text-center">{stat.label}</span>
                          <span className={cn('text-white font-bold text-sm md:text-base tabular-nums mt-0.5', stat.highlight && (kenoStats.profitLoss >= 0n ? 'text-emerald-400' : 'text-red-400'))}>
                            {stat.value}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex-1 min-h-0 flex items-center justify-center p-4">
                      <div
                        className="w-full h-full min-h-[80px] flex items-center justify-center rounded-lg border border-dashed border-white/20 text-white/40 text-sm"
                        style={{
                          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.6), rgba(40, 40, 40, 0.4))',
                        }}
                      >
                        Advertisement
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Advertising space — fixed height so board/betting panel/ad stay same size after game */}
            <AdSpace slot="default" />

          </div>

          {/* RIGHT COLUMN - Ticket Builder (desktop only) — min-height matches left so columns stay same size */}
          <div className="hidden md:block order-2 md:order-none min-h-[520px] md:min-h-[580px]">
            <Card
              className="relative overflow-hidden p-0 w-full max-w-full"
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                border: '1px inset rgba(60, 60, 60, 0.5)',
              }}
            >
              <div className="relative flex flex-col gap-4 p-4 min-h-0 overflow-x-hidden w-full">
                {ticketBuilder}
                {confirmPanel}
              </div>
              {lastResult && !drawComplete && (
                <div
                  className="absolute inset-0 z-20 flex flex-col rounded-lg"
                  style={{
                    background: 'linear-gradient(325deg, rgba(16, 20, 24, 0.98), rgba(24, 28, 32, 0.98))',
                  }}
                >
                  <div className="flex-1 min-h-0 p-3 grid grid-cols-3 grid-rows-3 gap-2 border-b border-white/10">
                    {[
                      { label: 'Balls left', value: <NumberTicker value={20 - drawnCount} animateOnChange direction="down" startValue={20} className="font-russo-one text-2xl md:text-3xl font-black tabular-nums text-white drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" /> },
                      { label: 'Drawn', value: `${drawnCount} / 20` },
                      { label: 'Spot', value: lastResult?.spotSize ?? '—' },
                      { label: 'Wager', value: lastResult ? `${Number(formatEther(lastResult.wager)).toLocaleString()}` : '—' },
                      { label: 'Total plays', value: kenoStats.totalPlays.toString() },
                      { label: 'Wagered', value: Number(formatEther(kenoStats.totalWagered)).toLocaleString() },
                      { label: 'Total won', value: Number(formatEther(kenoStats.totalWon)).toLocaleString() },
                      { label: 'Win rate', value: `${kenoStats.winRate.toFixed(1)}%` },
                      { label: 'P/L', value: (kenoStats.profitLoss >= 0n ? '+' : '') + Number(formatEther(kenoStats.profitLoss >= 0n ? kenoStats.profitLoss : -kenoStats.profitLoss)).toLocaleString(), highlight: true },
                    ].map((stat, i) => (
                      <div
                        key={i}
                        className="flex flex-col items-center justify-center rounded-lg p-2 min-h-0"
                        style={{
                          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                          boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.5)',
                          border: '1px solid rgba(60, 60, 60, 0.5)',
                        }}
                      >
                        <span className="text-cyan-300/80 text-[10px] font-bold uppercase tracking-wider truncate w-full text-center">{stat.label}</span>
                        <span className={cn('text-white font-bold text-sm md:text-base tabular-nums mt-0.5', stat.highlight && (kenoStats.profitLoss >= 0n ? 'text-emerald-400' : 'text-red-400'))}>
                          {stat.value}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 min-h-0 flex items-center justify-center p-4">
                    <div
                      className="w-full h-full min-h-[80px] flex items-center justify-center rounded-lg border border-dashed border-white/20 text-white/40 text-sm"
                      style={{
                        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.6), rgba(40, 40, 40, 0.4))',
                      }}
                    >
                      Advertisement
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Recent plays | Recent games — 2-col grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 mt-6">
          <div className="min-w-0">
            <KenoRecentPlays compact />
          </div>
          <div className="min-w-0">
            <GlobalKenoHistoryTable title="Recent games" />
          </div>
        </section>

        {/* How to Play | Leaderboard — 2-col grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 mt-6">
          <Card
            className="rounded-xl overflow-hidden border border-cyan-500/30"
            style={{
              background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.9), rgba(40, 40, 40, 0.7))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div className="p-4 space-y-4">
              <h2 className="text-lg font-bold text-cyan-400">How to Play Crypto KENO</h2>
              <div className="space-y-4 text-sm text-white/90">
                <div>
                  <h3 className="font-semibold text-white mb-1">Getting Started</h3>
                  <p>Connect your Web3 wallet to play on PulseChain. Choose how many spots (1-10) you want to play. Set your wager in MORBIUS or pay with PLS.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">Selecting Numbers</h3>
                  <p>Pick numbers from 1-80 or use Quick Pick. The count must match your spot size.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">Instant Results</h3>
                  <p>Click Play Now and the contract draws 20 winning numbers in the same transaction. Your result and payout appear instantly!</p>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">Paytables</h3>
                  <p>Paytables are shown above for your chosen spot size. Higher spot sizes offer bigger multipliers for full matches.</p>
                </div>
              </div>
            </div>
          </Card>
          <div className="min-w-0">
            <KenoTopPlayers />
          </div>
        </section>

      </main>

      {/* Prize Pool Modal */}
      <KenoPrizePoolModal
        open={showPrizePool}
        onOpenChange={setShowPrizePool}
      />

      <PlayerProfileModal
        isOpen={playerProfileOpen}
        onClose={() => setPlayerProfileOpen(false)}
        address={address ?? null}
        game={playerProfileGame}
      />

      {/* FAQ (includes contract addresses) */}
      <div className="w-full flex justify-center py-4">
        <GameFAQ
          game="keno"
          addresses={[
            { label: 'Keno Contract', address: KENO_ADDRESS },
            { label: 'MORBIUS Token', address: MORBIUS_TOKEN_ADDRESS },
          ]}
        />
      </div>

      {/* Footer */}
      <Footer />
      </GlobalMainNav>
    </div>
  )
}
