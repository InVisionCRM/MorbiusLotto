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
import { useCurrentRound } from '@/hooks/use-lottery-6of55'
import { toast } from 'sonner'
import { Heart, Coins, Trophy, Users } from 'lucide-react'

export default function DonatePage() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const [donationAmount, setDonationAmount] = useState('')
  const [isDonating, setIsDonating] = useState(false)

  // Fetch current round data
  const { data: roundDataRaw, isLoading: isLoadingRound } = useCurrentRound()

  // Parse round data (memoized to prevent recreating BigInts)
  const roundData = useMemo(() => {
    if (Array.isArray(roundDataRaw) && roundDataRaw.length >= 9) {
      return roundDataRaw as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean, number]
    }
    return undefined
  }, [roundDataRaw])

  const currentRoundId = roundData?.[0] ?? BigInt(0)
  const totalPssh = roundData?.[3] ?? BigInt(0)
  const totalTickets = roundData?.[4] ?? BigInt(0)
  const uniquePlayers = roundData?.[5] ?? BigInt(0)
  const isMegaMillionsRound = roundData?.[7] || false

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
            Donate to Prize Pool
          </h1>
          <p className="text-xl text-white/80 mb-8 funnel-display-regular">
            Support the lottery community by donating directly to the prize pool
          </p>
          <div className="w-20 h-0.5 bg-gradient-to-r from-purple-400 to-pink-400 mx-auto"></div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Donation Form */}
          <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10">
            <div className="flex items-center gap-3 mb-6">
              <Heart className="w-8 h-8 text-red-400" />
              <h2 className="text-2xl font-bold text-white">Make a Donation</h2>
            </div>

            {!isConnected ? (
              <div className="text-center py-8">
                <p className="text-white/70 mb-4">Connect your wallet to make a donation</p>
                <Button className="bg-purple-600 hover:bg-purple-700">
                  Connect Wallet
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <Label htmlFor="amount" className="text-white font-medium mb-2 block">
                    Donation Amount (MORBIUS)
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="0.00"
                    value={donationAmount}
                    onChange={(e) => setDonationAmount(e.target.value)}
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                    min="0"
                    step="0.01"
                  />
                </div>

                {/* Quick Amount Buttons */}
                <div>
                  <Label className="text-white/70 text-sm mb-3 block">Quick Amounts</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {quickAmounts.map((amount) => (
                      <Button
                        key={amount}
                        variant="outline"
                        size="sm"
                        onClick={() => setDonationAmount(amount.toString())}
                        className="text-white border-white/20 bg-white/5 hover:bg-white/10"
                      >
                        {amount}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={handleDonate}
                  disabled={!donationAmount || isDonating}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white py-3"
                >
                  {isDonating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                      Processing Donation...
                    </>
                  ) : (
                    <>
                      <Heart className="w-5 h-5 mr-2" />
                      Donate {donationAmount ? `${donationAmount} MORBIUS` : 'to Prize Pool'}
                    </>
                  )}
                </Button>

                {donationAmount && (
                  <p className="text-white/60 text-sm text-center">
                    Your donation will go directly to Round #{currentRoundId.toString()} prize pool
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Current Round Info */}
          <Card className="p-8 bg-black/20 backdrop-blur-lg border-white/10">
            <div className="flex items-center gap-3 mb-6">
              <Trophy className="w-8 h-8 text-yellow-400" />
              <h2 className="text-2xl font-bold text-white">Current Round</h2>
            </div>

            {isLoadingRound ? (
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-white/20 rounded w-3/4"></div>
                <div className="h-4 bg-white/20 rounded w-1/2"></div>
                <div className="h-4 bg-white/20 rounded w-2/3"></div>
              </div>
            ) : roundData ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                    <div className="text-white/60 text-sm mb-1">Round</div>
                    <div className="text-2xl font-bold text-white">#{currentRoundId.toString()}</div>
                  </div>
                  <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                    <div className="text-white/60 text-sm mb-1">Prize Pool</div>
                    <div className="text-2xl font-bold text-white">{formatPssh(totalPssh)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                    <div className="text-white/60 text-sm mb-1">Tickets</div>
                    <div className="text-xl font-bold text-white">{totalTickets.toString()}</div>
                  </div>
                  <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                    <div className="text-white/60 text-sm mb-1">Players</div>
                    <div className="text-xl font-bold text-white">{uniquePlayers.toString()}</div>
                  </div>
                </div>

                {isMegaMillionsRound && (
                  <div className="bg-gradient-to-r from-purple-950/30 to-pink-950/30 p-4 rounded-lg border border-purple-400/20">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                      <span className="text-purple-300 font-medium">MegaMorbius Round!</span>
                    </div>
                    <p className="text-white/70 text-sm">
                      This is a MegaMorbius jackpot round with massive prizes!
                    </p>
                  </div>
                )}

                <div className="bg-green-950/20 p-4 rounded-lg border border-green-400/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Coins className="w-5 h-5 text-green-400" />
                    <span className="text-green-300 font-medium">Impact of Your Donation</span>
                  </div>
                  <p className="text-white/70 text-sm">
                    100% of your donation goes directly to increasing prizes for all players in this round.
                    No fees, no middlemen - just bigger jackpots!
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-white/70">Unable to load round information</p>
              </div>
            )}
          </Card>
        </div>

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