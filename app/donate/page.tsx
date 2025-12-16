'use client'

import { useState, useMemo } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatUnits, parseUnits } from 'viem'
import { LOTTERY_ADDRESS, TOKEN_DECIMALS } from '@/lib/contracts'
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2'
import { useCurrentRound, useMegaMillionsBank } from '@/hooks/use-lottery-6of55'
import { toast } from 'sonner'
import { Heart, Coins, Trophy, Users, Sparkles } from 'lucide-react'

export default function DonatePage() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const [donationAmount, setDonationAmount] = useState('')
  const [jackpotDonationAmount, setJackpotDonationAmount] = useState('')
  const [isDonating, setIsDonating] = useState(false)
  const [isJackpotDonating, setIsJackpotDonating] = useState(false)

  // Fetch current round data and jackpot
  const { data: roundDataRaw, isLoading: isLoadingRound } = useCurrentRound()
  const { data: megaBankRaw } = useMegaMillionsBank()

  // Parse round data (memoized to prevent recreating BigInts)
  // V2 Returns: [roundId, startTime, endTime, totalMorbius, totalTickets, uniquePlayers, timeRemaining, state]
  const roundData = useMemo(() => {
    if (Array.isArray(roundDataRaw) && roundDataRaw.length >= 8) {
      return roundDataRaw as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, number]
    }
    return undefined
  }, [roundDataRaw])

  const currentRoundId = roundData?.[0] ?? BigInt(0)
  const totalPssh = roundData?.[3] ?? BigInt(0)
  const totalTickets = roundData?.[4] ?? BigInt(0)
  const uniquePlayers = roundData?.[5] ?? BigInt(0)
  const megaBank = (megaBankRaw ?? BigInt(0)) as bigint

  const formatPssh = (amount: bigint) => {
    return parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  const handleDonate = async () => {
    if (!address || !walletClient || !donationAmount) return

    try {
      setIsDonating(true)

      const amount = parseUnits(donationAmount, TOKEN_DECIMALS)

      if (amount <= 0) {
        toast.error('Please enter a valid donation amount')
        return
      }

      // Call the donateToPool function
      const hash = await walletClient.writeContract({
        address: LOTTERY_ADDRESS as `0x${string}`,
        abi: LOTTERY_6OF55_V2_ABI,
        functionName: 'donateToPool',
        args: [amount]
      })

      toast.success('Donation transaction submitted!', {
        description: 'Your donation is being processed...',
        duration: 5000,
      })

      // Wait for transaction confirmation
      if (!publicClient) {
        toast.error('Connection error', { description: 'Please try again' })
        return
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      if (receipt.status === 'success') {
        toast.success('Donation successful! 🎉', {
          description: `Thank you for donating ${donationAmount} MORBIUS to the prize pool!`,
          duration: 10000,
        })
        setDonationAmount('')
      } else {
        toast.error('Donation failed', {
          description: 'The transaction was not successful. Please try again.',
        })
      }

    } catch (error: any) {
      console.error('Donation error:', error)

      if (error.message?.includes('User rejected')) {
        toast.error('Transaction cancelled')
      } else if (error.message?.includes('insufficient funds')) {
        toast.error('Insufficient MORBIUS balance')
      } else {
        toast.error('Donation failed', {
          description: error.message || 'An unexpected error occurred',
        })
      }
    } finally {
      setIsDonating(false)
    }
  }

  const handleJackpotDonate = async () => {
    if (!address || !walletClient || !jackpotDonationAmount) return

    try {
      setIsJackpotDonating(true)

      const amount = parseUnits(jackpotDonationAmount, TOKEN_DECIMALS)

      if (amount <= 0) {
        toast.error('Please enter a valid donation amount')
        return
      }

      // Call the donateToMegaMorbius function
      const hash = await walletClient.writeContract({
        address: LOTTERY_ADDRESS as `0x${string}`,
        abi: LOTTERY_6OF55_V2_ABI,
        functionName: 'donateToMegaMorbius',
        args: [amount]
      })

      toast.success('Jackpot donation transaction submitted!', {
        description: 'Your donation is being processed...',
        duration: 5000,
      })

      // Wait for transaction confirmation
      if (!publicClient) {
        toast.error('Connection error', { description: 'Please try again' })
        return
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      if (receipt.status === 'success') {
        toast.success('Jackpot donation successful! 🎉', {
          description: `Thank you for donating ${jackpotDonationAmount} MORBIUS to the MegaMorbius Jackpot!`,
          duration: 10000,
        })
        setJackpotDonationAmount('')
      } else {
        toast.error('Donation failed', {
          description: 'The transaction was not successful. Please try again.',
        })
      }

    } catch (error: any) {
      console.error('Jackpot donation error:', error)

      if (error.message?.includes('User rejected')) {
        toast.error('Transaction cancelled')
      } else if (error.message?.includes('insufficient funds')) {
        toast.error('Insufficient MORBIUS balance')
      } else {
        toast.error('Donation failed', {
          description: error.message || 'An unexpected error occurred',
        })
      }
    } finally {
      setIsJackpotDonating(false)
    }
  }

  const quickAmounts = [10, 25, 50, 100, 250, 500]

  return (
    <div className="min-h-screen text-slate-100" style={{
      backgroundImage: "linear-gradient(rgba(2, 6, 23, 0.9), rgba(2, 6, 23, 0.88)), url('/morbius/Morbiusbg.png')",
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
    }}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent funnel-display-bold">
            Donate to Lottery
          </h1>
          <p className="text-xl text-white/80 mb-8 funnel-display-regular">
            Support the lottery community by donating to the prize pool or jackpot
          </p>
          <div className="w-20 h-0.5 bg-gradient-to-r from-purple-400 to-pink-400 mx-auto"></div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Prize Pool Donation */}
          <Card className="p-6 bg-black/20 backdrop-blur-lg border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <Heart className="w-6 h-6 text-red-400" />
              <h2 className="text-xl font-bold text-white">Prize Pool</h2>
            </div>
            <p className="text-white/70 text-sm mb-6">
              Donate to the current round's prize pool
            </p>

            {!isConnected ? (
              <div className="text-center py-6">
                <p className="text-white/70 text-sm mb-3">Connect wallet</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={donationAmount}
                    onChange={(e) => setDonationAmount(e.target.value)}
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[10, 50, 100].map((amount) => (
                    <Button
                      key={amount}
                      variant="outline"
                      size="sm"
                      onClick={() => setDonationAmount(amount.toString())}
                      className="text-white border-white/20 bg-white/5 hover:bg-white/10 text-xs"
                    >
                      {amount}
                    </Button>
                  ))}
                </div>

                <Button
                  onClick={handleDonate}
                  disabled={!donationAmount || isDonating}
                  className="w-full bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white"
                >
                  {isDonating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <Heart className="w-4 h-4 mr-2" />
                      Donate
                    </>
                  )}
                </Button>
              </div>
            )}
          </Card>

          {/* Jackpot Donation */}
          <Card className="p-6 bg-gradient-to-br from-purple-950/30 to-pink-950/30 backdrop-blur-lg border-purple-400/20">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-6 h-6 text-yellow-400" />
              <h2 className="text-xl font-bold text-white">MegaMorbius Jackpot</h2>
            </div>
            <p className="text-white/70 text-sm mb-2">
              Donate to the progressive jackpot
            </p>
            <p className="text-yellow-400 font-bold text-lg mb-6">
              {formatPssh(megaBank)} MORBIUS
            </p>

            {!isConnected ? (
              <div className="text-center py-6">
                <p className="text-white/70 text-sm mb-3">Connect wallet</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={jackpotDonationAmount}
                    onChange={(e) => setJackpotDonationAmount(e.target.value)}
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[25, 100, 500].map((amount) => (
                    <Button
                      key={amount}
                      variant="outline"
                      size="sm"
                      onClick={() => setJackpotDonationAmount(amount.toString())}
                      className="text-white border-white/20 bg-white/5 hover:bg-white/10 text-xs"
                    >
                      {amount}
                    </Button>
                  ))}
                </div>

                <Button
                  onClick={handleJackpotDonate}
                  disabled={!jackpotDonationAmount || isJackpotDonating}
                  className="w-full bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700 text-white"
                >
                  {isJackpotDonating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Donate
                    </>
                  )}
                </Button>
              </div>
            )}
          </Card>

          {/* Current Round Info */}
          <Card className="p-6 bg-black/20 backdrop-blur-lg border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <Trophy className="w-6 h-6 text-yellow-400" />
              <h2 className="text-xl font-bold text-white">Current Round</h2>
            </div>

            {isLoadingRound ? (
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-white/20 rounded w-3/4"></div>
                <div className="h-4 bg-white/20 rounded w-1/2"></div>
              </div>
            ) : roundData ? (
              <div className="space-y-4">
                <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                  <div className="text-white/60 text-xs mb-1">Round</div>
                  <div className="text-xl font-bold text-white">#{currentRoundId.toString()}</div>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                  <div className="text-white/60 text-xs mb-1">Prize Pool</div>
                  <div className="text-lg font-bold text-white">{formatPssh(totalPssh)}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                    <div className="text-white/60 text-xs mb-1">Tickets</div>
                    <div className="text-sm font-bold text-white">{totalTickets.toString()}</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                    <div className="text-white/60 text-xs mb-1">Players</div>
                    <div className="text-sm font-bold text-white">{uniquePlayers.toString()}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-white/70 text-sm">Unable to load</p>
              </div>
            )}
          </Card>
        </div>

        {/* Info Section */}
        <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10 mt-8">
          <div className="bg-blue-950/20 p-4 rounded-lg border border-blue-400/20">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-5 h-5 text-blue-400" />
              <span className="text-blue-300 font-medium">Donation Impact</span>
            </div>
            <div className="space-y-2 text-white/70 text-sm">
              <p><strong className="text-white">Prize Pool:</strong> Goes directly to Round #{currentRoundId.toString()} - winners in this round get bigger prizes!</p>
              <p><strong className="text-white">Jackpot:</strong> Grows the MegaMorbius progressive jackpot - future 6-match winners get the full amount!</p>
              <p className="text-green-400">100% of donations go to prizes. No fees!</p>
            </div>
          </div>
        </Card>

        {/* Benefits Section */}
        <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10 mt-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">Why Donate?</h2>
            <p className="text-white/70">Your contribution directly enhances the lottery experience for everyone</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Bigger Prizes</h3>
              <p className="text-white/70 text-sm">
                Every MORBIUS you donate increases the total prize pool, creating bigger winners and more excitement.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Community Support</h3>
              <p className="text-white/70 text-sm">
                Help build a thriving lottery community by ensuring attractive prize pools that draw more players.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Heart className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Pure Impact</h3>
              <p className="text-white/70 text-sm">
                Unlike ticket purchases, donations have zero fees. 100% goes directly to the prize pool.
              </p>
            </div>
          </div>
        </Card>

        {/* Footer */}
        <div className="text-center py-8 border-t border-white/10 mt-8">
          <p className="text-white/60 text-sm">
            Donations are processed instantly and recorded on the PulseChain blockchain for complete transparency.
          </p>
        </div>
      </div>
    </div>
  )
}