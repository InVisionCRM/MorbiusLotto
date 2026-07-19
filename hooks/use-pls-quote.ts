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
import { fetchDexScreenerProxy } from '@/lib/dexscreener-client'

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

// No markup is applied to the PLS quote. `Blackjack.deposit()` performs NO on-chain swap:
// it credits getAmountsOut(msg.value) at the PulseX spot rate and forwards the PLS to treasury.
// Because nothing is actually swapped, there is no slippage to tolerate and no amountOutMin that
// can revert — sending exactly the getAmountsIn() quote credits ~the requested MORBIUS. MORBIUS
// has no transfer tax, and none would apply on deposit anyway since no MORBIUS is moved here.

export interface PlsQuoteInputs {
  /** getAmountsIn result from the PulseX router, if it resolved. */
  plsBaseQuote: readonly bigint[] | undefined
  /** WPLS/MORBIUS pair getReserves result, if it resolved. */
  reserves: readonly [bigint, bigint, number] | readonly bigint[] | undefined
  /** Pair token0 address, needed to orient the reserves. */
  token0: string | undefined
  /** DexScreener priceNative scaled to 1e18, if fetched. */
  dexScreenerPrice: bigint | null
  morbiusCost: bigint
  wplsAddress: string
  tokenDecimals: number
}

export interface PlsQuoteSelection {
  plsValue: bigint
  basePlsQuote: bigint
  hasQuote: boolean
  usingFallback: boolean
  source: 'router' | 'reserves' | 'dexscreener' | 'none'
}

/**
 * Pure quote selection — picks the best available price source in priority
 * order (router → LP reserves → DexScreener) and computes the PLS required.
 * Extracted from the hook so the decision logic is unit-testable without
 * wagmi/react-query. Returns hasQuote:false (zero value) when no source is
 * available, which callers MUST treat as "block the transaction".
 */
export function selectPlsQuote(inputs: PlsQuoteInputs): PlsQuoteSelection {
  const { plsBaseQuote, reserves, token0, dexScreenerPrice, morbiusCost, wplsAddress, tokenDecimals } = inputs

  // Priority 1: Router getAmountsIn (most accurate)
  if (plsBaseQuote && Array.isArray(plsBaseQuote) && plsBaseQuote[0]) {
    return {
      plsValue: plsBaseQuote[0],
      basePlsQuote: plsBaseQuote[0],
      hasQuote: true,
      usingFallback: false,
      source: 'router',
    }
  }

  // Priority 2: LP reserves (calculate from pool ratio)
  if (reserves && token0 && morbiusCost > BigInt(0)) {
    const isToken0Wpls = token0.toLowerCase() === wplsAddress.toLowerCase()
    const wplsReserve = isToken0Wpls ? reserves[0] : reserves[1]
    const morbiusReserve = isToken0Wpls ? reserves[1] : reserves[0]
    if (typeof morbiusReserve === 'bigint' && typeof wplsReserve === 'bigint' && morbiusReserve > BigInt(0)) {
      const basePlsCost = (morbiusCost * wplsReserve) / morbiusReserve
      if (basePlsCost > BigInt(0)) {
        return { plsValue: basePlsCost, basePlsQuote: basePlsCost, hasQuote: true, usingFallback: true, source: 'reserves' }
      }
    }
  }

  // Priority 3: DexScreener API
  if (dexScreenerPrice && dexScreenerPrice > BigInt(0) && morbiusCost > BigInt(0)) {
    const decimalFactor = BigInt(10) ** BigInt(tokenDecimals)
    const basePlsCost = (morbiusCost * dexScreenerPrice) / decimalFactor
    if (basePlsCost > BigInt(0)) {
      return { plsValue: basePlsCost, basePlsQuote: basePlsCost, hasQuote: true, usingFallback: true, source: 'dexscreener' }
    }
  }

  // No price source available — zero value blocks the transaction.
  // Safer than guessing with a stale hardcoded value.
  return { plsValue: BigInt(0), basePlsQuote: BigInt(0), hasQuote: false, usingFallback: false, source: 'none' }
}

export function usePlsQuote({
  morbiusCost,
  enabled = true,
}: UsePlsQuoteParams): UsePlsQuoteReturn {
  // DexScreener fallback state
  const [dexScreenerPrice, setDexScreenerPrice] = useState<bigint | null>(null)

  // Primary: PulseX router getAmountsIn (most accurate, accounts for slippage).
  // placeholderData keeps the PREVIOUS quote while a new amount refetches, so
  // changing the amount doesn't flip isLoading and blank out the deposit CTA —
  // the quote is only "loading" on the true first fetch.
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
      placeholderData: (prev) => prev,
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
      placeholderData: (prev) => prev,
    },
  })

  // Tertiary: DexScreener API (last resort, only fetched when on-chain sources fail)
  const hasOnChainQuote = !!(plsBaseQuote && Array.isArray(plsBaseQuote) && plsBaseQuote[0])
  const hasReserves = !!(reserves && token0)

  useEffect(() => {
    if (hasOnChainQuote || hasReserves || !enabled) return

    const fetchDexScreener = async () => {
      try {
        const res = await fetchDexScreenerProxy('pairs', WPLS_MORBIUS_PAIR)
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
    const sel = selectPlsQuote({
      plsBaseQuote: plsBaseQuote as readonly bigint[] | undefined,
      reserves: reserves as readonly [bigint, bigint, number] | undefined,
      token0: token0 as string | undefined,
      dexScreenerPrice,
      morbiusCost,
      wplsAddress: WPLS_TOKEN_ADDRESS,
      tokenDecimals: TOKEN_DECIMALS,
    })

    if (sel.hasQuote && sel.usingFallback) {
      console.warn(`⚠️ PLS quote using fallback (${sel.source}):`, {
        morbiusCost: morbiusCost.toString(),
        basePlsCost: sel.basePlsQuote.toString(),
        finalPls: sel.plsValue.toString(),
      })
    }

    return {
      plsValue: sel.plsValue,
      basePlsQuote: sel.basePlsQuote,
      // Only report loading while we genuinely have no quote to show — a
      // background refetch of an existing quote must not disable the CTA.
      isLoading: !sel.hasQuote && (isLoadingPlsQuote || isLoadingReserves),
      error: plsQuoteError as Error | null,
      hasQuote: sel.hasQuote,
      usingFallback: sel.usingFallback,
    }
  }, [plsBaseQuote, morbiusCost, plsQuoteError, isLoadingPlsQuote, reserves, token0, isLoadingReserves, dexScreenerPrice])

  return result
}
