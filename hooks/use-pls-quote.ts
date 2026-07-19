import { useMemo, useState, useEffect } from 'react'
import { useReadContract } from 'wagmi'
import type { Address } from 'viem'
import {
  WPLS_TOKEN_ADDRESS,
  WPLS_MORBIUS_PAIR,
  TOKEN_DECIMALS,
} from '@/lib/contracts'
import { fetchDexScreenerProxy } from '@/lib/dexscreener-client'

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

// PRIMARY source is the WPLS/MORBIUS pair itself (getReserves + the exact
// UniswapV2 getAmountIn formula, 0.3% fee). The PulseX router's getAmountsIn
// was verified on-chain to revert with ds-math-sub-underflow for ANY amount on
// this pair (both router deployments), so it is not used — quoting from the
// pair reserves is byte-for-byte the same math a working router would do.
//
// No markup is applied. `Blackjack.deposit()` performs NO on-chain swap: it
// credits getAmountsOut(msg.value) at the PulseX spot rate and forwards the
// PLS to treasury. Because nothing is actually swapped there is no slippage to
// tolerate — sending exactly this quote credits ~the requested MORBIUS.

export interface PlsQuoteInputs {
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
  source: 'reserves' | 'dexscreener' | 'none'
}

/**
 * Exact UniswapV2 router getAmountIn: how much of the input token must be sent
 * to receive `amountOut`, on a 0.3%-fee constant-product pool.
 * Returns null when the pool cannot satisfy the request (amountOut >= reserveOut).
 */
export function getAmountInV2(amountOut: bigint, reserveIn: bigint, reserveOut: bigint): bigint | null {
  if (amountOut <= BigInt(0) || reserveIn <= BigInt(0) || reserveOut <= BigInt(0)) return null
  if (amountOut >= reserveOut) return null
  const numerator = reserveIn * amountOut * BigInt(1000)
  const denominator = (reserveOut - amountOut) * BigInt(997)
  return numerator / denominator + BigInt(1)
}

/**
 * Pure quote selection — pair reserves (exact router math) first, DexScreener
 * as last resort. Extracted from the hook so the decision logic is
 * unit-testable without wagmi/react-query. Returns hasQuote:false (zero value)
 * when no source is available, which callers MUST treat as "block the
 * transaction".
 */
export function selectPlsQuote(inputs: PlsQuoteInputs): PlsQuoteSelection {
  const { reserves, token0, dexScreenerPrice, morbiusCost, wplsAddress, tokenDecimals } = inputs

  // Priority 1: pair reserves + exact getAmountIn math (matches a working router)
  if (reserves && token0 && morbiusCost > BigInt(0)) {
    const isToken0Wpls = token0.toLowerCase() === wplsAddress.toLowerCase()
    const wplsReserve = isToken0Wpls ? reserves[0] : reserves[1]
    const morbiusReserve = isToken0Wpls ? reserves[1] : reserves[0]
    if (typeof morbiusReserve === 'bigint' && typeof wplsReserve === 'bigint') {
      const amountIn = getAmountInV2(morbiusCost, wplsReserve, morbiusReserve)
      if (amountIn != null && amountIn > BigInt(0)) {
        return { plsValue: amountIn, basePlsQuote: amountIn, hasQuote: true, usingFallback: false, source: 'reserves' }
      }
    }
  }

  // Priority 2: DexScreener API (spot ratio, no fee — close enough as a fallback)
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

  const { data: token0 } = useReadContract({
    address: WPLS_MORBIUS_PAIR as Address,
    abi: PAIR_ABI,
    functionName: 'token0',
    query: { enabled, staleTime: Infinity },
  })

  // placeholderData keeps the previous reserves while a refetch is in flight so
  // the deposit CTA never blanks out between refreshes.
  const {
    data: reserves,
    error: reservesError,
    isLoading: isLoadingReserves,
  } = useReadContract({
    address: WPLS_MORBIUS_PAIR as Address,
    abi: PAIR_ABI,
    functionName: 'getReserves',
    query: {
      enabled,
      refetchInterval: 10000,
      retry: 3,
      retryDelay: 1000,
      placeholderData: (prev) => prev,
    },
  })

  // Last resort: DexScreener API, only fetched when the on-chain read fails
  const hasReserves = !!(reserves && token0)

  useEffect(() => {
    if (hasReserves || !enabled) return

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
  }, [hasReserves, enabled])

  const result = useMemo(() => {
    const sel = selectPlsQuote({
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
      isLoading: !sel.hasQuote && isLoadingReserves,
      error: (reservesError as Error | null) ?? null,
      hasQuote: sel.hasQuote,
      usingFallback: sel.usingFallback,
    }
  }, [morbiusCost, reserves, token0, isLoadingReserves, reservesError, dexScreenerPrice])

  return result
}
