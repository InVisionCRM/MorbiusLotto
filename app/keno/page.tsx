'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { toast } from 'sonner'
import { cn, triggerSuccessConfetti } from '@/lib/utils'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, usePublicClient, useReadContract, useReadContracts } from 'wagmi'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatEther, parseAbiItem, parseEther } from 'viem'
import {
  KENO_ADDRESS,
  KENO_DEPLOY_BLOCK,
  WPLS_TOKEN_ADDRESS,
  MORBIUS_TOKEN_ADDRESS,
  PULSEX_V1_ROUTER_ADDRESS,
  WPLS_TO_MORBIUS_BUFFER_BPS,
} from '@/lib/contracts'
import { KENO_ABI } from '@/lib/keno-abi'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Trophy, Info, LayoutGrid } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
// import { KenoTicket } from '@/components/CryptoKeno/keno-ticket'
import { LiveKenoBoard } from '@/components/CryptoKeno/live-keno-board'
import { KenoPrizePoolModal } from '@/components/CryptoKeno/keno-prize-pool-modal'
// import { useKenoTicketRoundHistory } from '@/hooks/use-keno-ticket-round-history'
import { ContractAddress } from '@/components/ui/contract-address'
import Footer from '@/components/PLINKO/Footer'
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text'
import GlobalMainNav from '@/components/shared/GlobalMainNav'

const ALL_NUMBERS = Array.from({ length: 80 }, (_, i) => i + 1)

const PAYTABLE: Record<number, Record<number, number>> = {
  1: { 1: 2 },
  2: { 2: 11 },
  3: { 2: 2, 3: 27 },
  4: { 2: 1, 3: 5, 4: 72 },
  5: { 3: 2, 4: 18, 5: 410 },
  6: { 3: 1, 4: 7, 5: 57, 6: 1100 },
  7: { 3: 1, 4: 5, 5: 11, 6: 100, 7: 2000 },
  8: { 4: 2, 5: 15, 6: 50, 7: 300, 8: 10000 },
  9: { 4: 2, 5: 5, 6: 20, 7: 100, 8: 2000, 9: 25000 },
  10: { 0: 5, 5: 2, 6: 10, 7: 50, 8: 500, 9: 5000, 10: 100000 },
}

