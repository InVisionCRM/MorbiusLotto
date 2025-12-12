'use client'

import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { formatUnits } from 'viem'
import { TOKEN_DECIMALS, LOTTERY_ADDRESS } from '@/lib/contracts'
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2'
import { usePlayerRoundHistory } from '@/hooks/use-lottery-6of55'
import { toast } from 'sonner'
import { Loader2, Coins, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClaimableRound {
  roundId: number
  tickets: number
  amount: bigint
}

export function MultiClaimModal() {
  const { address } = useAccount()
  const { data: roundHistoryData, isLoading: isLoadingHistory } = usePlayerRoundHistory(address, 0, 100)
  const [selectedRounds, setSelectedRounds] = useState<Set<number>>(new Set())
  const [isClaiming, setIsClaiming] = useState(false)
  const [singleRoundId, setSingleRoundId] = useState('')
  const [isClaimingSingle, setIsClaimingSingle] = useState(false)
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const claimableRounds = useMemo(() => {
    if (!roundHistoryData || !Array.isArray(roundHistoryData) || roundHistoryData.length < 3) return []
    const [ids, tickets, wins] = roundHistoryData as [bigint[], bigint[], bigint[]]
    return ids.map((id, i) => ({
      roundId: Number(id),
      tickets: Number(tickets[i]),
      amount: wins[i] || BigInt(0)
    }))
      .filter(r => r.amount > 0 && r.roundId > 0)
      .reverse()
  }, [roundHistoryData])

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

      // Get the claimable amount first
      const claimableAmount = await publicClient.readContract({
        address: LOTTERY_ADDRESS as `0x${string}`,
        abi: LOTTERY_6OF55_V2_ABI,
        functionName: 'getClaimableWinnings',
        args: [parsedRoundId, address],
      }) as bigint

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
            Loading claimable rounds...
          </div>
        ) : claimableRounds.length === 0 ? (
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

        {/* Footer */}
        {address && claimableRounds.length > 0 && (
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
      </DialogContent>
    </Dialog>
  )
}

