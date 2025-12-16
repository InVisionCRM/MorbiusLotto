import { useEffect, useState } from 'react'

const MORBIUS_TOKEN = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1'

// Known burn addresses to check for
const BURN_ADDRESSES = [
  '0x0000000000000000000000000000000000000000',
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

        do {
          // Build URL with pagination params
          let url = `https://api.scan.pulsechain.com/api/v2/tokens/${MORBIUS_TOKEN}/holders`
          if (nextPageParams) {
            const params = new URLSearchParams({
              address_hash: nextPageParams.address_hash,
              items_count: nextPageParams.items_count.toString(),
              value: nextPageParams.value.toString(),
            })
            url += `?${params.toString()}`
          }

          const response = await fetch(url)

          if (!response.ok) {
            throw new Error(`Failed to fetch holders: ${response.status}`)
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
              console.log(`🔥 Found burn address ${address} with ${holder.value} tokens`)
            }
          }

          nextPageParams = data.next_page_params
          pageCount++
        } while (nextPageParams && pageCount < maxPages)

        console.log(`Total Morbius burned: ${total.toString()}`)

        if (isMounted) {
          setBurnedAmount(total)
          setIsLoading(false)
        }
      } catch (err) {
        console.error('Error fetching burned Morbius:', err)
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Unknown error'))
          setIsLoading(false)
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
