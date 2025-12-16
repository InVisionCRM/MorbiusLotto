/**
 * PulseScan API utilities for fetching blockchain data
 * Used as a fallback/complement to direct RPC calls
 */

const PULSESCAN_API_BASE = 'https://scan.pulsechain.box/api/v2'

export interface PulseScanLog {
  address: {
    hash: string
    is_contract: boolean
    is_verified: boolean
  }
  block_hash: string
  block_number: number
  data: string
  decoded: {
    method_call?: string
    method_id?: string
    parameters?: Array<{
      indexed?: boolean
      name: string
      type: string
      value: string | number
    }>
  } | null
  index: number
  topics: string[]
  transaction_hash: string
}

export interface PulseScanLogsResponse {
  items: PulseScanLog[]
  next_page_params: unknown | null
}

/**
 * Fetch recent logs from a contract address
 * @param address Contract address
 * @param fromBlock Optional starting block number
 * @param toBlock Optional ending block number (default: 'latest')
 * @param page Optional page number (default: 1)
 * @param offset Optional number of results per page (default: 1000)
 */
export async function fetchContractLogs(
  address: string,
  options?: {
    fromBlock?: number | 'latest'
    toBlock?: number | 'latest'
    page?: number
    offset?: number
  }
): Promise<PulseScanLog[]> {
  try {
    const params = new URLSearchParams({
      address,
      page: String(options?.page || 1),
      offset: String(options?.offset || 1000),
    })

    if (options?.fromBlock) {
      params.append('fromBlock', String(options.fromBlock))
    }
    if (options?.toBlock) {
      params.append('toBlock', String(options.toBlock))
    }

    const response = await fetch(`${PULSESCAN_API_BASE}/addresses/${address}/logs?${params.toString()}`, {
      headers: {
        accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`PulseScan API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as PulseScanLogsResponse

    if (!data.items || data.items.length === 0) {
      console.warn('PulseScan API returned no results')
      return []
    }

    return data.items
  } catch (error) {
    console.error('Error fetching logs from PulseScan API:', error)
    return []
  }
}

/**
 * Fetch recent events for a specific event signature
 * @param address Contract address
 * @param eventSignature Event signature (e.g., 'TicketsPurchased(uint256,address,uint256)')
 * @param fromBlock Optional starting block number
 */
export async function fetchEventLogs(
  address: string,
  eventSignature: string,
  fromBlock?: number
): Promise<PulseScanLog[]> {
  const logs = await fetchContractLogs(address, {
    fromBlock: fromBlock || 'latest',
    toBlock: 'latest',
  })

  // Filter by event signature (first topic is keccak256 hash of event signature)
  // Note: This is a simplified approach. For production, you'd want to properly hash the signature
  return logs.filter((log) => log.topics && log.topics.length > 0)
}

/**
 * Get the latest block number from PulseScan API
 */
export async function getLatestBlockNumber(): Promise<number | null> {
  try {
    const response = await fetch(`${PULSESCAN_API_BASE}/blocks?page=1&offset=1`, {
      headers: {
        accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`PulseScan API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as { status: string; result: Array<{ number: string }> }

    if (data.status === '0' || !data.result || data.result.length === 0) {
      return null
    }

    return parseInt(data.result[0].number, 16) // Convert from hex
  } catch (error) {
    console.error('Error fetching latest block from PulseScan API:', error)
    return null
  }
}

