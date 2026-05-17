'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { decodeEventLog, parseEther } from 'viem'
import {
  usePublicClient,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
  useReadContract,
} from 'wagmi'
import { triggerSuccessConfetti } from '@/lib/utils'
import { ROULETTE_ABI } from '@/lib/roulette-abi'
import {
  ROULETTE_ADDRESS,
  MORBIUS_TOKEN_ADDRESS,
  PULSEX_V1_ROUTER_ADDRESS,
  WPLS_TOKEN_ADDRESS,
} from '@/lib/contracts'
import { useGasParams } from '@/lib/tx-gas'

const MAX_UINT256 = (1n << 256n) - 1n

const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }, { name: '_spender', type: 'address' }],
    name: 'allowance',
    outputs: [{ name: 'remaining', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: false,
    inputs: [{ name: '_spender', type: 'address' }, { name: '_value', type: 'uint256' }],
    name: 'approve',
    outputs: [{ name: 'success', type: 'bool' }],
    type: 'function',
  },
] as const

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

// Maps to the Roulette.sol BetType enum (0–9)
export enum BetType {
  STRAIGHT   = 0,
  SPLIT      = 1,
  STREET     = 2,
  CORNER     = 3,
  LINE       = 4,
  COLUMN     = 5,
  DOZEN      = 6,
  RED_BLACK  = 7,
  EVEN_ODD   = 8,
  LOW_HIGH   = 9,
}

// A single bet position on the table
export type RouletteBet = {
  betType: BetType
  param: number      // variant selector (col 0/1/2, dozen 0/1/2, red=0/black=1, even=0/odd=1, low=0/high=1)
  wager: bigint      // in MORBIUS wei
  numbers: number[]  // pocket numbers covered (empty for outside bets)
  /** react-casino-roulette BetId — used only for felt chip display */
  libraryBetId: string
  /** Same as library onBet payload — for Bets[payload] sync */
  libraryPayload: string[]
}

export type RouletteSpinResult = {
  spinId: bigint
  result: number       // winning pocket 0–36
  totalWagered: bigint
  grossPayout: bigint
  netPayout: bigint
  bets: RouletteBet[]
}

interface UseRoulettePlayFlowParams {
  address?: `0x${string}`
  isConnected: boolean
  bets: RouletteBet[]        // current placed bets
  totalWager: bigint         // sum of all bet wagers
}

// Encode bets into the shape the Roulette.sol ABI expects
function encodeBets(bets: RouletteBet[]) {
  return bets.map((b) => ({
    betType: b.betType,
    param: b.param,
    wager: b.wager,
    numbers: b.numbers.map((n) => n),
  }))
}

