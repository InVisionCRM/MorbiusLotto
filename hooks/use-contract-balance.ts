import { useState, useEffect } from 'react'
import { LOTTERY_INSTANT_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'
import { formatUnits } from 'viem'

interface TokenBalance {
  token: {
    address: string
    symbol: string
    decimals: string
    name: string
  }
  value: string
}

/**
 * Hook to fetch contract's MORBIUS token balance from PulseScan API
 * This provides live data from the blockchain explorer
 */
export function useContractBalance() {
  const [balance, setBalance] = useState<bigint>(BigInt(0))
  const [balanceFormatted, setBalanceFormatted] = useState('0')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Fetch token balances from PulseScan API
        const response = await fetch(
          `https://api.scan.pulsechain.com/api/v2/addresses/${LOTTERY_INSTANT_ADDRESS}/token-balances`
        )

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }

        const data: TokenBalance[] = await response.json()

        // Find MORBIUS token balance
        const MORBIUSToken = data.find(
          (item) => item.token.address.toLowerCase() === MORBIUS_TOKEN_ADDRESS.toLowerCase()
        )

        if (MORBIUSToken) {
          const decimals = parseInt(MORBIUSToken.token.decimals) || 9
          const balanceValue = BigInt(MORBIUSToken.value)
          const formatted = formatUnits(balanceValue, decimals)

          setBalance(balanceValue)
          setBalanceFormatted(formatted)

          console.log('💰 Contract MORBIUS Balance (from API):', {
            raw: MORBIUSToken.value,
            formatted,
            decimals,
          })
        } else {
          console.warn('⚠️ MORBIUS token not found in API response')
          setBalance(BigInt(0))
          setBalanceFormatted('0')
        }
      } catch (err) {
        console.error('❌ Error fetching contract balance from API:', err)
        setError(err instanceof Error ? err : new Error('Unknown error'))
        setBalance(BigInt(0))
        setBalanceFormatted('0')
      } finally {
        setIsLoading(false)
      }
    }

    // Initial fetch
    fetchBalance()

    // Refetch every 5 seconds for live updates
    const interval = setInterval(fetchBalance, 5000)

    return () => clearInterval(interval)
  }, [])

  return {
    balance,
    balanceFormatted,
    isLoading,
    error,
  }
}