const BULLSEYE_PAYTABLE: Record<number, Record<number, number>> = {
  1: { 1: 6 },
  2: { 2: 33 },
  3: { 2: 6, 3: 81 },
  4: { 2: 3, 3: 15, 4: 216 },
  5: { 3: 6, 4: 54, 5: 1230 },
  6: { 3: 3, 4: 21, 5: 171, 6: 3300 },
  7: { 3: 3, 4: 15, 5: 33, 6: 300, 7: 6000 },
  8: { 4: 6, 5: 45, 6: 150, 7: 900, 8: 30000 },
  9: { 4: 6, 5: 15, 6: 60, 7: 300, 8: 6000, 9: 75000 },
  10: { 0: 15, 5: 6, 6: 30, 7: 150, 8: 1500, 9: 15000, 10: 300000 },
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
  {
    name: 'swapExactTokensForTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const

type MyTicket = {
  ticketId: bigint
  firstRoundId: bigint
  draws: number
  spotSize: number
  wagerPerDraw: string
  numbers: number[]
  drawsRemaining: number
  roundTo: number
  currentWin: string
  purchaseTimestamp?: number
  transactionHash?: string
  addons?: number[] // Add missing addons property
}

// KenoTicket / KenoTicketBarcode commented out from page UI
// Wrapper component that fetches round history for a keno ticket
// function KenoTicketWithHistory({
//   ticket,
//   index,
// }: {
//   ticket: MyTicket
//   index: number
// }) {
//   const ticketForHook = {
//     numbers: ticket.numbers,
//     spotSize: ticket.spotSize,
//     wagerPerDraw: ticket.wagerPerDraw,
//     firstRoundId: ticket.firstRoundId,
//     roundTo: ticket.roundTo,
//     addons: (ticket.addons || []) as any,
//   }
//   const { roundHistory } = useKenoTicketRoundHistory(ticketForHook as any)
//   const isActive = ticket.drawsRemaining > 0
//   return (
//     <KenoTicket
//       key={ticket.ticketId.toString()}
//       ticketId={ticket.ticketId}
//       numbers={ticket.numbers}
//       spotSize={ticket.spotSize}
//       wager={ticket.wagerPerDraw}
//       draws={ticket.draws}
//       drawsRemaining={ticket.drawsRemaining}
//       firstRoundId={ticket.firstRoundId}
//       roundTo={ticket.roundTo}
//       addons={{ multiplier: false, bullsEye: false, plus3: false }}
//       isActive={isActive}
//       currentWin={ticket.currentWin}
//       purchaseTimestamp={ticket.purchaseTimestamp}
//       transactionHash={ticket.transactionHash}
//       roundHistory={roundHistory}
//       index={index}
//     />
//   )
// }

// Memoized function that enriches tickets with round history for LiveKenoBoard
// Since we can't call hooks in loops, we'll use a simpler approach for now
function useTicketsWithHistoryMemo(tickets: MyTicket[]) {
  return useMemo(() => {
    return tickets.map(t => ({
      ticketId: t.ticketId,
      numbers: t.numbers,
      spotSize: t.spotSize,
      wager: t.wagerPerDraw,
      draws: t.draws,
      drawsRemaining: t.drawsRemaining,
      firstRoundId: t.firstRoundId,
      roundTo: t.roundTo,
      addons: {
        multiplier: false,
        bullsEye: false,
        plus3: false,
      },
      isActive: t.drawsRemaining > 0,
      currentWin: t.currentWin,
      purchaseTimestamp: t.purchaseTimestamp,
      roundHistory: [], // For now, LiveKenoBoard won't show round history to avoid hook order issues
    }))
  }, [tickets])
}

function formatCountdown(target: number | null) {
  if (!target || target <= 0) return '--:--'
  const diff = Math.max(0, target - Date.now())
  const totalSeconds = Math.floor(diff / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
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
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-[30px]">
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

  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([])
  const [spotSize, setSpotSize] = useState(8)
  const [wager, setWager] = useState(1000) // Wager amount in MORBIUS (contract expects MORBIUS amounts)
  const [draws, setDraws] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState<'MORBIUS' | 'PLS'>('MORBIUS')
  const [nextDrawTime, setNextDrawTime] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState<number>(Date.now())
  const [activeRoundId, setActiveRoundId] = useState<number>(1)
  const [showPrizePool, setShowPrizePool] = useState(false)
  const [myTickets, setMyTickets] = useState<MyTicket[]>([])
  const [loadingMyTickets, setLoadingMyTickets] = useState(false)
  const [hasLoadedTicketsOnce, setHasLoadedTicketsOnce] = useState(false)
  const [ticketIds, setTicketIds] = useState<bigint[]>([])
  const [ticketPurchaseTimestamps, setTicketPurchaseTimestamps] = useState<Map<string, number>>(new Map())
  const [ticketTransactionHashes, setTicketTransactionHashes] = useState<Map<string, string>>(new Map())
  const ticketBuilderRef = useRef<HTMLDivElement | null>(null)
  const [pendingBuy, setPendingBuy] = useState<{
    roundIdArg: bigint
    numbersArg: number[]
    spotArg: number
    drawsArg: number
    wagerArg: bigint
    totalCostWei: bigint
  } | null>(null)
  const prevWinningHash = useRef<string>('')
  const hasShownNoTicketsDialog = useRef(false)
  const [lastDraw, setLastDraw] = useState<{
    roundId: number
    winningNumbers: number[]
    plus3Numbers: number[]
    multiplier: number
    bullsEyeNumber: number
  } | null>(null)
  const [showLiveBoard, setShowLiveBoard] = useState(false)
  const [isNumberPickerCollapsed, setIsNumberPickerCollapsed] = useState(true)
  const [showNoTicketsDialog, setShowNoTicketsDialog] = useState(false)



  const { data: allowanceResult } = useReadContracts({
    contracts: address
      ? [
          { address: MORBIUS_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, KENO_ADDRESS] },
          { address: WPLS_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, PULSEX_V1_ROUTER_ADDRESS] },
        ]
      : [],
  })

  const { data: currentRoundIdData } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'currentRoundId',
    query: { refetchInterval: 5000 },
  })

  const { data: roundData } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'getRound',
    args: [BigInt(activeRoundId)],
    query: { enabled: activeRoundId > 0, refetchInterval: 5000 },
  })


  const roundDataAny = (roundData as any) || {}
  const roundState = Number(roundDataAny.state ?? 0)

  useEffect(() => {
    if (currentRoundIdData) setActiveRoundId(Number(currentRoundIdData))
  }, [currentRoundIdData])

  useEffect(() => {
    const endMs = Number(roundDataAny.endTime ?? 0) * 1000
    if (endMs > 0) setNextDrawTime(endMs)
  }, [roundDataAny.endTime])

  useEffect(() => {
    if (!nextDrawTime) return
    const timer = setInterval(() => {
      const now = Date.now()
      setCurrentTime(now)
      const total = nextDrawTime - (roundDataAny.startTime ? Number(roundDataAny.startTime) * 1000 : 0)
      const remaining = Math.max(0, nextDrawTime - now)
      setProgress(100 - Math.min(100, total > 0 ? (remaining / total) * 100 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [nextDrawTime, roundDataAny.startTime])

  const winningNumbers = useMemo(
    () => Array.from(roundDataAny.winningNumbers || []).map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0),
    [roundDataAny.winningNumbers]
  )
  const plus3Numbers = useMemo(() => {
    const raw = roundDataAny?.plus3Numbers ?? roundDataAny?.plus3WinningNumbers ?? []
    return Array.from(raw)
      .map((n: unknown) => (typeof n === 'bigint' ? Number(n) : typeof n === 'number' ? n : NaN))
      .filter((n: number) => Number.isFinite(n) && n > 0)
  }, [roundDataAny])
  const drawnMultiplier = useMemo(() => Number(roundDataAny.drawnMultiplier ?? 1), [roundDataAny.drawnMultiplier])

  // Capture finalized round for live board
  useEffect(() => {
    if (!roundDataAny) return

    // Debug: Log round state to diagnose LiveKenoBoard display issues
    console.log('🎲 Keno Round State Check:', {
      roundId: roundDataAny.id?.toString?.(),
      state: roundState,
      stateType: typeof roundState,
      stateNumber: roundState,
      isFinalized: roundState === 2,
      winningNumbersLength: winningNumbers.length,
      winningNumbers: winningNumbers.slice(0, 10),
      shouldShowBoard: roundState === 2 && winningNumbers.length > 0,
    })

    if (roundState === 2 && winningNumbers.length) {
      const sig = `${roundDataAny.id?.toString?.() || ''}|${winningNumbers.join(',')}`
      if (prevWinningHash.current === sig) {
        console.log('   ℹ️  Skipping duplicate round draw')
        return
      }
      prevWinningHash.current = sig
      console.log('   ✅ Setting lastDraw and showing LiveKenoBoard!')
      setLastDraw({
        roundId: Number(roundDataAny.id ?? activeRoundId),
        winningNumbers,
        plus3Numbers,
        multiplier: drawnMultiplier,
        bullsEyeNumber: Number(roundDataAny.bullsEyeNumber ?? 0),
      })
      setShowLiveBoard(true)
    } else {
      console.log('   ⏳ Round not ready for LiveKenoBoard display')
    }
  }, [roundDataAny, roundState, winningNumbers, plus3Numbers, drawnMultiplier, activeRoundId])


  const { MORBIUSAllowanceWei, wplsAllowanceWei } = useMemo(() => {
    type ReadValue = { result?: bigint } | bigint | undefined
    const res = allowanceResult as ReadValue[] | undefined
    const extract = (v: ReadValue) => {
      if (typeof v === 'bigint') return v
      if (v && typeof v === 'object' && 'result' in v && typeof v.result === 'bigint') return v.result
      return BigInt(0)
    }
    return {
      MORBIUSAllowanceWei: extract(res && res[0]),
      wplsAllowanceWei: extract(res && res[1]),
    }
  }, [allowanceResult])

  // Calculate total cost
  const totalCostWei = useMemo(() => {
    const baseCost = parseEther(wager.toString()) * BigInt(draws)
    return baseCost
  }, [wager, draws])

  const totalCost = useMemo(() => Number(formatEther(totalCostWei)), [totalCostWei])

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
    const taxed = (quote * BigInt(15000)) / BigInt(10000)  // 50% tax
    return (taxed * BigInt(12000)) / BigInt(10000)  // 20% buffer for slippage
  }, [wplsQuote])

  const { writeContract: writeApprove, writeContractAsync: writeApproveAsync, data: approveHash, isPending: isApprovePending, error: approveError } = useWriteContract()
  const { writeContract: writeBuy, writeContractAsync: writeBuyAsync, data: buyHash, isPending: isBuyPending, error: buyError } = useWriteContract()
  const { writeContractAsync: writeSwapAsync } = useWriteContract()

  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed, error: approveConfirmError } = useWaitForTransactionReceipt({ hash: approveHash })
  const { isLoading: isBuyConfirming, isSuccess: isBuyConfirmed, error: buyConfirmError } = useWaitForTransactionReceipt({ hash: buyHash })

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

  const handleBuy = async () => {
    if (!isConnected || !address) {
      toast.error('Connect wallet to buy.')
      return
    }
    if (selectedNumbers.length !== spotSize) {
      toast.error(`Pick ${spotSize} numbers before buying.`)
      return
    }
    // Contract automatically handles round creation and transitions
    // No frontend validation needed - let the contract decide the appropriate round
    const roundIdArg = BigInt(Math.max(1, activeRoundId))
    const numbersArg = selectedNumbers.map((n) => Number(n))
    const wagerArg = parseEther(wager.toString())
    const purchase = { roundIdArg, numbersArg, spotArg: spotSize, drawsArg: draws, wagerArg, totalCostWei }

    if (paymentMethod === 'PLS') {
      try {
        if (wplsRequiredWei === BigInt(0)) {
          toast.error('Unable to quote PLS required. Please try again.')
          return
        }
        const buyHashTx = await writeBuyAsync({
          address: KENO_ADDRESS,
          abi: KENO_ABI,
          functionName: 'buyTicketWithPLS',
          args: [roundIdArg, numbersArg, spotSize, draws, wagerArg],
          value: wplsRequiredWei,
        } as any)
        await publicClient?.waitForTransactionReceipt({ hash: buyHashTx })
        toast.success('Tickets purchased with PLS')
        triggerSuccessConfetti()
        setPendingBuy(null)
      } catch (err) {
        console.error(err)
        const message = err instanceof Error ? err.message : 'Purchase failed'
        toast.error(message)
      }
      return
    }

    if (MORBIUSAllowanceWei < totalCostWei) {
      setPendingBuy(purchase)
      writeApprove({ 
        address: MORBIUS_TOKEN_ADDRESS, 
        abi: ERC20_ABI, 
        functionName: 'approve', 
        args: [KENO_ADDRESS, totalCostWei],
      } as any)
    } else {
      writeBuy({
        address: KENO_ADDRESS,
        abi: KENO_ABI,
        functionName: 'buyTicket',
        args: [roundIdArg, numbersArg, spotSize, draws, wagerArg],
      } as any)
    }
  }

  const handleStartTicketBuild = () => {
    setShowNoTicketsDialog(false)
    ticketBuilderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    if (isApproveConfirmed && pendingBuy) {
      writeBuy({
        address: KENO_ADDRESS,
        abi: KENO_ABI,
        functionName: 'buyTicket',
        args: [
          pendingBuy.roundIdArg,
          pendingBuy.numbersArg,
          pendingBuy.spotArg,
          pendingBuy.drawsArg,
          pendingBuy.wagerArg,
        ],
      } as any)
      setPendingBuy(null)
    }
  }, [isApproveConfirmed, pendingBuy, writeBuy])

  useEffect(() => {
    if (isBuyConfirmed && publicClient && address) {
      setTimeout(async () => {
        try {
          const fromBlock = KENO_DEPLOY_BLOCK ? BigInt(KENO_DEPLOY_BLOCK) : BigInt(0)
          const event = parseAbiItem('event TicketPurchased(address indexed player,uint256 indexed ticketId,uint256 indexed firstRoundId,uint8 draws,uint8 spotSize,uint256 wagerPerDraw,uint256 grossCost)')
          const logs = await publicClient.getLogs({ address: KENO_ADDRESS, event, args: { player: address }, fromBlock, toBlock: 'latest' })
          const ids = logs.map((l) => l.args.ticketId).filter((id): id is bigint => id !== undefined)
          setTicketIds(ids)
          
          // Fetch timestamps and transaction hashes for each ticket
          const timestampMap = new Map<string, number>()
          const txHashMap = new Map<string, string>()
          for (const log of logs) {
            if (log.args.ticketId !== undefined) {
              try {
                const block = await publicClient.getBlock({ blockNumber: log.blockNumber })
                timestampMap.set(log.args.ticketId.toString(), Number(block.timestamp) * 1000)
                txHashMap.set(log.args.ticketId.toString(), log.transactionHash)
              } catch (err) {
                console.error('Failed to fetch block timestamp', err)
              }
            }
          }
          setTicketPurchaseTimestamps(timestampMap)
          setTicketTransactionHashes(txHashMap)
          setHasLoadedTicketsOnce(true)
        } catch (err) {
          console.error('ticket reload failed', err)
        }
      }, 2000)
    }
  }, [isBuyConfirmed, publicClient, address])

  useEffect(() => {
    if (!publicClient || !address) return
    const loadTickets = async () => {
      setLoadingMyTickets(true)
      try {
        const fromBlock = KENO_DEPLOY_BLOCK ? BigInt(KENO_DEPLOY_BLOCK) : BigInt(0)
        const event = parseAbiItem('event TicketPurchased(address indexed player,uint256 indexed ticketId,uint256 indexed firstRoundId,uint8 draws,uint8 spotSize,uint256 wagerPerDraw,uint256 grossCost)')
        const logs = await publicClient.getLogs({ address: KENO_ADDRESS, event, args: { player: address }, fromBlock, toBlock: 'latest' })
        const ids = logs.map((l) => l.args.ticketId).filter((id): id is bigint => id !== undefined)
        setTicketIds(ids)
        
        // Fetch timestamps and transaction hashes for each ticket
        const timestampMap = new Map<string, number>()
        const txHashMap = new Map<string, string>()
        for (const log of logs) {
          if (log.args.ticketId !== undefined) {
            try {
              const block = await publicClient.getBlock({ blockNumber: log.blockNumber })
              timestampMap.set(log.args.ticketId.toString(), Number(block.timestamp) * 1000)
              txHashMap.set(log.args.ticketId.toString(), log.transactionHash)
            } catch (err) {
              console.error('Failed to fetch block timestamp', err)
            }
          }
        }
        setTicketPurchaseTimestamps(timestampMap)
        setTicketTransactionHashes(txHashMap)
      } catch (err) {
        console.error('my tickets query failed', err)
      } finally {
        setLoadingMyTickets(false)
        setHasLoadedTicketsOnce(true)
      }
    }
    loadTickets()
  }, [address, publicClient])

  const { data: ticketDetails } = useReadContracts({
    contracts: ticketIds.map((id) => ({ address: KENO_ADDRESS, abi: KENO_ABI, functionName: 'getTicket', args: [id] } as const)),
    query: { enabled: ticketIds.length > 0, refetchInterval: 10000 },
  }) as { data: any[] | undefined }

  const decodeNumbers = (bitmap: bigint): number[] => {
    const arr: number[] = []
    for (let i = 1; i <= 80; i++) {
      const bit = BigInt(1) << BigInt(i - 1)
      if ((bitmap & bit) !== BigInt(0)) arr.push(i)
    }
    return arr
  }

  const calculateRoundWin = useCallback((ticketNumbers: number[], roundWinningNumbers: number[], spotSize: number, wagerPerDraw: bigint) => {
    let hits = 0
    for (const n of roundWinningNumbers) {
      if (ticketNumbers.includes(n)) {
        hits++
      }
    }
    const baseMult = PAYTABLE[spotSize]?.[hits] ?? 0
    const total = baseMult * Number(formatEther(wagerPerDraw))
    return total
  }, [])

  const myTicketsEnriched: MyTicket[] = useMemo(() => {
    if (!ticketDetails || ticketDetails.length === 0) return []
    const enriched: MyTicket[] = []
    ticketDetails.forEach((td, idx) => {
      const data: any = (td as any)?.result ?? td
      if (!data || !ticketIds[idx]) return
      const from = Number(data.firstRoundId || 0)
      const draws = Number(data.draws || 0)
      const spotSize = Number(data.spotSize || 0)
      const wagerPerDraw = data.wagerPerDraw ? Number(formatEther(data.wagerPerDraw)).toFixed(0) : '0'
      const numbers = decodeNumbers(data.numbersBitmap || BigInt(0))
      const lastRound = from + draws - 1
      const drawsRemaining = activeRoundId < from ? draws : activeRoundId > lastRound ? 0 : lastRound - activeRoundId + 1
      const currentWin =
        roundState === 2 && activeRoundId >= from && activeRoundId <= lastRound
          ? calculateRoundWin(
              numbers,
              Array.from(roundDataAny.winningNumbers || []).map((n: any) => Number(n)),
              spotSize,
              data.wagerPerDraw
            ).toFixed(0)
          : '0'
      const purchaseTimestamp = ticketPurchaseTimestamps.get(ticketIds[idx].toString())
      const transactionHash = ticketTransactionHashes.get(ticketIds[idx].toString())
      enriched.push({
        ticketId: ticketIds[idx],
        firstRoundId: BigInt(from),
        draws,
        spotSize,
        wagerPerDraw,
        numbers,
        drawsRemaining,
        roundTo: lastRound,
        currentWin,
        purchaseTimestamp,
        transactionHash,
      })
    })
    return enriched.sort((a, b) => Number(b.ticketId - a.ticketId))
  }, [ticketDetails, ticketIds, activeRoundId, roundData, calculateRoundWin, ticketPurchaseTimestamps, ticketTransactionHashes] as const)

  // Enrich tickets with round history for LiveKenoBoard
  const ticketsWithHistory = useTicketsWithHistoryMemo(myTicketsEnriched)

  useEffect(() => {
    if (!isConnected) {
      setShowNoTicketsDialog(false)
      hasShownNoTicketsDialog.current = false
      setHasLoadedTicketsOnce(false)
      return
    }
    if (!hasLoadedTicketsOnce || loadingMyTickets) return
    if (myTicketsEnriched.length > 0) {
      setShowNoTicketsDialog(false)
      hasShownNoTicketsDialog.current = false
      return
    }
    if (!loadingMyTickets && myTicketsEnriched.length === 0 && !hasShownNoTicketsDialog.current) {
      setShowNoTicketsDialog(true)
      hasShownNoTicketsDialog.current = true
    }
  }, [hasLoadedTicketsOnce, isConnected, loadingMyTickets, myTicketsEnriched.length])

  const roundStats = useMemo(() => {
    if (!roundDataAny) return null
    return {
      poolBalance: roundDataAny.poolBalance ?? BigInt(0),
      totalBaseWager: roundDataAny.totalBaseWager ?? BigInt(0),
    }
  }, [roundDataAny])

  const poolDisplay = useMemo(() => (roundStats ? Number(formatEther(roundStats.poolBalance)).toFixed(0) : '0'), [roundStats])

  useEffect(() => {
    if (approveError) toast.error(approveError.message || 'Approval failed.')
  }, [approveError])
  useEffect(() => {
    if (buyError) toast.error(buyError.message || 'Buy failed.')
  }, [buyError])
  useEffect(() => {
    if (approveConfirmError) toast.error(approveConfirmError.message || 'Approval failed.')
  }, [approveConfirmError])
  useEffect(() => {
    if (buyConfirmError) toast.error(buyConfirmError.message || 'Transaction failed.')
  }, [buyConfirmError])

  if (showIntro) {
    return <KenoIntroScreen onComplete={handleIntroComplete} />
  }

  return (
    <div 
      className="min-h-screen text-white"
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.95))',
      }}
    >
      <GlobalMainNav 
        onShowKenoPrizePool={() => setShowPrizePool(true)}
      >
      <main className="px-2 sm:px-4 md:px-6 pb-16 pt-4 md:pt-2 w-full max-w-full overflow-x-hidden">
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6">
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-6">
            {lastDraw && showLiveBoard && (
              <div id="live-keno-board">
                <LiveKenoBoard
                  roundId={lastDraw.roundId}
                  winningNumbers={lastDraw.winningNumbers}
                  plus3Numbers={lastDraw.plus3Numbers}
                  multiplier={lastDraw.multiplier}
                  bullsEyeNumber={lastDraw.bullsEyeNumber}
                  active={showLiveBoard}
                  onClose={() => setShowLiveBoard(false)}
                  nextDrawTime={nextDrawTime ? Math.floor(nextDrawTime / 1000) : undefined}
                  tickets={ticketsWithHistory}
                  insertAfterYourNumbers={
                    <div className="lg:hidden -mt-4">
                      <Card
                        className="relative overflow-hidden p-0 w-full max-w-full"
                        style={{
                          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                          boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                          border: '1px inset rgba(60, 60, 60, 0.5)',
                        }}
                      >
                        {/* Radial gradient overlay */}
                        <div className="relative flex flex-col gap-4 p-4 min-h-0 overflow-x-hidden w-full">
                          {/* LEFT PANEL - Builder */}
                          <div className="space-y-4 min-w-0 w-full overflow-x-hidden">
                            <h2 className="text-xl font-bold text-white">BUILD YOUR KENO TICKET</h2>

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
                                {/* Radial gradient overlay */}
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
                                {/* Radial gradient overlay */}
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
                              <label className="block text-sm font-medium text-gray-300">Wager per Draw</label>
                              <Input
                                type="number"
                                step="1000"
                                min="1000"
                                max="100000"
                                value={wager}
                                onChange={(e) => setWager(parseFloat(e.target.value) || 0)}
                                className="text-white relative"
                                style={{
                                  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                                  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                                  border: '1px inset rgba(60, 60, 60, 0.5)',
                                }}
                              />
                              <div className="grid grid-cols-3 gap-1.5">
                                {[1000, 5000, 10000, 25000, 50000, 100000].map((preset) => (
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
                              </div>
                            </div>

                            {/* Quick Actions - Always Visible */}
                            <div className="space-y-3">
                              <h3 className="text-lg font-semibold text-white">Pick your numbers</h3>
                              <div className="grid grid-cols-2 gap-3">
                                <button
                                  onClick={quickPick}
                                  className="h-12 text-white font-semibold rounded-lg hover:opacity-80 transition-all relative"
                                  style={{
                                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                                    border: '1px inset rgba(60, 60, 60, 0.5)',
                                  }}
                                >
                                  {/* Radial gradient overlay */}
                                  <span className="relative z-10">Quick Pick</span>
                                </button>
                                <button
                                  onClick={() => setSelectedNumbers([])}
                                  className="h-12 text-white font-semibold rounded-lg hover:opacity-80 transition-all relative"
                                  style={{
                                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                                    border: '1px inset rgba(60, 60, 60, 0.5)',
                                  }}
                                >
                                  {/* Radial gradient overlay */}
                                  <span className="relative z-10">Clear</span>
                                </button>
                              </div>
                            </div>

                            {/* Number Selection Section - Collapsible */}
                            <div className="space-y-2">
                              {isNumberPickerCollapsed ? (
                                <button
                                  onClick={() => setIsNumberPickerCollapsed(false)}
                                  className="w-full h-12 text-white font-semibold rounded-lg hover:opacity-80 transition-all"
                                  style={{
                                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                                    border: '1px inset rgba(60, 60, 60, 0.5)',
                                  }}
                                >
                                  Pick Your Own Numbers
                                </button>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-medium text-white/70">Select {spotSize} number{spotSize !== 1 ? 's' : ''} from 1-80</h4>
                                    <button
                                      onClick={() => setIsNumberPickerCollapsed(true)}
                                      className="text-white/70 hover:text-white text-sm underline"
                                    >
                                      Collapse
                                    </button>
                                  </div>
                                <div className="w-full overflow-x-hidden">
                                  <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5 mb-3 w-full">
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

                          {/* RIGHT PANEL - Confirm */}
                          <div
                            className="rounded-lg p-4 flex flex-col min-w-0 w-full overflow-x-hidden relative"
                            style={{
                              background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                              border: '1px inset rgba(60, 60, 60, 0.5)',
                            }}
                          >
                            {/* Radial gradient overlay */}
                            <div className="relative z-10">

                            {/* Selected Numbers Display */}
                            <div className="mb-4">
                              <h2 className="text-lg font-bold text-white text-center mb-3">CONFIRM</h2>
                              <div
                                className="rounded-lg p-3 relative"
                                style={{
                                  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                                  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                                  border: '1px inset rgba(60, 60, 60, 0.5)',
                                }}
                              >
                                {/* Radial gradient overlay */}
                                <div className="relative">
                                <div className="text-sm text-white/70 mb-2 text-center">Numbers selected</div>
                                <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center mb-2">
                                  {selectedNumbers.length > 0 ? (
                                    selectedNumbers.map((n) => (
                                      <span
                                        key={n}
                                        className="h-7 min-w-7 px-2 flex items-center justify-center rounded-full bg-white text-black font-bold text-sm"
                                      >
                                        {n}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-white/50 text-sm">Select {spotSize} numbers</span>
                                  )}
                                </div>
                                </div>
                              </div>
                            </div>

                            {/* Payment Method Selection */}
                            <div
                              className="mb-4 p-3 rounded-lg relative"
                              style={{
                                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                                border: '1px inset rgba(60, 60, 60, 0.5)',
                              }}
                            >
                              {/* Radial gradient overlay */}
                              <div className="relative">
                              <div className="text-xs text-white/70 mb-2 font-medium text-center">Pay In...</div>
                              <div className="flex items-center justify-center gap-4">
                                <span
                                  className={cn(
                                    'cursor-pointer transition-all duration-300 px-2 py-1 rounded text-xl',
                                    paymentMethod === 'MORBIUS'
                                      ? 'mitr-semibold bg-gradient-to-r from-cyan-400 to-cyan-600 bg-clip-text text-purple-500'
                                      : 'mitr-regular text-white hover:text-white'
                                  )}
                                  onClick={() => setPaymentMethod('MORBIUS')}
                                >
                                  MORBIUS
                                </span>
                                <span className="text-white/50 text-xl">/</span>
                                <span
                                  className={cn(
                                    'cursor-pointer transition-all duration-300 px-2 py-1 rounded text-xl',
                                    paymentMethod === 'PLS'
                                      ? 'mitr-semibold bg-gradient-to-r from-pink-400 via-red-400 to-cyan-500 bg-clip-text text-purple-500'
                                      : 'mitr-regular text-white/70 hover:text-white'
                                  )}
                                  onClick={() => setPaymentMethod('PLS')}
                                >
                                  PLS
                                </span>
                              </div>
                              </div>
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
                              {/* Radial gradient overlay */}
                              <div className="relative">
                              <div className="flex justify-between text-xs">
                                <span className="text-white/70">Spot Size</span>
                                <span className="text-white font-semibold">{spotSize}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-white/70">Numbers Selected</span>
                                <span className="text-white font-semibold">{selectedNumbers.length}/{spotSize}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-white/70">Wager per Draw</span>
                                <span className="text-white font-semibold">{wager} MORBIUS</span>
                              </div>
                              <div className="flex justify-between text-xs pt-2 border-t border-white/10">
                                <span className="text-white/70">Total Cost</span>
                                <span className="text-white font-semibold">
                                  {paymentMethod === 'PLS' ? (
                                    `~${Number(formatEther(wplsRequiredWei)).toFixed(0)} PLS`
                                  ) : (
                                    `${wager} MORBIUS`
                                  )}
                                </span>
                              </div>
                              </div>
                            </div>

                            {/* Buy Button */}
                            {!isConnected ? (
                              <ConnectButton />
                            ) : (
                              <Button
                                className={cn(
                                  'w-full h-12 font-semibold hover:opacity-80',
                                  (isApprovePending || isApproveConfirming || isBuyPending || isBuyConfirming || selectedNumbers.length !== spotSize)
                                    ? 'text-white/40 [-webkit-text-stroke:0.1px_black] font-bold'
                                    : 'text-white'
                                )}
                                style={
                                  !(isApprovePending || isApproveConfirming || isBuyPending || isBuyConfirming || selectedNumbers.length !== spotSize)
                                    ? {
                                        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                                        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                                        border: '1px inset rgba(60, 60, 60, 0.5)',
                                      }
                                    : undefined
                                }
                                disabled={isApprovePending || isApproveConfirming || isBuyPending || isBuyConfirming || selectedNumbers.length !== spotSize}
                                onClick={handleBuy}
                              >
                                {isApprovePending || isApproveConfirming ? (
                                  <AnimatedShinyText className="text-white/40 [-webkit-text-stroke:0.1px_black] font-bold">Approving...</AnimatedShinyText>
                                ) : isBuyPending || isBuyConfirming ? (
                                  <AnimatedShinyText className="text-white/40 [-webkit-text-stroke:0.1px_black] font-bold">Processing...</AnimatedShinyText>
                                ) : selectedNumbers.length !== spotSize ? (
                                  `Select ${spotSize - selectedNumbers.length} more number${spotSize - selectedNumbers.length !== 1 ? 's' : ''}`
                                ) : (
                                  <AnimatedShinyText className="text-white [-webkit-text-stroke:0.1px_black] font-bold">
                                    {paymentMethod === 'PLS' ? 'Buy with PLS' : 'Buy Ticket'}
                                  </AnimatedShinyText>
                                )}
                              </Button>
                            )}
                            </div>
                          </div>
                        </div>
                      </Card>
                    </div>
                  }
                />
              </div>
            )}

            {/* Round Status */}
            <Card
              className="p-4 relative order-3 lg:order-none"
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                border: '1px inset rgba(60, 60, 60, 0.5)',
              }}
            >
              {/* Radial gradient overlay */}
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-3 h-3 rounded-full",
                      roundState === 1 ? "bg-cyan-500" :
                      roundState === 2 ? "bg-blue-500" :
                      "bg-yellow-500"
                    )} />
                    <div>
                      <p className="text-white font-semibold">
                        Round {activeRoundId}
                      </p>
                      <p className="text-sm text-gray-400">
                        {roundState === 0 ? 'Round will start when purchased' :
                         roundState === 1 ? 'Accepting tickets' :
                         roundState === 2 ? 'Finalized (next round available)' :
                         'Unknown state'}
                      </p>
                    </div>
                  </div>
                  {nextDrawTime && (
                    <div className="text-right">
                      <p className="text-white font-semibold">
                        {formatCountdown(nextDrawTime)}
                      </p>
                      <p className="text-sm text-gray-400">until draw</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* RIGHT COLUMN - Ticket Builder */}
          {/* Mobile: appears after LiveKenoBoard (which contains "Your Numbers" as 2nd item) */}
          <div className="hidden lg:block order-2 lg:order-none">
            <Card
              className="relative overflow-hidden p-0 w-full max-w-full"
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                border: '1px inset rgba(60, 60, 60, 0.5)',
              }}
            >
          {/* Radial gradient overlay */}

          <div className="relative flex flex-col gap-4 p-4 min-h-0 overflow-x-hidden w-full">
            {/* LEFT PANEL - Builder */}
            <div className="space-y-4 min-w-0 w-full overflow-x-hidden">
              <h2 className="text-xl font-bold text-white">BUILD YOUR KENO TICKET</h2>

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
                  {/* Radial gradient overlay */}
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
                  {/* Radial gradient overlay */}
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
                <label className="block text-sm font-medium text-gray-300">Wager per Draw</label>
                <Input
                  type="number"
                  step="1000"
                  min="1000"
                  max="100000"
                  value={wager}
                  onChange={(e) => setWager(parseFloat(e.target.value) || 0)}
                  className="text-white relative"
                  style={{
                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                    border: '1px inset rgba(60, 60, 60, 0.5)',
                  }}
                />
                <div className="grid grid-cols-3 gap-1.5">
                  {[1000, 5000, 10000, 25000, 50000, 100000].map((preset) => (
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
                </div>
              </div>

              {/* Quick Actions - Always Visible */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Pick your numbers</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={quickPick}
                    className="h-12 text-white font-semibold rounded-lg hover:opacity-80 transition-all relative"
                    style={{
                      background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                      boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                      border: '1px inset rgba(60, 60, 60, 0.5)',
                    }}
                  >
                    {/* Radial gradient overlay */}
                    <span className="relative z-10">Quick Pick</span>
                  </button>
                  <button
                    onClick={() => setSelectedNumbers([])}
                    className="h-12 text-white font-semibold rounded-lg hover:opacity-80 transition-all relative"
                    style={{
                      background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                      boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                      border: '1px inset rgba(60, 60, 60, 0.5)',
                    }}
                  >
                    {/* Radial gradient overlay */}
                    <span className="relative z-10">Clear</span>
                  </button>
                </div>
              </div>

              {/* Number Selection Section - Collapsible */}
              <div className="space-y-2">
                {isNumberPickerCollapsed ? (
                  <button
                    onClick={() => setIsNumberPickerCollapsed(false)}
                    className="w-full h-12 text-white font-semibold rounded-lg hover:opacity-80 transition-all"
                    style={{
                      background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                      boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                      border: '1px inset rgba(60, 60, 60, 0.5)',
                    }}
                  >
                    Pick Your Own Numbers
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-white/70">Select {spotSize} number{spotSize !== 1 ? 's' : ''} from 1-80</h4>
                      <button
                        onClick={() => setIsNumberPickerCollapsed(true)}
                        className="text-white/70 hover:text-white text-sm underline"
                      >
                        Collapse
                      </button>
                    </div>
                  <div className="w-full overflow-x-hidden">
                    <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5 mb-3 w-full">
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

            {/* RIGHT PANEL - Confirm */}
            <div
              className="rounded-lg p-4 flex flex-col min-w-0 w-full overflow-x-hidden relative"
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                border: '1px inset rgba(60, 60, 60, 0.5)',
              }}
            >
              {/* Radial gradient overlay */}
              <div className="relative z-10">

              {/* Selected Numbers Display */}
              <div className="mb-4">
                <h2 className="text-lg font-bold text-white text-center mb-3">CONFIRM</h2>
                <div
                  className="rounded-lg p-3 relative"
                  style={{
                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                    border: '1px inset rgba(60, 60, 60, 0.5)',
                  }}
                >
                  {/* Radial gradient overlay */}
                  <div className="relative">
                  <div className="text-sm text-white/70 mb-2 text-center">Numbers selected</div>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center mb-2">
                    {selectedNumbers.length > 0 ? (
                      selectedNumbers.map((n) => (
                        <span
                          key={n}
                          className="h-7 min-w-7 px-2 flex items-center justify-center rounded-full bg-white text-black font-bold text-sm"
                        >
                          {n}
                        </span>
                      ))
                    ) : (
                      <span className="text-white/50 text-sm">Select {spotSize} numbers</span>
                    )}
                  </div>
                  </div>
                </div>
              </div>

              {/* Payment Method Selection */}
              <div
                className="mb-4 p-3 rounded-lg relative"
                style={{
                  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                  border: '1px inset rgba(60, 60, 60, 0.5)',
                }}
              >
                {/* Radial gradient overlay */}
                <div className="relative">
                <div className="text-xs text-white/70 mb-2 font-medium text-center">Pay In...</div>
                <div className="flex items-center justify-center gap-4">
                  <span
                    className={cn(
                      'cursor-pointer transition-all duration-300 px-2 py-1 rounded text-xl',
                      paymentMethod === 'MORBIUS'
                        ? 'mitr-semibold bg-gradient-to-r from-cyan-400 to-cyan-600 bg-clip-text text-purple-500'
                        : 'mitr-regular text-white hover:text-white'
                    )}
                    onClick={() => setPaymentMethod('MORBIUS')}
                  >
                    MORBIUS
                  </span>
                  <span className="text-white/50 text-xl">/</span>
                  <span
                    className={cn(
                      'cursor-pointer transition-all duration-300 px-2 py-1 rounded text-xl',
                      paymentMethod === 'PLS'
                        ? 'mitr-semibold bg-gradient-to-r from-pink-400 via-red-400 to-cyan-500 bg-clip-text text-purple-500'
                        : 'mitr-regular text-white/70 hover:text-white'
                    )}
                    onClick={() => setPaymentMethod('PLS')}
                  >
                    PLS
                  </span>
                </div>
                </div>
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
                {/* Radial gradient overlay */}
                <div className="relative">
                <div className="flex justify-between text-xs">
                  <span className="text-white/70">Spot Size</span>
                  <span className="text-white font-semibold">{spotSize}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/70">Numbers Selected</span>
                  <span className="text-white font-semibold">{selectedNumbers.length}/{spotSize}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/70">Wager per Draw</span>
                  <span className="text-white font-semibold">{wager} MORBIUS</span>
                </div>
                <div className="flex justify-between text-xs pt-2 border-t border-white/10">
                  <span className="text-white/70">Total Cost</span>
                  <span className="text-white font-semibold">
                    {paymentMethod === 'PLS' ? (
                      `~${Number(formatEther(wplsRequiredWei)).toFixed(0)} PLS`
                    ) : (
                      `${wager} MORBIUS`
                    )}
                  </span>
                </div>
                </div>
              </div>

              {/* Buy Button */}
              {!isConnected ? (
                <ConnectButton />
              ) : (
                <Button
                  className={cn(
                    'w-full h-12 font-semibold hover:opacity-80',
                    (isApprovePending || isApproveConfirming || isBuyPending || isBuyConfirming || selectedNumbers.length !== spotSize)
                      ? 'text-white/40 [-webkit-text-stroke:0.1px_black] font-bold'
                      : 'text-white'
                  )}
                  style={
                    !(isApprovePending || isApproveConfirming || isBuyPending || isBuyConfirming || selectedNumbers.length !== spotSize)
                      ? {
                          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                          boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                          border: '1px inset rgba(60, 60, 60, 0.5)',
                        }
                      : undefined
                  }
                  disabled={isApprovePending || isApproveConfirming || isBuyPending || isBuyConfirming || selectedNumbers.length !== spotSize}
                  onClick={handleBuy}
                >
                  {isApprovePending || isApproveConfirming ? (
                    <AnimatedShinyText className="text-white/40 [-webkit-text-stroke:0.1px_black] font-bold">Approving...</AnimatedShinyText>
                  ) : isBuyPending || isBuyConfirming ? (
                    <AnimatedShinyText className="text-white/40 [-webkit-text-stroke:0.1px_black] font-bold">Processing...</AnimatedShinyText>
                  ) : selectedNumbers.length !== spotSize ? (
                    `Select ${spotSize - selectedNumbers.length} more number${spotSize - selectedNumbers.length !== 1 ? 's' : ''}`
                  ) : (
                    <AnimatedShinyText className="text-white [-webkit-text-stroke:0.1px_black] font-bold">
                      {paymentMethod === 'PLS' ? 'Buy with PLS' : 'Buy Ticket'}
                    </AnimatedShinyText>
                  )}
                </Button>
              )}
              </div>
            </div>
          </div>
            </Card>
          </div>
        </div>

      </main>

      {/* Empty tickets dialog */}
      <Dialog open={showNoTicketsDialog} onOpenChange={setShowNoTicketsDialog}>
        <DialogContent
          className="max-w-lg overflow-hidden p-0 text-white"
          style={{
            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
            boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
            border: '1px inset rgba(60, 60, 60, 0.5)',
          }}
        >
          {/* Radial gradient overlay */}
          <div className="relative h-72">
            <Image
              src="/MORBIUS/821eff6f-8815-47ac-b93d-61d09d859de6.png"
              alt="MORBIUS Keno bag"
              fill
              priority
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 480px"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-slate-500 to-slate-600/40" />
            <div className="absolute inset-0 flex flex-col justify-end gap-3 p-6">
              <p className="text-xl font-bold">No active tickets yet</p>
              <p className="text-sm text-gray-100">
                Build your first ticket to join the next draw. It only takes a minute.
              </p>
              <Button
                className="w-full text-md font-bold text-white hover:opacity-80"
                style={{
                  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                  border: '1px inset rgba(60, 60, 60, 0.5)',
                }}
                onClick={handleStartTicketBuild}
              >
                Get Tickets Now!
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Prize Pool Modal */}
      <KenoPrizePoolModal
        open={showPrizePool}
        onOpenChange={setShowPrizePool}
      />

      {/* Keno contract address — click to copy */}
      <div className="w-full flex justify-center py-3">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(KENO_ADDRESS)
              toast.success('Keno contract address copied')
            } catch {
              toast.error('Failed to copy')
            }
          }}
          className="text-white font-bold font-poppins text-sm cursor-pointer hover:opacity-90 transition-opacity select-all"
          title="Click to copy Keno contract address"
        >
          {KENO_ADDRESS}
        </button>
      </div>

      {/* Footer */}
      <Footer />
      </GlobalMainNav>
    </div>
  )
}
