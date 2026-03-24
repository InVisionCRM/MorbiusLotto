'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, usePublicClient, useWatchContractEvent } from 'wagmi'
import { formatUnits, parseAbiItem } from 'viem'
import Link from 'next/link'
import { WalletMenu } from '@/components/shared/WalletMenu'
import { useProfile } from '@/hooks/use-player-profile'
import { PlayerPurchaseHistory, PurchaseEntry, PurchaseSummary, RoundDetail } from '@/components/shared/player-purchase-history'
import {
  KENO_ADDRESS,
  KENO_DEPLOY_BLOCK,
  TOKEN_DECIMALS,
  LOTTERY_INSTANT_ADDRESS,
} from '@/lib/contracts'
import { KENO_ABI } from '@/lib/keno-abi'
import { usePlayerInstantLotteryStats } from '@/hooks/use-instant-lottery'
import { usePlinkoHistory } from '@/hooks/use-plinko-history'
import Footer from '@/components/PLINKO/Footer'
import { PlinkoHistoryModal } from '@/components/PLINKO/PlinkoHistoryModal'
import QuickHistory from '@/components/BLACKJACK/QuickHistory'
import { batchAnalyzeTransactions } from '@/lib/transaction-analyzer'
import { formatMORBIUS, formatPLS } from '@/lib/format-utils'
import { INSTANT_LOTTERY_6OF55_ABI } from '@/abi/instant-lottery-6of55'

const pulseUrl = (tx: string) => `https://scan.pulsechain.com/tx/${tx}`

const formatTime = (iso: string | number | null | undefined) => {
  if (!iso) return '—'
  const d = typeof iso === 'number' ? new Date(iso) : new Date(iso)
  return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
}

