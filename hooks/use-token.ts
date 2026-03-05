import { useRef } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { MORBIUS_TOKEN_ADDRESS, LOTTERY_INSTANT_ADDRESS, TOKEN_DECIMALS } from '@/lib/contracts'
import { ERC20_ABI } from '@/abi/erc20'
import { formatEther, parseEther, formatUnits } from 'viem'
import { maxUint256 } from 'viem'

// Read token decimals (default to configured TOKEN_DECIMALS)
export function useTokenDecimals() {
  const { data: decimals } = useReadContract({
    address: MORBIUS_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'decimals',
  })
  
  return decimals || TOKEN_DECIMALS
}

// Read token balance
export function useTokenBalance(address?: `0x${string}`) {
  const { data: decimals } = useReadContract({
    address: MORBIUS_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'decimals',
  })
  
  const tokenDecimals = decimals || TOKEN_DECIMALS
  
  const { data: balance, error, isLoading, isError } = useReadContract({
    address: MORBIUS_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 10000,
      retry: 3,
    },
  })

  // Enhanced debug logging (only log on actual changes, not every render)
  const prevBalanceRef = useRef<bigint | undefined>(undefined)
  
  if (address) {
    if (error || isError) {
      console.error('❌ Error fetching token balance:', error)
      console.log('Wallet address:', address)
      console.log('Token address:', MORBIUS_TOKEN_ADDRESS)
      console.log('Token decimals:', tokenDecimals)
      console.log('Error details:', {
        message: error?.message,
        cause: error?.cause,
        name: error?.name,
      })
    }
    
    // Only log when balance actually changes
    if (balance !== undefined && balance !== prevBalanceRef.current) {
      const formatted = formatUnits(balance, tokenDecimals)
      console.log('✅ Token balance loaded:', formatted, '(decimals:', tokenDecimals, ')')
      prevBalanceRef.current = balance
    }
    
    if (isLoading && prevBalanceRef.current === undefined) {
      console.log('⏳ Loading token balance...')
    }
  }

  return {
    balance: balance || BigInt(0),
    balanceFormatted: balance ? formatUnits(balance, tokenDecimals) : '0',
    decimals: tokenDecimals,
    isLoading,
    error,
    isError,
  }
}

// Read token allowance
export function useTokenAllowance(owner?: `0x${string}`) {
  const { data: allowance, refetch } = useReadContract({
    address: MORBIUS_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: owner ? [owner, LOTTERY_INSTANT_ADDRESS] : undefined,
    query: {
      enabled: !!owner,
      refetchInterval: 10000,
    },
  })

  return {
    allowance: allowance || BigInt(0),
    allowanceFormatted: allowance ? formatEther(allowance) : '0',
    refetch,
  }
}

// Approve token spending
export function useApproveToken() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const approve = (amount?: bigint) => {
    writeContract({
      address: MORBIUS_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [LOTTERY_INSTANT_ADDRESS, amount || maxUint256], // Approve infinite by default
      maxPriorityFeePerGas: 40_000n, // PulseChain tip
    } as unknown as Parameters<typeof writeContract>[0])
  }

  return {
    approve,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  }
}

// Read token info
export function useTokenInfo() {
  const { data: name } = useReadContract({
    address: MORBIUS_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'name',
  })

  const { data: symbol } = useReadContract({
    address: MORBIUS_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'symbol',
  })

  const { data: decimals } = useReadContract({
    address: MORBIUS_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'decimals',
  })

  return {
    name: name || 'Unknown',
    symbol: symbol || 'TOKEN',
    decimals: decimals || 18,
  }
}
