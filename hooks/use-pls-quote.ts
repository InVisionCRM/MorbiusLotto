import { useMemo, useState, useEffect } from 'react'
import { useReadContract } from 'wagmi'
import type { Address } from 'viem'
import {
  PULSEX_V1_ROUTER_ADDRESS,
  WPLS_TOKEN_ADDRESS,
  MORBIUS_TOKEN_ADDRESS,
  WPLS_MORBIUS_PAIR,
  TOKEN_DECIMALS,
} from '@/lib/contracts'

const ROUTER_ABI = [
  {
    name: 'getAmountsIn',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const

const PAIR_ABI = [
  {
    inputs: [],
    name: 'getReserves',
    outputs: [
      { type: 'uint112' },
      { type: 'uint112' },
      { type: 'uint32' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token0',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

interface UsePlsQuoteParams {
  morbiusCost: bigint
  enabled?: boolean
}

interface UsePlsQuoteReturn {
  plsValue: bigint
  basePlsQuote: bigint
  isLoading: boolean
  error: Error | null
  hasQuote: boolean
  usingFallback: boolean
}

// Tax and slippage constants
const TAX_MULTIPLIER = BigInt(15000) // 50% tax: 1.5x
const TAX_DIVISOR = BigInt(10000)
const SLIPPAGE_MULTIPLIER = BigInt(12000) // 20% buffer: 1.2x
const SLIPPAGE_DIVISOR = BigInt(10000)

export function usePlsQuote({
  morbiusCost,
  enabled = true,
}: UsePlsQuoteParams): UsePlsQuoteReturn {
  // DexScreener fallback state
  const [dexScreenerPrice, setDexScreenerPrice] = useState<bigint | null>(null)

  // Primary: PulseX router getAmountsIn (most accurate, accounts for slippage)
  const {
    data: plsBaseQuote,
    error: plsQuoteError,
    isLoading: isLoadingPlsQuote,
  } = useReadContract({
    address: PULSEX_V1_ROUTER_ADDRESS as Address,
    abi: ROUTER_ABI,
    functionName: 'getAmountsIn',
    args: enabled && morbiusCost > BigInt(0)
      ? [morbiusCost, [WPLS_TOKEN_ADDRESS as Address, MORBIUS_TOKEN_ADDRESS as Address]]
      : undefined,
    query: {
      enabled: enabled && morbiusCost > BigInt(0),
      refetchInterval: 10000, // Refresh every 10 seconds
      retry: 3,
      retryDelay: 1000,
    },
  })

  // Secondary: LP reserves (works when router call fails)
  const { data: token0 } = useReadContract({
    address: WPLS_MORBIUS_PAIR as Address,
    abi: PAIR_ABI,
    functionName: 'token0',
    query: { enabled },
  })

  const { data: reserves, isLoading: isLoadingReserves } = useReadContract({
    address: WPLS_MORBIUS_PAIR as Address,
    abi: PAIR_ABI,
    functionName: 'getReserves',
    query: {
      enabled,
      refetchInterval: 30000,
    },
  })

  // Tertiary: DexScreener API (last resort, only fetched when on-chain sources fail)
  const hasOnChainQuote = !!(plsBaseQuote && Array.isArray(plsBaseQuote) && plsBaseQuote[0])
  const hasReserves = !!(reserves && token0)

  useEffect(() => {
    if (hasOnChainQuote || hasReserves || !enabled) return

    const fetchDexScreener = async () => {
      try {
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/pairs/pulsechain/${WPLS_MORBIUS_PAIR}`
        )
        if (!res.ok) return
        const data = await res.json()
        if (data.pairs?.[0]?.priceNative) {
          const price = parseFloat(data.pairs[0].priceNative)
          if (price > 0) {
            setDexScreenerPrice(BigInt(Math.floor(price * 1e18)))
          }
        }
      } catch {
        // Non-fatal — will return hasQuote: false
      }
    }

    fetchDexScreener()
  }, [hasOnChainQuote, hasReserves, enabled])

  const result = useMemo(() => {
    let basePlsCost = BigInt(0)
    let usingFallback = false
    let source = ''

    // Priority 1: Router getAmountsIn (most accurate)
    if (plsBaseQuote && Array.isArray(plsBaseQuote) && plsBaseQuote[0]) {
      basePlsCost = plsBaseQuote[0]
      source = 'router'
    }
    // Priority 2: LP reserves (calculate from pool ratio)
    else if (reserves && token0 && morbiusCost > BigInt(0)) {
      const isToken0Wpls = (token0 as string).toLowerCase() === WPLS_TOKEN_ADDRESS.toLowerCase()
      const wplsReserve = isToken0Wpls ? reserves[0] : reserves[1]
      const morbiusReserve = isToken0Wpls ? reserves[1] : reserves[0]

      if (morbiusReserve > BigInt(0)) {
        // price = wplsReserve / morbiusReserve, applied to morbiusCost
        basePlsCost = (morbiusCost * BigInt(wplsReserve)) / BigInt(morbiusReserve)
        source = 'reserves'
        usingFallback = true
      }
    }
    // Priority 3: DexScreener API
    else if (dexScreenerPrice && morbiusCost > BigInt(0)) {
      const decimalFactor = BigInt(10) ** BigInt(TOKEN_DECIMALS)
      basePlsCost = (morbiusCost * dexScreenerPrice) / decimalFactor
      source = 'dexscreener'
      usingFallback = true
    }

    // No price source available — return zero to BLOCK the transaction
    // This is safer than guessing with a stale hardcoded value
    if (basePlsCost === BigInt(0)) {
      return {
        plsValue: BigInt(0),
        basePlsQuote: BigInt(0),
        isLoading: isLoadingPlsQuote || isLoadingReserves,
        error: plsQuoteError as Error | null,
        hasQuote: false,
        usingFallback: false,
      }
    }

    // Apply 50% tax (making PLS payments 50% more expensive)
    const taxedAmount = (basePlsCost * TAX_MULTIPLIER) / TAX_DIVISOR

    // Add 20% buffer for slippage and DEX fees
    const totalPlsRequired = (taxedAmount * SLIPPAGE_MULTIPLIER) / SLIPPAGE_DIVISOR

    if (usingFallback) {
      console.warn(`⚠️ PLS quote using fallback (${source}):`, {
        morbiusCost: morbiusCost.toString(),
        basePlsCost: basePlsCost.toString(),
        finalPls: totalPlsRequired.toString(),
      })
    }

    return {
      plsValue: totalPlsRequired,
      basePlsQuote: basePlsCost,
      isLoading: isLoadingPlsQuote || isLoadingReserves,
      error: plsQuoteError as Error | null,
      hasQuote: true,
      usingFallback,
    }
  }, [plsBaseQuote, morbiusCost, plsQuoteError, isLoadingPlsQuote, reserves, token0, isLoadingReserves, dexScreenerPrice])

  return result
}
