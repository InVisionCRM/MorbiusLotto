'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { decodeEventLog, parseEther } from 'viem'
import { usePublicClient, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { triggerSuccessConfetti } from '@/lib/utils'
import { KENO_ABI } from '@/lib/keno-abi'
import { KENO_ADDRESS, MORBIUS_TOKEN_ADDRESS, PULSEX_V1_ROUTER_ADDRESS, WPLS_TOKEN_ADDRESS } from '@/lib/contracts'

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

export type KenoLastResult = {
  ticketId: bigint
  spotSize: number
  wager: bigint
  playerNumbers: number[]
  winningNumbers: number[]
  hits: number
  grossPayout: bigint
  netPayout: bigint
}

interface UseKenoPlayFlowParams {
  address?: `0x${string}`
  isConnected: boolean
  selectedNumbers: number[]
  spotSize: number
  wager: number
}

export function useKenoPlayFlow({
  address,
  isConnected,
  selectedNumbers,
  spotSize,
  wager,
}: UseKenoPlayFlowParams) {
  const publicClient = usePublicClient()
  const [paymentMethod, setPaymentMethod] = useState<'MORBIUS' | 'PLS'>('MORBIUS')
  const [isPlaying, setIsPlaying] = useState(false)
  const [lastResult, setLastResult] = useState<KenoLastResult | null>(null)
  const [drawComplete, setDrawComplete] = useState(false)
  const [drawnCount, setDrawnCount] = useState(0)
  const [pendingApproval, setPendingApproval] = useState<{ wagerWei: bigint } | null>(null)
  const [optimisticAllowanceWei, setOptimisticAllowanceWei] = useState<bigint>(0n)

  const { data: allowanceResult } = useReadContracts({
    contracts: address
      ? [{ address: MORBIUS_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, KENO_ADDRESS] }]
      : [],
  })

  const morbiusAllowanceWei = useMemo(() => {
    type ReadValue = { result?: bigint } | bigint | undefined
    const res = allowanceResult as ReadValue[] | undefined
    const v = res && res[0]
    if (typeof v === 'bigint') return v
    if (v && typeof v === 'object' && 'result' in v && typeof v.result === 'bigint') return v.result
    return BigInt(0)
  }, [allowanceResult])

  const effectiveAllowanceWei = useMemo(
    () => (morbiusAllowanceWei > optimisticAllowanceWei ? morbiusAllowanceWei : optimisticAllowanceWei),
    [morbiusAllowanceWei, optimisticAllowanceWei]
  )

  const totalCostWei = useMemo(() => parseEther(wager.toString()), [wager])

  const { data: wplsQuote } = useReadContract({
    address: PULSEX_V1_ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: 'getAmountsIn',
    args:
      paymentMethod !== 'MORBIUS' && totalCostWei > BigInt(0)
        ? [totalCostWei, [WPLS_TOKEN_ADDRESS, MORBIUS_TOKEN_ADDRESS]]
        : undefined,
    query: {
      enabled: paymentMethod !== 'MORBIUS' && totalCostWei > BigInt(0),
      refetchInterval: 10000,
    },
  })

  const wplsRequiredWei = useMemo(() => {
    const quote = Array.isArray(wplsQuote) ? (wplsQuote as bigint[])[0] ?? BigInt(0) : BigInt(0)
    if (quote === BigInt(0)) return BigInt(0)
    const taxed = (quote * BigInt(15000)) / BigInt(10000)
    return (taxed * BigInt(12000)) / BigInt(10000)
  }, [wplsQuote])

  const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending, error: approveError } = useWriteContract()
  const { writeContractAsync: writePlayAsync, isPending: isPlayPending, error: playError } = useWriteContract()

  const {
    isLoading: isApproveConfirming,
    isSuccess: isApproveConfirmed,
    error: approveConfirmError,
  } = useWaitForTransactionReceipt({ hash: approveHash })

  const parseKenoResult = useCallback((receipt: any, playerNums: number[]): KenoLastResult | null => {
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: KENO_ABI,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName === 'KenoPlayed') {
          const args = decoded.args as any
          return {
            ticketId: args.ticketId,
            spotSize: Number(args.spotSize),
            wager: args.wager,
            playerNumbers: playerNums,
            winningNumbers: [],
            hits: Number(args.hits),
            grossPayout: args.grossPayout,
            netPayout: args.netPayout,
          }
        }
      } catch {
        // skip unrelated logs
      }
    }
    return null
  }, [])

  const enrichResultWithWinningNumbers = useCallback(
    async (result: KenoLastResult): Promise<KenoLastResult> => {
      if (!publicClient) return result
      try {
        const ticketData = (await publicClient.readContract({
          address: KENO_ADDRESS,
          abi: KENO_ABI,
          functionName: 'getTicket',
          args: [result.ticketId],
        })) as any
        const winningNumbers = (ticketData.winningNumbers as number[]).map((n: any) => Number(n)).filter((n: number) => n > 0)
        return { ...result, winningNumbers }
      } catch (err) {
        console.error('Failed to fetch ticket winning numbers', err)
        return result
      }
    },
    [publicClient]
  )

  const handlePlay = useCallback(async () => {
    if (!isConnected || !address) {
      toast.error('Connect wallet to play.')
      return
    }
    if (selectedNumbers.length !== spotSize) {
      toast.error(`Pick ${spotSize} numbers before playing.`)
      return
    }

    const numbersArg = [...selectedNumbers].sort((a, b) => a - b).map((n) => Number(n))
    const wagerWei = parseEther(wager.toString())

    if (paymentMethod === 'PLS') {
      try {
        if (wplsRequiredWei === BigInt(0)) {
          toast.error('Unable to quote PLS required. Please try again.')
          return
        }
        setIsPlaying(true)
        setDrawComplete(false)
        setDrawnCount(0)
        const hash = await writePlayAsync({
          address: KENO_ADDRESS,
          abi: KENO_ABI,
          functionName: 'playKenoWithPLS',
          args: [numbersArg, spotSize],
          value: wplsRequiredWei,
        } as any)
        const receipt = await publicClient?.waitForTransactionReceipt({ hash })
        if (receipt) {
          let result = parseKenoResult(receipt, numbersArg)
          if (result) {
            result = await enrichResultWithWinningNumbers(result)
            setLastResult(result)
            if (result.netPayout > BigInt(0)) triggerSuccessConfetti()
          }
        }
        toast.success('Keno played!')
      } catch (err: any) {
        console.error(err)
        if (!err?.message?.includes('User rejected') && !err?.message?.includes('user rejected')) {
          toast.error(err?.shortMessage || err?.message || 'Play failed')
        }
      } finally {
        setIsPlaying(false)
      }
      return
    }

    if (effectiveAllowanceWei < wagerWei) {
      if (isApprovePending || isApproveConfirming) return
      setPendingApproval({ wagerWei })
      writeApprove({
        address: MORBIUS_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [KENO_ADDRESS, MAX_UINT256],
      } as any)
      return
    }

    try {
      setIsPlaying(true)
      setDrawComplete(false)
      setDrawnCount(0)
      const hash = await writePlayAsync({
        address: KENO_ADDRESS,
        abi: KENO_ABI,
        functionName: 'playKeno',
        args: [numbersArg, spotSize, wagerWei],
      } as any)
      const receipt = await publicClient?.waitForTransactionReceipt({ hash })
      if (receipt) {
        let result = parseKenoResult(receipt, numbersArg)
        if (result) {
          result = await enrichResultWithWinningNumbers(result)
          setLastResult(result)
          if (result.netPayout > BigInt(0)) triggerSuccessConfetti()
        }
      }
      toast.success('Keno played!')
    } catch (err: any) {
      console.error(err)
      if (!err?.message?.includes('User rejected') && !err?.message?.includes('user rejected')) {
        toast.error(err?.shortMessage || err?.message || 'Play failed')
      }
    } finally {
      setIsPlaying(false)
    }
  }, [
    address,
    enrichResultWithWinningNumbers,
    effectiveAllowanceWei,
    isApproveConfirming,
    isApprovePending,
    isConnected,
    paymentMethod,
    publicClient,
    selectedNumbers,
    spotSize,
    parseKenoResult,
    wager,
    wplsRequiredWei,
    writeApprove,
    writePlayAsync,
  ])

  useEffect(() => {
    if (isApproveConfirmed && pendingApproval) {
      setOptimisticAllowanceWei(MAX_UINT256)
      toast.success('Approved MORBIUS. Click Play Now to buy your ticket.')
      setPendingApproval(null)
    }
  }, [isApproveConfirmed, pendingApproval])

  useEffect(() => {
    if (approveError) toast.error(approveError.message || 'Approval failed.')
  }, [approveError])

  useEffect(() => {
    if (playError) {
      const msg = (playError as any)?.shortMessage || playError.message || 'Play failed.'
      if (!msg.includes('User rejected') && !msg.includes('user rejected')) {
        toast.error(msg)
      }
    }
  }, [playError])

  useEffect(() => {
    if (approveConfirmError) toast.error(approveConfirmError.message || 'Approval failed.')
  }, [approveConfirmError])

  const busy = isApprovePending || isApproveConfirming || isPlayPending || isPlaying

  return {
    paymentMethod,
    setPaymentMethod,
    wplsRequiredWei,
    handlePlay,
    busy,
    isApprovePending,
    isApproveConfirming,
    isPlayPending,
    isPlaying,
    lastResult,
    drawComplete,
    setDrawComplete,
    drawnCount,
    setDrawnCount,
  }
}
