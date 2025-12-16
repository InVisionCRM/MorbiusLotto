import { useState, useEffect } from 'react'
import { LOTTERY_ADDRESS, PSSH_TOKEN_ADDRESS } from '@/lib/contracts'
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
 * Hook to fetch contract's PSSH token balance from PulseScan API
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

        // Fetch token balances from scan.pulsechain.box
        const response = await fetch(
          `https://scan.pulsechain.box/api/v2/addresses/${LOTTERY_ADDRESS}/token-balances`
        )

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }

        const data: TokenBalance[] = await response.json()

        // Find PSSH token balance
        const psshToken = data.find(
          (item) => item.token.address.toLowerCase() === PSSH_TOKEN_ADDRESS.toLowerCase()
        )

        if (psshToken) {
          const decimals = parseInt(psshToken.token.decimals) || 9
          const balanceValue = BigInt(psshToken.value)
          const formatted = formatUnits(balanceValue, decimals)

          setBalance(balanceValue)
          setBalanceFormatted(formatted)

          console.log('💰 Contract PSSH Balance (from API):', {
            raw: psshToken.value,
            formatted,
            decimals,
          })
        } else {
          console.warn('⚠️ PSSH token not found in API response')
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

