'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { usePlayerLifetime, usePlayerRoundHistory } from '@/hooks/use-lottery-6of55'
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
    }
  }, [lifetimeData])

  const [lotteryEntries, setLotteryEntries] = useState<PurchaseEntry[]>([])

  useEffect(() => {
    const loadLotteryPurchases = async () => {
      if (!lotteryClient || !address) {
        setLotteryEntries([])
        return
      }
      try {
        const event = parseAbiItem(
          'event TicketsPurchased(address indexed player,uint256 indexed roundId,uint256 ticketCount,uint256 freeTicketsUsed,uint256 morbiusSpent)'
        )
        const logs = await lotteryClient.getLogs({
          address: LOTTERY_ADDRESS as `0x${string}`,
          event,
          args: { player: address },
          fromBlock: BigInt(LOTTERY_DEPLOY_BLOCK),
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

        const entries: PurchaseEntry[] = []
        for (const log of sorted) {
          const roundId = Number(log.args?.roundId ?? 0)
          const ticketCount = Number(log.args?.ticketCount ?? 0)
          const freeUsed = Number(log.args?.freeTicketsUsed ?? 0)
          const morbiusSpent = BigInt(log.args?.morbiusSpent ?? 0)
          const block =
            log.blockNumber !== undefined
              ? await lotteryClient.getBlock({ blockNumber: log.blockNumber as any })
              : null
          const ts = block?.timestamp ? Number(block.timestamp) * 1000 : null

          entries.push({
            id: `${roundId}-${log.transactionHash}-${log.logIndex?.toString?.() ?? ''}`,
            game: 'Lottery',
            roundLabel: `Round #${roundId}`,
            ticketsLabel: `${ticketCount} tickets`,
            freeTickets: freeUsed,
            addons: [],
            costLabel: `${parseFloat(formatUnits(morbiusSpent, TOKEN_DECIMALS)).toFixed(3)} Morbius`,
            tx: log.transactionHash as string,
            timeLabel: formatTime(ts),
            status: 'Confirmed',
          })
        }

        setLotteryEntries(entries.reverse())
      } catch (err) {
        console.error('load lottery purchases failed', err)
        setLotteryEntries([])
      }
    }
    loadLotteryPurchases()
  }, [lotteryClient, address])

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
        <PlayerPurchaseHistory title="Lottery Player Statistics" summary={lotterySummary} entries={lotteryEntries} />
        <PlayerPurchaseHistory title="Keno Player Statistics" summary={kenoSummary} entries={kenoEntries} pulseUrl={pulseUrl} />
      </div>
    </div>
  )
}
