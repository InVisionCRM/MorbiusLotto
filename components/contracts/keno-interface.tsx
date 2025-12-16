'use client'

import { useState } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, HelpCircle, CheckCircle } from 'lucide-react'
import { KENO_ADDRESS, TOKEN_DECIMALS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'
import { KENO_ABI } from '@/lib/keno-abi'
import { ERC20_ABI } from '@/abi/erc20'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'

interface KenoContractInterfaceProps {
  address?: `0x${string}`
}

export function KenoContractInterface({ address }: KenoContractInterfaceProps) {
  const [activeSection, setActiveSection] = useState('player-actions')

  return (
    <Tabs value={activeSection} onValueChange={setActiveSection} className="space-y-6">
      <TabsList className="grid w-full grid-cols-3 bg-black/40 border border-white/10">
        <TabsTrigger value="player-actions" className="data-[state=active]:bg-purple-600">
          Player Actions
        </TabsTrigger>
        <TabsTrigger value="admin-actions" className="data-[state=active]:bg-purple-600">
          Admin
        </TabsTrigger>
        <TabsTrigger value="stats" className="data-[state=active]:bg-purple-600">
          Statistics
        </TabsTrigger>
      </TabsList>

      <TabsContent value="player-actions" className="space-y-6">
        <BuyTicketSection address={address} />
        <ClaimPrizeSection address={address} />
        <AutoClaimSection address={address} />
      </TabsContent>

      <TabsContent value="admin-actions" className="space-y-6">
        <RoundManagementSection address={address} />
        <PaytableConfigSection address={address} />
        <ContractConfigSection address={address} />
        <AdvancedAdminSection address={address} />
        <RandomnessManagement address={address} />
        <OwnershipManagement address={address} />
      </TabsContent>

      <TabsContent value="stats" className="space-y-6">
        <CurrentRoundStats />
        <PlayerStatsSection address={address} />
        <GlobalKenoStats />
        <ProgressiveStats />
        <ContractConstants />
        <TokenInfoSection />
        <TicketLookupSection />
        <RoundDetailsSection />
        <ClaimedStatusCheck address={address} />
      </TabsContent>
    </Tabs>
  )
}

// Additional Admin Sections

function AdvancedAdminSection({ address }: { address?: `0x${string}` }) {
  const [feeRecipient, setFeeRecipient] = useState('')
  const [feeBps, setFeeBps] = useState('')
  const [amount, setAmount] = useState('')
  const [toAddress, setToAddress] = useState('')

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const handleSetFee = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      writeContract({
        address: KENO_ADDRESS as `0x${string}`,
        abi: KENO_ABI,
        functionName: 'setFee',
        args: [BigInt(feeBps), feeRecipient as `0x${string}`],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to update')
    }
  }

  const handleWithdraw = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      const withdrawAmount = parseUnits(amount, TOKEN_DECIMALS)
      writeContract({
        address: KENO_ADDRESS as `0x${string}`,
        abi: KENO_ABI,
        functionName: 'withdrawBankroll',
        args: [withdrawAmount, toAddress as `0x${string}`],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to withdraw')
    }
  }

  const handlePause = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    writeContract({
      address: KENO_ADDRESS as `0x${string}`,
      abi: KENO_ABI,
      functionName: 'pause',
    })
  }

  const handleUnpause = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    writeContract({
      address: KENO_ADDRESS as `0x${string}`,
      abi: KENO_ABI,
      functionName: 'unpause',
    })
  }

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Advanced Admin Functions (Owner Only)
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Advanced contract management</p>
                <p className="text-xs text-white/70">
                  Set fees, withdraw bankroll, pause/unpause contract.
                  Use with caution - these affect contract operations.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Set Protocol Fee</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={feeBps}
              onChange={(e) => setFeeBps(e.target.value)}
              placeholder="Fee (basis points, 100=1%)"
              type="number"
              className="bg-black/40 border-white/10"
            />
            <Input
              value={feeRecipient}
              onChange={(e) => setFeeRecipient(e.target.value)}
              placeholder="Recipient address"
              className="bg-black/40 border-white/10"
            />
          </div>
          <Button
            onClick={handleSetFee}
            disabled={!address || !feeBps || !feeRecipient || isPending}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            Set Fee
          </Button>
        </div>

        <div className="space-y-3">
          <Label>Withdraw Bankroll</Label>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (Morbius)"
            type="number"
            step="0.001"
            className="bg-black/40 border-white/10"
          />
          <Input
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            placeholder="Destination address"
            className="bg-black/40 border-white/10"
          />
          <Button
            onClick={handleWithdraw}
            disabled={!address || !amount || !toAddress || isPending}
            className="w-full bg-orange-600 hover:bg-orange-700"
          >
            Withdraw
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={handlePause}
            disabled={!address || isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            Pause Contract
          </Button>
          <Button
            onClick={handleUnpause}
            disabled={!address || isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            Unpause Contract
          </Button>
        </div>

        {isSuccess && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">
              Operation completed successfully!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function RandomnessManagement({ address }: { address?: `0x${string}` }) {
  const [roundId, setRoundId] = useState('')
  const [commitment, setCommitment] = useState('')
  const [seed, setSeed] = useState('')
  const [provider, setProvider] = useState('')

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const handleCommit = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      writeContract({
        address: KENO_ADDRESS as `0x${string}`,
        abi: KENO_ABI,
        functionName: 'commitRandom',
        args: [BigInt(roundId), commitment as `0x${string}`],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to commit')
    }
  }

  const handleReveal = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      writeContract({
        address: KENO_ADDRESS as `0x${string}`,
        abi: KENO_ABI,
        functionName: 'revealRandom',
        args: [BigInt(roundId), seed as `0x${string}`],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to reveal')
    }
  }

  const handleSetProvider = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      writeContract({
        address: KENO_ADDRESS as `0x${string}`,
        abi: KENO_ABI,
        functionName: 'setRandomnessProvider',
        args: [provider as `0x${string}`],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to set provider')
    }
  }

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Randomness Management (Owner Only)
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Commit-Reveal randomness scheme</p>
                <p className="text-xs text-white/70">
                  Commit: Hash of secret seed (keccak256(seed))<br />
                  Reveal: Original seed value<br />
                  Provider: Optional VRF adapter address
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Commit Randomness</Label>
          <Input
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            placeholder="Round ID"
            type="number"
            className="bg-black/40 border-white/10"
          />
          <Input
            value={commitment}
            onChange={(e) => setCommitment(e.target.value)}
            placeholder="Commitment hash (0x...)"
            className="bg-black/40 border-white/10 font-mono text-xs"
          />
          <Button
            onClick={handleCommit}
            disabled={!address || !roundId || !commitment || isPending}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            Commit
          </Button>
        </div>

        <div className="space-y-3">
          <Label>Reveal Randomness</Label>
          <Input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Seed value (0x...)"
            className="bg-black/40 border-white/10 font-mono text-xs"
          />
          <Button
            onClick={handleReveal}
            disabled={!address || !roundId || !seed || isPending}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            Reveal
          </Button>
        </div>

        <div className="space-y-3">
          <Label>Set Randomness Provider</Label>
          <Input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="Provider address (0x...)"
            className="bg-black/40 border-white/10 font-mono text-xs"
          />
          <Button
            onClick={handleSetProvider}
            disabled={!address || !provider || isPending}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            Set Provider
          </Button>
        </div>

        {isSuccess && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">
              Randomness operation completed!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function OwnershipManagement({ address }: { address?: `0x${string}` }) {
  const [newOwner, setNewOwner] = useState('')

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const { data: currentOwner } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'owner',
  })

  const handleTransfer = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    if (!confirm('Are you sure you want to transfer ownership? This cannot be undone!')) {
      return
    }

    try {
      writeContract({
        address: KENO_ADDRESS as `0x${string}`,
        abi: KENO_ABI,
        functionName: 'transferOwnership',
        args: [newOwner as `0x${string}`],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to transfer')
    }
  }

  const handleRenounce = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    if (!confirm('Are you sure you want to renounce ownership? Contract will have NO OWNER!')) {
      return
    }

    try {
      writeContract({
        address: KENO_ADDRESS as `0x${string}`,
        abi: KENO_ABI,
        functionName: 'renounceOwnership',
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to renounce')
    }
  }

  return (
    <Card className="bg-black/40 border-red-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-400">
          ⚠️ Ownership Management (DANGEROUS)
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-red-400" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2 text-red-400">EXTREMELY DANGEROUS</p>
                <p className="text-xs text-white/70">
                  Transfer: Give ownership to another address<br />
                  Renounce: Permanently remove owner (contract becomes ownerless)<br />
                  <strong>These actions are irreversible!</strong>
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription className="text-red-400/70">
          Use extreme caution - these operations are irreversible
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-400 mb-1">Current Owner</p>
          <p className="text-sm font-mono break-all">{currentOwner as string}</p>
        </div>

        <div className="space-y-3">
          <Label>Transfer Ownership</Label>
          <Input
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            placeholder="New owner address (0x...)"
            className="bg-black/40 border-red-500/20 font-mono text-xs"
          />
          <Button
            onClick={handleTransfer}
            disabled={!address || !newOwner || isPending}
            className="w-full bg-red-600 hover:bg-red-700"
          >
            Transfer Ownership
          </Button>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleRenounce}
            disabled={!address || isPending}
            className="w-full bg-red-800 hover:bg-red-900"
          >
            Renounce Ownership (PERMANENT)
          </Button>
        </div>

        {isSuccess && (
          <Alert className="bg-orange-500/10 border-orange-500/20">
            <AlertDescription className="text-orange-500">
              Ownership operation completed. Verify on block explorer!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

// Additional Statistics Sections

function ContractConstants() {
  const { data: numbers } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'NUMBERS',
  })

  const { data: drawn } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'DRAWN',
  })

  const { data: plus3Drawn } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'PLUS3_DRAWN',
  })

  const { data: minSpot } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'MIN_SPOT',
  })

  const { data: maxSpot } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'maxSpot',
  })

  const { data: claimDeadline } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'CLAIM_DEADLINE',
  })

  const { data: bpsDenom } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'BPS_DENOMINATOR',
  })

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Contract Constants
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Immutable contract parameters</p>
                <p className="text-xs text-white/70">
                  These values are set at deployment and cannot be changed.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-white/50">Total Numbers</p>
            <p className="text-xl font-bold">{numbers?.toString() || '0'}</p>
          </div>
          <div>
            <p className="text-xs text-white/50">Numbers Drawn</p>
            <p className="text-xl font-bold">{drawn?.toString() || '0'}</p>
          </div>
          <div>
            <p className="text-xs text-white/50">Plus 3 Numbers</p>
            <p className="text-xl font-bold">{plus3Drawn?.toString() || '0'}</p>
          </div>
          <div>
            <p className="text-xs text-white/50">Min Spot Size</p>
            <p className="text-xl font-bold">{minSpot?.toString() || '0'}</p>
          </div>
          <div>
            <p className="text-xs text-white/50">Max Spot Size</p>
            <p className="text-xl font-bold">{maxSpot?.toString() || '0'}</p>
          </div>
          <div>
            <p className="text-xs text-white/50">Claim Deadline</p>
            <p className="text-xl font-bold">{(Number(claimDeadline || 0) / 86400).toFixed(0)} days</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-white/50">Basis Points Denominator</p>
            <p className="text-xl font-bold">{bpsDenom?.toString() || '0'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TokenInfoSection() {
  const { data: tokenAddress } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'token',
  })

  const { data: feeBps } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'feeBps',
  })

  const { data: feeRecipient } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'feeRecipient',
  })

  const { data: isPaused } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'paused',
  })

  const { data: roundDuration } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'roundDuration',
  })

  const { data: maxWager } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'maxWagerPerDraw',
  })

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle>Contract Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="p-3 bg-black/40 border border-white/10 rounded-lg">
            <p className="text-xs text-white/50">Token Address</p>
            <p className="text-sm font-mono break-all">{tokenAddress as string}</p>
          </div>
          <div className="p-3 bg-black/40 border border-white/10 rounded-lg">
            <p className="text-xs text-white/50">Fee Recipient</p>
            <p className="text-sm font-mono break-all">{feeRecipient as string}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-black/40 border border-white/10 rounded-lg">
              <p className="text-xs text-white/50">Protocol Fee</p>
              <p className="text-lg font-bold">{(Number(feeBps || 0) / 100).toFixed(2)}%</p>
            </div>
            <div className="p-3 bg-black/40 border border-white/10 rounded-lg">
              <p className="text-xs text-white/50">Contract Status</p>
              <p className={`text-lg font-bold ${isPaused ? 'text-red-500' : 'text-green-500'}`}>
                {isPaused ? 'PAUSED' : 'ACTIVE'}
              </p>
            </div>
            <div className="p-3 bg-black/40 border border-white/10 rounded-lg">
              <p className="text-xs text-white/50">Round Duration</p>
              <p className="text-lg font-bold">{Number(roundDuration || 0)}s</p>
            </div>
            <div className="p-3 bg-black/40 border border-white/10 rounded-lg">
              <p className="text-xs text-white/50">Max Wager</p>
              <p className="text-lg font-bold">{formatUnits(maxWager && typeof maxWager === 'bigint' ? maxWager : BigInt(0), TOKEN_DECIMALS)}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TicketLookupSection() {
  const [ticketId, setTicketId] = useState('')

  const { data: ticket, refetch } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'getTicket',
    args: ticketId ? [BigInt(ticketId)] : undefined,
  })

  const ticketData = ticket as any

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Ticket Lookup
          <Button
            onClick={() => refetch()}
            size="sm"
            variant="outline"
            className="ml-auto"
          >
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Ticket ID</Label>
          <Input
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
            placeholder="Enter ticket ID"
            type="number"
            className="bg-black/40 border-white/10"
          />
        </div>

        {ticketData && (
          <div className="space-y-3">
            <div className="p-3 bg-black/40 border border-white/10 rounded-lg">
              <p className="text-xs text-white/50">Player</p>
              <p className="text-sm font-mono break-all">{ticketData.player}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-white/50">First Round</p>
                <p className="text-lg font-bold">{ticketData.firstRoundId?.toString()}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Spot Size</p>
                <p className="text-lg font-bold">{ticketData.spotSize?.toString()}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Total Draws</p>
                <p className="text-lg font-bold">{ticketData.draws?.toString()}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Draws Remaining</p>
                <p className="text-lg font-bold">{ticketData.drawsRemaining?.toString()}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50">Wager Per Draw</p>
              <p className="text-lg font-bold">{formatUnits(ticketData.wagerPerDraw || BigInt(0), TOKEN_DECIMALS)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RoundDetailsSection() {
  const [roundId, setRoundId] = useState('')

  const { data: round, refetch } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'getRound',
    args: roundId ? [BigInt(roundId)] : undefined,
  })

  const roundData = round as any

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Round Details Lookup
          <Button
            onClick={() => refetch()}
            size="sm"
            variant="outline"
            className="ml-auto"
          >
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Round ID</Label>
          <Input
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            placeholder="Enter round ID"
            type="number"
            className="bg-black/40 border-white/10"
          />
        </div>

        {roundData && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-white/50">State</p>
                <p className="text-lg font-bold">
                  {roundData.state === 0 ? 'OPEN' : roundData.state === 1 ? 'CLOSED' : 'FINALIZED'}
                </p>
              </div>
              <div>
                <p className="text-xs text-white/50">Bulls-Eye Number</p>
                <p className="text-lg font-bold">{roundData.bullsEyeNumber?.toString()}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Total Base Wager</p>
                <p className="text-lg font-bold">{formatUnits(roundData.totalBaseWager || BigInt(0), TOKEN_DECIMALS)}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Pool Balance</p>
                <p className="text-lg font-bold">{formatUnits(roundData.poolBalance || BigInt(0), TOKEN_DECIMALS)}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Multiplier Outcome</p>
                <p className="text-lg font-bold">{roundData.drawnMultiplier?.toString()}x</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ClaimedStatusCheck({ address }: { address?: `0x${string}` }) {
  const [roundId, setRoundId] = useState('')
  const [ticketId, setTicketId] = useState('')

  const { data: isClaimed, refetch } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'claimed',
    args: roundId && ticketId ? [BigInt(roundId), BigInt(ticketId)] : undefined,
  })

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Check Claim Status
          <Button
            onClick={() => refetch()}
            size="sm"
            variant="outline"
            className="ml-auto"
          >
            Check
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Round ID</Label>
            <Input
              value={roundId}
              onChange={(e) => setRoundId(e.target.value)}
              placeholder="Round ID"
              type="number"
              className="bg-black/40 border-white/10"
            />
          </div>
          <div>
            <Label>Ticket ID</Label>
            <Input
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              placeholder="Ticket ID"
              type="number"
              className="bg-black/40 border-white/10"
            />
          </div>
        </div>

        {roundId && ticketId && (
          <div className="p-4 bg-black/40 border border-white/10 rounded-lg text-center">
            <p className="text-xs text-white/50 mb-2">Claim Status</p>
            <p className={`text-2xl font-bold ${isClaimed ? 'text-green-500' : 'text-yellow-500'}`}>
              {isClaimed ? '✓ CLAIMED' : '○ NOT CLAIMED'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Player Actions

function BuyTicketSection({ address }: { address?: `0x${string}` }) {
  const [roundId, setRoundId] = useState('')
  const [numbers, setNumbers] = useState<string>('[1,2,3,4,5,6,7,8,9,10]')
  const [spotSize, setSpotSize] = useState('10')
  const [draws, setDraws] = useState('1')
  const [wagerPerDraw, setWagerPerDraw] = useState('0.001')
  const [multiplier, setMultiplier] = useState(false)
  const [bullsEye, setBullsEye] = useState(false)
  const [plus3, setPlus3] = useState(false)
  const [progressive, setProgressive] = useState(false)
  const [approvalAmount, setApprovalAmount] = useState('10')

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const { writeContract: approveContract, data: approveHash, isPending: isApproving } = useWriteContract()
  const { isLoading: isApprovingConfirm, isSuccess: isApproved } = useWaitForTransactionReceipt({ hash: approveHash })

  const handleApprove = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      const amount = parseUnits(approvalAmount, TOKEN_DECIMALS)
      approveContract({
        address: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [KENO_ADDRESS, amount],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to approve')
    }
  }

  const handleBuy = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      const parsedNumbers = JSON.parse(numbers)
      const parsedRoundId = BigInt(roundId || '1')
      const parsedSpotSize = parseInt(spotSize)
      const parsedDraws = parseInt(draws)
      const wager = parseUnits(wagerPerDraw, TOKEN_DECIMALS)

      // Build addons bitmask
      let addons = 0
      if (multiplier) addons |= 1 << 0 // ADDON_MULTIPLIER
      if (bullsEye) addons |= 1 << 1 // ADDON_BULLSEYE
      if (plus3) addons |= 1 << 2 // ADDON_PLUS3
      if (progressive) addons |= 1 << 3 // ADDON_PROGRESSIVE

      writeContract({
        address: KENO_ADDRESS as `0x${string}`,
        abi: KENO_ABI,
        functionName: 'buyTicket',
        args: [parsedRoundId, parsedNumbers, parsedSpotSize, parsedDraws, addons, wager],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to buy ticket')
    }
  }

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Buy Keno Ticket
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Purchase a Keno ticket for consecutive draws</p>
                <p className="text-sm mb-2">
                  <strong>Example:</strong><br />
                  Numbers: [1,2,3,4,5,6,7,8,9,10]<br />
                  Spot Size: 10<br />
                  Draws: 5
                </p>
                <p className="text-xs text-white/70">
                  Pick 1-10 numbers from 1-80. The contract draws 20 numbers.
                  Match numbers to win based on paytable. Add-ons increase cost but boost potential prizes.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription className="text-white/60">
          Pick your numbers and add-ons for multi-draw Keno tickets
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="keno-approve">Approval Amount (Morbius)</Label>
          <div className="flex gap-2 mt-2">
            <Input
              id="keno-approve"
              value={approvalAmount}
              onChange={(e) => setApprovalAmount(e.target.value)}
              placeholder="10"
              className="bg-black/40 border-white/10"
            />
            <Button
              onClick={handleApprove}
              disabled={!address || isApproving || isApprovingConfirm}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isApproving || isApprovingConfirm ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                'Approve'
              )}
            </Button>
          </div>
          {isApproved && (
            <Alert className="mt-2 bg-green-500/10 border-green-500/20">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-500">
                Approval successful!
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div>
          <Label htmlFor="keno-round">Round ID</Label>
          <Input
            id="keno-round"
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            placeholder="1"
            type="number"
            className="bg-black/40 border-white/10"
          />
        </div>

        <div>
          <Label htmlFor="keno-numbers">Your Numbers (JSON Array 1-80)</Label>
          <textarea
            id="keno-numbers"
            value={numbers}
            onChange={(e) => setNumbers(e.target.value)}
            placeholder="[1,2,3,4,5,6,7,8,9,10]"
            rows={3}
            className="w-full mt-2 p-3 bg-black/40 border border-white/10 rounded-md text-white font-mono text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="spot-size">Spot Size (1-10)</Label>
            <Input
              id="spot-size"
              value={spotSize}
              onChange={(e) => setSpotSize(e.target.value)}
              placeholder="10"
              type="number"
              min="1"
              max="10"
              className="bg-black/40 border-white/10"
            />
          </div>

          <div>
            <Label htmlFor="draws">Number of Draws</Label>
            <Input
              id="draws"
              value={draws}
              onChange={(e) => setDraws(e.target.value)}
              placeholder="1"
              type="number"
              min="1"
              className="bg-black/40 border-white/10"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="wager">Wager Per Draw (Morbius)</Label>
          <Input
            id="wager"
            value={wagerPerDraw}
            onChange={(e) => setWagerPerDraw(e.target.value)}
            placeholder="0.001"
            type="number"
            step="0.001"
            className="bg-black/40 border-white/10"
          />
        </div>

        <div className="space-y-3">
          <Label>Add-Ons (optional)</Label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="multiplier"
                checked={multiplier}
                onCheckedChange={(checked) => setMultiplier(checked as boolean)}
              />
              <label htmlFor="multiplier" className="text-sm cursor-pointer">
                Multiplier (1x-10x random multiplier on winnings)
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="bullseye"
                checked={bullsEye}
                onCheckedChange={(checked) => setBullsEye(checked as boolean)}
              />
              <label htmlFor="bullseye" className="text-sm cursor-pointer">
                Bulls-Eye (3x payout if special number hit)
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="plus3"
                checked={plus3}
                onCheckedChange={(checked) => setPlus3(checked as boolean)}
              />
              <label htmlFor="plus3" className="text-sm cursor-pointer">
                Plus 3 (Draw 3 extra numbers for more chances)
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="progressive"
                checked={progressive}
                onCheckedChange={(checked) => setProgressive(checked as boolean)}
              />
              <label htmlFor="progressive" className="text-sm cursor-pointer">
                Progressive Jackpot (9/10 spots wins share of jackpot)
              </label>
            </div>
          </div>
        </div>

        <Button
          onClick={handleBuy}
          disabled={!address || isPending || isConfirming}
          className="w-full bg-purple-600 hover:bg-purple-700"
          size="lg"
        >
          {isPending || isConfirming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isPending ? 'Confirming...' : 'Buying...'}
            </>
          ) : (
            'Buy Keno Ticket'
          )}
        </Button>

        {isSuccess && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">
              Ticket purchased successfully!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function ClaimPrizeSection({ address }: { address?: `0x${string}` }) {
  const [roundId, setRoundId] = useState('')
  const [ticketId, setTicketId] = useState('')

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const handleClaim = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      const parsedRoundId = BigInt(roundId)
      const parsedTicketId = BigInt(ticketId)

      writeContract({
        address: KENO_ADDRESS as `0x${string}`,
        abi: KENO_ABI,
        functionName: 'claim',
        args: [parsedRoundId, parsedTicketId],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to claim')
    }
  }

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Claim Prize
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Claim your winnings from a finalized round</p>
                <p className="text-sm mb-2">
                  <strong>Example:</strong> Round ID = 5, Ticket ID = 123
                </p>
                <p className="text-xs text-white/70">
                  Must claim within 180 days of round end. Can only claim once per ticket per round.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription className="text-white/60">
          Claim prizes from finalized rounds
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="claim-round">Round ID</Label>
          <Input
            id="claim-round"
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            placeholder="1"
            type="number"
            className="bg-black/40 border-white/10"
          />
        </div>

        <div>
          <Label htmlFor="claim-ticket">Ticket ID</Label>
          <Input
            id="claim-ticket"
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
            placeholder="123"
            type="number"
            className="bg-black/40 border-white/10"
          />
        </div>

        <Button
          onClick={handleClaim}
          disabled={!address || !roundId || !ticketId || isPending || isConfirming}
          className="w-full bg-green-600 hover:bg-green-700"
          size="lg"
        >
          {isPending || isConfirming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isPending ? 'Confirming...' : 'Claiming...'}
            </>
          ) : (
            'Claim Prize'
          )}
        </Button>

        {isSuccess && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">
              Prize claimed successfully!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function AutoClaimSection({ address }: { address?: `0x${string}` }) {
  const [enabled, setEnabled] = useState(false)

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const { data: currentStatus, refetch } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'autoClaimEnabled',
    args: address ? [address] : undefined,
  })

  const handleToggle = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    writeContract({
      address: KENO_ADDRESS as `0x${string}`,
      abi: KENO_ABI,
      functionName: 'setAutoClaim',
      args: [!currentStatus],
    })
  }

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Auto-Claim Settings
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Automatically claim prizes when rounds finalize</p>
                <p className="text-xs text-white/70">
                  When enabled, the contract will attempt to auto-claim your prizes
                  during round finalization (gas-limited). If auto-claim fails, you can still claim manually.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription className="text-white/60">
          Enable automatic prize claiming (gas-limited)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-black/40 border border-white/10 rounded-lg">
          <span className="text-sm">Auto-Claim Status</span>
          <span className={`text-sm font-bold ${currentStatus ? 'text-green-500' : 'text-red-500'}`}>
            {currentStatus ? 'ENABLED' : 'DISABLED'}
          </span>
        </div>

        <Button
          onClick={handleToggle}
          disabled={!address || isPending || isConfirming}
          className={`w-full ${currentStatus ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
          size="lg"
        >
          {isPending || isConfirming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isPending ? 'Confirming...' : 'Updating...'}
            </>
          ) : currentStatus ? (
            'Disable Auto-Claim'
          ) : (
            'Enable Auto-Claim'
          )}
        </Button>

        {isSuccess && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">
              Auto-claim settings updated!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

// Admin Actions

function RoundManagementSection({ address }: { address?: `0x${string}` }) {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const handleStartNext = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    writeContract({
      address: KENO_ADDRESS as `0x${string}`,
      abi: KENO_ABI,
      functionName: 'startNextRound',
    })
  }

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Round Management (Owner Only)
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Admin functions for managing Keno rounds</p>
                <p className="text-xs text-white/70">
                  Start Next Round: Finalizes current round (if expired) and starts a new one.
                  Only contract owner can execute.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription className="text-white/60">
          Control round progression (requires owner permissions)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleStartNext}
          disabled={!address || isPending || isConfirming}
          className="w-full bg-orange-600 hover:bg-orange-700"
          size="lg"
        >
          {isPending || isConfirming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isPending ? 'Confirming...' : 'Starting...'}
            </>
          ) : (
            'Start Next Round'
          )}
        </Button>

        {isSuccess && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">
              Round operation successful!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function PaytableConfigSection({ address }: { address?: `0x${string}` }) {
  const [spotSize, setSpotSize] = useState('')
  const [hits, setHits] = useState('')
  const [multiplier, setMultiplier] = useState('')

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const handleSetPaytable = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      writeContract({
        address: KENO_ADDRESS as `0x${string}`,
        abi: KENO_ABI,
        functionName: 'setPaytable',
        args: [parseInt(spotSize), parseInt(hits), BigInt(multiplier)],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to update paytable')
    }
  }

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Paytable Configuration (Owner Only)
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Update prize multipliers for specific outcomes</p>
                <p className="text-sm mb-2">
                  <strong>Example:</strong><br />
                  Spot Size: 10<br />
                  Hits: 10<br />
                  Multiplier: 100000 (means 100,000x wager)
                </p>
                <p className="text-xs text-white/70">
                  Sets the payout multiplier for matching a specific number of spots.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription className="text-white/60">
          Configure prize payouts (requires owner permissions)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="paytable-spot">Spot Size (1-10)</Label>
          <Input
            id="paytable-spot"
            value={spotSize}
            onChange={(e) => setSpotSize(e.target.value)}
            placeholder="10"
            type="number"
            className="bg-black/40 border-white/10"
          />
        </div>

        <div>
          <Label htmlFor="paytable-hits">Hits</Label>
          <Input
            id="paytable-hits"
            value={hits}
            onChange={(e) => setHits(e.target.value)}
            placeholder="10"
            type="number"
            className="bg-black/40 border-white/10"
          />
        </div>

        <div>
          <Label htmlFor="paytable-mult">Multiplier (integer)</Label>
          <Input
            id="paytable-mult"
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
            placeholder="100000"
            type="number"
            className="bg-black/40 border-white/10"
          />
        </div>

        <Button
          onClick={handleSetPaytable}
          disabled={!address || !spotSize || !hits || !multiplier || isPending || isConfirming}
          className="w-full bg-purple-600 hover:bg-purple-700"
          size="lg"
        >
          {isPending || isConfirming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating...
            </>
          ) : (
            'Update Paytable'
          )}
        </Button>

        {isSuccess && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">
              Paytable updated successfully!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function ContractConfigSection({ address }: { address?: `0x${string}` }) {
  const [roundDuration, setRoundDuration] = useState('')
  const [maxWager, setMaxWager] = useState('')

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const handleUpdateDuration = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      writeContract({
        address: KENO_ADDRESS as `0x${string}`,
        abi: KENO_ABI,
        functionName: 'setRoundDuration',
        args: [BigInt(roundDuration)],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to update')
    }
  }

  const handleUpdateMaxWager = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      const wager = parseUnits(maxWager, TOKEN_DECIMALS)
      writeContract({
        address: KENO_ADDRESS as `0x${string}`,
        abi: KENO_ABI,
        functionName: 'setMaxWagerPerDraw',
        args: [wager],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to update')
    }
  }

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Contract Configuration (Owner Only)
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Configure core contract parameters</p>
                <p className="text-xs text-white/70">
                  Round Duration: Time in seconds per draw<br />
                  Max Wager: Maximum bet per draw to bound liability
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription className="text-white/60">
          Adjust contract settings (requires owner permissions)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Round Duration (seconds)</Label>
          <div className="flex gap-2">
            <Input
              value={roundDuration}
              onChange={(e) => setRoundDuration(e.target.value)}
              placeholder="180"
              type="number"
              className="bg-black/40 border-white/10"
            />
            <Button
              onClick={handleUpdateDuration}
              disabled={!address || !roundDuration || isPending || isConfirming}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Update
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Max Wager Per Draw (Morbius)</Label>
          <div className="flex gap-2">
            <Input
              value={maxWager}
              onChange={(e) => setMaxWager(e.target.value)}
              placeholder="0.001"
              type="number"
              step="0.001"
              className="bg-black/40 border-white/10"
            />
            <Button
              onClick={handleUpdateMaxWager}
              disabled={!address || !maxWager || isPending || isConfirming}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Update
            </Button>
          </div>
        </div>

        {isSuccess && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">
              Configuration updated successfully!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

// Statistics Components

function CurrentRoundStats() {
  const { data, isLoading, refetch } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'currentRoundId',
  })

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Current Round Information
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Information about the active Keno round</p>
                <p className="text-xs text-white/70">
                  Shows the current round ID and can be expanded to show more details.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            onClick={() => refetch()}
            size="sm"
            variant="outline"
            className="ml-auto"
          >
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          </div>
        ) : (
          <div>
            <p className="text-xs text-white/50">Current Round ID</p>
            <p className="text-3xl font-bold">{(data as bigint)?.toString() || '0'}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PlayerStatsSection({ address }: { address?: `0x${string}` }) {
  const { data, isLoading, refetch } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'getPlayerStats',
    args: address ? [address] : undefined,
  })

  const stats = data as any

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Your Keno Statistics
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Your lifetime Keno stats</p>
                <p className="text-xs text-white/70">
                  Total wagered, total won, tickets bought, win count, win rate, and net P&L.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            onClick={() => refetch()}
            size="sm"
            variant="outline"
            className="ml-auto"
          >
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!address ? (
          <p className="text-center text-white/50 py-4">Connect wallet to view stats</p>
        ) : isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-white/50">Total Wagered</p>
              <p className="text-xl font-bold">{formatUnits(stats[0] || BigInt(0), TOKEN_DECIMALS)}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Total Won</p>
              <p className="text-xl font-bold">{formatUnits(stats[1] || BigInt(0), TOKEN_DECIMALS)}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Tickets Bought</p>
              <p className="text-xl font-bold">{stats[2]?.toString()}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Win Count</p>
              <p className="text-xl font-bold">{stats[3]?.toString()}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Win Rate</p>
              <p className="text-xl font-bold">{(Number(stats[4]) / 100).toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Net P&L</p>
              <p className={`text-xl font-bold ${Number(stats[5]) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {(Number(stats[5]) / 1e18).toFixed(4)}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-center text-white/50">No data available</p>
        )}
      </CardContent>
    </Card>
  )
}

function GlobalKenoStats() {
  const { data, isLoading, refetch } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'getGlobalStats',
  })

  const stats = data as any

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Global Keno Statistics
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Lifetime stats for all Keno players</p>
                <p className="text-xs text-white/70">
                  Shows total amounts wagered, won, tickets sold, and active round.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            onClick={() => refetch()}
            size="sm"
            variant="outline"
            className="ml-auto"
          >
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-white/50">Total Wagered</p>
              <p className="text-xl font-bold">{formatUnits(stats[0] || BigInt(0), TOKEN_DECIMALS)}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Total Won</p>
              <p className="text-xl font-bold">{formatUnits(stats[1] || BigInt(0), TOKEN_DECIMALS)}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Total Tickets</p>
              <p className="text-xl font-bold">{stats[2]?.toString()}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Active Round</p>
              <p className="text-xl font-bold">{stats[3]?.toString()}</p>
            </div>
          </div>
        ) : (
          <p className="text-center text-white/50">No data available</p>
        )}
      </CardContent>
    </Card>
  )
}

