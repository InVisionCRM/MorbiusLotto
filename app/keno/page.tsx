'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
import { Trophy, Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { KenoTicket } from '@/components/CryptoKeno/keno-ticket'
import { LiveKenoBoard } from '@/components/CryptoKeno/live-keno-board'
import { usePulseProgressive } from '@/hooks/usePulseProgressive'
import { useKenoTicketRoundHistory } from '@/hooks/use-keno-ticket-round-history'
import { KenoStatsDisplay } from '@/components/CryptoKeno/keno-stats-display'
import { ContractAddress } from '@/components/ui/contract-address'

const ALL_NUMBERS = Array.from({ length: 80 }, (_, i) => i + 1)
const ADDON_MULTIPLIER_FLAG = 1 << 0
const ADDON_BULLSEYE_FLAG = 1 << 1
const ADDON_PLUS3_FLAG = 1 << 2
const ADDON_PROGRESSIVE_FLAG = 1 << 3

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
  addons: number
  wagerPerDraw: string
  numbers: number[]
  drawsRemaining: number
  roundTo: number
  currentWin: string
  purchaseTimestamp?: number
  transactionHash?: string
}

// Wrapper component that fetches round history for a keno ticket
function KenoTicketWithHistory({
  ticket,
  index,
}: {
  ticket: MyTicket
  index: number
}) {
  const ticketForHook = {
    numbers: ticket.numbers,
    spotSize: ticket.spotSize,
    wagerPerDraw: ticket.wagerPerDraw,
    firstRoundId: ticket.firstRoundId,
    roundTo: ticket.roundTo,
    addons: ticket.addons,
  }

  const { roundHistory } = useKenoTicketRoundHistory(ticketForHook)

  const hasMultiplier = (ticket.addons & ADDON_MULTIPLIER_FLAG) !== 0
  const hasBullsEye = (ticket.addons & ADDON_BULLSEYE_FLAG) !== 0
  const hasPlus3 = (ticket.addons & ADDON_PLUS3_FLAG) !== 0
  const hasProgressive = (ticket.addons & ADDON_PROGRESSIVE_FLAG) !== 0
  const isActive = ticket.drawsRemaining > 0

  return (
    <KenoTicket
      key={ticket.ticketId.toString()}
      ticketId={ticket.ticketId}
      numbers={ticket.numbers}
      spotSize={ticket.spotSize}
      wager={ticket.wagerPerDraw}
      draws={ticket.draws}
      drawsRemaining={ticket.drawsRemaining}
      firstRoundId={ticket.firstRoundId}
      roundTo={ticket.roundTo}
      addons={{
        multiplier: hasMultiplier,
        bullsEye: hasBullsEye,
        plus3: hasPlus3,
        progressive: hasProgressive,
      }}
      isActive={isActive}
      currentWin={ticket.currentWin}
      purchaseTimestamp={ticket.purchaseTimestamp}
      transactionHash={ticket.transactionHash}
      roundHistory={roundHistory}
      index={index}
    />
  )
}

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
        multiplier: Boolean(t.addons & ADDON_MULTIPLIER_FLAG),
        bullsEye: Boolean(t.addons & ADDON_BULLSEYE_FLAG),
        plus3: Boolean(t.addons & ADDON_PLUS3_FLAG),
        progressive: Boolean(t.addons & ADDON_PROGRESSIVE_FLAG),
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

