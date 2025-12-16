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
import { Loader2, HelpCircle, CheckCircle, XCircle } from 'lucide-react'
import { LOTTERY_ADDRESS, TOKEN_DECIMALS, MORBIUS_TOKEN_ADDRESS, WPLS_TOKEN_ADDRESS } from '@/lib/contracts'
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2'
import { ERC20_ABI } from '@/abi/erc20'
import { toast } from 'sonner'

interface LotteryContractInterfaceProps {
  address?: `0x${string}`
}

export function LotteryContractInterface({ address }: LotteryContractInterfaceProps) {
  const [activeSection, setActiveSection] = useState('user-actions')

  return (
    <Tabs value={activeSection} onValueChange={setActiveSection} className="space-y-6">
      <TabsList className="grid w-full grid-cols-3 bg-black/40 border border-white/10">
        <TabsTrigger value="user-actions" className="data-[state=active]:bg-purple-600">
          User Actions
        </TabsTrigger>
        <TabsTrigger value="admin-actions" className="data-[state=active]:bg-purple-600">
          Admin
        </TabsTrigger>
        <TabsTrigger value="stats" className="data-[state=active]:bg-purple-600">
          Statistics
        </TabsTrigger>
      </TabsList>

      <TabsContent value="user-actions" className="space-y-6">
        <BuyTicketsSection address={address} />
        <BuyTicketsMultiRoundSection address={address} />
        <BuyWithWPLSSection address={address} />
        <ClaimWinningsSection address={address} />
      </TabsContent>

      <TabsContent value="admin-actions" className="space-y-6">
        <FinalizeRoundSection address={address} />
        <UpdateSettingsSection address={address} />
      </TabsContent>

      <TabsContent value="stats" className="space-y-6">
        <CurrentRoundStats />
        <PlayerStats address={address} />
        <GlobalStats />
        <BracketConfig />
      </TabsContent>
    </Tabs>
  )
}

// User Actions Components

