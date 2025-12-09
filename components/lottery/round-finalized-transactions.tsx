'use client'

import { useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { ExternalLink, Loader2 } from 'lucide-react'
import { LOTTERY_ADDRESS, LOTTERY_DEPLOY_BLOCK } from '@/lib/contracts'
import { LOTTERY_6OF55_ABI } from '@/abi/lottery6of55'
import { formatUnits, decodeEventLog } from 'viem'

interface RoundFinalizedTx {
  roundId: bigint
  transactionHash: string
  blockNumber: bigint
  winningNumbers: number[]
  totalPssh: bigint
  totalTickets: bigint
  closingBlock?: bigint
}

export function RoundFinalizedTransactions() {
  const publicClient = usePublicClient()
  const [transactions, setTransactions] = useState<RoundFinalizedTx[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTransactions() {
      if (!publicClient || (LOTTERY_ADDRESS as string).toLowerCase() === '0x0000000000000000000000000000000000000000') {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        // Fetch RoundLocked events (these are what appear on-chain)
        const lockedEventAbi = LOTTERY_6OF55_ABI.find(
          (item: any) => item.type === 'event' && item.name === 'RoundLocked'
        )
        
        // Also try to fetch RoundFinalized events
        const finalizedEventAbi = LOTTERY_6OF55_ABI.find(
          (item: any) => item.type === 'event' && item.name === 'RoundFinalized'
        )

        const txs: RoundFinalizedTx[] = []
        
        // Fetch RoundLocked events
        if (lockedEventAbi) {
          try {
            const lockedLogs = await publicClient.getLogs({
              address: LOTTERY_ADDRESS as `0x${string}`,
              event: lockedEventAbi as any,
              fromBlock: LOTTERY_DEPLOY_BLOCK ? BigInt(LOTTERY_DEPLOY_BLOCK) : 'earliest',
              toBlock: 'latest',
            })

            for (const log of lockedLogs) {
              try {
                const decoded = decodeEventLog({
                  abi: LOTTERY_6OF55_ABI,
                  data: log.data,
                  topics: log.topics,
                })
                
                if (decoded.eventName === 'RoundLocked' && decoded.args) {
                  const args = decoded.args as any
                  txs.push({
                    roundId: args.roundId || BigInt(0),
                    transactionHash: log.transactionHash,
                    blockNumber: log.blockNumber || BigInt(0),
                    winningNumbers: [], // RoundLocked doesn't have winning numbers
                    totalPssh: args.totalPssh || BigInt(0),
                    totalTickets: args.totalTickets || BigInt(0),
                    closingBlock: args.closingBlock || BigInt(0),
                  })
                }
              } catch (err) {
                console.error('Error decoding RoundLocked log:', err)
              }
            }
          } catch (err) {
            console.error('Error fetching RoundLocked events:', err)
          }
        }

        // Also fetch RoundFinalized events to get winning numbers
        if (finalizedEventAbi) {
          try {
            const finalizedLogs = await publicClient.getLogs({
              address: LOTTERY_ADDRESS as `0x${string}`,
              event: finalizedEventAbi as any,
              fromBlock: LOTTERY_DEPLOY_BLOCK ? BigInt(LOTTERY_DEPLOY_BLOCK) : 'earliest',
              toBlock: 'latest',
            })

            // Merge winning numbers into existing transactions
            for (const log of finalizedLogs) {
              try {
                const decoded = decodeEventLog({
                  abi: LOTTERY_6OF55_ABI,
                  data: log.data,
                  topics: log.topics,
                })
                
                if (decoded.eventName === 'RoundFinalized' && decoded.args) {
                  const args = decoded.args as any
                  const roundId = args.roundId || BigInt(0)
                  
                  // Find matching RoundLocked transaction and add winning numbers
                  const existingTx = txs.find(tx => tx.roundId === roundId)
                  if (existingTx) {
                    existingTx.winningNumbers = args.winningNumbers ? Array.from(args.winningNumbers).map((n: any) => Number(n)) : []
                  } else {
                    // If no RoundLocked event found, add the RoundFinalized event
                    txs.push({
                      roundId: roundId,
                      transactionHash: log.transactionHash,
                      blockNumber: log.blockNumber || BigInt(0),
                      winningNumbers: args.winningNumbers ? Array.from(args.winningNumbers).map((n: any) => Number(n)) : [],
                      totalPssh: args.totalPssh || BigInt(0),
                      totalTickets: args.totalTickets || BigInt(0),
                    })
                  }
                }
              } catch (err) {
                console.error('Error decoding RoundFinalized log:', err)
              }
            }
          } catch (err) {
            console.error('Error fetching RoundFinalized events:', err)
          }
        }

        // Sort by roundId descending (newest first)
        txs.sort((a, b) => {
          if (a.roundId > b.roundId) return -1
          if (a.roundId < b.roundId) return 1
          return 0
        })

        setTransactions(txs)
      } catch (err) {
        console.error('Error fetching RoundFinalized transactions:', err)
        setError('Failed to load transactions')
      } finally {
        setIsLoading(false)
      }
    }

    fetchTransactions()
  }, [publicClient])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-white/60" />
        <span className="ml-2 text-sm text-white/60">Loading transactions...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="p-3 bg-black/40 border border-white/10 rounded-lg">
        <p className="text-sm text-white/60">No finalized rounds found yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {transactions.map((tx) => (
        <div
          key={tx.transactionHash}
          className="p-3 bg-black/40 border border-white/10 rounded-lg hover:bg-black/60 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-white">Round #{tx.roundId.toString()}</span>
                {tx.winningNumbers.length > 0 && (
                  <span className="text-xs text-white/60">
                    Numbers: {tx.winningNumbers.join(', ')}
                  </span>
                )}
              </div>
              <div className="text-xs text-white/50 space-y-0.5">
                <div>Block: {tx.blockNumber.toString()}</div>
                <div>
                  {parseFloat(formatUnits(tx.totalPssh, 9)).toLocaleString()} pSSH • {tx.totalTickets.toString()} tickets
                </div>
              </div>
            </div>
            <a
              href={`https://scan.pulsechain.box/tx/${tx.transactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors flex-shrink-0"
              title="View transaction on PulseScan"
            >
              <span className="text-white/80">View</span>
              <ExternalLink className="h-3 w-3 text-white/60" />
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}
