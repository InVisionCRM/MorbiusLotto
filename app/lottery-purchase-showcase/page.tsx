'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, usePublicClient, useReadContracts } from 'wagmi'
import { formatUnits, parseAbiItem } from 'viem'
import Link from 'next/link'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { PlayerPurchaseHistory, PurchaseEntry, PurchaseSummary, RoundDetail } from '@/components/shared/player-purchase-history'
import {
  KENO_ADDRESS,
  KENO_DEPLOY_BLOCK,
  LOTTERY_DEPLOY_BLOCK,
  LOTTERY_ADDRESS,
  TICKET_PRICE,
  TOKEN_DECIMALS,
} from '@/lib/contracts'
import { KENO_ABI } from '@/lib/keno-abi'
import { usePlayerLifetime, usePlayerRoundHistory, useWatchTicketsPurchased } from '@/hooks/use-lottery-6of55'
import { usePlinkoHistory } from '@/hooks/use-plinko-history'
import Footer from '@/components/PLINKO/Footer'
import { PlinkoHistoryModal } from '@/components/PLINKO/PlinkoHistoryModal'
import QuickHistory from '@/components/BLACKJACK/QuickHistory'
import { usePublicClient as useLotteryPublicClient } from 'wagmi'
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2'
import { batchAnalyzeTransactions } from '@/lib/transaction-analyzer'
import { formatMORBIUS, formatPLS } from '@/lib/format-utils'

const pulseUrl = (tx: string) => `https://scan.pulsechain.box/tx/${tx}`

const formatTime = (iso: string | number | null | undefined) => {
  if (!iso) return '—'
  const d = typeof iso === 'number' ? new Date(iso) : new Date(iso)
  return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
}