function BuyTicketsSection({ address }: { address?: `0x${string}` }) {
  const [tickets, setTickets] = useState<string>('[[1,2,3,4,5,6]]')
  const [approvalAmount, setApprovalAmount] = useState('1000000')

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
        args: [LOTTERY_ADDRESS, amount],
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
      const parsedTickets = JSON.parse(tickets)
      
      // Validate format
      if (!Array.isArray(parsedTickets) || parsedTickets.length === 0) {
        toast.error('Invalid ticket format. Must be array of number arrays.')
        return
      }

      writeContract({
        address: LOTTERY_ADDRESS as `0x${string}`,
        abi: LOTTERY_6OF55_V2_ABI,
        functionName: 'buyTickets',
        args: [parsedTickets],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to buy tickets')
    }
  }

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Buy Tickets (Morbius)
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Purchase lottery tickets with Morbius tokens</p>
                <p className="text-sm mb-2">
                  <strong>Example:</strong> [[1,2,3,4,5,6], [7,8,9,10,11,12]]
                </p>
                <p className="text-xs text-white/70">
                  Each ticket costs 1,000 Morbius. You must approve the contract first.
                  Pick 6 unique numbers between 1-55 per ticket.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription className="text-white/60">
          Purchase lottery tickets for the current round
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="approve-amount">Approval Amount (Morbius)</Label>
          <div className="flex gap-2 mt-2">
            <Input
              id="approve-amount"
              value={approvalAmount}
              onChange={(e) => setApprovalAmount(e.target.value)}
              placeholder="1000000"
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
                Approval successful! You can now buy tickets.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div>
          <Label htmlFor="tickets">Ticket Numbers (JSON Array)</Label>
          <textarea
            id="tickets"
            value={tickets}
            onChange={(e) => setTickets(e.target.value)}
            placeholder="[[1,2,3,4,5,6], [7,8,9,10,11,12]]"
            rows={4}
            className="w-full mt-2 p-3 bg-black/40 border border-white/10 rounded-md text-white font-mono text-sm"
          />
          <p className="text-xs text-white/50 mt-1">
            Format: Array of arrays. Each inner array = 6 numbers (1-55). Max 100 tickets per transaction.
          </p>
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
            'Buy Tickets'
          )}
        </Button>

        {isSuccess && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">
              Tickets purchased successfully!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function BuyTicketsMultiRoundSection({ address }: { address?: `0x${string}` }) {
  const [ticketGroups, setTicketGroups] = useState<string>('[[[1,2,3,4,5,6]], [[7,8,9,10,11,12]]]')
  const [roundOffsets, setRoundOffsets] = useState<string>('[0, 1]')

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const handleBuy = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      const parsedGroups = JSON.parse(ticketGroups)
      const parsedOffsets = JSON.parse(roundOffsets)

      if (!Array.isArray(parsedGroups) || !Array.isArray(parsedOffsets)) {
        toast.error('Invalid format')
        return
      }

      if (parsedGroups.length !== parsedOffsets.length) {
        toast.error('Ticket groups and round offsets must have same length')
        return
      }

      writeContract({
        address: LOTTERY_ADDRESS as `0x${string}`,
        abi: LOTTERY_6OF55_V2_ABI,
        functionName: 'buyTicketsForRounds',
        args: [parsedGroups, parsedOffsets],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to buy tickets')
    }
  }

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Buy Tickets for Multiple Rounds
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Purchase tickets for current and future rounds</p>
                <p className="text-sm mb-2">
                  <strong>Example:</strong><br />
                  Ticket Groups: [[[1,2,3,4,5,6]], [[7,8,9,10,11,12]]]<br />
                  Round Offsets: [0, 1]
                </p>
                <p className="text-xs text-white/70">
                  Offset 0 = current round, 1 = next round, etc. Max offset = 100.
                  Total cost = (tickets × rounds × 1000 Morbius)
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription className="text-white/60">
          Buy tickets for current and future rounds (max 100 rounds ahead)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="ticket-groups">Ticket Groups (3D Array)</Label>
          <textarea
            id="ticket-groups"
            value={ticketGroups}
            onChange={(e) => setTicketGroups(e.target.value)}
            placeholder="[[[1,2,3,4,5,6]], [[7,8,9,10,11,12]]]"
            rows={4}
            className="w-full mt-2 p-3 bg-black/40 border border-white/10 rounded-md text-white font-mono text-sm"
          />
        </div>

        <div>
          <Label htmlFor="round-offsets">Round Offsets (Array)</Label>
          <Input
            id="round-offsets"
            value={roundOffsets}
            onChange={(e) => setRoundOffsets(e.target.value)}
            placeholder="[0, 1, 2]"
            className="bg-black/40 border-white/10 font-mono"
          />
          <p className="text-xs text-white/50 mt-1">
            0 = current round, 1 = next round, 2 = round after next, etc.
          </p>
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
            'Buy Multi-Round Tickets'
          )}
        </Button>

        {isSuccess && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">
              Multi-round tickets purchased successfully!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function BuyWithWPLSSection({ address }: { address?: `0x${string}` }) {
  const [tickets, setTickets] = useState<string>('[[1,2,3,4,5,6]]')
  const [extraBuffer, setExtraBuffer] = useState('0')
  const [approvalAmount, setApprovalAmount] = useState('1')

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
        address: WPLS_TOKEN_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [LOTTERY_ADDRESS, amount],
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
      const parsedTickets = JSON.parse(tickets)
      const bufferBps = parseInt(extraBuffer)

      if (bufferBps > 0) {
        // Use buffered version
        writeContract({
          address: LOTTERY_ADDRESS as `0x${string}`,
          abi: LOTTERY_6OF55_V2_ABI,
          functionName: 'buyTicketsWithWPLSAndBuffer',
          args: [parsedTickets, BigInt(bufferBps)],
        })
      } else {
        // Use standard version
        writeContract({
          address: LOTTERY_ADDRESS as `0x${string}`,
          abi: LOTTERY_6OF55_V2_ABI,
          functionName: 'buyTicketsWithWPLS',
          args: [parsedTickets],
        })
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to buy tickets')
    }
  }

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Buy Tickets with WPLS
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Purchase tickets using WPLS (auto-swaps to Morbius)</p>
                <p className="text-sm mb-2">
                  <strong>Example:</strong> [[1,2,3,4,5,6]]
                </p>
                <p className="text-xs text-white/70">
                  Contract automatically swaps WPLS to Morbius via PulseX.
                  Default buffer: 11.1% (covers 5.5% tax + 5% slippage).
                  You can add extra buffer if needed (in basis points, 100 = 1%).
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription className="text-white/60">
          Buy tickets with WPLS - automatically swaps to Morbius
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="wpls-approve-amount">WPLS Approval Amount</Label>
          <div className="flex gap-2 mt-2">
            <Input
              id="wpls-approve-amount"
              value={approvalAmount}
              onChange={(e) => setApprovalAmount(e.target.value)}
              placeholder="1"
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
                'Approve WPLS'
              )}
            </Button>
          </div>
          {isApproved && (
            <Alert className="mt-2 bg-green-500/10 border-green-500/20">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-500">
                WPLS approval successful!
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div>
          <Label htmlFor="wpls-tickets">Ticket Numbers</Label>
          <textarea
            id="wpls-tickets"
            value={tickets}
            onChange={(e) => setTickets(e.target.value)}
            placeholder="[[1,2,3,4,5,6]]"
            rows={3}
            className="w-full mt-2 p-3 bg-black/40 border border-white/10 rounded-md text-white font-mono text-sm"
          />
        </div>

        <div>
          <Label htmlFor="extra-buffer">Extra Buffer (basis points, 0-10000)</Label>
          <Input
            id="extra-buffer"
            value={extraBuffer}
            onChange={(e) => setExtraBuffer(e.target.value)}
            placeholder="0"
            type="number"
            className="bg-black/40 border-white/10"
          />
          <p className="text-xs text-white/50 mt-1">
            Optional extra buffer added on top of default 11.1%. 100 = 1%, 1000 = 10%.
          </p>
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
            'Buy with WPLS'
          )}
        </Button>

        {isSuccess && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">
              Tickets purchased with WPLS successfully!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function ClaimWinningsSection({ address }: { address?: `0x${string}` }) {
  const [roundId, setRoundId] = useState('')

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const handleClaim = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      const parsedRoundId = BigInt(roundId)
      writeContract({
        address: LOTTERY_ADDRESS as `0x${string}`,
        abi: LOTTERY_6OF55_V2_ABI,
        functionName: 'claimWinnings',
        args: [parsedRoundId],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to claim winnings')
    }
  }

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Claim Winnings
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Claim your winnings from a finalized round</p>
                <p className="text-sm mb-2">
                  <strong>Example:</strong> Round ID = 5
                </p>
                <p className="text-xs text-white/70">
                  You can only claim from finalized rounds. Each address can claim once per round.
                  Winnings are transferred to your wallet immediately.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription className="text-white/60">
          Claim your prize from a finalized round
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="claim-round">Round ID</Label>
          <Input
            id="claim-round"
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            placeholder="5"
            type="number"
            className="bg-black/40 border-white/10"
          />
        </div>

        <Button
          onClick={handleClaim}
          disabled={!address || !roundId || isPending || isConfirming}
          className="w-full bg-green-600 hover:bg-green-700"
          size="lg"
        >
          {isPending || isConfirming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isPending ? 'Confirming...' : 'Claiming...'}
            </>
          ) : (
            'Claim Winnings'
          )}
        </Button>

        {isSuccess && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">
              Winnings claimed successfully!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

// Admin Actions Components

function FinalizeRoundSection({ address }: { address?: `0x${string}` }) {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const handleFinalize = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    writeContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'finalizeRound',
    })
  }

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Finalize Round
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Manually finalize the current round</p>
                <p className="text-sm mb-2">
                  <strong>Example:</strong> Click when round timer expires
                </p>
                <p className="text-xs text-white/70">
                  Can only finalize after round duration has passed.
                  Generates winning numbers, calculates prizes, and starts a new round.
                  Anyone can call this function.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription className="text-white/60">
          Finalize the current round if time has expired
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleFinalize}
          disabled={!address || isPending || isConfirming}
          className="w-full bg-orange-600 hover:bg-orange-700"
          size="lg"
        >
          {isPending || isConfirming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isPending ? 'Confirming...' : 'Finalizing...'}
            </>
          ) : (
            'Finalize Current Round'
          )}
        </Button>

        {isSuccess && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">
              Round finalized successfully!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function UpdateSettingsSection({ address }: { address?: `0x${string}` }) {
  const [roundDuration, setRoundDuration] = useState('')
  const [megaInterval, setMegaInterval] = useState('')
  const [blockDelay, setBlockDelay] = useState('')

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const handleUpdateDuration = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      const duration = BigInt(roundDuration)
      writeContract({
        address: LOTTERY_ADDRESS as `0x${string}`,
        abi: LOTTERY_6OF55_V2_ABI,
        functionName: 'updateRoundDuration',
        args: [duration],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to update')
    }
  }

  const handleUpdateMega = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      const interval = BigInt(megaInterval)
      writeContract({
        address: LOTTERY_ADDRESS as `0x${string}`,
        abi: LOTTERY_6OF55_V2_ABI,
        functionName: 'updateMegaMillionsInterval',
        args: [interval],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to update')
    }
  }

  const handleUpdateBlockDelay = () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    try {
      const delay = BigInt(blockDelay)
      writeContract({
        address: LOTTERY_ADDRESS as `0x${string}`,
        abi: LOTTERY_6OF55_V2_ABI,
        functionName: 'updateBlockDelay',
        args: [delay],
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to update')
    }
  }

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Update Settings (Owner Only)
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Admin functions - only contract owner can execute</p>
                <p className="text-xs text-white/70">
                  Round Duration: Time in seconds between draws<br />
                  MegaMorbius Interval: Every Nth round triggers MegaMorbius<br />
                  Block Delay: Blocks to wait before using randomness
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription className="text-white/60">
          Configure lottery parameters (requires owner permissions)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Round Duration (seconds)</Label>
          <div className="flex gap-2">
            <Input
              value={roundDuration}
              onChange={(e) => setRoundDuration(e.target.value)}
              placeholder="86400"
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
          <Label>MegaMorbius Interval (rounds)</Label>
          <div className="flex gap-2">
            <Input
              value={megaInterval}
              onChange={(e) => setMegaInterval(e.target.value)}
              placeholder="5"
              type="number"
              className="bg-black/40 border-white/10"
            />
            <Button
              onClick={handleUpdateMega}
              disabled={!address || !megaInterval || isPending || isConfirming}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Update
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Block Delay</Label>
          <div className="flex gap-2">
            <Input
              value={blockDelay}
              onChange={(e) => setBlockDelay(e.target.value)}
              placeholder="0"
              type="number"
              className="bg-black/40 border-white/10"
            />
            <Button
              onClick={handleUpdateBlockDelay}
              disabled={!address || !blockDelay || isPending || isConfirming}
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
              Settings updated successfully!
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
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getCurrentRoundInfo',
  })

  const stats = data as any

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
                <p className="font-semibold mb-2">Real-time stats for the active round</p>
                <p className="text-xs text-white/70">
                  Shows round ID, timestamps, pool size, ticket count, unique players,
                  time remaining, and whether it's a MegaMorbius round.
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
              <p className="text-xs text-white/50">Round ID</p>
              <p className="text-xl font-bold">{stats[0]?.toString()}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">State</p>
              <p className="text-xl font-bold">
                {stats[8] === 0 ? 'OPEN' : 'FINALIZED'}
              </p>
            </div>
            <div>
              <p className="text-xs text-white/50">Total Morbius</p>
              <p className="text-xl font-bold">{formatUnits(stats[3] || BigInt(0), TOKEN_DECIMALS)}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Total Tickets</p>
              <p className="text-xl font-bold">{stats[4]?.toString()}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Unique Players</p>
              <p className="text-xl font-bold">{stats[5]?.toString()}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Time Remaining</p>
              <p className="text-xl font-bold">
                {Math.floor(Number(stats[6] || 0) / 60)}m
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-white/50">MegaMorbius Round</p>
              <p className="text-xl font-bold">{stats[7] ? 'YES 🎰' : 'No'}</p>
            </div>
          </div>
        ) : (
          <p className="text-center text-white/50">No data available</p>
        )}
      </CardContent>
    </Card>
  )
}