export default function KenoPage() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  // Progressive hook
  const progressiveStats = usePulseProgressive()

  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([])
  const [spotSize, setSpotSize] = useState(8)
  const [wager, setWager] = useState(0.001)
  const [draws, setDraws] = useState(5)
  const [multiplier, setMultiplier] = useState(false)
  const [bullsEye, setBullsEye] = useState(false)
  const [plus3, setPlus3] = useState(false)
  const [progressive, setProgressive] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'morbius' | 'pls'>('morbius')
  const [multiplierCostWei, setMultiplierCostWei] = useState<bigint>(BigInt(0))
  const [bullsEyeCostWei, setBullsEyeCostWei] = useState<bigint>(BigInt(0))
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
    addonsArg: number
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
  const [showNoTicketsDialog, setShowNoTicketsDialog] = useState(false)


  // Costs, allowance, round
  const { data: addonCostResults } = useReadContracts({
    contracts: [
      { address: KENO_ADDRESS, abi: KENO_ABI, functionName: 'multiplierCostPerDraw' },
      { address: KENO_ADDRESS, abi: KENO_ABI, functionName: 'bullsEyeCostPerDraw' },
    ],
  })

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

  useEffect(() => {
    type ReadValue = { result?: bigint } | bigint | undefined
    const res = addonCostResults as ReadValue[] | undefined
    if (!res) return
    const extract = (v: ReadValue) => (typeof v === 'bigint' ? v : v && typeof v === 'object' && 'result' in v && typeof v.result === 'bigint' ? v.result : undefined)
    const mult = extract(res[0])
    const bull = extract(res[1])
    if (mult !== undefined) setMultiplierCostWei(mult)
    if (bull !== undefined) setBullsEyeCostWei(bull)
  }, [addonCostResults])

  const { morbiusAllowanceWei, wplsAllowanceWei } = useMemo(() => {
    type ReadValue = { result?: bigint } | bigint | undefined
    const res = allowanceResult as ReadValue[] | undefined
    const extract = (v: ReadValue) => {
      if (typeof v === 'bigint') return v
      if (v && typeof v === 'object' && 'result' in v && typeof v.result === 'bigint') return v.result
      return BigInt(0)
    }
    return {
      morbiusAllowanceWei: extract(res && res[0]),
      wplsAllowanceWei: extract(res && res[1]),
    }
  }, [allowanceResult])

  const addonPerDrawWei = useMemo(() => {
    let total = BigInt(0)
    if (multiplier) total += multiplierCostWei
    if (bullsEye) total += bullsEyeCostWei
    if (plus3) total += parseEther(wager.toString()) // Plus 3 doubles wager (costs same as base wager)
    if (progressive) {
      // Use contract value if available, otherwise use default 0.001 ether
      const progressiveCost = progressiveStats.costPerDraw > BigInt(0) ? progressiveStats.costPerDraw : parseEther('0.001')
      total += progressiveCost
    }
    return total
  }, [multiplier, bullsEye, plus3, progressive, multiplierCostWei, bullsEyeCostWei, progressiveStats.costPerDraw, wager])

  const totalCostWei = useMemo(() => {
    const perDraw = parseEther(wager.toString()) + addonPerDrawWei
    return perDraw * BigInt(draws)
  }, [wager, addonPerDrawWei, draws])

  const totalCost = useMemo(() => Number(formatEther(totalCostWei)), [totalCostWei])

  const { data: wplsQuote } = useReadContract({
    address: PULSEX_V1_ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: 'getAmountsIn',
    args:
      paymentMethod !== 'morbius' && totalCostWei > BigInt(0)
        ? [totalCostWei, [WPLS_TOKEN_ADDRESS, MORBIUS_TOKEN_ADDRESS]]
        : undefined,
    query: {
      enabled: paymentMethod !== 'morbius' && totalCostWei > BigInt(0),
      refetchInterval: 10000,
    },
  })

  const wplsRequiredWei = useMemo(() => {
    const quote = Array.isArray(wplsQuote) ? (wplsQuote as bigint[])[0] ?? BigInt(0) : BigInt(0)
    if (quote === BigInt(0)) return BigInt(0)
    return (quote * BigInt(WPLS_TO_MORBIUS_BUFFER_BPS)) / BigInt(10000)
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
    const roundIdArg = BigInt(Math.max(1, activeRoundId))
    const numbersArg = selectedNumbers.map((n) => Number(n))
    const addonsArg = (() => {
      let mask = 0
      if (multiplier) mask |= ADDON_MULTIPLIER_FLAG
      if (bullsEye) mask |= ADDON_BULLSEYE_FLAG
      if (plus3) mask |= ADDON_PLUS3_FLAG
      if (progressive) mask |= ADDON_PROGRESSIVE_FLAG
      return mask
    })()
    const wagerArg = parseEther(wager.toString())
    const purchase = { roundIdArg, numbersArg, spotArg: spotSize, drawsArg: draws, addonsArg, wagerArg, totalCostWei }

    if (paymentMethod === 'pls') {
      try {
        if (wplsRequiredWei === BigInt(0)) {
          toast.error('Unable to quote PLS required. Please try again.')
          return
        }
        const buyHashTx = await writeBuyAsync({
          address: KENO_ADDRESS,
          abi: KENO_ABI,
          functionName: 'buyTicketWithPLS',
          args: [roundIdArg, numbersArg, spotSize, draws, addonsArg, wagerArg],
          value: wplsRequiredWei,
        })
        await publicClient?.waitForTransactionReceipt({ hash: buyHashTx })
        toast.success('Tickets purchased with PLS')
        setPendingBuy(null)
      } catch (err) {
        console.error(err)
        const message = err instanceof Error ? err.message : 'Purchase failed'
        toast.error(message)
      }
      return
    }

    if (morbiusAllowanceWei < totalCostWei) {
      setPendingBuy(purchase)
      writeApprove({ 
        address: MORBIUS_TOKEN_ADDRESS, 
        abi: ERC20_ABI, 
        functionName: 'approve', 
        args: [KENO_ADDRESS, totalCostWei],
      })
    } else {
      writeBuy({ 
        address: KENO_ADDRESS, 
        abi: KENO_ABI, 
        functionName: 'buyTicket', 
        args: [roundIdArg, numbersArg, spotSize, draws, addonsArg, wagerArg],
      })
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
          pendingBuy.addonsArg,
          pendingBuy.wagerArg,
        ],
      })
      setPendingBuy(null)
    }
  }, [isApproveConfirmed, pendingBuy, writeBuy])

  useEffect(() => {
    if (isBuyConfirmed && publicClient && address) {
      setTimeout(async () => {
        try {
          const fromBlock = KENO_DEPLOY_BLOCK ? BigInt(KENO_DEPLOY_BLOCK) : BigInt(0)
          const event = parseAbiItem('event TicketPurchased(address indexed player,uint256 indexed ticketId,uint256 indexed firstRoundId,uint8 draws,uint8 spotSize,uint16 addons,uint256 wagerPerDraw,uint256 grossCost)')
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
        const event = parseAbiItem('event TicketPurchased(address indexed player,uint256 indexed ticketId,uint256 indexed firstRoundId,uint8 draws,uint8 spotSize,uint16 addons,uint256 wagerPerDraw,uint256 grossCost)')
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
    contracts: ticketIds.map((id) => ({ address: KENO_ADDRESS, abi: KENO_ABI, functionName: 'getTicket', args: [id] })),
    query: { enabled: ticketIds.length > 0, refetchInterval: 10000 },
  })

  const decodeNumbers = (bitmap: bigint): number[] => {
    const arr: number[] = []
    for (let i = 1; i <= 80; i++) {
      const bit = BigInt(1) << BigInt(i - 1)
      if ((bitmap & bit) !== BigInt(0)) arr.push(i)
    }
    return arr
  }

  const calculateRoundWin = useCallback((ticketNumbers: number[], roundWinningNumbers: number[], spotSize: number, addons: number, wagerPerDraw: bigint, bullsEyeNumber: number, drawnMultiplier: number) => {
    let hits = 0
    let hasBullsEye = false
    for (const n of roundWinningNumbers) {
      if (ticketNumbers.includes(n)) {
        hits++
        if (n === bullsEyeNumber) hasBullsEye = true
      }
    }
    const baseMult = PAYTABLE[spotSize]?.[hits] ?? 0
    const bullsMult = hasBullsEye && (addons & ADDON_BULLSEYE_FLAG) !== 0 ? BULLSEYE_PAYTABLE[spotSize]?.[hits] ?? 0 : 0
    const roundMult = (addons & ADDON_MULTIPLIER_FLAG) !== 0 && drawnMultiplier > 0 ? drawnMultiplier : 1
    const total = (baseMult + bullsMult) * Number(formatEther(wagerPerDraw)) * roundMult
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
      const addons = Number(data.addons || 0)
      const wagerPerDraw = data.wagerPerDraw ? Number(formatEther(data.wagerPerDraw)).toFixed(4) : '0.0000'
      const numbers = decodeNumbers(data.numbersBitmap || BigInt(0))
      const lastRound = from + draws - 1
      const drawsRemaining = activeRoundId < from ? draws : activeRoundId > lastRound ? 0 : lastRound - activeRoundId + 1
      const currentWin =
        roundState === 2 && activeRoundId >= from && activeRoundId <= lastRound
          ? calculateRoundWin(
              numbers,
              Array.from(roundDataAny.winningNumbers || []).map((n: any) => Number(n)),
              spotSize,
              addons,
              data.wagerPerDraw,
              Number(roundDataAny.bullsEyeNumber ?? 0),
              Number(roundDataAny.drawnMultiplier ?? 1)
            ).toFixed(4)
          : '0.0000'
      const purchaseTimestamp = ticketPurchaseTimestamps.get(ticketIds[idx].toString())
      const transactionHash = ticketTransactionHashes.get(ticketIds[idx].toString())
      enriched.push({
        ticketId: ticketIds[idx],
        firstRoundId: BigInt(from),
        draws,
        spotSize,
        addons,
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
  }, [ticketDetails, ticketIds, activeRoundId, roundData, calculateRoundWin, ticketPurchaseTimestamps, ticketTransactionHashes])

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
      totalMultiplierAddon: roundDataAny.totalMultiplierAddon ?? BigInt(0),
      totalBullsEyeAddon: roundDataAny.totalBullsEyeAddon ?? BigInt(0),
    }
  }, [roundDataAny])

  const poolDisplay = useMemo(() => (roundStats ? Number(formatEther(roundStats.poolBalance)).toFixed(4) : '0.0000'), [roundStats])

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

  return (
    <div className="min-h-screen text-white">
      <header className="flex items-center justify-between px-6 py-4 gap-4">
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPrizePool(true)}
            className="border-emerald-400/60 text-emerald-100"
          >
            <Trophy className="h-4 w-4 mr-2" />
            Prize Pool
          </Button>
          <ConnectButton />
        </div>
      </header>

      <main className="px-6 pb-16">
        {lastDraw && showLiveBoard && (
          <div className="mb-6" id="live-keno-board">
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
            />
          </div>
        )}

        {/* Pulse Progressive Card */}
        <Card className="bg-white/5 border-white/10 p-6 mb-6">
          <div className="text-center">
            <p className="text-base font-medium text-white mb-2">Pulse Progressive</p>
            {progressiveStats.isLoading ? (
              <div className="h-12 w-48 bg-white/5 rounded animate-pulse mx-auto" />
            ) : (
              <p className="text-4xl font-bold text-white">
                {Number(formatEther(progressiveStats.currentPool)).toLocaleString()} WPLS
              </p>
            )}
          </div>
        </Card>

        {/* Player Statistics */}
        <div className="mb-6">
          <KenoStatsDisplay />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="bg-white/5 border-white/10 p-6">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">KENO!</h3>
              <p className="text-sm text-gray-400">Build your ticket step by step</p>
            </div>

            {/* Section 1: Spot Size */}
            <div className="mb-8 pb-6 border-b border-white/10">
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
                  <span className="text-2xl font-bold text-emerald-400">1</span>
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-semibold text-white mb-2">How many numbers (spots) do you want to play?</h4>
                  <p className="text-sm text-gray-400 mb-4">Select how many numbers you want to pick per draw. You can choose 1 to 10 spots.</p>
                  <div className="flex flex-wrap gap-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <button
                        key={num}
                        onClick={() => setSpotSize(num)}
                        className={cn(
                          "w-12 h-12 rounded-lg border-2 font-semibold text-lg transition-all",
                          spotSize === num
                            ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/20"
                            : "bg-white/5 border-white/10 text-gray-300 hover:border-emerald-500/50 hover:bg-emerald-500/10"
                        )}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Number Selection */}
            <div className="mb-8 pb-6 border-b border-white/10">
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
                  <span className="text-2xl font-bold text-emerald-400">2</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-lg font-semibold text-white">Pick your own numbers, OR choose Quick Pick</h4>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={quickPick}>Quick Pick</Button>
                      <Button variant="outline" size="sm" onClick={() => setSelectedNumbers([])}>Clear</Button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400 mb-4">Select {spotSize} number{spotSize !== 1 ? 's' : ''} from 1 to 80, or use Quick Pick for random selection.</p>
                  <div className="grid grid-cols-10 gap-2">
                    {ALL_NUMBERS.map((n) => {
                      const active = selectedNumbers.includes(n)
                      return (
                        <button
                          key={n}
                          onClick={() => handleToggleNumber(n)}
                          className={cn(
                            'h-10 rounded-md border text-sm font-semibold transition',
                            active
                              ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.4)]'
                              : 'border-white/10 bg-white/5 text-gray-200 hover:border-emerald-400/50'
                          )}
                        >
                          {n}
                        </button>
                      )
                    })}
                  </div>
                  {selectedNumbers.length > 0 && (
                    <p className="text-xs text-emerald-400 mt-3">
                      Selected: {selectedNumbers.length} of {spotSize} numbers
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 3: Wager per Draw */}
            <div className="mb-8 pb-6 border-b border-white/10">
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
                  <span className="text-2xl font-bold text-emerald-400">3</span>
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-semibold text-white mb-2">How much do you want to play per draw?</h4>
                  <p className="text-sm text-gray-400 mb-4">Choose your wager amount per draw. Maximum wager is 0.001 WPLS per draw.</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {[0.0001, 0.0002, 0.0003, 0.0004, 0.0005, 0.001].map((preset) => (
                      <Button
                        key={preset}
                        variant={wager === preset ? "default" : "outline"}
                        size="sm"
                        onClick={() => setWager(preset)}
                        className={cn(
                          "text-xs",
                          wager === preset && "bg-emerald-500 hover:bg-emerald-600"
                        )}
                      >
                        {preset.toFixed(4)} WPLS
                      </Button>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Or enter custom amount:</p>
                    <Input 
                      type="number" 
                      step="0.0001" 
                      min={0.0001} 
                      max={0.001} 
                      value={wager} 
                      onChange={(e) => setWager(Number(e.target.value))} 
                      placeholder="0.0001 - 0.001 WPLS"
                      className="max-w-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: Consecutive Draws */}
            <div className="mb-8 pb-6 border-b border-white/10">
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
                  <span className="text-2xl font-bold text-emerald-400">4</span>
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-semibold text-white mb-2">How many consecutive draws do you want to play?</h4>
                  <p className="text-sm text-gray-400 mb-4">Select how many consecutive rounds you want to play with the same numbers. You can play 1 to 60 consecutive draws.</p>
                  <div className="max-w-xs">
                    <Input 
                      type="number" 
                      min={1} 
                      max={60} 
                      value={draws} 
                      onChange={(e) => setDraws(Math.min(60, Math.max(1, Number(e.target.value))))} 
                      placeholder="1 - 60 draws"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Base Ticket Cost: {wager.toFixed(4)} WPLS × {draws} draw{draws !== 1 ? 's' : ''} = {(wager * draws).toFixed(4)} WPLS
                  </p>
                </div>
              </div>
            </div>

            {/* Section 5: Add-ons */}
            <div className="mb-8">
              <div className="mb-4 pb-3 border-b-2 border-emerald-500/30">
                <h4 className="text-lg font-bold text-white">MORE WAYS TO PLAY & WIN!</h4>
              </div>
              <div className="space-y-4">
                <div className="flex flex-col rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">Multiplier</p>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-gray-400 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs bg-slate-800 border-purple-500/30 text-white">
                            <p className="text-xs">
                              Multiplier add-on multiplies your Club Keno and Kicker (if applicable) prizes by a randomly drawn multiplier (1x, 2x, 3x, 5x, or 10x) for each round.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Switch checked={multiplier} onCheckedChange={setMultiplier} />
                  </div>
                  <p className="text-xs text-gray-400 mb-2">
                    Play MULTIPLIER to increase KENO! prizes by as much as 10 times!
                  </p>
                  <p className="text-xs text-gray-500">
                    Cost: {multiplierCostWei ? `${Number(formatEther(multiplierCostWei)).toFixed(4)} Morbius/draw` : 'No extra cost set'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    If you play MULTIPLIER, total ticket price increases by Base Ticket Cost from Step 4.
                  </p>
                </div>
                <div className="flex flex-col rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">Bulls-Eye</p>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-gray-400 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs bg-slate-800 border-purple-500/30 text-white">
                            <p className="text-xs">
                              Bulls-Eye add-on enhances your prizes when you match the special Bulls-Eye number drawn each round. If your ticket includes the Bulls-Eye number, you win enhanced payouts (typically 3x the base prize).
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Switch checked={bullsEye} onCheckedChange={setBullsEye} />
                  </div>
                  <p className="text-xs text-gray-400 mb-2">
                    Play BULLS-EYE for bigger prizes and more chances to win!
                  </p>
                  <p className="text-xs text-gray-500">
                    Cost: {bullsEyeCostWei ? `${Number(formatEther(bullsEyeCostWei)).toFixed(4)} Morbius/draw` : 'No extra cost set'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    If you play BULLS-EYE, total ticket price increases by Base Ticket Cost from Step 4.
                  </p>
                </div>
                <div className="flex flex-col rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">Plus 3</p>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-gray-400 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs bg-slate-800 border-purple-500/30 text-white">
                            <p className="text-xs mb-2">
                              Plus 3 doubles your Club Keno and Kicker (if applicable) wager. After the 20 winning Club Keno numbers are drawn, three additional Plus 3 numbers will be selected. Use these three extra numbers to help you match and win a Club Keno prize.
                            </p>
                            <p className="text-xs text-amber-300">
                              NOTE: Adding Plus 3 to a 10-spot wager may negate a match-0 CLUB KENO prize. Plus 3 does not apply to The Jack.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Switch checked={plus3} onCheckedChange={setPlus3} />
                  </div>
                  <p className="text-xs text-gray-400 mb-2">
                    Add Plus 3 to improve your odds of winning.
                  </p>
                  <p className="text-xs text-gray-500">
                    Cost: {wager.toFixed(4)} Morbius/draw (doubles wager)
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    If you play PLUS 3, total ticket price increases by Base Ticket Cost from Step 4.
                  </p>
                </div>

                {/* Pulse Progressive Add-on */}
                <div className={cn(
                  "flex flex-col rounded-lg border p-4 transition-all",
                  spotSize >= 9 && progressive
                    ? "border-purple-500 bg-gradient-to-br from-purple-900/30 via-indigo-900/30 to-purple-900/30"
                    : "border-white/10 bg-white/5"
                )}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">Pulse Progressive</p>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-gray-400 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs bg-slate-800 border-purple-500/30 text-white">
                            <p className="text-xs mb-2">
                              Win the growing progressive jackpot by matching 9 or more numbers on 9-Spot or 10-Spot games!
                            </p>
                            <p className="text-xs text-purple-300">
                              Current Jackpot: {Number(formatEther(progressiveStats.currentPool)).toLocaleString()} Morbius
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Switch
                      checked={progressive}
                      onCheckedChange={setProgressive}
                      disabled={spotSize < 9}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mb-2">
                    Add Pulse Progressive to win the growing jackpot! Match 9+ numbers on 9 or 10 spot games.
                  </p>
                  {spotSize < 9 && (
                    <p className="text-xs text-orange-400 mb-2">
                      ⚠️ Requires 9 or 10 spots. Currently playing {spotSize} spots.
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    Cost: {progressiveStats.costPerDraw > BigInt(0) ? `${Number(formatEther(progressiveStats.costPerDraw)).toFixed(4)} Morbius/draw` : '0.0010 Morbius/draw (default)'}
                  </p>
                  {progressiveStats.currentPool > BigInt(0) && (
                    <p className="text-xs text-purple-400 mt-2 font-semibold">
                      Current Jackpot: {Number(formatEther(progressiveStats.currentPool)).toLocaleString()} Morbius
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-xs text-amber-200">
                  <strong>Note:</strong> If both MULTIPLIER and BULLS-EYE options are played, total ticket price is Base Ticket Cost times three. BULLS-EYE PRIZES CANNOT BE MULTIPLIED.
                </p>
              </div>
            </div>

            {/* Cost Summary, Payment Method, and Buy Button */}
            <div className="mt-6 flex flex-col gap-4 rounded-lg border-2 border-emerald-500/30 bg-emerald-500/10 px-6 py-4">
              <div className="flex flex-wrap gap-3">
                <Button
                  variant={paymentMethod === 'morbius' ? 'default' : 'outline'}
                  onClick={() => setPaymentMethod('morbius')}
                  className="text-sm"
                >
                  Pay with Morbius
                </Button>
                <Button
                  variant={paymentMethod === 'pls' ? 'default' : 'outline'}
                  onClick={() => setPaymentMethod('pls')}
                  className="text-sm"
                >
                  Pay with PLS (native)
                </Button>
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-200 mb-1">Total Ticket Cost</p>
                <p className="text-3xl font-bold text-white mb-2">
                  {paymentMethod === 'pls'
                    ? `~${Number(formatEther(wplsRequiredWei)).toFixed(4)} PLS`
                    : `${totalCost.toFixed(4)} Morbius`}
                </p>
                <div className="text-xs text-gray-300 space-y-1">
                  <p>Base Cost: {wager.toFixed(4)} Morbius × {draws} draw{draws !== 1 ? 's' : ''} = {(wager * draws).toFixed(4)} Morbius</p>
                  {addonPerDrawWei > BigInt(0) && (
                    <p>Add-ons: {Number(formatEther(addonPerDrawWei)).toFixed(4)} Morbius × {draws} draw{draws !== 1 ? 's' : ''} = {(Number(formatEther(addonPerDrawWei)) * draws).toFixed(4)} Morbius</p>
                  )}
                  {paymentMethod === 'pls' && (
                    <p className="text-amber-200">
                      Includes {((WPLS_TO_MORBIUS_BUFFER_BPS - 10000) / 100).toFixed(1)}% buffer — contract wraps PLS to WPLS and swaps to Morbius before purchase.
                    </p>
                  )}
                  <p className="pt-2 border-t border-white/10">
                    {spotSize}-spot ticket • {selectedNumbers.length > 0 ? `${selectedNumbers.length} number${selectedNumbers.length !== 1 ? 's' : ''} selected` : 'No numbers selected'}
                  </p>
                </div>
              </div>
              <Button
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-6 text-lg"
                onClick={handleBuy}
                disabled={isApprovePending || isApproveConfirming || isBuyPending || isBuyConfirming || selectedNumbers.length !== spotSize}
              >
                {isApprovePending || isApproveConfirming
                  ? 'Approving…'
                  : isBuyPending
                    ? 'Submitting…'
                    : isBuyConfirming
                      ? 'Confirming…'
                      : selectedNumbers.length !== spotSize
                        ? `Select ${spotSize - selectedNumbers.length} more number${spotSize - selectedNumbers.length !== 1 ? 's' : ''}`
                        : 'Buy Ticket'}
              </Button>
            </div>
          </Card>

          <Card className="bg-white/5 border-white/10 p-6 lg:col-span-2">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="prize-pool" className="border-white/10">
                <AccordionTrigger className="text-white hover:text-emerald-400">
                  Prize Pool
                </AccordionTrigger>
                <AccordionContent className="text-gray-300 space-y-6">
                  <div className="space-y-2">
                    <h4 className="text-lg font-semibold text-white">Prize Tables</h4>
                    <p className="text-sm text-gray-400">Prizes paid for a 0.001 Morbius wager</p>
                    <p className="text-xs text-gray-500">Multiply these prize payouts by the amount you wagered per drawing to determine prizes for wagers greater than 0.001 Morbius.</p>
                  </div>

                  {/* 10 Spot Game */}
                  <div className="space-y-3">
                    <h5 className="text-base font-semibold text-emerald-400">10 Spot Game</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-3 text-gray-400">MATCH</th>
                            <th className="text-left py-2 px-3 text-gray-400">CRYPTO KENO PRIZE</th>
                            <th className="text-right py-2 px-3 text-gray-400">ODDS 1 IN</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">10 of 10</td><td className="py-2 px-3">100,000 WPLS</td><td className="text-right py-2 px-3">8,911,711.18</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">9 of 10</td><td className="py-2 px-3">5,000 WPLS</td><td className="text-right py-2 px-3">163,381.37</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">8 of 10</td><td className="py-2 px-3">500 WPLS</td><td className="text-right py-2 px-3">7,384.47</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">7 of 10</td><td className="py-2 px-3">50 WPLS</td><td className="text-right py-2 px-3">620.68</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">6 of 10</td><td className="py-2 px-3">10 WPLS</td><td className="text-right py-2 px-3">87.11</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">5 of 10</td><td className="py-2 px-3">2 WPLS</td><td className="text-right py-2 px-3">19.44</td></tr>
                          <tr className="border-b border-white/5 bg-purple-500/10"><td className="py-2 px-3 font-semibold">0 of 10</td><td className="py-2 px-3 font-semibold">5 WPLS</td><td className="text-right py-2 px-3">21.84</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-gray-400 space-y-1">
                      <p>OVERALL ODDS OF WINNING: 1 in 9.05</p>
                      <p>OVERALL ODDS OF WINNING WITH PLUS 3: 1 in 7.10</p>
                    </div>
                  </div>

                  {/* 9 Spot Game */}
                  <div className="space-y-3">
                    <h5 className="text-base font-semibold text-emerald-400">9 Spot Game</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-3 text-gray-400">MATCH</th>
                            <th className="text-left py-2 px-3 text-gray-400">CRYPTO KENO PRIZE</th>
                            <th className="text-right py-2 px-3 text-gray-400">ODDS 1 IN</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">9 of 9</td><td className="py-2 px-3">25,000 WPLS</td><td className="text-right py-2 px-3">1,380,687.65</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">8 of 9</td><td className="py-2 px-3">2,000 WPLS</td><td className="text-right py-2 px-3">30,681.95</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">7 of 9</td><td className="py-2 px-3">100 WPLS</td><td className="text-right py-2 px-3">1,690.11</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">6 of 9</td><td className="py-2 px-3">20 WPLS</td><td className="text-right py-2 px-3">174.84</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">5 of 9</td><td className="py-2 px-3">5 WPLS</td><td className="text-right py-2 px-3">30.67</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">4 of 9</td><td className="py-2 px-3">2 WPLS</td><td className="text-right py-2 px-3">8.76</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-gray-400 space-y-1">
                      <p>OVERALL ODDS OF WINNING: 1 in 6.53</p>
                      <p>OVERALL ODDS OF WINNING WITH PLUS 3: 1 in 4.32</p>
                    </div>
                  </div>

                  {/* 8 Spot Game */}
                  <div className="space-y-3">
                    <h5 className="text-base font-semibold text-emerald-400">8 Spot Game</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-3 text-gray-400">MATCH</th>
                            <th className="text-left py-2 px-3 text-gray-400">CRYPTO KENO PRIZE</th>
                            <th className="text-right py-2 px-3 text-gray-400">ODDS 1 IN</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">8 of 8</td><td className="py-2 px-3">10,000 WPLS</td><td className="text-right py-2 px-3">230,114.61</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">7 of 8</td><td className="py-2 px-3">300 WPLS</td><td className="text-right py-2 px-3">6,232.27</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">6 of 8</td><td className="py-2 px-3">50 WPLS</td><td className="text-right py-2 px-3">422.53</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">5 of 8</td><td className="py-2 px-3">15 WPLS</td><td className="text-right py-2 px-3">54.64</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">4 of 8</td><td className="py-2 px-3">2 WPLS</td><td className="text-right py-2 px-3">12.27</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-gray-400 space-y-1">
                      <p>OVERALL ODDS OF WINNING: 1 in 9.77</p>
                      <p>OVERALL ODDS OF WINNING WITH PLUS 3: 1 in 6.22</p>
                    </div>
                  </div>

                  {/* 7 Spot Game */}
                  <div className="space-y-3">
                    <h5 className="text-base font-semibold text-emerald-400">7 Spot Game</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-3 text-gray-400">MATCH</th>
                            <th className="text-left py-2 px-3 text-gray-400">CRYPTO KENO PRIZE</th>
                            <th className="text-right py-2 px-3 text-gray-400">ODDS 1 IN</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">7 of 7</td><td className="py-2 px-3">2,000 WPLS</td><td className="text-right py-2 px-3">40,979.31</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">6 of 7</td><td className="py-2 px-3">100 WPLS</td><td className="text-right py-2 px-3">1,365.98</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">5 of 7</td><td className="py-2 px-3">11 WPLS</td><td className="text-right py-2 px-3">115.76</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">4 of 7</td><td className="py-2 px-3">5 WPLS</td><td className="text-right py-2 px-3">19.16</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">3 of 7</td><td className="py-2 px-3">1 WPLS</td><td className="text-right py-2 px-3">5.71</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-gray-400 space-y-1">
                      <p>OVERALL ODDS OF WINNING: 1 in 4.23</p>
                      <p>OVERALL ODDS OF WINNING WITH PLUS 3: 1 in 3.12</p>
                    </div>
                  </div>

                  {/* 6 Spot Game */}
                  <div className="space-y-3">
                    <h5 className="text-base font-semibold text-emerald-400">6 Spot Game</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-3 text-gray-400">MATCH</th>
                            <th className="text-left py-2 px-3 text-gray-400">CRYPTO KENO PRIZE</th>
                            <th className="text-right py-2 px-3 text-gray-400">ODDS 1 IN</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">6 of 6</td><td className="py-2 px-3">1,100 WPLS</td><td className="text-right py-2 px-3">7,752.84</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">5 of 6</td><td className="py-2 px-3">57 WPLS</td><td className="text-right py-2 px-3">323.04</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">4 of 6</td><td className="py-2 px-3">7 WPLS</td><td className="text-right py-2 px-3">35.04</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">3 of 6</td><td className="py-2 px-3">1 WPLS</td><td className="text-right py-2 px-3">7.70</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-gray-400 space-y-1">
                      <p>OVERALL ODDS OF WINNING: 1 in 6.19</p>
                      <p>OVERALL ODDS OF WINNING WITH PLUS 3: 1 in 4.42</p>
                    </div>
                  </div>

                  {/* 5 Spot Game */}
                  <div className="space-y-3">
                    <h5 className="text-base font-semibold text-emerald-400">5 Spot Game</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-3 text-gray-400">MATCH</th>
                            <th className="text-left py-2 px-3 text-gray-400">CRYPTO KENO PRIZE</th>
                            <th className="text-right py-2 px-3 text-gray-400">ODDS 1 IN</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">5 of 5</td><td className="py-2 px-3">410 WPLS</td><td className="text-right py-2 px-3">1,550.57</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">4 of 5</td><td className="py-2 px-3">18 WPLS</td><td className="text-right py-2 px-3">82.70</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">3 of 5</td><td className="py-2 px-3">2 WPLS</td><td className="text-right py-2 px-3">11.91</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-gray-400 space-y-1">
                      <p>OVERALL ODDS OF WINNING: 1 in 10.34</p>
                      <p>OVERALL ODDS OF WINNING WITH PLUS 3: 1 in 7.14</p>
                    </div>
                  </div>

                  {/* 4 Spot Game */}
                  <div className="space-y-3">
                    <h5 className="text-base font-semibold text-emerald-400">4 Spot Game</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-3 text-gray-400">MATCH</th>
                            <th className="text-left py-2 px-3 text-gray-400">CRYPTO KENO PRIZE</th>
                            <th className="text-right py-2 px-3 text-gray-400">ODDS 1 IN</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">4 of 4</td><td className="py-2 px-3">72 WPLS</td><td className="text-right py-2 px-3">326.44</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">3 of 4</td><td className="py-2 px-3">5 WPLS</td><td className="text-right py-2 px-3">23.12</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">2 of 4</td><td className="py-2 px-3">1 WPLS</td><td className="text-right py-2 px-3">4.70</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-gray-400 space-y-1">
                      <p>OVERALL ODDS OF WINNING: 1 in 3.86</p>
                      <p>OVERALL ODDS OF WINNING WITH PLUS 3: 1 in 3.08</p>
                    </div>
                  </div>

                  {/* 3 Spot Game */}
                  <div className="space-y-3">
                    <h5 className="text-base font-semibold text-emerald-400">3 Spot Game</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-3 text-gray-400">MATCH</th>
                            <th className="text-left py-2 px-3 text-gray-400">CRYPTO KENO PRIZE</th>
                            <th className="text-right py-2 px-3 text-gray-400">ODDS 1 IN</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">3 of 3</td><td className="py-2 px-3">27 WPLS</td><td className="text-right py-2 px-3">72.07</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">2 of 3</td><td className="py-2 px-3">2 WPLS</td><td className="text-right py-2 px-3">7.21</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-gray-400 space-y-1">
                      <p>OVERALL ODDS OF WINNING: 1 in 6.55</p>
                      <p>OVERALL ODDS OF WINNING WITH PLUS 3: 1 in 5.07</p>
                    </div>
                  </div>

                  {/* 2 Spot Game */}
                  <div className="space-y-3">
                    <h5 className="text-base font-semibold text-emerald-400">2 Spot Game</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-3 text-gray-400">MATCH</th>
                            <th className="text-left py-2 px-3 text-gray-400">CRYPTO KENO PRIZE</th>
                            <th className="text-right py-2 px-3 text-gray-400">ODDS 1 IN</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">2 of 2</td><td className="py-2 px-3">11 WPLS</td><td className="text-right py-2 px-3">16.63</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-gray-400 space-y-1">
                      <p>OVERALL ODDS OF WINNING: 1 in 16.63</p>
                      <p>OVERALL ODDS OF WINNING WITH PLUS 3: 1 in 12.49</p>
                    </div>
                  </div>

                  {/* 1 Spot Game */}
                  <div className="space-y-3">
                    <h5 className="text-base font-semibold text-emerald-400">1 Spot Game</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-3 text-gray-400">MATCH</th>
                            <th className="text-left py-2 px-3 text-gray-400">CRYPTO KENO PRIZE</th>
                            <th className="text-right py-2 px-3 text-gray-400">ODDS 1 IN</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">1 of 1</td><td className="py-2 px-3">2 WPLS</td><td className="text-right py-2 px-3">4.00</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-gray-400 space-y-1">
                      <p>OVERALL ODDS OF WINNING: 1 in 4.00</p>
                      <p>OVERALL ODDS OF WINNING WITH PLUS 3: 1 in 3.48</p>
                    </div>
                  </div>

                  {/* The Jack */}
                  <div className="space-y-3">
                    <h5 className="text-base font-semibold text-amber-400">The Jack</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-2 px-3 text-gray-400">MATCH</th>
                            <th className="text-left py-2 px-3 text-gray-400">PRIZE</th>
                            <th className="text-right py-2 px-3 text-gray-400">ODDS 1 IN</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">9 of 9</td><td className="py-2 px-3">Jackpot*</td><td className="text-right py-2 px-3">1,380,688</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">8 of 9</td><td className="py-2 px-3">1,000 WPLS</td><td className="text-right py-2 px-3">30,682</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">7 of 9</td><td className="py-2 px-3">100 WPLS</td><td className="text-right py-2 px-3">1,690</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">6 of 9</td><td className="py-2 px-3">10 WPLS</td><td className="text-right py-2 px-3">175</td></tr>
                          <tr className="border-b border-white/5"><td className="py-2 px-3">5 of 9</td><td className="py-2 px-3">5 WPLS</td><td className="text-right py-2 px-3">31</td></tr>
                          <tr className="border-b border-white/5 bg-purple-500/10"><td className="py-2 px-3 font-semibold">0 of 9</td><td className="py-2 px-3 font-semibold">1 WPLS</td><td className="text-right py-2 px-3">16</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-gray-400 space-y-1">
                      <p>Overall Odds to Win: 1 in 9.74</p>
                      <p className="text-gray-500">* If two or more persons win the jackpot or Top-Prize, the prize is shared equally among winning persons.</p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>

          <Accordion type="single" collapsible className="w-full lg:col-span-2">
            <AccordionItem value="my-tickets" className="border-white/10">
              <AccordionTrigger className="text-white hover:text-emerald-400 px-6">
                <div className="flex items-center justify-between w-full mr-4">
                  <p className="text-sm text-gray-300">My Tickets (on-chain)</p>
                  {(loadingMyTickets || isApprovePending || isBuyPending) && (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                      <span className="text-xs text-gray-400">Loading...</span>
                    </div>
                  )}
                  {!loadingMyTickets && myTicketsEnriched.length > 0 && (
                    <span className="text-xs text-gray-400 bg-white/10 px-2 py-1 rounded">
                      {myTicketsEnriched.length} ticket{myTicketsEnriched.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-gray-300 px-6 pb-6">
                <div className="mt-3">
                  {!loadingMyTickets && myTicketsEnriched.length === 0 && (
                    <div className="rounded-md border border-white/10 bg-white/5 px-4 py-6 text-center">
                      <p className="text-sm text-gray-400">No purchased tickets found for this wallet.</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-center">
                    {myTicketsEnriched.map((t, idx) => (
                      <KenoTicketWithHistory
                        key={t.ticketId.toString()}
                        ticket={t}
                        index={idx}
                      />
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </main>

      {/* Empty tickets dialog */}
      <Dialog open={showNoTicketsDialog} onOpenChange={setShowNoTicketsDialog}>
        <DialogContent className="max-w-lg overflow-hidden border-purple-500/40 bg-transparent p-0 text-white">
          <div className="relative h-72">
            <Image
              src="/morbius/821eff6f-8815-47ac-b93d-61d09d859de6.png"
              alt="Morbius Keno bag"
              fill
              priority
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 480px"
            />
            <div className="absolute inset-0 bg-black/40" />
            <div className="absolute inset-0 flex flex-col justify-end gap-3 p-6">
              <p className="text-xl font-bold">No active tickets yet</p>
              <p className="text-sm text-gray-100">
                Build your first ticket to join the next draw. It only takes a minute.
              </p>
              <Button
                className="w-full bg-purple-950/80 text-md font-bold text-white hover:bg-purple-900/80"
                onClick={handleStartTicketBuild}
              >
                Get Tickets Now!
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Prize Pool Modal */}
      <Dialog open={showPrizePool} onOpenChange={setShowPrizePool}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-slate-900 border-purple-500/30">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white text-center">
              KENO! PRIZE PAYOUTS - PRIZES WON (PER 0.001 WPLS PLAY)
            </DialogTitle>
            <DialogDescription className="text-gray-300 text-center">
              Prize amounts shown are multipliers. Multiply by your wager to get total payout.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-6">
            {/* Prize Table Data - Using contract paytable values */}
            {[
              { 
                spot: 10, 
                rows: [
                  { matched: 10, base: 100000, bullsEye: 300000 },
                  { matched: 9, base: 5000, bullsEye: 15000 },
                  { matched: 8, base: 500, bullsEye: 1500 },
                  { matched: 7, base: 50, bullsEye: 150 },
                  { matched: 6, base: 10, bullsEye: 30 },
                  { matched: 5, base: 2, bullsEye: 6 },
                  { matched: 0, base: 5, bullsEye: 15 },
                ], 
                odds: "1 in 9.05" 
              },
              { 
                spot: 9, 
                rows: [
                  { matched: 9, base: 25000, bullsEye: 75000 },
                  { matched: 8, base: 2000, bullsEye: 6000 },
                  { matched: 7, base: 100, bullsEye: 300 },
                  { matched: 6, base: 20, bullsEye: 60 },
                  { matched: 5, base: 5, bullsEye: 15 },
                  { matched: 4, base: 2, bullsEye: 6 },
                ], 
                odds: "1 in 6.53" 
              },
              { 
                spot: 8, 
                rows: [
                  { matched: 8, base: 10000, bullsEye: 30000 },
                  { matched: 7, base: 300, bullsEye: 900 },
                  { matched: 6, base: 50, bullsEye: 150 },
                  { matched: 5, base: 15, bullsEye: 45 },
                  { matched: 4, base: 2, bullsEye: 6 },
                ], 
                odds: "1 in 9.77" 
              },
              { 
                spot: 7, 
                rows: [
                  { matched: 7, base: 2000, bullsEye: 6000 },
                  { matched: 6, base: 100, bullsEye: 300 },
                  { matched: 5, base: 11, bullsEye: 33 },
                  { matched: 4, base: 5, bullsEye: 15 },
                  { matched: 3, base: 1, bullsEye: 3 },
                ], 
                odds: "1 in 4.23" 
              },
              { 
                spot: 6, 
                rows: [
                  { matched: 6, base: 1100, bullsEye: 3300 },
                  { matched: 5, base: 57, bullsEye: 171 },
                  { matched: 4, base: 7, bullsEye: 21 },
                  { matched: 3, base: 1, bullsEye: 3 },
                ], 
                odds: "1 in 6.19" 
              },
              { 
                spot: 5, 
                rows: [
                  { matched: 5, base: 410, bullsEye: 1230 },
                  { matched: 4, base: 18, bullsEye: 54 },
                  { matched: 3, base: 2, bullsEye: 6 },
                ], 
                odds: "1 in 10.34" 
              },
              { 
                spot: 4, 
                rows: [
                  { matched: 4, base: 72, bullsEye: 216 },
                  { matched: 3, base: 5, bullsEye: 15 },
                  { matched: 2, base: 1, bullsEye: 3 },
                ], 
                odds: "1 in 3.86" 
              },
              { 
                spot: 3, 
                rows: [
                  { matched: 3, base: 27, bullsEye: 81 },
                  { matched: 2, base: 2, bullsEye: 6 },
                ], 
                odds: "1 in 6.55" 
              },
              { 
                spot: 2, 
                rows: [
                  { matched: 2, base: 11, bullsEye: 33 },
                ], 
                odds: "1 in 16.63" 
              },
              { 
                spot: 1, 
                rows: [
                  { matched: 1, base: 2, bullsEye: 6 },
                ], 
                odds: "1 in 4.00" 
              },
            ].map(({ spot, rows, odds }) => (
              <div key={spot} className="border border-white/10 rounded-lg overflow-hidden">
                <div className="bg-purple-500/20 px-4 py-2 border-b border-white/10">
                  <h3 className="text-lg font-bold text-white">{spot} SPOT</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10">
                        <th className="px-4 py-2 text-left text-gray-300 font-semibold">NUMBERS MATCHED</th>
                        <th className="px-4 py-2 text-center text-gray-300 font-semibold">Base Prize</th>
                        <th className="px-4 py-2 text-center text-gray-300 font-semibold">Bulls-Eye Prize</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => (
                        <tr key={idx} className={cn("border-b border-white/5", idx % 2 === 0 && "bg-white/5")}>
                          <td className="px-4 py-2 text-white font-medium">
                            {row.matched} {row.matched === 1 ? 'Match' : 'Matches'}
                          </td>
                          <td className="px-4 py-2 text-center text-emerald-200 font-semibold">
                            {row.base.toLocaleString()} WPLS
                          </td>
                          <td className="px-4 py-2 text-center text-amber-200 font-semibold">
                            {row.bullsEye.toLocaleString()} WPLS
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-white/5">
                        <td colSpan={3} className="px-4 py-2 text-center text-gray-400 text-xs">
                          ODDS: {odds}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-xs text-amber-200 mb-2">
              <strong>*</strong> Subject to contract rules, prize amounts may vary. The total liability for 10 of 10 prize is limited.
            </p>
            <p className="text-xs text-amber-200">
              <strong>**</strong> Subject to contract rules, prize amounts may vary. The total KENO! MULTIPLIER prize liability is limited.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-12 py-6 px-6">
        <div className="flex justify-center">
          <ContractAddress
            address={KENO_ADDRESS}
            label="CryptoKeno Contract"
          />
        </div>
      </footer>
    </div>
  )
}
