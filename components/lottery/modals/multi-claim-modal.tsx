'use client'

import { useState, useMemo, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { formatUnits } from 'viem'
import { TOKEN_DECIMALS, LOTTERY_ADDRESS } from '@/lib/contracts'
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2'
import { usePlayerRoundHistory, useRound, usePlayerTickets } from '@/hooks/use-lottery-6of55'
import { toast } from 'sonner'
import { Loader2, Coins, CheckCircle2, History, XCircle } from 'lucide-react'
import { cn, triggerSuccessConfetti } from '@/lib/utils'

interface Ticket {
  ticketId: bigint
  numbers: readonly number[]
  isFreeTicket: boolean
}

interface ClaimableRound {
  roundId: number
  tickets: number
  amount: bigint
  winningNumbers?: number[]
  userTickets?: Ticket[]
  ticketMatches?: number[]
}

interface RoundHistory {
  roundId: number
  tickets: number
  amount: bigint
  hasClaimed: boolean
  status: 'claimed' | 'claimable' | 'no-win'
  transactionHash?: string
}

interface MultiClaimModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

// Utility functions for transaction hash storage
const getStoredTransactionHashes = (address: string) => {
  try {
    const stored = localStorage.getItem(`lottery_claims_${address}`)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

const storeTransactionHash = (address: string, roundId: number, hash: string) => {
  try {
    const stored = getStoredTransactionHashes(address)
    stored[roundId] = hash
    localStorage.setItem(`lottery_claims_${address}`, JSON.stringify(stored))
  } catch (error) {
    console.warn('Failed to store transaction hash:', error)
  }
}

export function MultiClaimModal({ open, onOpenChange }: MultiClaimModalProps = {}) {
  const { address } = useAccount()
  const { data: roundHistoryData, isLoading: isLoadingHistory } = usePlayerRoundHistory(address, 0, 100)
  const [selectedRounds, setSelectedRounds] = useState<Set<number>>(new Set())
  const [isClaiming, setIsClaiming] = useState(false)
  const [singleRoundId, setSingleRoundId] = useState('')
  const [isClaimingSingle, setIsClaimingSingle] = useState(false)
  const [claimedRounds, setClaimedRounds] = useState<Set<number>>(new Set())
  const [fullHistory, setFullHistory] = useState<RoundHistory[]>([])
  const [isLoadingFullHistory, setIsLoadingFullHistory] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set())
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  // Fetch claimed status for ALL rounds and build full history
  useEffect(() => {
    if (!publicClient || !address || !roundHistoryData || !Array.isArray(roundHistoryData)) return

    const checkClaimedStatus = async () => {
      setIsLoadingFullHistory(true)
      console.log('🔄 Starting claim status check...')
      const [ids, tickets, wins] = roundHistoryData as [bigint[], bigint[], bigint[]]
      const claimed = new Set<number>()
      const history: RoundHistory[] = []

      // Process rounds in batches to avoid overwhelming the network
      const BATCH_SIZE = 10
      for (let batchStart = 0; batchStart < ids.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, ids.length)
        const batchPromises = []

        // Prepare batch of contract calls
        for (let i = batchStart; i < batchEnd; i++) {
          const roundId = Number(ids[i])
          const amount = wins[i] || BigInt(0)
          const ticketCount = Number(tickets[i])

          if (roundId > 0 && amount > 0) {
            batchPromises.push(
              publicClient.readContract({
                address: LOTTERY_ADDRESS as `0x${string}`,
                abi: LOTTERY_6OF55_V2_ABI,
                functionName: 'hasClaimed',
                args: [BigInt(roundId), address],
              }).then((result: unknown) => ({
                roundId,
                amount,
                ticketCount,
                hasClaimed: result as boolean
              })).catch((error) => {
                console.warn(`Error checking claim status for round ${roundId}:`, error)
                return {
                  roundId,
                  amount,
                  ticketCount,
                  hasClaimed: false // Assume not claimed on error
                }
              })
            )
          }
        }

        // Wait for this batch to complete
        const batchResults = await Promise.all(batchPromises)

        // Process batch results
        for (const result of batchResults) {
          const { roundId, amount, ticketCount, hasClaimed } = result

          let status: 'claimed' | 'claimable' | 'no-win'
          if (amount === BigInt(0)) {
            status = 'no-win'
          } else if (hasClaimed) {
            status = 'claimed'
            claimed.add(roundId)
          } else {
            status = 'claimable'
          }

          history.push({
            roundId,
            tickets: ticketCount,
            amount,
            hasClaimed,
            status,
          })
        }

        // Small delay between batches to avoid rate limiting
        if (batchEnd < ids.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      // Add transaction hashes from localStorage
      const storedHashes = address ? getStoredTransactionHashes(address) : {}
      const historyWithHashes = history.map(round => ({
        ...round,
        transactionHash: storedHashes[round.roundId] || undefined
      }))

      setClaimedRounds(claimed)
      setFullHistory(historyWithHashes.reverse()) // Most recent first
      setIsLoadingFullHistory(false)

      console.log('✅ Claim status check complete:', {
        totalRounds: history.length,
        claimedRounds: Array.from(claimed),
        claimableRounds: history.filter(h => h.status === 'claimable').length,
        noWinRounds: history.filter(h => h.status === 'no-win').length,
      })
    }

    checkClaimedStatus()
  }, [publicClient, address, roundHistoryData])

  // Fetch claimed status for all rounds
  const claimableRounds = useMemo(() => {
    if (!roundHistoryData || !Array.isArray(roundHistoryData) || roundHistoryData.length < 3) {
      console.log('❌ No roundHistoryData or invalid format')
      return []
    }

    // Use the fullHistory data if available, as it has more accurate claim status
    if (fullHistory.length > 0) {
      const claimable = fullHistory
        .filter(round => round.status === 'claimable')
        .map(round => ({
          roundId: round.roundId,
          tickets: round.tickets,
          amount: round.amount
        }))
        .reverse() // Most recent first

      console.log('✅ Claimable rounds from fullHistory:', claimable.map(r => ({
        roundId: r.roundId,
        amount: r.amount.toString()
      })))

      return claimable
    }

    // Fallback to basic filtering if fullHistory isn't ready yet
    const [ids, tickets, wins] = roundHistoryData as [bigint[], bigint[], bigint[]]
    console.log('📊 Raw round history (fallback):', {
      ids: ids.map(id => Number(id)),
      tickets: tickets.map(t => Number(t)),
      wins: wins.map(w => w.toString())
    })

    const filtered = ids.map((id, i) => ({
      roundId: Number(id),
      tickets: Number(tickets[i]),
      amount: wins[i] || BigInt(0)
    }))
      .filter(r => r.amount > 0 && r.roundId > 0 && !claimedRounds.has(r.roundId))
      .reverse()

    console.log('✅ Filtered claimable rounds (fallback):', filtered.map(r => ({
      roundId: r.roundId,
      amount: r.amount.toString(),
      claimed: claimedRounds.has(r.roundId)
    })))

    return filtered
  }, [roundHistoryData, claimedRounds, fullHistory])

  const totalSelected = useMemo(() => {
    return Array.from(selectedRounds).reduce((total, roundId) => {
      const round = claimableRounds.find(r => r.roundId === roundId)
      return total + (round?.amount || BigInt(0))
    }, BigInt(0))
  }, [selectedRounds, claimableRounds])

  const fmt = (amount: bigint) =>
    parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })

  // Helper function to count matches between user numbers and winning numbers
  const countMatches = (userNumbers: number[], winningNumbers: number[]): number => {
    if (!userNumbers || !winningNumbers) return 0
    return userNumbers.filter(num => winningNumbers.includes(num)).length
  }

  const toggleRound = (roundId: number) => {
    const newSelected = new Set(selectedRounds)
    if (newSelected.has(roundId)) {
      newSelected.delete(roundId)
    } else {
      newSelected.add(roundId)
    }
    setSelectedRounds(newSelected)
  }

  const toggleExpanded = (roundId: number) => {
    const newExpanded = new Set(expandedRounds)
    if (newExpanded.has(roundId)) {
      newExpanded.delete(roundId)
    } else {
      newExpanded.add(roundId)
    }
    setExpandedRounds(newExpanded)
  }

  const selectAll = () => {
    setSelectedRounds(new Set(claimableRounds.map(r => r.roundId)))
  }

  const clearAll = () => {
    setSelectedRounds(new Set())
  }

  const handleClaimAll = async () => {
    if (claimableRounds.length === 0) return

    // Select all claimable rounds - we already verified these are claimable
    const allRounds = new Set(claimableRounds.map(round => round.roundId))
    setSelectedRounds(allRounds)

    // Claim them directly
    await handleClaim()
  }

  const handleClaim = async () => {
    if (!walletClient || !publicClient || selectedRounds.size === 0) return

    setIsClaiming(true)

    try {
      const roundIds = Array.from(selectedRounds).sort((a, b) => a - b)

      // Split rounds into batches of 50 (contract limit)
      const BATCH_SIZE = 50
      const batches = []
      for (let i = 0; i < roundIds.length; i += BATCH_SIZE) {
        batches.push(roundIds.slice(i, i + BATCH_SIZE))
      }

      const successfulClaims = []
      const failedBatches = []
      let totalAmount = BigInt(0)

      // Process each batch
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]

        try {
          if (batches.length > 1) {
            toast.info(`Processing batch ${batchIndex + 1} of ${batches.length}... (${batch.length} rounds)`)
          }

          const { request } = await publicClient.simulateContract({
            address: LOTTERY_ADDRESS as `0x${string}`,
            abi: LOTTERY_6OF55_V2_ABI,
            functionName: 'claimWinningsMultiple',
            args: [batch],
            account: address,
          })

          const hash = await walletClient.writeContract(request)

          // Calculate amount for this batch
          const batchAmount = claimableRounds
            .filter(round => batch.includes(round.roundId))
            .reduce((total, round) => total + round.amount, BigInt(0))

          totalAmount += batchAmount

          toast.success(`Transaction sent! Claiming ${fmt(batchAmount)} MORBIUS from ${batch.length} round${batch.length > 1 ? 's' : ''}...`)
          triggerSuccessConfetti()

          try {
            // Wait for transaction with a longer timeout and retry logic
            await publicClient.waitForTransactionReceipt({
              hash,
              timeout: 120000, // 2 minutes timeout
              retryCount: 5,
              retryDelay: 2000 // 2 second retry delay
            })

            successfulClaims.push({ batch, hash, amount: batchAmount })

            // Store transaction hashes for each claimed round in this batch
            if (address) {
              batch.forEach(roundId => {
                storeTransactionHash(address, roundId, hash)
              })
            }

          } catch (receiptError: any) {
            console.warn(`Batch ${batchIndex + 1} transaction sent but receipt not found:`, receiptError)
            failedBatches.push({ batch, hash, error: receiptError })
          }

        } catch (batchError: any) {
          console.error(`Failed to process batch ${batchIndex + 1}:`, batchError)

          // If the error indicates the round was already claimed, remove it from consideration
          if (batchError.message && batchError.message.includes('already claimed')) {
            toast.warning(`Some rounds in batch ${batchIndex + 1} were already claimed`)
          } else {
            failedBatches.push({ batch, error: batchError })
          }
        }
      }

      // Show final results
      if (successfulClaims.length > 0) {
        const totalRounds = successfulClaims.reduce((sum, claim) => sum + claim.batch.length, 0)
        const allHashes = successfulClaims.map(claim => claim.hash)

        toast.success(
          <div className="flex flex-col gap-2">
            <div>Claim successful! {fmt(totalAmount)} MORBIUS claimed from {totalRounds} round{totalRounds > 1 ? 's' : ''} across {successfulClaims.length} transaction{successfulClaims.length > 1 ? 's' : ''}</div>
            {allHashes.length === 1 ? (
              <div className="text-xs opacity-75 break-all">
                Txn: <a
                  href={`https://scan.pulsechain.com/tx/${allHashes[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                >
                  {allHashes[0]}
                </a>
              </div>
            ) : (
              <div className="text-xs opacity-75">
                Transactions: {allHashes.map((hash, idx) => (
                  <a
                    key={idx}
                    href={`https://scan.pulsechain.com/tx/${hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:no-underline mr-2"
                  >
                    {idx + 1}
                  </a>
                ))}
              </div>
            )}
          </div>,
          { duration: 10000 }
        )
        triggerSuccessConfetti()
      }

      if (failedBatches.length > 0) {
        toast.error(`Failed to claim ${failedBatches.reduce((sum, failed) => sum + (failed.batch?.length || 0), 0)} rounds. Some claims may be pending.`)
      }

      // Reset selection and refresh data if any claims succeeded
      if (successfulClaims.length > 0) {
        setSelectedRounds(new Set())

        // Instead of full reload, just refresh the round history data
        // This is less disruptive than a full page reload
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      }

    } catch (error: any) {
      console.error('Claim failed:', error)

      let errorMessage = "Transaction failed"
      if (error.message) {
        if (error.message.includes('rejected')) {
          errorMessage = "Transaction was rejected by your wallet"
        } else if (error.message.includes('insufficient funds')) {
          errorMessage = "Insufficient PLS for gas fees"
        } else if (error.message.includes('network')) {
          errorMessage = "Network error - please check your connection"
        } else if (error.message.includes('timeout')) {
          errorMessage = "Transaction timed out - it may still be processing"
        } else {
          errorMessage = error.message
        }
      }

      toast.error(`Claim Failed: ${errorMessage}`)
    } finally {
      setIsClaiming(false)
    }
  }

  const handleSingleClaim = async () => {
    if (!walletClient || !publicClient || !singleRoundId) return

    setIsClaimingSingle(true)

    try {
      const parsedRoundId = BigInt(singleRoundId)

      // Check if already claimed
      const hasClaimed = await publicClient.readContract({
        address: LOTTERY_ADDRESS as `0x${string}`,
        abi: LOTTERY_6OF55_V2_ABI,
        functionName: 'hasClaimed',
        args: [parsedRoundId, address],
      }) as boolean

      if (hasClaimed) {
        toast.error(`Round #${singleRoundId} has already been claimed`)
        setIsClaimingSingle(false)
        return
      }

      // Get the claimable amount first
      const claimableAmount = await publicClient.readContract({
        address: LOTTERY_ADDRESS as `0x${string}`,
        abi: LOTTERY_6OF55_V2_ABI,
        functionName: 'getClaimableWinnings',
        args: [parsedRoundId, address],
      }) as bigint

      if (claimableAmount === BigInt(0)) {
        toast.error(`No winnings to claim for Round #${singleRoundId}`)
        setIsClaimingSingle(false)
        return
      }

      const { request } = await publicClient.simulateContract({
        address: LOTTERY_ADDRESS as `0x${string}`,
        abi: LOTTERY_6OF55_V2_ABI,
        functionName: 'claimWinnings',
        args: [parsedRoundId],
        account: address,
      })

      const hash = await walletClient.writeContract(request)

      toast.success(`Transaction sent! Claiming ${fmt(claimableAmount)} MORBIUS from Round #${singleRoundId}...`)
      triggerSuccessConfetti()

      try {
        // Wait for transaction with a longer timeout and retry logic
        await publicClient.waitForTransactionReceipt({
          hash,
          timeout: 120000, // 2 minutes timeout
          retryCount: 5,
          retryDelay: 2000 // 2 second retry delay
        })

        toast.success(
          <div className="flex flex-col gap-2">
            <div>Claim successful! {fmt(claimableAmount)} MORBIUS claimed from Round #{singleRoundId}</div>
            <div className="text-xs opacity-75 break-all">
              Txn: <a
                href={`https://scan.pulsechain.com/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline"
              >
                {hash}
              </a>
            </div>
          </div>,
          { duration: 8000 }
        )
        triggerSuccessConfetti()

        // Store transaction hash for the claimed round
        if (address && singleRoundId) {
          storeTransactionHash(address, parseInt(singleRoundId), hash)
        }

        // Reset form and refresh data
        setSingleRoundId('')
        window.location.reload()

      } catch (receiptError: any) {
        console.warn('Transaction sent but receipt not found yet:', receiptError)

        // Transaction was sent successfully, show success with warning
        toast.success(
          <div className="flex flex-col gap-2">
            <div>Transaction sent successfully! Your claim may take a few minutes to process on PulseChain.</div>
            <div className="text-xs opacity-75 break-all">
              Txn: <a
                href={`https://scan.pulsechain.com/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline"
              >
                {hash}
              </a>
            </div>
          </div>,
          { duration: 8000 }
        )
        triggerSuccessConfetti()

        // Reset form even if receipt isn't found
        setSingleRoundId('')

        // Still reload to refresh the UI
        setTimeout(() => window.location.reload(), 3000)
      }

    } catch (error: any) {
      console.error('Single claim failed:', error)

      let errorMessage = "Transaction failed"
      if (error.message) {
        if (error.message.includes('rejected')) {
          errorMessage = "Transaction was rejected by your wallet"
        } else if (error.message.includes('insufficient funds')) {
          errorMessage = "Insufficient PLS for gas fees"
        } else if (error.message.includes('network')) {
          errorMessage = "Network error - please check your connection"
        } else if (error.message.includes('already claimed')) {
          errorMessage = "This round has already been claimed"
        } else {
          errorMessage = error.message
        }
      }

      toast.error(`Claim Failed: ${errorMessage}`)
    } finally {
      setIsClaimingSingle(false)
    }
  }

  const totalClaimable = claimableRounds.reduce((total, round) => total + round.amount, BigInt(0))

  // Component for detailed round information
  const RoundDetails = ({ round }: { round: ClaimableRound }) => {
    const { data: roundData, isLoading: isLoadingRound } = useRound(round.roundId)
    const { data: userTickets, isLoading: isLoadingTickets } = usePlayerTickets(round.roundId, address)

    if (isLoadingRound || isLoadingTickets) {
      return (
        <div className="mt-2 p-3 bg-gradient-to-br from-slate-950 to-slate-900/20 rounded border border-white/10">
          <div className="flex items-center gap-2 text-white/60">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading round details...
          </div>
        </div>
      )
    }

    // Extract winning numbers from round data - the contract returns an object with winningNumbers as property
    const winningNumbers = roundData && typeof roundData === 'object' && 'winningNumbers' in roundData
      ? (roundData as any).winningNumbers
      : undefined
    const tickets = userTickets || []

    return (
      <div className="mt-2 p-3 bg-gradient-to-br from-slate-950 to-slate-900/20 rounded border border-white/10 space-y-2">
        {/* Winning Numbers */}
        {winningNumbers && Array.isArray(winningNumbers) && (
          <div className="text-xs">
            <div className="text-white/70 font-medium mb-1">Winning Numbers:</div>
            <div className="flex gap-1 flex-wrap">
              {winningNumbers.map((num: number, idx: number) => (
                <span key={idx} className="inline-flex items-center justify-center w-6 h-6 bg-yellow-500/20 text-yellow-300 text-xs font-bold rounded border border-yellow-500/30">
                  {num}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* User Tickets */}
        {Array.isArray(tickets) && tickets.length > 0 && (
          <div className="text-xs">
            <div className="text-white/70 font-medium mb-1">Your Tickets:</div>
            <div className="space-y-1">
              {tickets.map((ticket, idx) => {
                const ticketNumbers = Array.from(ticket.numbers as number[])
                const matches = countMatches(ticketNumbers, Array.isArray(winningNumbers) ? winningNumbers : [])
                const isWinner = matches > 0
                return (
                  <div key={ticket.ticketId.toString()} className="flex items-center gap-2">
                    <span className="text-white/60">#{idx + 1}:</span>
                    <div className="flex gap-1 flex-wrap">
                      {ticketNumbers.map((num: number, numIdx: number) => {
                        const isMatch = Array.isArray(winningNumbers) && winningNumbers.includes(num)
                        return (
                          <span
                            key={numIdx}
                            className={cn(
                              "inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded border",
                              isMatch
                                ? "bg-green-500/20 text-green-300 border-green-500/30"
                                : "bg-white/10 text-white/70 border-white/20"
                            )}
                          >
                            {num}
                          </span>
                        )
                      })}
                    </div>
                    <span className={cn(
                      "text-xs font-medium",
                      isWinner ? "text-green-400" : "text-white/60"
                    )}>
                      ({matches} match{matches !== 1 ? 'es' : ''})
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!open && !onOpenChange && (
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="text-white w-full h-10 p-0 text-xs sm:text-sm hover:opacity-80"
            style={{
              background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
              border: '1px inset rgba(60, 60, 60, 0.5)',
            }}
            title="Claim Winnings"
          >
            Claim
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="group/bento shadow-input row-span-1 flex flex-col justify-between space-y-4 rounded-xl border border-neutral-200 bg-white p-4 transition duration-200 hover:shadow-xl dark:border-white/[0.2] dark:bg-gradient-to-br from-slate-950 to-slate-900 dark:shadow-none max-w-md max-h-[80vh]">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Coins className="w-6 h-6 text-neutral-600 dark:text-neutral-200" />
            <div className="font-sans font-bold text-neutral-600 dark:text-neutral-200 text-xl">
              Claim Winnings
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.reload()}
            className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            title="Refresh data"
          >
            <History className="w-4 h-4" />
          </Button>
        </div>

        {!address ? (
          <div className="text-center text-sm text-neutral-600 dark:text-neutral-300 py-8">Connect wallet to claim winnings</div>
        ) : isLoadingHistory || isLoadingFullHistory ? (
          <div className="flex flex-col items-center justify-center gap-3 text-sm text-neutral-600 dark:text-neutral-300 py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
            <div className="text-center">
              <div className="font-medium">Loading your winnings...</div>
              <div className="text-xs opacity-75 mt-1">Checking claim status across all rounds</div>
            </div>
          </div>
        ) : claimableRounds.length === 0 ? (
          <div className="text-center">
            <div className="text-sm text-neutral-600 dark:text-neutral-300 mb-4">
              {isLoadingFullHistory ? "Checking for winnings..." : "No winnings available to claim"}
            </div>
            {!isLoadingFullHistory && (
              <div className="space-y-3">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Make sure you're connected to PulseChain and try refreshing if you believe you have unclaimed winnings.
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowAdvanced(true)}
                  className="border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                >
                  View History
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Total Winnings Summary */}
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400 font-sans mb-1">
                {fmt(totalClaimable)} MORBIUS
              </div>
              <div className="text-sm text-neutral-600 dark:text-neutral-400 font-sans">
                Available to claim from {claimableRounds.length} round{claimableRounds.length !== 1 ? 's' : ''}
              </div>
              {isLoadingFullHistory && (
                <div className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  Verifying claim status...
                </div>
              )}
            </div>

            {/* Claim All Button */}
            <Button
              onClick={handleClaimAll}
              disabled={isClaiming}
              className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white font-bold text-lg py-3 font-sans"
            >
              {isClaiming ? (
                <>
                  <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Coins className="w-5 h-5 mr-3" />
                  Claim All Winnings
                </>
              )}
            </Button>

            {/* Advanced Options */}
            <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4">
              <Button
                variant="ghost"
                onClick={() => setShowAdvanced(true)}
                className="w-full text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 font-sans"
              >
                <History className="w-4 h-4 mr-2" />
                Advanced Options
              </Button>
            </div>
          </div>
        )}

        {/* Advanced Modal */}
        {showAdvanced && (
          <Dialog open={showAdvanced} onOpenChange={setShowAdvanced}>
            <DialogContent className="group/bento shadow-input row-span-1 flex flex-col justify-between space-y-4 rounded-xl border border-neutral-200 bg-white p-4 transition duration-200 hover:shadow-xl dark:border-white/[0.2] dark:bg-gradient-to-br from-slate-950 to-slate-900 dark:shadow-none max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center gap-3 mb-4">
                <History className="w-5 h-5 text-neutral-600 dark:text-neutral-200" />
                <div className="font-sans font-bold text-neutral-600 dark:text-neutral-200 text-lg">
                  Advanced Claim Options
                </div>
              </div>

              <Tabs defaultValue="claimable" className="w-full flex-1 flex flex-col min-h-0">
                <TabsList className="w-full grid grid-cols-2 bg-neutral-100 dark:bg-neutral-800/50 mx-4" style={{ width: 'calc(100% - 2rem)' }}>
                  <TabsTrigger value="claimable" className="data-[state=active]:bg-green-600/20 data-[state=active]:text-green-400 font-sans text-neutral-600 dark:text-neutral-200">
                    <Coins className="w-3 h-3 mr-2" />
                    Claimable ({claimableRounds.length})
                  </TabsTrigger>
                  <TabsTrigger value="history" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400 font-sans text-neutral-600 dark:text-neutral-200">
                    <History className="w-3 h-3 mr-2" />
                    History ({fullHistory.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="claimable" className="mt-0 flex-1 flex flex-col min-h-0">
                  {claimableRounds.length === 0 ? (
                    <div className="text-center text-xs text-neutral-600 dark:text-neutral-300 flex-1 py-8">No winnings to claim</div>
                  ) : (
                    <>
                      <div className="overflow-y-auto max-h-[calc(85vh-200px)] flex-1">
                        {/* Quick Single Claim */}
                        <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800/30 border-b border-neutral-200 dark:border-neutral-700">
                          <div className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-3 uppercase tracking-wide font-sans">Quick Claim</div>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <Label htmlFor="quick-claim-round" className="text-xs text-neutral-600 dark:text-neutral-300 font-sans">Round ID</Label>
                              <Input
                                id="quick-claim-round"
                                value={singleRoundId}
                                onChange={(e) => setSingleRoundId(e.target.value)}
                                placeholder="42"
                                type="number"
                                className="bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 text-sm h-8 mt-1"
                              />
                            </div>
                            <div className="flex items-end">
                              <Button
                                onClick={handleSingleClaim}
                                disabled={!singleRoundId || isClaimingSingle}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3 font-sans"
                              >
                                {isClaimingSingle ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  'Claim'
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Summary */}
                        <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800/30 border-b border-neutral-200 dark:border-neutral-700">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs text-neutral-600 dark:text-neutral-300 font-sans">Total Claimable</div>
                            <div className="text-sm font-bold text-green-600 dark:text-green-400 font-sans">{fmt(totalClaimable)} MORBIUS</div>
                          </div>
                          {selectedRounds.size > 0 && (
                            <div className="flex items-center justify-between">
                              <div className="text-xs text-neutral-600 dark:text-neutral-300 font-sans">Selected to Claim</div>
                              <div className="text-sm font-bold text-yellow-600 dark:text-yellow-400 font-sans">{fmt(totalSelected)} MORBIUS</div>
                            </div>
                          )}
                        </div>

                        {/* Selection Controls */}
                        <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={selectAll}
                            className="text-xs h-6 px-2 text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-sans"
                            disabled={selectedRounds.size === claimableRounds.length}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearAll}
                            className="text-xs h-6 px-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-500 dark:hover:text-neutral-300 font-sans"
                            disabled={selectedRounds.size === 0}
                          >
                            Clear All
                          </Button>
                          <div className="text-xs text-neutral-600 dark:text-neutral-400 ml-auto font-sans">
                            {selectedRounds.size} of {claimableRounds.length} selected
                          </div>
                        </div>

                        {/* Rounds List */}
                        <div className="px-4 py-2">
                          <div className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-3 uppercase tracking-wide font-sans">Claimable Rounds</div>
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {claimableRounds.map((round) => (
                              <div key={round.roundId}>
                                <div
                                  className={cn(
                                    "flex items-center gap-3 p-3 rounded border transition-colors cursor-pointer",
                                    selectedRounds.has(round.roundId)
                                      ? "bg-yellow-500/10 border-yellow-500/30 dark:bg-yellow-500/5 dark:border-yellow-500/20"
                                      : "bg-neutral-50 dark:bg-neutral-800/20 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800/40"
                                  )}
                                  onClick={() => toggleRound(round.roundId)}
                                >
                                  <Checkbox
                                    checked={selectedRounds.has(round.roundId)}
                                    onChange={() => toggleRound(round.roundId)}
                                    className="border-neutral-300 dark:border-neutral-600 data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <div className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">Round #{round.roundId}</div>
                                      <div className="text-xs text-neutral-600 dark:text-neutral-400 font-sans">({round.tickets} ticket{round.tickets !== 1 ? 's' : ''})</div>
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 p-1 h-6 w-6 font-sans"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleExpanded(round.roundId)
                                    }}
                                  >
                                    {expandedRounds.has(round.roundId) ? '−' : '+'}
                                  </Button>
                                  <div className="text-sm font-bold text-green-600 dark:text-green-400 font-sans">
                                    {fmt(round.amount)} MORBIUS
                                  </div>
                                </div>

                                {/* Expanded Details */}
                                {expandedRounds.has(round.roundId) && (
                                  <RoundDetails round={round} />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Fixed footer with claim button - always visible */}
                      <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/30 flex-shrink-0">
                        <Button
                          onClick={handleClaim}
                          disabled={selectedRounds.size === 0 || isClaiming}
                          className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white font-bold font-sans"
                        >
                          {isClaiming ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Claiming...
                            </>
                          ) : (
                            <>
                              <Coins className="w-4 h-4 mr-2" />
                              Claim {selectedRounds.size} Round{selectedRounds.size !== 1 ? 's' : ''} ({fmt(totalSelected)} MORBIUS)
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="history" className="mt-0 flex-1 flex flex-col min-h-0">
                  {isLoadingFullHistory ? (
                    <div className="px-4 py-8 flex items-center justify-center gap-2 text-xs text-neutral-600 dark:text-neutral-300 flex-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading history...
                    </div>
                  ) : fullHistory.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-neutral-600 dark:text-neutral-300 flex-1">No rounds found</div>
                  ) : (
                    <div className="overflow-y-auto max-h-[calc(85vh-160px)] px-4 py-3 flex-1">
                      <div className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-3 uppercase tracking-wide font-sans">Claim History</div>
                      <div className="space-y-2">
                        {fullHistory.map((round) => (
                          <div
                            key={round.roundId}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded border",
                              round.status === 'claimed'
                                ? "bg-blue-500/10 border-blue-500/30 dark:bg-blue-500/5 dark:border-blue-500/20"
                                : round.status === 'claimable'
                                ? "bg-green-500/10 border-green-500/30 dark:bg-green-500/5 dark:border-green-500/20"
                                : "bg-neutral-100 dark:bg-neutral-800/20 border-neutral-200 dark:border-neutral-700"
                            )}
                          >
                            <div className="flex-shrink-0">
                              {round.status === 'claimed' && (
                                <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                              )}
                              {round.status === 'claimable' && (
                                <Coins className="w-5 h-5 text-green-600 dark:text-green-400" />
                              )}
                              {round.status === 'no-win' && (
                                <XCircle className="w-5 h-5 text-neutral-500 dark:text-neutral-400" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <div className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">Round #{round.roundId}</div>
                                <div className="text-xs text-neutral-600 dark:text-neutral-400 font-sans">({round.tickets} ticket{round.tickets !== 1 ? 's' : ''})</div>
                              </div>
                              <div className="text-xs mt-0.5 font-sans">
                                {round.status === 'claimed' && (
                                  <span className="text-blue-600 dark:text-blue-400">✓ Claimed</span>
                                )}
                                {round.status === 'claimable' && (
                                  <span className="text-green-600 dark:text-green-400">• Ready to Claim</span>
                                )}
                                {round.status === 'no-win' && (
                                  <span className="text-neutral-600 dark:text-neutral-400">No Winnings</span>
                                )}
                              </div>
                              {/* Transaction Hash for claimed rounds */}
                              {round.status === 'claimed' && round.transactionHash && (
                                <div className="text-xs mt-1 font-mono text-neutral-500 dark:text-neutral-500 break-all">
                                  <a
                                    href={`https://scan.pulsechain.com/tx/${round.transactionHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline hover:no-underline"
                                  >
                                    {round.transactionHash.slice(0, 10)}...{round.transactionHash.slice(-8)}
                                  </a>
                                </div>
                              )}
                            </div>
                            <div className={cn(
                              "text-sm font-bold font-sans",
                              round.status === 'claimed' ? "text-blue-600 dark:text-blue-400" :
                              round.status === 'claimable' ? "text-green-600 dark:text-green-400" :
                              "text-neutral-600 dark:text-neutral-400"
                            )}>
                              {round.amount > 0 ? fmt(round.amount) : '0'} MORBIUS
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  )
}