function PlayerStats({ address }: { address?: `0x${string}` }) {
  const { data, isLoading, refetch } = useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getPlayerLifetime',
    args: address ? [address] : undefined,
  })

  const stats = data as any

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Your Lifetime Statistics
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Your personal stats across all rounds</p>
                <p className="text-xs text-white/70">
                  Tracks total tickets bought, Morbius spent, winnings claimed,
                  and pending claimable prizes.
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
              <p className="text-xs text-white/50">Tickets Bought</p>
              <p className="text-xl font-bold">{stats[0]?.toString()}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Total Spent</p>
              <p className="text-xl font-bold">{formatUnits(stats[1] || BigInt(0), TOKEN_DECIMALS)}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Total Claimed</p>
              <p className="text-xl font-bold">{formatUnits(stats[2] || BigInt(0), TOKEN_DECIMALS)}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Claimable Now</p>
              <p className="text-xl font-bold text-green-500">{formatUnits(stats[3] || BigInt(0), TOKEN_DECIMALS)}</p>
            </div>
          </div>
        ) : (
          <p className="text-center text-white/50">No data available</p>
        )}
      </CardContent>
    </Card>
  )
}

function GlobalStats() {
  const { data: totalTickets, isLoading: loadingTickets, refetch: refetchTickets } = useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getTotalTicketsEver',
  })

  const { data: totalCollected, isLoading: loadingCollected, refetch: refetchCollected } = useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getTotalMorbiusEverCollected',
  })

  const { data: totalClaimed, isLoading: loadingClaimed, refetch: refetchClaimed } = useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getTotalMorbiusEverClaimed',
  })

  const { data: totalClaimable, isLoading: loadingClaimable, refetch: refetchClaimable } = useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getTotalMorbiusClaimableAll',
  })

  const { data: megaBank, isLoading: loadingMega, refetch: refetchMega } = useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getMegaMillionsBank',
  })

  const isLoading = loadingTickets || loadingCollected || loadingClaimed || loadingClaimable || loadingMega

  const refetchAll = () => {
    refetchTickets()
    refetchCollected()
    refetchClaimed()
    refetchClaimable()
    refetchMega()
  }

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Global Statistics
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">Lifetime stats for the entire lottery contract</p>
                <p className="text-xs text-white/70">
                  Total tickets sold, Morbius collected, prizes claimed,
                  outstanding prizes, and MegaMorbius bank balance.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            onClick={refetchAll}
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-white/50">Total Tickets Ever</p>
              <p className="text-xl font-bold">{(totalTickets as bigint)?.toString() || '0'}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Total Collected</p>
              <p className="text-xl font-bold">{formatUnits((totalCollected as bigint) || BigInt(0), TOKEN_DECIMALS)}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Total Claimed</p>
              <p className="text-xl font-bold">{formatUnits((totalClaimed as bigint) || BigInt(0), TOKEN_DECIMALS)}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Outstanding Prizes</p>
              <p className="text-xl font-bold text-yellow-500">
                {formatUnits((totalClaimable as bigint) || BigInt(0), TOKEN_DECIMALS)}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-white/50">MegaMorbius Bank</p>
              <p className="text-2xl font-bold text-purple-500">
                {formatUnits((megaBank as bigint) || BigInt(0), TOKEN_DECIMALS)} Morbius
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BracketConfig() {
  const { data, isLoading, refetch } = useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getBracketConfig',
  })

  const config = data as any

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Prize Distribution Configuration
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-white/50" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-2">How prizes are distributed</p>
                <p className="text-xs text-white/70">
                  Shows the percentage allocation for each bracket (1-6 matches),
                  winners pool, burn amount, and MegaMorbius contribution.
                  All percentages in basis points (100 = 1%).
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
        ) : config ? (
          <div className="space-y-6">
            <div>
              <h4 className="font-semibold mb-3">Bracket Percentages (of 60% Winners Pool)</h4>
              <div className="grid grid-cols-3 gap-3">
                {(config[0] as bigint[])?.map((percent: bigint, idx: number) => (
                  <div key={idx} className="p-3 bg-black/40 border border-white/10 rounded-lg">
                    <p className="text-xs text-white/50">Bracket {idx + 1}</p>
                    <p className="text-lg font-bold">{(Number(percent) / 100).toFixed(1)}%</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-black/40 border border-white/10 rounded-lg">
                <p className="text-xs text-white/50">Winners Pool</p>
                <p className="text-lg font-bold">{(Number(config[1]) / 100).toFixed(0)}%</p>
              </div>
              <div className="p-3 bg-black/40 border border-white/10 rounded-lg">
                <p className="text-xs text-white/50">Burn</p>
                <p className="text-lg font-bold">{(Number(config[2]) / 100).toFixed(0)}%</p>
              </div>
              <div className="p-3 bg-black/40 border border-white/10 rounded-lg">
                <p className="text-xs text-white/50">MegaMorbius</p>
                <p className="text-lg font-bold">{(Number(config[3]) / 100).toFixed(0)}%</p>
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






