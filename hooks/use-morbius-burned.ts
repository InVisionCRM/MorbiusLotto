import { useEffect, useState } from 'react'
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'

// Known burn addresses to check for
const BURN_ADDRESSES = [
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dEaD', // Contract burn address
  '0x000000000000000000000000000000000000dead',
  '0x0000000000000000000000000000000000000369',
]

type Holder = {
  address: {
    hash: string
  }
  value: string
}

type HoldersResponse = {
  items: Holder[]
  next_page_params: {
    address_hash: string
    items_count: number
    value: string
  } | null
}

export function useMorbiusBurned() {
  const [burnedAmount, setBurnedAmount] = useState<bigint>(BigInt(0))
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let isMounted = true

    const fetchBurnedAmount = async () => {
      try {
        setIsLoading(true)
        setError(null)

        let total = BigInt(0)
        let nextPageParams: any = null
        let pageCount = 0
        const maxPages = 10 // Safety limit

        // 502/503/429 = PulseChain scan API overloaded or down; retry with backoff
        const fetchWithRetry = async (url: string, retries = 4): Promise<Response> => {
          for (let i = 0; i < retries; i++) {
            const response = await fetch(url)
            const isRetryable = response.status === 503 || response.status === 502 || response.status === 429
            if (response.ok) return response
            if (!isRetryable) return response
            if (i < retries - 1) {
              await new Promise(r => setTimeout(r, 2000 * (i + 1)))
            } else {
              return response
            }
          }
          throw new Error('Failed after retries')
        }

        do {
          // Build URL with pagination params
          let url = `https://api.scan.pulsechain.com/api/v2/tokens/${MORBIUS_TOKEN_ADDRESS}/holders`
          if (nextPageParams) {
            const params = new URLSearchParams({
              address_hash: nextPageParams.address_hash,
              items_count: nextPageParams.items_count.toString(),
              value: nextPageParams.value.toString(),
            })
            url += `?${params.toString()}`
          }

          const response = await fetchWithRetry(url)

          if (!response.ok) {
            // 502 = PulseChain scan API Bad Gateway (their upstream is down/overloaded)
            throw new Error(`Scan API unavailable (${response.status}). Try again later.`)
          }

          const data: HoldersResponse = await response.json()
          const holders: Holder[] = data.items || []

          // Check each holder against our burn addresses
          for (const holder of holders) {
            const address = holder.address.hash.toLowerCase()

            // Check if this address is one of our known burn addresses
            if (BURN_ADDRESSES.some(burnAddr => address === burnAddr.toLowerCase())) {
              const balance = BigInt(holder.value)
              total += balance
            }
          }

          nextPageParams = data.next_page_params
          pageCount++
        } while (nextPageParams && pageCount < maxPages)

        if (isMounted) {
          setBurnedAmount(total)
          setIsLoading(false)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Unknown error'))
          setIsLoading(false)
          // Keep last burned amount; UI can show "unavailable" or previous value
          if (process.env.NODE_ENV === 'development') {
            console.warn('Burned amount: scan API failed (e.g. 502). Keeping previous value.', err)
          }
        }
      }
    }

    fetchBurnedAmount()

    // Refetch every 5 minutes
    const interval = setInterval(fetchBurnedAmount, 5 * 60 * 1000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  return { burnedAmount, isLoading, error }
}
