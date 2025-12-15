'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, usePublicClient, useReadContract, useReadContracts } from 'wagmi'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatEther, parseAbiItem, parseEther } from 'viem'
import {
  KENO_ADDRESS,
  KENO_DEPLOY_BLOCK,
  WPLS_TOKEN_ADDRESS,
  MORBIUS_TOKEN_ADDRESS,
  PULSEX_V1_ROUTER_ADDRESS,
  WPLS_TO_MORBIUS_BUFFER_BPS,
} from '@/lib/contracts'
import { KENO_ABI } from '@/lib/keno-abi'
import { LoaderOne } from '@/components/ui/loader'
import { Trophy, Info, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const ALL_NUMBERS = Array.from({ length: 80 }, (_, i) => i + 1)
const ADDON_MULTIPLIER_FLAG = 1 << 0
const ADDON_BULLSEYE_FLAG = 1 << 1
const ADDON_PLUS3_FLAG = 1 << 2
const ADDON_PROGRESSIVE_FLAG = 1 << 3

const ROUTER_ABI = [
  {
    name: 'getAmountsIn',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const

const ERC20_ABI = [
  { constant: true, inputs: [{ name: '_owner', type: 'address' }, { name: '_spender', type: 'address' }], name: 'allowance', outputs: [{ name: 'remaining', type: 'uint256' }], type: 'function' },
  { constant: false, inputs: [{ name: '_spender', type: 'address' }, { name: '_value', type: 'uint256' }], name: 'approve', outputs: [{ name: 'success', type: 'bool' }], type: 'function' },
] as const

interface KenoTicketPurchaseBuilderProps {
  initialSpotSize?: number
  initialWager?: number
  initialDraws?: number
  initialMultiplier?: boolean
  initialBullsEye?: boolean
  initialPlus3?: boolean
  initialProgressive?: boolean
  initialPaymentMethod?: 'morbius' | 'pls'
  onSuccess?: () => void
  onError?: (error: Error) => void
  onStateChange?: (config: {
    selectedNumbers: number[]
    spotSize: number
    wager: number
    draws: number
    multiplier: boolean
    bullsEye: boolean
    plus3: boolean
    progressive: boolean
    paymentMethod: 'morbius' | 'pls'
  }) => void
}

export function KenoTicketPurchaseBuilder({
  initialSpotSize = 8,
  initialWager = 0.001,
  initialDraws = 5,
  initialMultiplier = false,
  initialBullsEye = false,
  initialPlus3 = false,
  initialProgressive = false,
  initialPaymentMethod = 'morbius',
  onSuccess,
  onError,
  onStateChange,
}: KenoTicketPurchaseBuilderProps) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  // Ticket building state
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([])
  const [spotSize, setSpotSize] = useState(initialSpotSize)
  const [wager, setWager] = useState(initialWager)
  const [draws, setDraws] = useState(initialDraws)
  const [multiplier, setMultiplier] = useState(initialMultiplier)
  const [bullsEye, setBullsEye] = useState(initialBullsEye)
  const [plus3, setPlus3] = useState(initialPlus3)
  const [progressive, setProgressive] = useState(initialProgressive)
  const [paymentMethod, setPaymentMethod] = useState<'morbius' | 'pls'>(initialPaymentMethod)

  // Contract interaction state
  const [multiplierCostWei, setMultiplierCostWei] = useState<bigint>(BigInt(0))
  const [bullsEyeCostWei, setBullsEyeCostWei] = useState<bigint>(BigInt(0))
  const [isApprovePending, setIsApprovePending] = useState(false)
  const [isBuyPending, setIsBuyPending] = useState(false)
  const [buyError, setBuyError] = useState<string | null>(null)

  // Costs, allowance, round
  const { data: addonCostResults } = useReadContracts({
    contracts: [
      { address: KENO_ADDRESS, abi: KENO_ABI, functionName: 'multiplierCostPerDraw' },
      { address: KENO_ADDRESS, abi: KENO_ABI, functionName: 'bullsEyeCostPerDraw' },
    ],
  })

  const { data: allowanceResult } = useReadContracts({
    contracts: address
      ? [
          { address: MORBIUS_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, KENO_ADDRESS] },
          { address: WPLS_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, PULSEX_V1_ROUTER_ADDRESS] },
        ]
      : [],
  })

  const { data: currentRoundIdData } = useReadContract({
    address: KENO_ADDRESS,
    abi: KENO_ABI,
    functionName: 'currentRoundId',
    query: { refetchInterval: 5000 },
  })

  // Process addon costs
  useEffect(() => {
    if (addonCostResults && addonCostResults.length >= 2) {
      const multiplierCost = addonCostResults[0]?.result as bigint || BigInt(0)
      const bullsEyeCost = addonCostResults[1]?.result as bigint || BigInt(0)
      setMultiplierCostWei(multiplierCost)
      setBullsEyeCostWei(bullsEyeCost)
    }
  }, [addonCostResults])

  // Notify parent of state changes
  useEffect(() => {
    onStateChange?.({
      selectedNumbers,
      spotSize,
      wager,
      draws,
      multiplier,
      bullsEye,
      plus3,
      progressive,
      paymentMethod,
    })
  }, [selectedNumbers, spotSize, wager, draws, multiplier, bullsEye, plus3, progressive, paymentMethod, onStateChange])

  // Calculate totals
  const baseCostPerDraw = wager
  const addonCostPerDraw =
    (multiplier ? Number(multiplierCostWei) / 1e18 : 0) +
    (bullsEye ? Number(bullsEyeCostWei) / 1e18 : 0) +
    (plus3 ? wager : 0) +
    (progressive ? wager : 0)

  const totalCostPerDraw = baseCostPerDraw + addonCostPerDraw
  const totalCost = totalCostPerDraw * draws

  // Check allowances
  const morbiusAllowance = allowanceResult?.[0]?.result as bigint | undefined
  const wplsAllowance = allowanceResult?.[1]?.result as bigint | undefined
  const hasMorbiusAllowance = morbiusAllowance && morbiusAllowance >= parseEther(totalCost.toString())
  const hasWplsAllowance = wplsAllowance && wplsAllowance >= parseEther(totalCost.toString())

  // Number selection handlers
  const handleToggleNumber = useCallback((num: number) => {
    setSelectedNumbers(prev => {
      if (prev.includes(num)) {
        return prev.filter(n => n !== num)
      } else if (prev.length < spotSize) {
        return [...prev, num].sort((a, b) => a - b)
      }
      return prev
    })
  }, [spotSize])

  const quickPick = useCallback(() => {
    const shuffled = [...ALL_NUMBERS].sort(() => Math.random() - 0.5)
    setSelectedNumbers(shuffled.slice(0, spotSize).sort((a, b) => a - b))
  }, [spotSize])

  // Approval and purchase handlers
  const handleApprove = async (tokenAddress: string, spender: string, amount: string) => {
    if (!address) return

    setIsApprovePending(true)
    try {
      const { writeContract } = useWriteContract()
      await writeContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender as `0x${string}`, parseEther(amount)],
      })
      toast.success('Approval successful!')
    } catch (err: any) {
      toast.error(`Approval failed: ${err.message}`)
    } finally {
      setIsApprovePending(false)
    }
  }

  const handlePurchase = async () => {
    if (!address || !currentRoundIdData || selectedNumbers.length !== spotSize) return

    setIsBuyPending(true)
    setBuyError(null)

    try {
      const roundId = currentRoundIdData as bigint
      const addons =
        (multiplier ? ADDON_MULTIPLIER_FLAG : 0) |
        (bullsEye ? ADDON_BULLSEYE_FLAG : 0) |
        (plus3 ? ADDON_PLUS3_FLAG : 0) |
        (progressive ? ADDON_PROGRESSIVE_FLAG : 0)

      if (paymentMethod === 'pls') {
        // Pay with PLS
        const { writeContract } = useWriteContract()
        await writeContract({
          address: KENO_ADDRESS,
          abi: KENO_ABI,
          functionName: 'buyTicketWithPLS',
          args: [roundId, selectedNumbers, spotSize, draws, addons],
          value: parseEther(totalCost.toString()),
        })
      } else {
        // Pay with MORBIUS
        const { writeContract } = useWriteContract()
        await writeContract({
          address: KENO_ADDRESS,
          abi: KENO_ABI,
          functionName: 'buyTicket',
          args: [roundId, selectedNumbers, spotSize, draws, addons, parseEther(totalCost.toString())],
        })
      }

      toast.success('Ticket purchased successfully!')
      onSuccess?.()

      // Reset form
      setSelectedNumbers([])
      quickPick() // Generate new quick pick numbers
    } catch (err: any) {
      const errorMessage = err.message || 'Purchase failed'
      setBuyError(errorMessage)
      toast.error(errorMessage)
      onError?.(new Error(errorMessage))
    } finally {
      setIsBuyPending(false)
    }
  }

  // Initialize with quick pick
  useEffect(() => {
    if (selectedNumbers.length === 0) {
      quickPick()
    }
  }, [spotSize, quickPick])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Build Your Keno Ticket</h2>
        <p className="text-gray-400">Select your numbers, wager amount, and add-ons</p>
      </div>

      {/* Section 1: Spot Size */}
      <Card className="bg-white/5 border-white/10 p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
            <span className="text-2xl font-bold text-emerald-400">1</span>
          </div>
          <div className="flex-1">
            <h4 className="text-lg font-semibold text-white mb-2">Choose Your Spot Size</h4>
            <p className="text-sm text-gray-400 mb-4">Select how many numbers you want to pick per draw. You can choose 1 to 10 spots.</p>
            <div className="flex flex-wrap gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  onClick={() => setSpotSize(num)}
                  className={cn(
                    "w-12 h-12 rounded-lg border-2 font-semibold text-lg transition-all",
                    spotSize === num
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/20"
                      : "bg-white/5 border-white/10 text-gray-300 hover:border-emerald-500/50 hover:bg-emerald-500/10"
                  )}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Section 2: Number Selection */}
      <Card className="bg-white/5 border-white/10 p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
            <span className="text-2xl font-bold text-emerald-400">2</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-lg font-semibold text-white">Pick your own numbers, OR choose Quick Pick</h4>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={quickPick}>Quick Pick</Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedNumbers([])}>Clear</Button>
              </div>
            </div>
            <p className="text-sm text-gray-400 mb-4">Select {spotSize} number{spotSize !== 1 ? 's' : ''} from 1 to 80, or use Quick Pick for random selection.</p>
            <div className="grid grid-cols-10 gap-2">
              {ALL_NUMBERS.map((n) => {
                const active = selectedNumbers.includes(n)
                return (
                  <button
                    key={n}
                    onClick={() => handleToggleNumber(n)}
                    className={cn(
                      'h-10 rounded-md border text-sm font-semibold transition',
                      active
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.4)]'
                        : 'border-white/10 bg-white/5 text-gray-200 hover:border-emerald-400/50'
                    )}
                  >
                    {n.toString().padStart(2, '0')}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 text-sm text-gray-400">
              Selected: {selectedNumbers.length}/{spotSize}
            </div>
          </div>
        </div>
      </Card>

      {/* Section 3: Wager & Draws */}
      <Card className="bg-white/5 border-white/10 p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
            <span className="text-2xl font-bold text-emerald-400">3</span>
          </div>
          <div className="flex-1">
            <h4 className="text-lg font-semibold text-white mb-4">Set Your Wager and Number of Draws</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Wager per Draw (WPLS)</label>
                <Input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={wager}
                  onChange={(e) => setWager(parseFloat(e.target.value) || 0)}
                  className="bg-white/10 border-white/20 text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Number of Draws</label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={draws}
                  onChange={(e) => setDraws(parseInt(e.target.value) || 1)}
                  className="bg-white/10 border-white/20 text-white"
                />
              </div>
            </div>

            <div className="text-sm text-gray-400 space-y-1">
              <div>Base cost per draw: {baseCostPerDraw.toFixed(4)} WPLS</div>
              <div>Addon cost per draw: {addonCostPerDraw.toFixed(4)} WPLS</div>
              <div>Total cost per draw: {totalCostPerDraw.toFixed(4)} WPLS</div>
              <div>Total cost: {totalCost.toFixed(4)} WPLS</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Section 4: Add-ons */}
      <Card className="bg-white/5 border-white/10 p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
            <span className="text-2xl font-bold text-emerald-400">4</span>
          </div>
          <div className="flex-1">
            <h4 className="text-lg font-semibold text-white mb-4">Choose Your Add-ons</h4>
            <p className="text-sm text-gray-400 mb-4">Add special features to increase your winnings potential.</p>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-white/10 rounded-lg">
                <div>
                  <h5 className="font-semibold text-white">Multiplier (x2-x10)</h5>
                  <p className="text-sm text-gray-400">Random multiplier applied to your winnings</p>
                  <p className="text-xs text-emerald-400">+{formatEther(multiplierCostWei)} WPLS per draw</p>
                </div>
                <Switch checked={multiplier} onCheckedChange={setMultiplier} />
              </div>

              <div className="flex items-center justify-between p-4 border border-white/10 rounded-lg">
                <div>
                  <h5 className="font-semibold text-white">Bulls-Eye Bonus</h5>
                  <p className="text-sm text-gray-400">Extra payout if you hit the bulls-eye number</p>
                  <p className="text-xs text-emerald-400">+{formatEther(bullsEyeCostWei)} WPLS per draw</p>
                </div>
                <Switch checked={bullsEye} onCheckedChange={setBullsEye} />
              </div>

              <div className="flex items-center justify-between p-4 border border-white/10 rounded-lg">
                <div>
                  <h5 className="font-semibold text-white">Plus 3</h5>
                  <p className="text-sm text-gray-400">Win on 3 consecutive numbers around your picks</p>
                  <p className="text-xs text-emerald-400">+{wager.toFixed(4)} WPLS per draw</p>
                </div>
                <Switch checked={plus3} onCheckedChange={setPlus3} />
              </div>

              <div className="flex items-center justify-between p-4 border border-white/10 rounded-lg">
                <div>
                  <h5 className="font-semibold text-white">Progressive Jackpot</h5>
                  <p className="text-sm text-gray-400">Chance to win the growing progressive jackpot</p>
                  <p className="text-xs text-emerald-400">+{wager.toFixed(4)} WPLS per draw</p>
                </div>
                <Switch checked={progressive} onCheckedChange={setProgressive} />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Section 5: Payment Method & Purchase */}
      <Card className="bg-white/5 border-white/10 p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
            <span className="text-2xl font-bold text-emerald-400">5</span>
          </div>
          <div className="flex-1">
            <h4 className="text-lg font-semibold text-white mb-4">Payment Method & Purchase</h4>

            {/* Payment Method Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Payment Method</label>
              <div className="flex gap-4">
                <button
                  onClick={() => setPaymentMethod('morbius')}
                  className={cn(
                    "px-4 py-2 rounded-lg border-2 font-semibold transition-all",
                    paymentMethod === 'morbius'
                      ? "bg-purple-500/20 border-purple-500 text-purple-400"
                      : "bg-white/5 border-white/10 text-gray-300 hover:border-purple-500/50"
                  )}
                >
                  MORBIUS
                </button>
                <button
                  onClick={() => setPaymentMethod('pls')}
                  className={cn(
                    "px-4 py-2 rounded-lg border-2 font-semibold transition-all",
                    paymentMethod === 'pls'
                      ? "bg-blue-500/20 border-blue-500 text-blue-400"
                      : "bg-white/5 border-white/10 text-gray-300 hover:border-blue-500/50"
                  )}
                >
                  WPLS
                </button>
              </div>
            </div>

            {/* Approval Status */}
            {paymentMethod === 'morbius' && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">MORBIUS Allowance</span>
                  {hasMorbiusAllowance ? (
                    <span className="text-green-400 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" />
                      Approved
                    </span>
                  ) : (
                    <span className="text-red-400 flex items-center gap-1">
                      <XCircle className="h-4 w-4" />
                      Not Approved
                    </span>
                  )}
                </div>
                {!hasMorbiusAllowance && (
                  <Button
                    onClick={() => handleApprove(MORBIUS_TOKEN_ADDRESS, KENO_ADDRESS, totalCost.toString())}
                    disabled={isApprovePending}
                    className="mt-2"
                    size="sm"
                  >
                    {isApprovePending ? <div className="h-4 w-4 mr-2"><LoaderOne /></div> : null}
                    Approve MORBIUS
                  </Button>
                )}
              </div>
            )}

            {/* Purchase Button */}
            <div className="flex justify-center">
              {!isConnected ? (
                <ConnectButton />
              ) : (
                <Button
                  onClick={handlePurchase}
                  disabled={
                    isBuyPending ||
                    selectedNumbers.length !== spotSize ||
                    (paymentMethod === 'morbius' && !hasMorbiusAllowance)
                  }
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 text-lg font-semibold"
                >
                  {isBuyPending ? (
                    <>
                      <div className="h-5 w-5 mr-2"><LoaderOne /></div>
                      Purchasing...
                    </>
                  ) : (
                    `Purchase Ticket - ${totalCost.toFixed(4)} ${paymentMethod === 'pls' ? 'WPLS' : 'MORBIUS'}`
                  )}
                </Button>
              )}
            </div>

            {/* Error Display */}
            {buyError && (
              <Alert className="mt-4 border-red-500/50 bg-red-500/10">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-red-400">
                  {buyError}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}