import { useState, useEffect } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import type { Address } from 'viem'
import { ERC20_ABI } from '@/abi/erc20'
import { pulsechain } from '@/lib/chains'

interface UseTokenApprovalParams {
  tokenAddress: Address
  spenderAddress: Address
  requiredAmount: bigint
  userAddress?: Address
  enabled?: boolean
  defaultToUnlimited?: boolean
}

interface UseTokenApprovalReturn {
  allowance: bigint
  needsApproval: boolean
  isLoadingAllowance: boolean
  approve: (customAmount?: bigint) => void
  isApproving: boolean
  /** Tx hash once submitted; use with isApproving to show "Confirm in wallet" vs "Confirming…" */
  approveHash: `0x${string}` | undefined
  isApprovalSuccess: boolean
  approvalError: Error | null
  refetchAllowance: () => void
}

const MAX_UINT256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935')

export function useTokenApproval({
  tokenAddress,
  spenderAddress,
  requiredAmount,
  userAddress,
  enabled = true,
  defaultToUnlimited = false,
}: UseTokenApprovalParams): UseTokenApprovalReturn {
  const [optimisticAllowance, setOptimisticAllowance] = useState<bigint | null>(null)

  // Read current allowance
  const {
    data: contractAllowance,
    refetch: refetchAllowance,
    isLoading: isLoadingAllowance,
  } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: userAddress ? [userAddress, spenderAddress] : undefined,
    query: {
      enabled: enabled && !!userAddress,
      refetchInterval: 1000, // Refresh every second for responsive UI
      staleTime: 0,
    },
  })

  // Approval transaction
  const {
    writeContract,
    data: approveHash,
    isPending: isApprovePending,
    error: approveError,
  } = useWriteContract()

  // Wait for approval transaction
  const {
    isLoading: isApproveLoading,
    isSuccess: isApprovalSuccess,
  } = useWaitForTransactionReceipt({
    hash: approveHash,
  })

  // On approval success: refetch so chain state is correct. Clear optimistic only once
  // contract allowance is sufficient, so the UI doesn't flicker back to "Approve" while refetch is in flight.
  useEffect(() => {
    if (!isApprovalSuccess) return
    refetchAllowance()
  }, [isApprovalSuccess, refetchAllowance])

  useEffect(() => {
    if (contractAllowance !== undefined && contractAllowance >= requiredAmount && requiredAmount > BigInt(0)) {
      setOptimisticAllowance(null)
    }
  }, [contractAllowance, requiredAmount])

  // Calculate effective allowance (optimistic or contract value)
  const allowance = optimisticAllowance ?? contractAllowance ?? BigInt(0)

  // Determine if approval is needed
  const needsApproval =
    contractAllowance !== undefined &&
    !isLoadingAllowance &&
    allowance < requiredAmount &&
    requiredAmount > BigInt(0)

  const approve = (customAmount?: bigint) => {
    if (!userAddress) {
      return
    }

    const amountToApprove = customAmount ?? (defaultToUnlimited ? MAX_UINT256 : requiredAmount)

    // Set optimistic allowance immediately for better UX
    setOptimisticAllowance(amountToApprove)

    try {
      writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spenderAddress, amountToApprove],
        chainId: pulsechain.id,
        maxPriorityFeePerGas: 40_000n, // PulseChain tip
      })
    } catch (error) {
      console.error('Approval error:', error)
    }
  }

  const isApproving = isApprovePending || isApproveLoading

  return {
    allowance,
    needsApproval,
    isLoadingAllowance,
    approve,
    isApproving,
    approveHash: approveHash ?? undefined,
    isApprovalSuccess,
    approvalError: approveError as Error | null,
    refetchAllowance,
  }
}
