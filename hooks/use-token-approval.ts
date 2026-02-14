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

  // Clear optimistic allowance and refetch on success
  useEffect(() => {
    if (isApprovalSuccess) {
      setOptimisticAllowance(null)
      refetchAllowance()
    }
  }, [isApprovalSuccess, refetchAllowance])

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
    isApprovalSuccess,
    approvalError: approveError as Error | null,
    refetchAllowance,
  }
}
