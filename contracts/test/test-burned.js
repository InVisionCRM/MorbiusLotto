// Quick test to see what the burned amount hook returns
const MORBIUS_TOKEN = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1'

// Known burn addresses to check for
const BURN_ADDRESSES = [
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dead',
  '0x0000000000000000000000000000000000000369',
]

async function fetchBurnedAmount() {
  try {
    let total = BigInt(0)
    let nextPageParams = null
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

      console.log('Fetching:', url)

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to fetch holders: ${response.status}`)
      }

      const data = await response.json()
      const holders = data.items || []

      console.log(`Page ${pageCount + 1}: Found ${holders.length} holders`)

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

    console.log(`Total morbius burned: ${total.toString()}`)

    return total
  } catch (err) {
    console.error('Error fetching burned morbius:', err)
    throw err
  }
}

fetchBurnedAmount().then(result => {
  console.log('Final result:', result.toString())
}).catch(err => {
  console.error('Failed:', err)
})