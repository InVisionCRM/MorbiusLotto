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
import { usePlayerRoundHistory } from '@/hooks/use-lottery-6of55'
import { toast } from 'sonner'
import { Loader2, Coins, CheckCircle2, History, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClaimableRound {
  roundId: number
  tickets: number
  amount: bigint
}

interface RoundHistory {
  roundId: number
  tickets: number
  amount: bigint
  hasClaimed: boolean
  status: 'claimed' | 'claimable' | 'no-win'
}

export function MultiClaimModal() {
  const { address } = useAccount()
  const { data: roundHistoryData, isLoading: isLoadingHistory } = usePlayerRoundHistory(address, 0, 100)
  const [selectedRounds, setSelectedRounds] = useState<Set<number>>(new Set())
  const [isClaiming, setIsClaiming] = useState(false)
  const [singleRoundId, setSingleRoundId] = useState('')
  const [isClaimingSingle, setIsClaimingSingle] = useState(false)
  const [claimedRounds, setClaimedRounds] = useState<Set<number>>(new Set())
  const [fullHistory, setFullHistory] = useState<RoundHistory[]>([])
  const [isLoadingFullHistory, setIsLoadingFullHistory] = useState(false)
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  // Fetch claimed status for ALL rounds and build full history
  useEffect(() => {
    if (!publicClient || !address || !roundHistoryData || !Array.isArray(roundHistoryData)) return

    const checkClaimedStatus = async () => {
      setIsLoadingFullHistory(true)
      const [ids, tickets, wins] = roundHistoryData as [bigint[], bigint[], bigint[]]
      const claimed = new Set<number>()
      const history: RoundHistory[] = []

      // Check each round
      for (let i = 0; i < ids.length; i++) {
        const roundId = Number(ids[i])
        const amount = wins[i] || BigInt(0)
        const ticketCount = Number(tickets[i])

        if (roundId > 0) {
          try {
            const hasClaimed = await publicClient.readContract({
              address: LOTTERY_ADDRESS as `0x${string}`,
              abi: LOTTERY_6OF55_V2_ABI,
              functionName: 'hasClaimed',
              args: [BigInt(roundId), address],
            }) as boolean

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
          } catch (err) {
            console.error(`Error checking claim status for round ${roundId}:`, err)
            // Add to history anyway with best guess
            history.push({
              roundId,
              tickets: ticketCount,
              amount,
              hasClaimed: false,
              status: amount > 0 ? 'claimable' : 'no-win',
            })
          }
        }
      }

      setClaimedRounds(claimed)
      setFullHistory(history.reverse()) // Most recent first
      setIsLoadingFullHistory(false)
    }

    checkClaimedStatus()
  }, [publicClient, address, roundHistoryData])

  // Fetch claimed status for all rounds
  const claimableRounds = useMemo(() => {
    if (!roundHistoryData || !Array.isArray(roundHistoryData) || roundHistoryData.length < 3) return []
    const [ids, tickets, wins] = roundHistoryData as [bigint[], bigint[], bigint[]]
    return ids.map((id, i) => ({
      roundId: Number(id),
      tickets: Number(tickets[i]),
      amount: wins[i] || BigInt(0)
    }))
      .filter(r => r.amount > 0 && r.roundId > 0 && !claimedRounds.has(r.roundId))
      .reverse()
  }, [roundHistoryData, claimedRounds])

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

  const toggleRound = (roundId: number) => {
    const newSelected = new Set(selectedRounds)
    if (newSelected.has(roundId)) {
      newSelected.delete(roundId)
    } else {
      newSelected.add(roundId)
    }
    setSelectedRounds(newSelected)
  }

  const selectAll = () => {
    setSelectedRounds(new Set(claimableRounds.map(r => r.roundId)))
  }

  const clearAll = () => {
    setSelectedRounds(new Set())
  }

  const handleClaim = async () => {
    if (!walletClient || !publicClient || selectedRounds.size === 0) return

    setIsClaiming(true)

    try {
      const roundIds = Array.from(selectedRounds).sort((a, b) => a - b)

      const { request } = await publicClient.simulateContract({
        address: LOTTERY_ADDRESS as `0x${string}`,
        abi: LOTTERY_6OF55_V2_ABI,
        functionName: 'claimWinningsMultiple',
        args: [roundIds],
        account: address,
      })

      const hash = await walletClient.writeContract(request)
      await publicClient.waitForTransactionReceipt({ hash })

      toast.success(`Claim successful! ${fmt(totalSelected)} Morbius claimed from ${selectedRounds.size} round${selectedRounds.size > 1 ? 's' : ''}`)

      // Reset selection and refresh data
      setSelectedRounds(new Set())

      // Force a re-render by updating the query key or similar
      window.location.reload()

    } catch (error: any) {
      console.error('Claim failed:', error)
      toast.error(`Claim Failed: ${error.message || "Transaction failed"}`)
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
      await publicClient.waitForTransactionReceipt({ hash })

      toast.success(`Claim successful! ${fmt(claimableAmount)} Morbius claimed from Round #${singleRoundId}`)

      // Reset form and refresh data
      setSingleRoundId('')
      window.location.reload()

    } catch (error: any) {
      console.error('Single claim failed:', error)
      toast.error(`Claim Failed: ${error.message || "Transaction failed"}`)
    } finally {
      setIsClaimingSingle(false)
    }
  }

  const totalClaimable = claimableRounds.reduce((total, round) => total + round.amount, BigInt(0))

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-white bg-slate-900 border-white/10 hover:bg-black/60 w-10 h-10 p-0" title="Claim Winnings">
          <Coins className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900/98 border-white/20 text-white max-w-2xl max-h-[85vh] overflow-hidden p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-white/10">
          <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
            <Coins className="w-4 h-4" />
            Claim Lottery Winnings
          </DialogTitle>
        </DialogHeader>

        {!address ? (
          <div className="px-4 py-8 text-center text-xs text-white/50">Connect wallet to claim winnings</div>
        ) : isLoadingHistory ? (
          <div className="px-4 py-8 flex items-center justify-center gap-2 text-xs text-white/50">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading rounds...
          </div>
        ) : (
          <Tabs defaultValue="claimable" className="w-full">
            <TabsList className="w-full grid grid-cols-2 bg-black/40 mx-4" style={{ width: 'calc(100% - 2rem)' }}>
              <TabsTrigger value="claimable" className="data-[state=active]:bg-green-600/20 data-[state=active]:text-green-400">
                <Coins className="w-3 h-3 mr-2" />
                Claimable ({claimableRounds.length})
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
                <History className="w-3 h-3 mr-2" />
                History ({fullHistory.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="claimable" className="mt-0">
              {claimableRounds.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-white/50">No winnings to claim</div>
              ) : (
          <div className="overflow-y-auto max-h-[calc(85vh-120px)]">
            {/* Quick Single Claim */}
            <div className="px-4 py-3 bg-black/20 border-b border-white/10">
              <div className="text-xs font-medium text-white/70 mb-3 uppercase tracking-wide">Quick Claim</div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="quick-claim-round" className="text-xs text-white/60">Round ID</Label>
                  <Input
                    id="quick-claim-round"
                    value={singleRoundId}
                    onChange={(e) => setSingleRoundId(e.target.value)}
                    placeholder="42"
                    type="number"
                    className="bg-black/40 border-white/10 text-white placeholder:text-white/50 text-sm h-8 mt-1"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleSingleClaim}
                    disabled={!singleRoundId || isClaimingSingle}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3"
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
            <div className="px-4 py-3 bg-black/20 border-b border-white/10">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-white/60">Total Claimable</div>
                <div className="text-sm font-bold text-green-400">{fmt(totalClaimable)} Morbius</div>
              </div>
              {selectedRounds.size > 0 && (
                <div className="flex items-center justify-between">
                  <div className="text-xs text-white/60">Selected to Claim</div>
                  <div className="text-sm font-bold text-yellow-400">{fmt(totalSelected)} Morbius</div>
                </div>
              )}
            </div>

            {/* Selection Controls */}
            <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAll}
                className="text-xs h-6 px-2 text-blue-400 hover:text-blue-300"
                disabled={selectedRounds.size === claimableRounds.length}
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="text-xs h-6 px-2 text-gray-400 hover:text-gray-300"
                disabled={selectedRounds.size === 0}
              >
                Clear All
              </Button>
              <div className="text-xs text-white/50 ml-auto">
                {selectedRounds.size} of {claimableRounds.length} selected
              </div>
            </div>

            {/* Rounds List */}
            <div className="px-4 py-2">
              <div className="text-xs font-medium text-white/70 mb-3 uppercase tracking-wide">Claimable Rounds</div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {claimableRounds.map((round) => (
                  <div
                    key={round.roundId}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded border transition-colors cursor-pointer",
                      selectedRounds.has(round.roundId)
                        ? "bg-yellow-500/10 border-yellow-500/30"
                        : "bg-black/20 border-white/5 hover:bg-white/5"
                    )}
                    onClick={() => toggleRound(round.roundId)}
                  >
                    <Checkbox
                      checked={selectedRounds.has(round.roundId)}
                      onChange={() => toggleRound(round.roundId)}
                      className="border-white/30 data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-mono font-semibold text-white">Round #{round.roundId}</div>
                        <div className="text-xs text-white/60">({round.tickets} ticket{round.tickets !== 1 ? 's' : ''})</div>
                      </div>
                    </div>
                    <div className="text-sm font-bold text-green-400">
                      {fmt(round.amount)} Morbius
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
              )}

              {/* Footer for Claimable tab */}
              {claimableRounds.length > 0 && (
                <div className="px-4 py-3 border-t border-white/10 bg-black/20">
                  <Button
                    onClick={handleClaim}
                    disabled={selectedRounds.size === 0 || isClaiming}
                    className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white font-bold"
                  >
                    {isClaiming ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Claiming...
                      </>
                    ) : (
                      <>
                        <Coins className="w-4 h-4 mr-2" />
                        Claim {selectedRounds.size} Round{selectedRounds.size !== 1 ? 's' : ''} ({fmt(totalSelected)} Morbius)
                      </>
                    )}
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-0">
              {isLoadingFullHistory ? (
                <div className="px-4 py-8 flex items-center justify-center gap-2 text-xs text-white/50">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading history...
                </div>
              ) : fullHistory.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-white/50">No rounds found</div>
              ) : (
                <div className="overflow-y-auto max-h-[calc(85vh-120px)] px-4 py-3">
                  <div className="text-xs font-medium text-white/70 mb-3 uppercase tracking-wide">Claim History</div>
                  <div className="space-y-2">
                    {fullHistory.map((round) => (
                      <div
                        key={round.roundId}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded border",
                          round.status === 'claimed'
                            ? "bg-blue-500/10 border-blue-500/30"
                            : round.status === 'claimable'
                            ? "bg-green-500/10 border-green-500/30"
                            : "bg-gray-500/10 border-gray-500/20"
                        )}
                      >
                        <div className="flex-shrink-0">
                          {round.status === 'claimed' && (
                            <CheckCircle2 className="w-5 h-5 text-blue-400" />
                          )}
                          {round.status === 'claimable' && (
                            <Coins className="w-5 h-5 text-green-400" />
                          )}
                          {round.status === 'no-win' && (
                            <XCircle className="w-5 h-5 text-gray-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-mono font-semibold text-white">Round #{round.roundId}</div>
                            <div className="text-xs text-white/60">({round.tickets} ticket{round.tickets !== 1 ? 's' : ''})</div>
                          </div>
                          <div className="text-xs mt-0.5">
                            {round.status === 'claimed' && (
                              <span className="text-blue-400">✓ Claimed</span>
                            )}
                            {round.status === 'claimable' && (
                              <span className="text-green-400">• Ready to Claim</span>
                            )}
                            {round.status === 'no-win' && (
                              <span className="text-gray-500">No Winnings</span>
                            )}
                          </div>
                        </div>
                        <div className={cn(
                          "text-sm font-bold",
                          round.status === 'claimed' ? "text-blue-400" :
                          round.status === 'claimable' ? "text-green-400" :
                          "text-gray-500"
                        )}>
                          {round.amount > 0 ? fmt(round.amount) : '0'} Morbius
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}

