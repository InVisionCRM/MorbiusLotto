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

  // #region agent log
  useEffect(() => {
    if (approveHash) {
      fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-token-approval.ts:62',message:'approveHash set',data:{approveHash,isPending:isApprovePending,hasError:!!approveError,errorMessage:approveError?.message},timestamp:Date.now(),runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    }
  }, [approveHash, isApprovePending, approveError]);
  // #endregion

  // Wait for approval transaction
  const {
    isLoading: isApproveLoading,
    isSuccess: isApprovalSuccess,
  } = useWaitForTransactionReceipt({
    hash: approveHash,
  })

  // #region agent log
  useEffect(() => {
    if (approveError) {
      fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-token-approval.ts:72',message:'approveError detected',data:{errorMessage:approveError?.message,errorName:approveError?.name,errorStack:approveError?.stack},timestamp:Date.now(),runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    }
  }, [approveError]);
  // #endregion

  // #region agent log
  useEffect(() => {
    if (isApprovalSuccess) {
      fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-token-approval.ts:79',message:'approval success',data:{approveHash},timestamp:Date.now(),runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    }
  }, [isApprovalSuccess, approveHash]);
  // #endregion

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

  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-token-approval.ts:89',message:'needsApproval check',data:{contractAllowance:contractAllowance?.toString(),allowance:allowance.toString(),requiredAmount:requiredAmount.toString(),isLoadingAllowance,needsApproval,enabled,hasUserAddress:!!userAddress},timestamp:Date.now(),runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  }, [contractAllowance, allowance, requiredAmount, isLoadingAllowance, needsApproval, enabled, userAddress]);
  // #endregion

  const approve = (customAmount?: bigint) => {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-token-approval.ts:91',message:'approve function called',data:{hasUserAddress:!!userAddress,userAddress,customAmount:customAmount?.toString(),defaultToUnlimited,requiredAmount:requiredAmount.toString(),tokenAddress,spenderAddress},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!userAddress) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-token-approval.ts:94',message:'approve early return - no userAddress',data:{},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return
    }

    const amountToApprove = customAmount ?? (defaultToUnlimited ? MAX_UINT256 : requiredAmount)

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-token-approval.ts:98',message:'approve parameters calculated',data:{amountToApprove:amountToApprove.toString(),isUnlimited:amountToApprove === MAX_UINT256},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Set optimistic allowance immediately for better UX
    setOptimisticAllowance(amountToApprove)

    try {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-token-approval.ts:105',message:'calling writeContract',data:{tokenAddress,spenderAddress,amountToApprove:amountToApprove.toString(),chainId:pulsechain.id},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spenderAddress, amountToApprove],
        chainId: pulsechain.id,
      })
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-token-approval.ts:113',message:'writeContract called successfully',data:{},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-token-approval.ts:116',message:'writeContract error caught',data:{error:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
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
