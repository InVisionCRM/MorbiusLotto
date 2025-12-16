'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { formatUnits, parseAbiItem } from 'viem'
import { PlayerPurchaseHistory, PurchaseEntry, PurchaseSummary } from '@/components/shared/player-purchase-history'
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
import { usePublicClient as useLotteryPublicClient } from 'wagmi'
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2'

const pulseUrl = (tx: string) => `https://scan.pulsechain.box/tx/${tx}`

const ADDON_MULTIPLIER_FLAG = 1 << 0
const ADDON_BULLSEYE_FLAG = 1 << 1
const ADDON_PLUS3_FLAG = 1 << 2
const ADDON_PROGRESSIVE_FLAG = 1 << 3

const formatTime = (iso: string | number | null | undefined) => {
  if (!iso) return '—'
  const d = typeof iso === 'number' ? new Date(iso) : new Date(iso)
  return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
}

export default function LotteryPurchaseShowcase() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const lotteryClient = useLotteryPublicClient()

  // Lottery data hooks
  const { data: lifetimeData } = usePlayerLifetime(address)
  const { data: roundHistoryData } = usePlayerRoundHistory(address, 0, 25)

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
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const loadLotteryPurchases = useCallback(async () => {
    if (!lotteryClient || !address) {
      setLotteryEntries([])
      return
    }
    try {
      const entries: PurchaseEntry[] = []

      // Fetch single-round purchases (TicketsPurchased events)
      const singleRoundEvent = parseAbiItem(
        'event TicketsPurchased(address indexed player,uint256 indexed roundId,uint256 ticketCount,uint256 freeTicketsUsed,uint256 morbiusSpent)'
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
        'event TicketsPurchasedForRounds(address indexed player,uint256[] roundIds,uint256[] ticketCounts,uint256 morbiusSpent)'
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
          const morbiusSpent = BigInt((multiRoundLog.args as any).morbiusSpent ?? 0)

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
            costLabel: `${parseFloat(formatUnits(morbiusSpent, TOKEN_DECIMALS)).toFixed(3)} Morbius`,
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
              const morbiusSpent = BigInt(args.morbiusSpent ?? 0)

              entries.push({
                id: `${roundId}-${txHash}-${log.logIndex?.toString?.() ?? ''}`,
                game: 'Lottery',
                roundLabel: `Round #${roundId}`,
                ticketsLabel: `${ticketCount} tickets`,
                freeTickets: freeUsed,
                addons: [],
                costLabel: `${parseFloat(formatUnits(morbiusSpent, TOKEN_DECIMALS)).toFixed(3)} Morbius`,
                tx: txHash,
                timeLabel: formatTime(ts),
                status: 'Confirmed',
              })
            }
          }
        }
      }

      setLotteryEntries(entries.reverse())
    } catch (err) {
      console.error('load lottery purchases failed', err)
      setLotteryEntries([])
    }
  }, [lotteryClient, address])

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
  const [kenoSummary, setKenoSummary] = useState<PurchaseSummary | undefined>(undefined)

  useEffect(() => {
    const loadKeno = async () => {
      if (!publicClient || !address) {
        setKenoEntries([])
        setKenoSummary(undefined)
        return
      }
      try {
        const event = parseAbiItem(
          'event TicketPurchased(address indexed player,uint256 indexed ticketId,uint256 indexed firstRoundId,uint8 draws,uint8 spotSize,uint16 addons,uint256 wagerPerDraw,uint256 grossCost)'
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
          const addonsMask = Number(log.args?.addons ?? 0)
          const grossCost = BigInt(log.args?.grossCost ?? 0)
          totalGross += grossCost

          const block =
            log.blockNumber !== undefined
              ? await publicClient.getBlock({ blockNumber: log.blockNumber as any })
              : null
          const ts = block?.timestamp ? Number(block.timestamp) * 1000 : null

          const addons: string[] = []
          if ((addonsMask & ADDON_MULTIPLIER_FLAG) !== 0) addons.push('Multiplier')
          if ((addonsMask & ADDON_BULLSEYE_FLAG) !== 0) addons.push('Bulls-Eye')
          if ((addonsMask & ADDON_PLUS3_FLAG) !== 0) addons.push('Plus3')
          if ((addonsMask & ADDON_PROGRESSIVE_FLAG) !== 0) addons.push('Progressive')

          entries.push({
            id: ticketId ? ticketId.toString() : `${firstRoundId}-${draws}-${Math.random()}`,
            game: 'Keno',
            roundLabel: draws > 1 ? `Rounds ${firstRoundId}→${firstRoundId + draws - 1}` : `Round ${firstRoundId}`,
            ticketsLabel: ticketId ? `Ticket #${ticketId.toString()}` : `${draws} draws`,
            freeTickets: 0,
            addons,
            costLabel: `${parseFloat(formatUnits(grossCost, TOKEN_DECIMALS)).toFixed(3)} Morbius`,
            tx: log.transactionHash as string,
            timeLabel: ts ? new Date(ts).toLocaleString() : '—',
            status: 'Confirmed',
          })
        }

        setKenoEntries(entries.reverse())
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

  return (
    <div className="min-h-screen text-white bg-[linear-gradient(rgba(6,1,30,0.92),rgba(3,7,18,0.92)),url('/morbius/Morbiusbg.png')] bg-cover bg-center bg-fixed">
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
        <PlayerPurchaseHistory
          title="Lottery Player Statistics"
          summary={lotterySummary}
          entries={lotteryEntries}
          onRefresh={refetchPurchases}
        />
        <PlayerPurchaseHistory title="Keno Player Statistics" summary={kenoSummary} entries={kenoEntries} pulseUrl={pulseUrl} />
      </div>
    </div>
  )
}
