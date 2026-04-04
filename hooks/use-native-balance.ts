import { useBalance } from 'wagmi'
import { pulsechain } from '@/lib/chains'

/**
 * Hook to get native PLS balance for connected wallet on PulseChain.
 * Pass address so the query runs; without it enabled is false and balance stays 0.
 */
export function useNativeBalance(address?: `0x${string}`) {
  const { data, error, isLoading, refetch } = useBalance({
    address,
    chainId: pulsechain.id, // Always query PulseChain (369) for PLS
    query: {
      enabled: !!address,
      refetchInterval: 10000, // Refetch every 10 seconds
      retry: 3, // Retry failed requests
    },
  })

  if (address && error) {
    console.error('Error fetching PLS balance:', error)
    console.error('PLS balance context:', {
      walletAddress: address,
      message: error.message,
      cause: error.cause,
      name: error.name,
    })
  }

  return {
    balance: data?.value || BigInt(0),
    balanceFormatted: data?.formatted || '0',
    symbol: data?.symbol || 'PLS',
    decimals: data?.decimals || 18,
    isLoading,
    error,
    refetch,
  }
}

