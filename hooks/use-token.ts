import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { PSSH_TOKEN_ADDRESS, LOTTERY_ADDRESS, TOKEN_DECIMALS } from '@/lib/contracts'
import { ERC20_ABI } from '@/abi/erc20'
import { formatEther, parseEther, formatUnits } from 'viem'
import { maxUint256 } from 'viem'

// Read token decimals (default to configured TOKEN_DECIMALS)
export function useTokenDecimals() {
  const { data: decimals } = useReadContract({
    address: PSSH_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'decimals',
  })
  
  return decimals || TOKEN_DECIMALS
}

// Read token balance
export function useTokenBalance(address?: `0x${string}`) {
  const { data: decimals } = useReadContract({
    address: PSSH_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'decimals',
  })
  
  const tokenDecimals = decimals || TOKEN_DECIMALS
  
  const { data: balance, error, isLoading, isError } = useReadContract({
    address: PSSH_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 10000,
      retry: 3,
    },
  })

  // Enhanced debug logging
  if (address) {
    if (error || isError) {
      console.error('❌ Error fetching token balance:', error)
      console.log('Wallet address:', address)
      console.log('Token address:', PSSH_TOKEN_ADDRESS)
      console.log('Token decimals:', tokenDecimals)
      console.log('Error details:', {
        message: error?.message,
        cause: error?.cause,
        name: error?.name,
      })
    }
    
    if (balance !== undefined) {
      const formatted = formatUnits(balance, tokenDecimals)
      console.log('✅ Token balance loaded:', formatted, '(decimals:', tokenDecimals, ')')
    }
    
    if (isLoading) {
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
    address: PSSH_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: owner ? [owner, LOTTERY_ADDRESS] : undefined,
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
      address: PSSH_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [LOTTERY_ADDRESS, amount || maxUint256], // Approve infinite by default
    })
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
    address: PSSH_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'name',
  })

  const { data: symbol } = useReadContract({
    address: PSSH_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'symbol',
  })

  const { data: decimals } = useReadContract({
    address: PSSH_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'decimals',
  })

  return {
    name: name || 'Unknown',
    symbol: symbol || 'TOKEN',
    decimals: decimals || 18,
  }
}