export default function LotteryPurchaseShowcase() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const lotteryClient = useLotteryPublicClient()
  const router = useRouter()

  // Lottery data hooks
  const { data: lifetimeData } = usePlayerLifetime(address)
  const { data: roundHistoryData } = usePlayerRoundHistory(address, 0, 25)

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

  // Debug logging for data comparison
  console.log('🔍 Showcase Page Debug:', {
    address: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'not connected',
    lifetimeData,
    roundHistoryData: roundHistoryData ? {
      length: Array.isArray(roundHistoryData) ? roundHistoryData.length : 'not array',
      sample: Array.isArray(roundHistoryData) && roundHistoryData.length > 0 ? roundHistoryData[0] : 'empty'
    } : 'null'
  })

  // Calculate won rounds from round history
  const roundsStats = useMemo(() => {
    if (!roundHistoryData || !Array.isArray(roundHistoryData) || roundHistoryData.length < 3) {
      return { totalWonRounds: 0, claimableRounds: 0 }
    }

    const [ids, tickets, wins] = roundHistoryData as [bigint[], bigint[], bigint[]]
    let totalWonRounds = 0
    let claimableRounds = 0

    for (let i = 0; i < ids.length; i++) {
      const roundId = Number(ids[i])
      const amount = wins[i] || BigInt(0)

      if (amount > 0 && roundId > 0) {
        totalWonRounds++ // All rounds ever won
        // Note: claimableRounds would require claim status checking like in MultiClaimModal
        // For now, we'll show total won rounds
      }
    }

    return { totalWonRounds, claimableRounds }
  }, [roundHistoryData])

  console.log('🏆 Won rounds calculation:', {
    totalWonRounds: roundsStats.totalWonRounds,
    claimableRounds: roundsStats.claimableRounds,
    roundHistoryDataLength: Array.isArray(roundHistoryData) ? roundHistoryData.length : 'not array'
  })

  const lotterySummary: PurchaseSummary = useMemo(() => {
    if (!lifetimeData || !Array.isArray(lifetimeData) || lifetimeData.length < 4) return {}
    const [tickets, spent, claimed, claimable] = lifetimeData as [bigint, bigint, bigint, bigint]
    const pl = claimed - spent
    const potentialPl = claimed + claimable - spent
    const roi = spent > 0 ? ((Number(pl) / Number(spent)) * 100).toFixed(1) : '0.0'
    const potentialRoi = spent > 0 ? ((Number(potentialPl) / Number(spent)) * 100).toFixed(1) : '0.0'
    const fmt = (v: bigint) => parseFloat(formatUnits(v, TOKEN_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 3 })
    return {
      tickets: Number(tickets),
      spent: fmt(spent),
      claimed: fmt(claimed),
      pending: fmt(claimable),
      pl: parseFloat(formatUnits(pl, TOKEN_DECIMALS)).toFixed(3),
      potentialPl: parseFloat(formatUnits(potentialPl, TOKEN_DECIMALS)).toFixed(3),
      roi,
      potentialRoi,
      wonRounds: roundsStats.totalWonRounds, // Add won rounds count
    }
  }, [lifetimeData, roundsStats])

  const [lotteryEntries, setLotteryEntries] = useState<PurchaseEntry[]>([])
  const [allLotteryEntries, setAllLotteryEntries] = useState<PurchaseEntry[]>([])
  const [lotteryDisplayCount, setLotteryDisplayCount] = useState(25)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Enrich lottery entries with PLS payment data, win amounts, and status
  const enrichLotteryEntries = useCallback(async (entriesToEnrich: PurchaseEntry[], allEntries: PurchaseEntry[]) => {
    console.log('🔄 enrichLotteryEntries called:', {
      entriesToEnrichCount: entriesToEnrich.length,
      allEntriesCount: allEntries.length,
      hasClient: !!lotteryClient,
      hasAddress: !!address
    })

    if (!lotteryClient || !address || entriesToEnrich.length === 0) {
      console.log('⚠️ Skipping lottery enrichment - missing requirements')
      setLotteryEntries(allEntries.slice(0, lotteryDisplayCount))
      return
    }

    try {
      console.log('✅ Starting lottery enrichment...')
      // 1. Batch analyze transactions for PLS detection
      const txHashes = entriesToEnrich.map(e => e.tx).filter(Boolean) as string[]
      const txAnalysisMap = await batchAnalyzeTransactions(txHashes, lotteryClient, 'Lottery')

      // 2. Extract round IDs from entries
      const roundIds: bigint[] = []
      const roundIdToEntry = new Map<string, PurchaseEntry>()

      entriesToEnrich.forEach(entry => {
        // Extract round ID from roundLabel (e.g., "Round #123" or "Rounds 120→125")
        const match = entry.roundLabel.match(/Round #?(\d+)/)
        if (match) {
          const roundId = BigInt(match[1])
          roundIds.push(roundId)
          roundIdToEntry.set(roundId.toString(), entry)
        }
      })

      // 3. Batch fetch round data and claimable winnings
      const roundDataPromises = roundIds.map(roundId =>
        lotteryClient.readContract({
          address: LOTTERY_ADDRESS as `0x${string}`,
          abi: LOTTERY_6OF55_V2_ABI,
          functionName: 'getRound',
          args: [roundId],
        }).catch(() => null)
      )

      const winningsPromises = roundIds.map(roundId =>
        lotteryClient.readContract({
          address: LOTTERY_ADDRESS as `0x${string}`,
          abi: LOTTERY_6OF55_V2_ABI,
          functionName: 'getClaimableWinnings',
          args: [roundId, address],
        }).catch(() => BigInt(0))
      )

      const [roundDataResults, winningsResults] = await Promise.all([
        Promise.all(roundDataPromises),
        Promise.all(winningsPromises)
      ])

      const roundDataMap = new Map<string, any>()
      const winningsMap = new Map<string, bigint>()

      roundIds.forEach((roundId, index) => {
        if (roundDataResults[index]) {
          roundDataMap.set(roundId.toString(), roundDataResults[index])
        }
        winningsMap.set(roundId.toString(), winningsResults[index] as bigint)
      })

      // 4. Enrich entries
      const enriched = entriesToEnrich.map(entry => {
        const txAnalysis = entry.tx ? txAnalysisMap.get(entry.tx) : null
        const roundMatch = entry.roundLabel.match(/Round #?(\d+)/)
        const roundId = roundMatch ? roundMatch[1] : null
        const winAmount = roundId ? winningsMap.get(roundId) || BigInt(0) : BigInt(0)
        const hasWon = winAmount > BigInt(0)
        const roundData = roundId ? roundDataMap.get(roundId) : null

        // Determine status based on round state
        let ticketStatus: 'in-play' | 'expired' | 'claimable' | 'claimed' = 'in-play'

        if (roundData) {
          try {
            const roundState = Number(roundData.state || 0) // 0 = OPEN, 1 = FINALIZED
            const isFinalized = roundState === 1

            // Debug log
            console.log(`🎰 Lottery Round #${roundId} status:`, {
              roundState,
              isFinalized,
              hasWon,
              winAmount: winAmount.toString(),
              rawRoundData: roundData
            })

            if (isFinalized) {
              if (hasWon) {
                ticketStatus = 'claimable'
                console.log(`✅ Round #${roundId} marked as CLAIMABLE (finalized + has winnings)`)
              } else {
                ticketStatus = 'expired'
                console.log(`✅ Round #${roundId} marked as EXPIRED (finalized + no winnings)`)
              }
            } else {
              ticketStatus = 'in-play'
              console.log(`⏳ Round #${roundId} marked as IN-PLAY (not finalized)`)
            }
          } catch (error) {
            console.error(`❌ Error processing Lottery Round #${roundId}:`, error)
          }
        } else if (hasWon) {
          // Fallback if we don't have round data but have winnings
          ticketStatus = 'claimable'
          console.log(`✅ Round #${roundId} marked as CLAIMABLE (fallback - has winnings but no round data)`)
        } else {
          console.warn(`⚠️ No round data found for Round #${roundId}`)
        }

        // Format amounts
        let costLabel = entry.costLabel
        let originalAmount: string | undefined

        if (txAnalysis?.paymentType === 'PLS' && txAnalysis.plsAmount) {
          originalAmount = formatPLS(txAnalysis.plsAmount)
          const morbiusAmount = txAnalysis.morbiusReceived || BigInt(0)
          if (morbiusAmount > 0) {
            costLabel = `${formatMORBIUS(morbiusAmount)} MORBIUS`
          }
        } else {
          // Parse existing MORBIUS amount and reformat as whole number
          const match = entry.costLabel.match(/([\d.]+)\s*MORBIUS/)
          if (match) {
            const amount = parseFloat(match[1])
            costLabel = `${Math.floor(amount).toLocaleString()} MORBIUS`
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

      console.log('✅ Lottery enrichment complete. Setting entries:', {
        enrichedCount: enriched.length,
        totalCount: finalEntries.length,
        displayCount: lotteryDisplayCount,
        sampleEnrichedEntry: enriched[0]
      })

      setLotteryEntries(finalEntries.slice(0, lotteryDisplayCount))
    } catch (error) {
      console.error('❌ Error enriching lottery entries:', error)
      setLotteryEntries(allEntries.slice(0, lotteryDisplayCount))
    }
  }, [lotteryClient, address, lotteryDisplayCount])

  const loadLotteryPurchases = useCallback(async () => {
    if (!lotteryClient || !address) {
      setLotteryEntries([])
      return
    }
    try {
      const entries: PurchaseEntry[] = []

      // Fetch single-round purchases (TicketsPurchased events)
      const singleRoundEvent = parseAbiItem(
        'event TicketsPurchased(address indexed player,uint256 indexed roundId,uint256 ticketCount,uint256 freeTicketsUsed,uint256 MORBIUSSpent)'
      )
      const singleRoundLogs = await lotteryClient.getLogs({
        address: LOTTERY_ADDRESS as `0x${string}`,
        event: singleRoundEvent,
        args: { player: address },
        fromBlock: BigInt(LOTTERY_DEPLOY_BLOCK),
        toBlock: 'latest',
      })

      // Fetch multi-round purchases (TicketsPurchasedForRounds events)
      const multiRoundEvent = parseAbiItem(
        'event TicketsPurchasedForRounds(address indexed player,uint256[] roundIds,uint256[] ticketCounts,uint256 MORBIUSSpent)'
      )
      const multiRoundLogs = await lotteryClient.getLogs({
        address: LOTTERY_ADDRESS as `0x${string}`,
        event: multiRoundEvent,
        args: { player: address },
        fromBlock: BigInt(LOTTERY_DEPLOY_BLOCK),
        toBlock: 'latest',
      })

      // Combine and sort all logs by block number and log index
      const allLogs = [...singleRoundLogs, ...multiRoundLogs].sort((a, b) => {
        const bnA = typeof a.blockNumber === 'bigint' ? a.blockNumber : BigInt(a.blockNumber || 0)
        const bnB = typeof b.blockNumber === 'bigint' ? b.blockNumber : BigInt(b.blockNumber || 0)
        if (bnA !== bnB) return bnA > bnB ? 1 : -1
        const liA = typeof a.logIndex === 'bigint' ? a.logIndex : BigInt(a.logIndex || 0)
        const liB = typeof b.logIndex === 'bigint' ? b.logIndex : BigInt(b.logIndex || 0)
        return liA > liB ? 1 : liA < liB ? -1 : 0
      })

      // Group logs by transaction hash to combine multi-round purchases
      const txGroups = new Map<string, typeof allLogs>()

      for (const log of allLogs) {
        const txHash = log.transactionHash
        if (!txGroups.has(txHash)) {
          txGroups.set(txHash, [])
        }
        txGroups.get(txHash)!.push(log)
      }

      // Process each transaction group
      for (const [txHash, logs] of txGroups) {
        // Sort logs within transaction by log index
        logs.sort((a, b) => {
          const liA = typeof a.logIndex === 'bigint' ? a.logIndex : BigInt(a.logIndex || 0)
          const liB = typeof b.logIndex === 'bigint' ? b.logIndex : BigInt(b.logIndex || 0)
          return liA > liB ? 1 : liA < liB ? -1 : 0
        })

        const block =
          logs[0].blockNumber !== undefined
            ? await lotteryClient.getBlock({ blockNumber: logs[0].blockNumber as any })
            : null
        const ts = block?.timestamp ? Number(block.timestamp) * 1000 : null

        // Check if this transaction contains multi-round purchases
        const multiRoundLog = logs.find(log => log.args && 'roundIds' in log.args && Array.isArray(log.args.roundIds))

        if (multiRoundLog && multiRoundLog.args) {
          // Multi-round purchase
          const roundIds = (multiRoundLog.args as any).roundIds as readonly bigint[]
          const ticketCounts = (multiRoundLog.args as any).ticketCounts as readonly bigint[]
          const MORBIUSSpent = BigInt((multiRoundLog.args as any).MORBIUSSpent ?? 0)

          // Calculate round range and total tickets
          const sortedRounds = roundIds.map(id => Number(id)).sort((a, b) => a - b)
          const firstRound = sortedRounds[0]
          const lastRound = sortedRounds[sortedRounds.length - 1]
          const totalTickets = ticketCounts.reduce((sum, count) => sum + Number(count), 0)

          const roundLabel = sortedRounds.length > 1
            ? `Rounds ${firstRound}→${lastRound}`
            : `Round #${firstRound}`

          entries.push({
            id: `${txHash}-multi`,
            game: 'Lottery',
            roundLabel,
            ticketsLabel: `${totalTickets} tickets`,
            freeTickets: 0, // Multi-round doesn't track free tickets
            addons: [],
            costLabel: `${parseFloat(formatUnits(MORBIUSSpent, TOKEN_DECIMALS)).toFixed(3)} MORBIUS`,
            tx: txHash,
            timeLabel: formatTime(ts),
            status: 'Confirmed',
          })
        } else {
          // Single-round purchases (could be multiple single-round logs in one tx)
          for (const log of logs) {
            const args = log.args
            if (args && 'roundId' in args) {
              const roundId = Number(args.roundId ?? 0)
              const ticketCount = Number(args.ticketCount ?? 0)
              const freeUsed = Number(args.freeTicketsUsed ?? 0)
              const MORBIUSSpent = BigInt(args.MORBIUSSpent ?? 0)

              entries.push({
                id: `${roundId}-${txHash}-${log.logIndex?.toString?.() ?? ''}`,
                game: 'Lottery',
                roundLabel: `Round #${roundId}`,
                ticketsLabel: `${ticketCount} tickets`,
                freeTickets: freeUsed,
                addons: [],
                costLabel: `${parseFloat(formatUnits(MORBIUSSpent, TOKEN_DECIMALS)).toFixed(3)} MORBIUS`,
                tx: txHash,
                timeLabel: formatTime(ts),
                status: 'Confirmed',
              })
            }
          }
        }
      }

      const reversedEntries = entries.reverse()
      setAllLotteryEntries(reversedEntries)

      // Enrich only the visible entries (first lotteryDisplayCount)
      const entriesToEnrich = reversedEntries.slice(0, lotteryDisplayCount)
      await enrichLotteryEntries(entriesToEnrich, reversedEntries)
    } catch (err) {
      console.error('load lottery purchases failed', err)
      setLotteryEntries([])
      setAllLotteryEntries([])
    }
  }, [lotteryClient, address, lotteryDisplayCount])

  const refetchPurchases = useCallback(() => {
    setRefreshTrigger(prev => prev + 1)
  }, [])

  // Watch for new ticket purchases and trigger refresh
  useWatchTicketsPurchased(address, (roundId, ticketCount) => {
    console.log('🎫 New lottery purchase detected:', {
      roundId: roundId.toString(),
      ticketCount: ticketCount.toString(),
      address: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'unknown'
    })
    refetchPurchases()
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
    console.log('🔄 enrichKenoEntries called:', {
      entriesToEnrichCount: entriesToEnrich.length,
      allEntriesCount: allEntries.length,
      hasClient: !!publicClient,
      hasAddress: !!address
    })

    if (!publicClient || !address || entriesToEnrich.length === 0) {
      console.log('⚠️ Skipping Keno enrichment - missing requirements')
      setKenoEntries(allEntries.slice(0, kenoDisplayCount))
      return
    }

    try {
      console.log('✅ Starting Keno enrichment...')
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

            // Debug log
            console.log(`🎫 Keno Ticket #${ticketId} status:`, {
              drawsRemaining,
              totalDraws,
              firstRoundId,
              rawTicketData: ticketData
            })

            // Determine status based on draws remaining
            if (drawsRemaining === 0) {
              ticketStatus = 'expired'
              console.log(`✅ Ticket #${ticketId} marked as EXPIRED (0 draws remaining)`)
            } else {
              ticketStatus = 'in-play'
              console.log(`⏳ Ticket #${ticketId} marked as IN-PLAY (${drawsRemaining} draws remaining)`)
            }
          } catch (error) {
            console.error(`❌ Error processing Keno Ticket #${ticketId}:`, error)
          }
        } else {
          console.warn(`⚠️ No ticket data found for Ticket #${ticketId}`)
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

      console.log('✅ Keno enrichment complete. Setting entries:', {
        enrichedCount: enriched.length,
        totalCount: finalEntries.length,
        displayCount: kenoDisplayCount,
        sampleEnrichedEntry: enriched[0]
      })

      setKenoEntries(finalEntries.slice(0, kenoDisplayCount))
    } catch (error) {
      console.error('❌ Error enriching Keno entries:', error)
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

  // Fetch individual round details for Lottery (expandable entries)
  const fetchLotteryRoundDetails = useCallback(async (entry: PurchaseEntry): Promise<RoundDetail[]> => {
    if (!lotteryClient || !address) {
      return []
    }

    try {
      // Extract round IDs from the entry
      let roundIds: number[] = []

      // Check if it's a multi-round entry (e.g., "Rounds 120→125")
      const multiRoundMatch = entry.roundLabel.match(/Rounds (\d+)→(\d+)/)
      if (multiRoundMatch) {
        const startRound = parseInt(multiRoundMatch[1])
        const endRound = parseInt(multiRoundMatch[2])
        roundIds = Array.from({ length: endRound - startRound + 1 }, (_, i) => startRound + i)
      } else {
        // Single round entry (e.g., "Round #123")
        const singleRoundMatch = entry.roundLabel.match(/Round #?(\d+)/)
        if (singleRoundMatch) {
          roundIds = [parseInt(singleRoundMatch[1])]
        }
      }

      if (roundIds.length === 0) {
        return []
      }

      // Fetch data for all rounds in parallel
      const roundDetailsPromises = roundIds.map(async (roundId) => {
        try {
          // Fetch round data to get winning numbers and state
          const roundData = await lotteryClient.readContract({
            address: LOTTERY_ADDRESS as `0x${string}`,
            abi: LOTTERY_6OF55_V2_ABI,
            functionName: 'getRound',
            args: [BigInt(roundId)],
          })

          // Fetch player's tickets for this round
          const playerTickets = await lotteryClient.readContract({
            address: LOTTERY_ADDRESS as `0x${string}`,
            abi: LOTTERY_6OF55_V2_ABI,
            functionName: 'getPlayerTickets',
            args: [BigInt(roundId), address],
          }) as number[][]

          // Fetch claimable winnings
          const winnings = await lotteryClient.readContract({
            address: LOTTERY_ADDRESS as `0x${string}`,
            abi: LOTTERY_6OF55_V2_ABI,
            functionName: 'getClaimableWinnings',
            args: [BigInt(roundId), address],
          }) as bigint

          const roundState = Number(roundData.state || 0) // 0 = OPEN, 1 = FINALIZED
          const isFinalized = roundState === 1
          const winningNumbers = roundData.winningNumbers ? (roundData.winningNumbers as bigint[]).map(n => Number(n)) : []

          // Calculate matches if we have tickets and winning numbers
          let matches = 0
          let playerNumbers: number[] = []

          if (playerTickets && playerTickets.length > 0 && winningNumbers.length > 0) {
            // Use the first ticket for now (could be enhanced to show all tickets)
            playerNumbers = playerTickets[0].map(n => Number(n))
            matches = playerNumbers.filter(num => winningNumbers.includes(num)).length
          }

          // Determine status
          let status: 'pending' | 'won' | 'lost' = 'pending'
          if (isFinalized) {
            status = winnings > BigInt(0) ? 'won' : 'lost'
          }

          const roundDetail: RoundDetail = {
            roundId,
            numbers: playerNumbers.length > 0 ? playerNumbers : undefined,
            winningNumbers: winningNumbers.length > 0 ? winningNumbers : undefined,
            matches: isFinalized ? matches : undefined,
            prize: winnings > BigInt(0) ? winnings : undefined,
            status,
          }

          return roundDetail
        } catch (error) {
          console.error(`Error fetching lottery round ${roundId}:`, error)
          return {
            roundId,
            status: 'pending' as const,
          }
        }
      })

      const details = await Promise.all(roundDetailsPromises)
      return details
    } catch (error) {
      console.error('Error fetching lottery round details:', error)
      return []
    }
  }, [lotteryClient, address])

  // Fetch individual round details for Keno (expandable entries)
  const fetchKenoRoundDetails = useCallback(async (entry: PurchaseEntry): Promise<RoundDetail[]> => {
    if (!publicClient || !address) {
      return []
    }

    try {
      // Extract ticket ID from the entry
      const ticketMatch = entry.ticketsLabel.match(/Ticket #(\d+)/)
      if (!ticketMatch) {
        return []
      }

      const ticketId = BigInt(ticketMatch[1])

      // Fetch ticket data to get picked numbers and round range
      const ticketData = await publicClient.readContract({
        address: KENO_ADDRESS as `0x${string}`,
        abi: KENO_ABI,
        functionName: 'getTicket',
        args: [ticketId],
      }) as any

      if (!ticketData) {
        return []
      }

      const firstRoundId = Number(ticketData.firstRoundId || 0)
      const draws = Number(ticketData.draws || 0)
      const drawsRemaining = Number(ticketData.drawsRemaining || 0)
      const pickedNumbers = ticketData.pickedNumbers ? (ticketData.pickedNumbers as bigint[]).map(n => Number(n)) : []

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
        } catch (error) {
          console.error(`Error fetching keno round ${roundId}:`, error)
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
      console.error('Error fetching keno round details:', error)
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
            <ConnectButton />
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