export function useRoulettePlayFlow({
  address,
  isConnected,
  bets,
  totalWager,
}: UseRoulettePlayFlowParams) {
  const publicClient = usePublicClient()
  const getGas = useGasParams()
  const [paymentMethod, setPaymentMethod] = useState<'MORBIUS' | 'PLS'>('MORBIUS')
  const [isSpinning, setIsSpinning] = useState(false)
  const [lastResult, setLastResult] = useState<RouletteSpinResult | null>(null)
  const [spinComplete, setSpinComplete] = useState(false)
  const [pendingApproval, setPendingApproval] = useState<{ totalWager: bigint } | null>(null)
  const [optimisticAllowanceWei, setOptimisticAllowanceWei] = useState<bigint>(0n)

  // ─── MORBIUS allowance ───────────────────────────────────────────────────
  const { data: allowanceResult } = useReadContracts({
    contracts: address
      ? [{ address: MORBIUS_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, ROULETTE_ADDRESS] }]
      : [],
  })

  const morbiusAllowanceWei = useMemo(() => {
    type ReadValue = { result?: bigint } | bigint | undefined
    const res = allowanceResult as ReadValue[] | undefined
    const v = res && res[0]
    if (typeof v === 'bigint') return v
    if (v && typeof v === 'object' && 'result' in v && typeof v.result === 'bigint') return v.result
    return 0n
  }, [allowanceResult])

  const effectiveAllowanceWei = useMemo(
    () => (morbiusAllowanceWei > optimisticAllowanceWei ? morbiusAllowanceWei : optimisticAllowanceWei),
    [morbiusAllowanceWei, optimisticAllowanceWei]
  )

  // ─── PLS quote ───────────────────────────────────────────────────────────
  const { data: wplsQuote } = useReadContract({
    address: PULSEX_V1_ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: 'getAmountsIn',
    args:
      paymentMethod !== 'MORBIUS' && totalWager > 0n
        ? [totalWager, [WPLS_TOKEN_ADDRESS, MORBIUS_TOKEN_ADDRESS]]
        : undefined,
    query: {
      enabled: paymentMethod !== 'MORBIUS' && totalWager > 0n,
      refetchInterval: 10000,
    },
  })

  const wplsRequiredWei = useMemo(() => {
    const quote = Array.isArray(wplsQuote) ? (wplsQuote as bigint[])[0] ?? 0n : 0n
    if (quote === 0n) return 0n
    // Add 10% slippage + 20% PLS buffer (same as Keno)
    const taxed = (quote * 15000n) / 10000n
    return (taxed * 12000n) / 10000n
  }, [wplsQuote])

  // ─── Contract writes ─────────────────────────────────────────────────────
  const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending, error: approveError } = useWriteContract()
  const { writeContractAsync: writeSpinAsync, isPending: isSpinPending, error: spinError } = useWriteContract()

  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed, error: approveConfirmError } =
    useWaitForTransactionReceipt({ hash: approveHash })

  // ─── Parse Spun event from receipt ───────────────────────────────────────
  const parseSpinResult = useCallback(
    (receipt: any, placedBets: RouletteBet[]): RouletteSpinResult | null => {
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: ROULETTE_ABI, data: log.data, topics: log.topics })
          if (decoded.eventName === 'Spun') {
            const args = decoded.args as any
            return {
              spinId: BigInt(args.spinId),
              result: Number(args.result),
              totalWagered: BigInt(args.totalWagered),
              grossPayout: BigInt(args.grossPayout),
              netPayout: BigInt(args.netPayout),
              bets: placedBets,
            }
          }
        } catch {
          // skip unrelated logs
        }
      }
      return null
    },
    []
  )

  // ─── Main play handler ───────────────────────────────────────────────────
  const handleSpin = useCallback(async () => {
    if (!isConnected || !address) {
      toast.error('Connect wallet to play.')
      return
    }
    if (bets.length === 0) {
      toast.error('Place at least one bet before spinning.')
      return
    }

    const encodedBets = encodeBets(bets)

    if (paymentMethod === 'PLS') {
      if (wplsRequiredWei === 0n) {
        toast.error('Unable to quote PLS required. Try again.')
        return
      }
      try {
        setIsSpinning(true)
        setSpinComplete(false)
        const hash = await writeSpinAsync({
          address: ROULETTE_ADDRESS,
          abi: ROULETTE_ABI,
          functionName: 'spinWithPLS',
          args: [encodedBets],
          value: wplsRequiredWei,
          ...getGas(),
        } as any)
        const receipt = await publicClient?.waitForTransactionReceipt({ hash })
        if (receipt) {
          const result = parseSpinResult(receipt, bets)
          if (result) {
            setLastResult(result)
            if (result.netPayout > 0n) triggerSuccessConfetti()
          }
        }
        toast.success('Spin complete!')
      } catch (err: any) {
        console.error(err)
        if (!err?.message?.includes('User rejected') && !err?.message?.includes('user rejected')) {
          toast.error(err?.shortMessage || err?.message || 'Spin failed')
        }
      } finally {
        setIsSpinning(false)
      }
      return
    }

    // MORBIUS path — check allowance first
    if (effectiveAllowanceWei < totalWager) {
      if (isApprovePending || isApproveConfirming) return
      setPendingApproval({ totalWager })
      writeApprove({
        address: MORBIUS_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ROULETTE_ADDRESS, MAX_UINT256],
        ...getGas(),
      } as any)
      return
    }

    try {
      setIsSpinning(true)
      setSpinComplete(false)
      const hash = await writeSpinAsync({
        address: ROULETTE_ADDRESS,
        abi: ROULETTE_ABI,
        functionName: 'spin',
        args: [encodedBets],
        ...getGas(),
      } as any)
      const receipt = await publicClient?.waitForTransactionReceipt({ hash })
      if (receipt) {
        const result = parseSpinResult(receipt, bets)
        if (result) {
          setLastResult(result)
          if (result.netPayout > 0n) triggerSuccessConfetti()
        }
      }
      toast.success('Spin complete!')
    } catch (err: any) {
      console.error(err)
      if (!err?.message?.includes('User rejected') && !err?.message?.includes('user rejected')) {
        toast.error(err?.shortMessage || err?.message || 'Spin failed')
      }
    } finally {
      setIsSpinning(false)
    }
  }, [
    address,
    bets,
    effectiveAllowanceWei,
    isApproveConfirming,
    isApprovePending,
    isConnected,
    parseSpinResult,
    paymentMethod,
    publicClient,
    totalWager,
    wplsRequiredWei,
    writeApprove,
    writeSpinAsync,
    getGas,
  ])

  // ─── Side-effects for approval flow ─────────────────────────────────────
  useEffect(() => {
    if (isApproveConfirmed && pendingApproval) {
      setOptimisticAllowanceWei(MAX_UINT256)
      toast.success('Approved MORBIUS. Click Spin to place your bets.')
      setPendingApproval(null)
    }
  }, [isApproveConfirmed, pendingApproval])

  useEffect(() => {
    if (approveError) toast.error(approveError.message || 'Approval failed.')
  }, [approveError])

  useEffect(() => {
    if (spinError) {
      const msg = (spinError as any)?.shortMessage || spinError.message || 'Spin failed.'
      if (!msg.includes('User rejected') && !msg.includes('user rejected')) toast.error(msg)
    }
  }, [spinError])

  useEffect(() => {
    if (approveConfirmError) toast.error(approveConfirmError.message || 'Approval failed.')
  }, [approveConfirmError])

  const busy = isApprovePending || isApproveConfirming || isSpinPending || isSpinning

  return {
    paymentMethod,
    setPaymentMethod,
    wplsRequiredWei,
    handleSpin,
    busy,
    isApprovePending,
    isApproveConfirming,
    isSpinPending,
    isSpinning,
    lastResult,
    spinComplete,
    setSpinComplete,
  }
}