export default function LotteryPurchaseShowcase() {
  const { address } = useAccount()
  const { profileDisplayName, profileImageUrl } = useProfile()
  const publicClient = usePublicClient()
  const router = useRouter()

  // Instant Lottery: player stats (plays, wagered, won)
  const { totalPlays, totalWagered, totalWon, isLoading: instantStatsLoading } = usePlayerInstantLotteryStats(address ?? undefined)

  // Plinko data hooks
  const {
    drops: plinkoDrops,
    stats: plinkoStats,
    isLoading: plinkoLoading,
    exportHistory: exportPlinkoHistory,
    clearHistory: clearPlinkoHistory,
    updateFilter: updatePlinkoFilter,
    isConnected: plinkoConnected,
    playerKey: plinkoPlayerKey
  } = usePlinkoHistory()

  // Instant Lottery summary from contract stats (plays, wagered, won)
  const lotterySummary: PurchaseSummary = useMemo(() => {
    if (instantStatsLoading || totalPlays === undefined) return {}
    const spent = totalWagered ?? 0n
    const claimed = totalWon ?? 0n
    const pl = claimed - spent
    const roi = spent > 0n ? ((Number(pl) / Number(spent)) * 100).toFixed(1) : '0.0'
    const fmt = (v: bigint) => parseFloat(formatUnits(v, TOKEN_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 3 })
    return {
      tickets: Number(totalPlays ?? 0n),
      spent: fmt(spent),
      claimed: fmt(claimed),
      pending: '0',
      pl: parseFloat(formatUnits(pl, TOKEN_DECIMALS)).toFixed(3),
      potentialPl: parseFloat(formatUnits(pl, TOKEN_DECIMALS)).toFixed(3),
      roi,
      potentialRoi: roi,
      wonRounds: 0,
    }
  }, [totalPlays, totalWagered, totalWon, instantStatsLoading])

  const [lotteryEntries, setLotteryEntries] = useState<PurchaseEntry[]>([])
  const [allLotteryEntries, setAllLotteryEntries] = useState<PurchaseEntry[]>([])
  const [lotteryDisplayCount, setLotteryDisplayCount] = useState(25)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Enrich instant lottery entries: PLS payment detection and format labels
  const enrichLotteryEntries = useCallback(async (entriesToEnrich: PurchaseEntry[], allEntries: PurchaseEntry[]) => {
    if (!publicClient || !address || entriesToEnrich.length === 0) {
      setLotteryEntries(allEntries.slice(0, lotteryDisplayCount))
      return
    }
    try {
      const txHashes = entriesToEnrich.map(e => e.tx).filter(Boolean) as string[]
      const txAnalysisMap = await batchAnalyzeTransactions(txHashes, publicClient, 'Lottery')
      const enriched = entriesToEnrich.map(entry => {
        const txAnalysis = entry.tx ? txAnalysisMap.get(entry.tx) : null
        let costLabel = entry.costLabel
        let originalAmount: string | undefined
        if (txAnalysis?.paymentType === 'PLS' && txAnalysis.plsAmount) {
          originalAmount = formatPLS(txAnalysis.plsAmount)
          const morbiusAmount = txAnalysis.morbiusReceived || BigInt(0)
          if (morbiusAmount > 0n) costLabel = `${formatMORBIUS(morbiusAmount)} MORBIUS`
        } else {
          const match = entry.costLabel.match(/([\d.]+)\s*MORBIUS/)
          if (match) costLabel = `${Math.floor(parseFloat(match[1])).toLocaleString()} MORBIUS`
        }
        return {
          ...entry,
          paymentType: txAnalysis?.paymentType ?? 'MORBIUS',
          originalAmount,
          costLabel,
          ticketStatus: 'claimed' as const,
          winAmount: entry.winAmount ?? BigInt(0),
          hasWon: (entry.winAmount ?? BigInt(0)) > BigInt(0),
        }
      })
      const finalEntries = [...enriched, ...allEntries.slice(entriesToEnrich.length)]
      setLotteryEntries(finalEntries.slice(0, lotteryDisplayCount))
    } catch {
      setLotteryEntries(allEntries.slice(0, lotteryDisplayCount))
    }
  }, [publicClient, address, lotteryDisplayCount])

  const loadLotteryPurchases = useCallback(async () => {
    if (!publicClient || !address) {
      setLotteryEntries([])
      setAllLotteryEntries([])
      return
    }
    const zero = (LOTTERY_INSTANT_ADDRESS as string) === '0x0000000000000000000000000000000000000000'
    if (zero) {
      setLotteryEntries([])
      setAllLotteryEntries([])
      return
    }
    try {
      const toBlock = await publicClient.getBlockNumber()
      const fromBlock = 0n
      const logs = await publicClient.getContractEvents({
        address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
        abi: INSTANT_LOTTERY_6OF55_ABI,
        eventName: 'InstantLotteryResult',
        args: { player: address },
        fromBlock,
        toBlock,
      })
      const entries: PurchaseEntry[] = []
      for (const log of logs) {
        const args = log.args as {
          player?: string
          playerNumbers?: readonly number[] | readonly bigint[]
          winningNumbers?: readonly number[] | readonly bigint[]
          matchCount?: number | bigint
          wager?: bigint
          grossPayout?: bigint
          netPayout?: bigint
        }
        const wager = BigInt(args.wager ?? 0)
        const netPayout = BigInt(args.netPayout ?? 0)
        const playerNumbers = Array.isArray(args.playerNumbers) ? args.playerNumbers.map(n => Number(n)) : []
        const winningNumbers = Array.isArray(args.winningNumbers) ? args.winningNumbers.map(n => Number(n)) : []
        const matchCount = Number(args.matchCount ?? 0)
        const block = log.blockNumber != null ? await publicClient.getBlock({ blockNumber: log.blockNumber }).catch(() => null) : null
        const ts = block?.timestamp ? Number(block.timestamp) * 1000 : null
        entries.push({
          id: `${log.transactionHash}-${log.logIndex?.toString() ?? ''}`,
          game: 'Lottery',
          roundLabel: 'Instant play',
          ticketsLabel: '1 play',
          costLabel: `${parseFloat(formatUnits(wager, TOKEN_DECIMALS)).toFixed(3)} MORBIUS`,
          tx: log.transactionHash,
          timeLabel: formatTime(ts),
          status: 'Confirmed',
          winAmount: netPayout,
          hasWon: netPayout > 0n,
          instantPlay: { playerNumbers, winningNumbers, matchCount, netPayout },
        })
      }
      const reversedEntries = entries.reverse()
      setAllLotteryEntries(reversedEntries)
      const entriesToEnrich = reversedEntries.slice(0, lotteryDisplayCount)
      await enrichLotteryEntries(entriesToEnrich, reversedEntries)
    } catch (err) {
      setLotteryEntries([])
      setAllLotteryEntries([])
    }
  }, [publicClient, address, lotteryDisplayCount, enrichLotteryEntries])

  const refetchPurchases = useCallback(() => {
    setRefreshTrigger(prev => prev + 1)
  }, [])

  useWatchContractEvent({
    address: (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000' ? LOTTERY_INSTANT_ADDRESS : undefined,
    abi: INSTANT_LOTTERY_6OF55_ABI,
    eventName: 'InstantLotteryResult',
    args: address ? { player: address } : undefined,
    onLogs: () => refetchPurchases(),
  })
  useEffect(() => {
    loadLotteryPurchases()
  }, [loadLotteryPurchases, refreshTrigger])

  // Keno data via logs
  const [kenoEntries, setKenoEntries] = useState<PurchaseEntry[]>([])
  const [allKenoEntries, setAllKenoEntries] = useState<PurchaseEntry[]>([])
  const [kenoDisplayCount, setKenoDisplayCount] = useState(25)
  const [kenoSummary, setKenoSummary] = useState<PurchaseSummary | undefined>(undefined)

  // Enrich Keno entries with PLS payment data, status, and winnings
  const enrichKenoEntries = useCallback(async (entriesToEnrich: PurchaseEntry[], allEntries: PurchaseEntry[]) => {
    if (!publicClient || !address || entriesToEnrich.length === 0) {
      setKenoEntries(allEntries.slice(0, kenoDisplayCount))
      return
    }

    try {
      // Batch analyze transactions for PLS detection
      const txHashes = entriesToEnrich.map(e => e.tx).filter(Boolean) as string[]
      const txAnalysisMap = await batchAnalyzeTransactions(txHashes, publicClient, 'Keno')

      // Extract ticket IDs and fetch ticket data
      const ticketIds: bigint[] = []
      const ticketIdToEntry = new Map<string, PurchaseEntry>()

      entriesToEnrich.forEach(entry => {
        // Extract ticket ID from ticketsLabel (e.g., "Ticket #123")
        const match = entry.ticketsLabel.match(/Ticket #(\d+)/)
        if (match) {
          const ticketId = BigInt(match[1])
          ticketIds.push(ticketId)
          ticketIdToEntry.set(ticketId.toString(), entry)
        }
      })

      // Batch fetch ticket data
      const ticketPromises = ticketIds.map(ticketId =>
        publicClient.readContract({
          address: KENO_ADDRESS as `0x${string}`,
          abi: KENO_ABI,
          functionName: 'getTicket',
          args: [ticketId],
        }).catch(() => null)
      )

      const ticketResults = await Promise.all(ticketPromises)
      const ticketDataMap = new Map<string, any>()
      ticketIds.forEach((ticketId, index) => {
        if (ticketResults[index]) {
          ticketDataMap.set(ticketId.toString(), ticketResults[index])
        }
      })

      // Enrich entries
      const enriched = entriesToEnrich.map(entry => {
        const txAnalysis = entry.tx ? txAnalysisMap.get(entry.tx) : null

        let costLabel = entry.costLabel
        let originalAmount: string | undefined

        if (txAnalysis?.paymentType === 'PLS' && txAnalysis.plsAmount) {
          originalAmount = formatPLS(txAnalysis.plsAmount)
        }

        // Get ticket data to determine status
        const ticketMatch = entry.ticketsLabel.match(/Ticket #(\d+)/)
        const ticketId = ticketMatch ? ticketMatch[1] : null
        const ticketData = ticketId ? ticketDataMap.get(ticketId) : null

        let ticketStatus: 'in-play' | 'expired' | 'claimable' | 'claimed' = 'in-play'
        let winAmount = BigInt(0)
        let hasWon = false

        if (ticketData) {
          try {
            const drawsRemaining = Number(ticketData.drawsRemaining || 0)
            const totalDraws = Number(ticketData.draws || 0)
            const firstRoundId = Number(ticketData.firstRoundId || 0)

            if (drawsRemaining === 0) ticketStatus = 'expired'
            else ticketStatus = 'in-play'
          } catch {
            // keep default ticketStatus
          }
        }

        return {
          ...entry,
          paymentType: txAnalysis?.paymentType || 'MORBIUS',
          originalAmount,
          costLabel,
          ticketStatus,
          winAmount,
          hasWon,
        }
      })

      // Merge enriched entries with the rest
      const finalEntries = [
        ...enriched,
        ...allEntries.slice(entriesToEnrich.length)
      ]

      setKenoEntries(finalEntries.slice(0, kenoDisplayCount))
    } catch {
      setKenoEntries(allEntries.slice(0, kenoDisplayCount))
    }
  }, [publicClient, address, kenoDisplayCount])

  useEffect(() => {
    const loadKeno = async () => {
      if (!publicClient || !address) {
        setKenoEntries([])
        setKenoSummary(undefined)
        return
      }
      try {
        const event = parseAbiItem(
          'event TicketPurchased(address indexed player,uint256 indexed ticketId,uint256 indexed firstRoundId,uint8 draws,uint8 spotSize,uint256 wagerPerDraw,uint256 grossCost)'
        )
        const logs = await publicClient.getLogs({
          address: KENO_ADDRESS as `0x${string}`,
          event,
          args: { player: address },
          fromBlock: BigInt(KENO_DEPLOY_BLOCK),
          toBlock: 'latest',
        })

        const sorted = [...logs].sort((a, b) => {
          const bnA = typeof a.blockNumber === 'bigint' ? a.blockNumber : BigInt(a.blockNumber || 0)
          const bnB = typeof b.blockNumber === 'bigint' ? b.blockNumber : BigInt(b.blockNumber || 0)
          if (bnA !== bnB) return bnA > bnB ? 1 : -1
          const liA = typeof a.logIndex === 'bigint' ? a.logIndex : BigInt(a.logIndex || 0)
          const liB = typeof b.logIndex === 'bigint' ? b.logIndex : BigInt(b.logIndex || 0)
          return liA > liB ? 1 : liA < liB ? -1 : 0
        })

        let totalGross = BigInt(0)
        const entries: PurchaseEntry[] = []
        for (const log of sorted) {
          const ticketId = log.args?.ticketId as bigint | undefined
          const firstRoundId = Number(log.args?.firstRoundId ?? 0)
          const draws = Number(log.args?.draws ?? 0)
          const grossCost = BigInt(log.args?.grossCost ?? 0)
          totalGross += grossCost

          const block =
            log.blockNumber !== undefined
              ? await publicClient.getBlock({ blockNumber: log.blockNumber as any })
              : null
          const ts = block?.timestamp ? Number(block.timestamp) * 1000 : null

          entries.push({
            id: ticketId ? ticketId.toString() : `${firstRoundId}-${draws}-${Math.random()}`,
            game: 'Keno',
            roundLabel: draws > 1 ? `Rounds ${firstRoundId}→${firstRoundId + draws - 1}` : `Round ${firstRoundId}`,
            ticketsLabel: ticketId ? `Ticket #${ticketId.toString()}` : `${draws} draws`,
            freeTickets: 0,
            addons: [],
            costLabel: `${Math.floor(parseFloat(formatUnits(grossCost, TOKEN_DECIMALS))).toLocaleString()} MORBIUS`,
            tx: log.transactionHash as string,
            timeLabel: ts ? new Date(ts).toLocaleString() : '—',
            status: 'Confirmed',
          })
        }

        const reversedEntries = entries.reverse()
        setAllKenoEntries(reversedEntries)

        // Enrich only visible entries for Keno
        const entriesToEnrich = reversedEntries.slice(0, kenoDisplayCount)
        await enrichKenoEntries(entriesToEnrich, reversedEntries)
        setKenoSummary({
          tickets: entries.length,
          spent: parseFloat(formatUnits(totalGross, TOKEN_DECIMALS)).toFixed(3),
          claimed: '—',
          pending: '—',
          pl: '—',
          potentialPl: '—',
          roi: '—',
          potentialRoi: '—',
        })
      } catch (err) {
        console.error('load keno purchases failed', err)
        setKenoEntries([])
        setKenoSummary(undefined)
      }
    }
    loadKeno()
  }, [publicClient, address])

  // Load More handlers
  const handleLoadMoreLottery = useCallback(() => {
    setLotteryDisplayCount(prev => Math.min(prev + 25, allLotteryEntries.length))
  }, [allLotteryEntries.length])

  const handleLoadMoreKeno = useCallback(() => {
    setKenoDisplayCount(prev => Math.min(prev + 25, allKenoEntries.length))
  }, [allKenoEntries.length])

  // Re-enrich when display count changes
  useEffect(() => {
    if (allLotteryEntries.length > 0) {
      const entriesToEnrich = allLotteryEntries.slice(0, lotteryDisplayCount)
      enrichLotteryEntries(entriesToEnrich, allLotteryEntries)
    }
  }, [lotteryDisplayCount, allLotteryEntries, enrichLotteryEntries])

  useEffect(() => {
    if (allKenoEntries.length > 0) {
      const entriesToEnrich = allKenoEntries.slice(0, kenoDisplayCount)
      enrichKenoEntries(entriesToEnrich, allKenoEntries)
    }
  }, [kenoDisplayCount, allKenoEntries, enrichKenoEntries])

  // Instant Lottery: expand shows one play (numbers, result, payout) from entry.instantPlay
  const fetchLotteryRoundDetails = useCallback(async (entry: PurchaseEntry): Promise<RoundDetail[]> => {
    const play = entry.instantPlay
    if (!play) return []
    return [{
      roundId: 0,
      numbers: play.playerNumbers.length > 0 ? play.playerNumbers : undefined,
      winningNumbers: play.winningNumbers.length > 0 ? play.winningNumbers : undefined,
      matches: play.matchCount,
      prize: play.netPayout > 0n ? play.netPayout : undefined,
      status: play.netPayout > 0n ? 'won' : 'lost',
    }]
  }, [])

  // Decode Keno numbersBitmap (bit i set = number i+1 picked) to number[]
  const decodeKenoBitmap = (bitmap: bigint): number[] => {
    const out: number[] = []
    for (let i = 0; i < 80; i++) {
      if ((bitmap & (1n << BigInt(i))) !== 0n) out.push(i + 1)
    }
    return out
  }

  // Fetch individual round details for Keno (expandable entries) using KENO_ABI getTicket
  const fetchKenoRoundDetails = useCallback(async (entry: PurchaseEntry): Promise<RoundDetail[]> => {
    if (!publicClient || !address) {
      return []
    }

    try {
      const ticketMatch = entry.ticketsLabel.match(/Ticket #(\d+)/)
      if (!ticketMatch) return []

      const ticketId = BigInt(ticketMatch[1])
      const ticketData = await publicClient.readContract({
        address: KENO_ADDRESS as `0x${string}`,
        abi: KENO_ABI,
        functionName: 'getTicket',
        args: [ticketId],
      }) as { firstRoundId?: bigint; draws?: number; drawsRemaining?: number; numbersBitmap?: bigint } | null

      if (!ticketData) return []

      const firstRoundId = Number(ticketData.firstRoundId ?? 0)
      const draws = Number(ticketData.draws ?? 0)
      const drawsRemaining = Number(ticketData.drawsRemaining ?? 0)
      const pickedNumbers = ticketData.numbersBitmap != null ? decodeKenoBitmap(ticketData.numbersBitmap) : []

      // Calculate which rounds this ticket covers
      const completedDraws = draws - drawsRemaining
      const roundIds = Array.from({ length: completedDraws }, (_, i) => firstRoundId + i)

      if (roundIds.length === 0) {
        // No completed rounds yet, show as pending
        return [{
          roundId: firstRoundId,
          numbers: pickedNumbers,
          status: 'pending',
        }]
      }

      // Fetch data for all completed rounds
      const roundDetailsPromises = roundIds.map(async (roundId) => {
        try {
          // Fetch round data to get winning numbers
          const roundData = await publicClient.readContract({
            address: KENO_ADDRESS as `0x${string}`,
            abi: KENO_ABI,
            functionName: 'getRound',
            args: [BigInt(roundId)],
          }) as any

          const winningNumbers = roundData?.winningNumbers ? (roundData.winningNumbers as bigint[]).map(n => Number(n)) : []

          // Calculate matches
          let matches = 0
          if (pickedNumbers.length > 0 && winningNumbers.length > 0) {
            matches = pickedNumbers.filter(num => winningNumbers.includes(num)).length
          }

          // For Keno, we'd need to calculate the prize based on the paytable
          // For now, we'll just show matches
          const roundDetail: RoundDetail = {
            roundId,
            numbers: pickedNumbers,
            winningNumbers: winningNumbers.length > 0 ? winningNumbers : undefined,
            matches,
            status: 'lost', // Default to lost, would need paytable lookup to determine wins
          }

          return roundDetail
        } catch {
          return {
            roundId,
            numbers: pickedNumbers,
            status: 'pending' as const,
          }
        }
      })

      const details = await Promise.all(roundDetailsPromises)

      // Add pending rounds if there are draws remaining
      if (drawsRemaining > 0) {
        for (let i = 0; i < Math.min(drawsRemaining, 3); i++) {
          details.push({
            roundId: firstRoundId + completedDraws + i,
            numbers: pickedNumbers,
            status: 'pending',
          })
        }
      }

      return details
    } catch (error) {
      return []
    }
  }, [publicClient, address])

  // Tab state
  const [activeTab, setActiveTab] = useState<'lottery' | 'keno' | 'plinko' | 'blackjack'>('lottery')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showPlinkoHistory, setShowPlinkoHistory] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div className="min-h-screen text-white bg-[linear-gradient(rgba(6,1,30,0.92),rgba(3,7,18,0.92)),url('/MORBIUS/MORBIUSbg.png')] bg-cover bg-center bg-fixed">
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-b from-slate-950 via-slate-900/95 to-slate-900/80 backdrop-blur-lg border-b border-white/10 shadow-lg">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-white/80 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10"
                title="Go back"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <h1 className="text-md font-bold text-white">
                History
              </h1>
            </div>
            <WalletMenu profileDisplayName={profileDisplayName} profileImageUrl={profileImageUrl} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Game Selection Dropdown */}
        <div className="mb-8 flex justify-center">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="bg-slate-800/50 text-white border border-white/10 hover:bg-slate-700/50 px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
            >
              Select Game: {activeTab === 'lottery' ? 'Lottery' : activeTab === 'keno' ? 'Keno' : activeTab === 'plinko' ? 'Plinko' : 'Blackjack'}
              <svg
                className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {dropdownOpen && (
              <div className="absolute top-full mt-1 bg-slate-800 border border-white/10 rounded-md shadow-lg z-50 min-w-[200px]">
                <button
                  onClick={() => {
                    setActiveTab('lottery')
                    setDropdownOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'lottery'
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                      : 'text-white hover:bg-slate-700/50'
                  }`}
                >
                  Lottery
                </button>
                <button
                  onClick={() => {
                    setActiveTab('keno')
                    setDropdownOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'keno'
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                      : 'text-white hover:bg-slate-700/50'
                  }`}
                >
                  Keno
                </button>
                <button
                  onClick={() => {
                    setActiveTab('plinko')
                    setDropdownOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'plinko'
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                      : 'text-white hover:bg-slate-700/50'
                  }`}
                >
                  Plinko
                </button>
                <button
                  onClick={() => {
                    setActiveTab('blackjack')
                    setDropdownOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'blackjack'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                      : 'text-white hover:bg-slate-700/50'
                  }`}
                >
                  Blackjack
                </button>
              </div>
            )}
          </div>
        </div>
        {activeTab === 'lottery' && (
          <div className="space-y-6">
            <PlayerPurchaseHistory
              title="Lottery Player Statistics"
              summary={lotterySummary}
              entries={lotteryEntries}
              onRefresh={refetchPurchases}
              onLoadMore={handleLoadMoreLottery}
              hasMore={lotteryDisplayCount < allLotteryEntries.length}
              totalEntries={allLotteryEntries.length}
              currentPage={Math.floor(lotteryDisplayCount / 25) - 1}
              itemsPerPage={25}
              onExpandEntry={fetchLotteryRoundDetails}
            />
          </div>
        )}
        {activeTab === 'keno' && (
          <div className="space-y-6">
            <PlayerPurchaseHistory
              title="Keno Player Statistics"
              summary={kenoSummary}
              entries={kenoEntries}
              pulseUrl={pulseUrl}
              onLoadMore={handleLoadMoreKeno}
              hasMore={kenoDisplayCount < allKenoEntries.length}
              totalEntries={allKenoEntries.length}
              currentPage={Math.floor(kenoDisplayCount / 25) - 1}
              itemsPerPage={25}
              onExpandEntry={fetchKenoRoundDetails}
            />
          </div>
        )}
        {activeTab === 'plinko' && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 rounded-xl p-6 border border-white/10">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Plinko Player Statistics</h2>
                <button
                  onClick={() => setShowPlinkoHistory(true)}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:from-blue-600 hover:to-cyan-600 transition-colors text-sm font-medium"
                >
                  View Full History
                </button>
              </div>

              {plinkoLoading ? (
                <div className="text-white/60">Loading Plinko history...</div>
              ) : plinkoStats ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <div className="text-sm text-white/60">Total Drops</div>
                    <div className="text-2xl font-bold text-white">{plinkoStats.totalDrops || 0}</div>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <div className="text-sm text-white/60">Total Wager</div>
                    <div className="text-2xl font-bold text-white">{formatPLS(BigInt(Math.round((plinkoStats.totalWagered || 0) * 10**18)))}</div>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <div className="text-sm text-white/60">Total Profit</div>
                    <div className={`text-2xl font-bold ${(plinkoStats.netProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPLS(BigInt(Math.round((plinkoStats.netProfit || 0) * 10**18)))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-white/60">No Plinko history found</div>
              )}

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">Recent Drops</h3>
                {plinkoDrops.length > 0 ? (
                  <div className="space-y-2">
                    {plinkoDrops.slice(0, 10).map((drop) => (
                      <div key={drop.id} className="bg-slate-700/30 rounded-lg p-4 border border-white/5">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-4">
                            <div className="text-sm text-white/60">
                              {formatTime(drop.timestamp)}
                            </div>
                            <div className="text-sm text-white/60">
                              Risk: {drop.riskLevel}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-white">
                              Wager: {formatPLS(BigInt(Math.round((drop.wager || 0) * 10**18)))}
                            </div>
                            <div className={`text-sm font-medium ${(drop.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              Profit: {formatPLS(BigInt(Math.round((drop.profit || 0) * 10**18)))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-white/60">No drops found</div>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'blackjack' && (
          <div className="space-y-6">
            <QuickHistory history={[]} />
            <div className="bg-slate-800/50 rounded-xl p-6 border border-white/10">
              <p className="text-white/80 mb-4">
                Play Blackjack to see your recent games here. Full history and stats are on the Blackjack page.
              </p>
              <Link
                href="/BLACKJACK"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 transition-colors text-sm font-medium"
              >
                Play Blackjack
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </div>
        )}

        {/* PLINKO History Modal */}
        <PlinkoHistoryModal
          open={showPlinkoHistory}
          onOpenChange={setShowPlinkoHistory}
          drops={plinkoDrops}
          stats={plinkoStats}
          isConnected={plinkoConnected}
          playerKey={plinkoPlayerKey}
          onExport={exportPlinkoHistory}
          onClear={async () => {
            if (confirm('Are you sure you want to clear all Plinko history? This cannot be undone.')) {
              await clearPlinkoHistory()
            }
          }}
          onFilterChange={updatePlinkoFilter}
        />
      </div>

      {/* Footer */}
      <Footer />
    </div>
  )
}
