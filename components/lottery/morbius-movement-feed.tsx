'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { formatUnits, decodeEventLog } from 'viem'
import { LOTTERY_ADDRESS, LOTTERY_DEPLOY_BLOCK, TOKEN_DECIMALS } from '@/lib/contracts'
import { LOTTERY_6OF55_ABI } from '@/abi/lottery6of55'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowDownRight, ArrowUpRight, AlertTriangle, Sparkles } from 'lucide-react'

type MovementKind = 'base' | 'rollover' | 'mega'

type MovementItem = {
  roundId: bigint
  blockNumber: bigint
  txHash: string
  label: string
  amount: bigint
  direction: 'in' | 'out'
  kind: MovementKind
  detail?: string
}

const BP_TOTAL = BigInt(10_000)
const MEGA_BP = BigInt(2_000)
const BURN_BP = BigInt(2_000)
const WINNERS_BP = BigInt(6_000)

const formatMORBIUS = (amount: bigint) =>
  parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })

export function MORBIUSMovementFeed() {
  const publicClient = usePublicClient()
  const [items, setItems] = useState<MovementItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const eventAbis = useMemo(() => {
    const findEvent = (name: string) =>
      LOTTERY_6OF55_ABI.find((item: any) => item.type === 'event' && item.name === name)
    return {
      finalized: findEvent('RoundFinalized'),
      rollover: findEvent('UnclaimedPrizeRolledOver'),
      mega: findEvent('MegaMillionsTriggered'),
    }
  }, [])

  useEffect(() => {
    async function load() {
      if (
        !publicClient ||
        (LOTTERY_ADDRESS as string).toLowerCase() === '0x0000000000000000000000000000000000000000'
      ) {
        setIsLoading(false)
        return
      }
      try {
        setIsLoading(true)
        setError(null)
        const movements: MovementItem[] = []
        const fromBlock = LOTTERY_DEPLOY_BLOCK ? BigInt(LOTTERY_DEPLOY_BLOCK) : 'earliest'

        // RoundFinalized: base allocations (winners/burn/mega)
        if (eventAbis.finalized) {
          const logs = await publicClient.getLogs({
            address: LOTTERY_ADDRESS as `0x${string}`,
            event: eventAbis.finalized as any,
            fromBlock,
            toBlock: 'latest',
          })
          for (const log of logs) {
            try {
              const decoded = decodeEventLog({
                abi: LOTTERY_6OF55_ABI,
                data: log.data,
                topics: log.topics,
              })
              if (decoded.eventName !== 'RoundFinalized') continue
              const args = decoded.args as any
              const roundId = args.roundId || BigInt(0)
              const totalMORBIUS: bigint = args.totalMORBIUS || BigInt(0)
              const megaContribution = (totalMORBIUS * MEGA_BP) / BP_TOTAL
              const burnAmount = (totalMORBIUS * BURN_BP) / BP_TOTAL
              const winnersAmount = (totalMORBIUS * WINNERS_BP) / BP_TOTAL

              movements.push(
                {
                  roundId,
                  blockNumber: log.blockNumber || BigInt(0),
                  txHash: log.transactionHash,
                  label: 'Collected this round',
                  amount: totalMORBIUS,
                  direction: 'in',
                  kind: 'base',
                },
                {
                  roundId,
                  blockNumber: log.blockNumber || BigInt(0),
                  txHash: log.transactionHash,
                  label: 'Base to MegaMORBIUS (20%)',
                  amount: megaContribution,
                  direction: 'in',
                  kind: 'base',
                },
                {
                  roundId,
                  blockNumber: log.blockNumber || BigInt(0),
                  txHash: log.transactionHash,
                  label: 'Burned (20%)',
                  amount: burnAmount,
                  direction: 'out',
                  kind: 'base',
                },
                {
                  roundId,
                  blockNumber: log.blockNumber || BigInt(0),
                  txHash: log.transactionHash,
                  label: 'Winners pool (60%)',
                  amount: winnersAmount,
                  direction: 'out',
                  kind: 'base',
                }
              )
            } catch (err) {
              console.error('decode RoundFinalized', err)
            }
          }
        }

        // UnclaimedPrizeRolledOver: add rollovers
        if (eventAbis.rollover) {
          const logs = await publicClient.getLogs({
            address: LOTTERY_ADDRESS as `0x${string}`,
            event: eventAbis.rollover as any,
            fromBlock,
            toBlock: 'latest',
          })
          for (const log of logs) {
            try {
              const decoded = decodeEventLog({
                abi: LOTTERY_6OF55_ABI,
                data: log.data,
                topics: log.topics,
              })
              if (decoded.eventName !== 'UnclaimedPrizeRolledOver') continue
              const args = decoded.args as any
              const roundId = args.roundId || BigInt(0)
              const amount: bigint = args.amount || BigInt(0)
              const destination: string = (args.destination || '').toString()
              const isMega = destination.toLowerCase().includes('mega')
              movements.push({
                roundId,
                blockNumber: log.blockNumber || BigInt(0),
                txHash: log.transactionHash,
                label: `Rollover → ${destination}`,
                amount,
                direction: isMega ? 'in' : 'in',
                kind: 'rollover',
                detail: destination,
              })
            } catch (err) {
              console.error('decode UnclaimedPrizeRolledOver', err)
            }
          }
        }

        // MegaMillionsTriggered: payouts from mega bank
        if (eventAbis.mega) {
          const logs = await publicClient.getLogs({
            address: LOTTERY_ADDRESS as `0x${string}`,
            event: eventAbis.mega as any,
            fromBlock,
            toBlock: 'latest',
          })
          for (const log of logs) {
            try {
              const decoded = decodeEventLog({
                abi: LOTTERY_6OF55_ABI,
                data: log.data,
                topics: log.topics,
              })
              if (decoded.eventName !== 'MegaMillionsTriggered') continue
              const args = decoded.args as any
              const roundId = args.roundId || BigInt(0)
              const bankAmount: bigint = args.bankAmount || BigInt(0)
              const to6: bigint = args.toBracket6 || BigInt(0)
              const to5: bigint = args.toBracket5 || BigInt(0)
              movements.push(
                {
                  roundId,
                  blockNumber: log.blockNumber || BigInt(0),
                  txHash: log.transactionHash,
                  label: 'MegaMORBIUS distributed',
                  amount: bankAmount,
                  direction: 'out',
                  kind: 'mega',
                  detail: `B6: ${formatMORBIUS(to6)} | B5: ${formatMORBIUS(to5)}`,
                }
              )
            } catch (err) {
              console.error('decode MegaMillionsTriggered', err)
            }
          }
        }

        movements.sort((a, b) => {
          if (a.blockNumber === b.blockNumber) return Number(b.roundId - a.roundId)
          return a.blockNumber > b.blockNumber ? -1 : 1
        })
        setItems(movements)
      } catch (err) {
        console.error(err)
        setError('Failed to load MORBIUS movements')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [eventAbis.finalized, eventAbis.mega, eventAbis.rollover, publicClient])

  const totals = useMemo(() => {
    let burned = BigInt(0)
    let megaNet = BigInt(0)
    let winnersOut = BigInt(0)

    for (const item of items) {
      if (item.kind === 'base' && item.label.toLowerCase().includes('burn')) {
        burned += item.amount
      }
      if (item.kind === 'base' && item.label.toLowerCase().includes('mega')) {
        megaNet += item.amount
      }
      if (item.kind === 'rollover' && (item.detail || '').toLowerCase().includes('mega')) {
        megaNet += item.amount
      }
      if (item.kind === 'mega' && item.direction === 'out') {
        megaNet -= item.amount
      }
      if (item.kind === 'base' && item.label.toLowerCase().includes('winners')) {
        winnersOut += item.amount
      }
    }

    return {
      burned,
      megaNet,
      winnersOut,
    }
  }, [items])

  return (
    <Card className="p-6 bg-gradient-to-br from-slate-950 to-slate-900/50 border-white/10">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">MORBIUS Movements</h3>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading movements...
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-white/60">No movements found yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Card className="p-3 bg-gradient-to-br from-slate-950 to-slate-900/60 border-white/10">
              <div className="text-xs text-white/60">Total Burned</div>
              <div className="text-lg font-bold text-white">{formatMORBIUS(totals.burned)} MORBIUS</div>
            </Card>
            <Card className="p-3 bg-gradient-to-br from-slate-950 to-slate-900/60 border-white/10">
              <div className="text-xs text-white/60">Winners Pool Total (60%)</div>
              <div className="text-lg font-bold text-white">{formatMORBIUS(totals.winnersOut)} MORBIUS</div>
            </Card>
            <Card className="p-3 bg-gradient-to-br from-slate-950 to-slate-900/60 border-white/10">
              <div className="text-xs text-white/60">MegaMORBIUS Net</div>
              <div className="text-lg font-bold text-white">{formatMORBIUS(totals.megaNet)} MORBIUS</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-h-[520px] overflow-auto pr-1">
            {items.map((item, idx) => (
              <div
                key={`${item.txHash}-${idx}`}
                className="p-3 bg-gradient-to-br from-slate-950 to-slate-900/40 border border-white/10 rounded-lg flex items-start gap-3"
              >
                <div
                  className={`mt-1 rounded-full p-1 ${
                    item.direction === 'in' ? 'bg-cyan-500/20' : 'bg-red-500/20'
                  }`}
                >
                  {item.direction === 'in' ? (
                    <ArrowDownRight className="h-4 w-4 text-cyan-500" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4 text-red-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white">{item.label}</span>
                    <Badge variant="outline" className="text-[10px]">
                      Round #{item.roundId.toString()}
                    </Badge>
                    {item.detail && <span className="text-xs text-white/60">{item.detail}</span>}
                  </div>
                  <div className="text-sm font-bold text-white">{formatMORBIUS(item.amount)} MORBIUS</div>
                  <div className="text-xs text-white/50">
                    Block {item.blockNumber.toString()} · {item.txHash.slice(0, 10)}…
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