function ProgressiveStats() {
  const { data, isLoading, refetch } = useReadContract({
    address: KENO_ADDRESS as `0x${string}`,
    abi: KENO_ABI,
    functionName: 'getProgressiveStats',
  })

  const stats = data as any

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Progressive Jackpot Stats
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Pulse Progressive Jackpot information</p>
                <p className="text-xs text-white/70">
                  Current pool, base seed, cost, total collected/paid, win count, and last win round.
                  Win condition: 9+ hits on 9/10-spot game with progressive add-on.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            onClick={() => refetch()}
            size="sm"
            variant="outline"
            className="ml-auto"
          >
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          </div>
        ) : stats ? (
          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/30 rounded-lg">
              <p className="text-sm text-white/70 mb-1">Current Jackpot Pool</p>
              <p className="text-3xl font-bold text-purple-400">{formatUnits(stats[0] || BigInt(0), TOKEN_DECIMALS)} Morbius</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-white/50">Base Seed</p>
                <p className="text-lg font-bold">{formatUnits(stats[1] || BigInt(0), TOKEN_DECIMALS)}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Cost Per Draw</p>
                <p className="text-lg font-bold">{formatUnits(stats[2] || BigInt(0), TOKEN_DECIMALS)}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Total Collected</p>
                <p className="text-lg font-bold">{formatUnits(stats[3] || BigInt(0), TOKEN_DECIMALS)}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Total Paid</p>
                <p className="text-lg font-bold">{formatUnits(stats[4] || BigInt(0), TOKEN_DECIMALS)}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Win Count</p>
                <p className="text-lg font-bold">{stats[5]?.toString()}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Last Win Round</p>
                <p className="text-lg font-bold">{stats[6]?.toString()}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-center text-white/50">No data available</p>
        )}
      </CardContent>
    </Card>
  )
}






