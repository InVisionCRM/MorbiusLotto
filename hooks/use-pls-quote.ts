import { useMemo } from 'react'
import { useReadContract } from 'wagmi'
import type { Address } from 'viem'
import {
  WPLS_TOKEN_ADDRESS,
  WPLS_MORBIUS_PAIR,
  MORBIUS_TOKEN_ADDRESS,
} from '@/lib/contracts'

// A UniswapV2 pair sorts its two tokens on creation, so token0 is deterministically
// the lower address. We still read token0 on-chain, but fall back to this constant so
// a single failed token0 read can never permanently block the quote: the reserves read
// self-heals on its 10s poll, whereas token0 (staleTime: Infinity) has no recovery, and
// without orientation the quote stays "unavailable" forever even while reserves succeed.
const SORTED_TOKEN0 =
  WPLS_TOKEN_ADDRESS.toLowerCase() < MORBIUS_TOKEN_ADDRESS.toLowerCase()
    ? WPLS_TOKEN_ADDRESS
    : MORBIUS_TOKEN_ADDRESS

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
}

// The quote comes straight from PulseX: the WPLS/MORBIUS pair's getReserves
// plus the exact UniswapV2 getAmountIn formula (0.3% fee). The PulseX router's
// getAmountsIn was verified on-chain to revert with ds-math-sub-underflow for
// ANY amount on this pair (both router deployments), so it is not used —
// quoting from the pair reserves is byte-for-byte the same math a working
// router would do. There is deliberately NO off-chain price fallback: if the
// wallet cannot reach the RPC to read the pool, it cannot send the deposit
// transaction either, so an off-chain price would only invite bad sends.
//
// No markup is applied. The PLS deposit is a REAL PulseX swap
// (swapExactETHForTokens → MORBIUS delivered to the MorbiusVault), so this
// quote is exactly what the router will charge at current reserves; the swap's
// amountOutMin (set by the caller) guards against price movement in flight.

export interface PlsQuoteInputs {
  /** WPLS/MORBIUS pair getReserves result, if it resolved. */
  reserves: readonly [bigint, bigint, number] | readonly bigint[] | undefined
  /** Pair token0 address, needed to orient the reserves. */
  token0: string | undefined
  morbiusCost: bigint
  wplsAddress: string
}

export interface PlsQuoteSelection {
  plsValue: bigint
  basePlsQuote: bigint
  hasQuote: boolean
  source: 'reserves' | 'none'
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
 * Pure quote selection from the PulseX pair reserves (exact router math).
 * Extracted from the hook so the decision logic is unit-testable without
 * wagmi/react-query. Returns hasQuote:false (zero value) when the pool data
 * is unavailable or cannot satisfy the request, which callers MUST treat as
 * "block the transaction".
 */
export function selectPlsQuote(inputs: PlsQuoteInputs): PlsQuoteSelection {
  const { reserves, token0, morbiusCost, wplsAddress } = inputs

  if (reserves && token0 && morbiusCost > BigInt(0)) {
    const isToken0Wpls = token0.toLowerCase() === wplsAddress.toLowerCase()
    const wplsReserve = isToken0Wpls ? reserves[0] : reserves[1]
    const morbiusReserve = isToken0Wpls ? reserves[1] : reserves[0]
    if (typeof morbiusReserve === 'bigint' && typeof wplsReserve === 'bigint') {
      const amountIn = getAmountInV2(morbiusCost, wplsReserve, morbiusReserve)
      if (amountIn != null && amountIn > BigInt(0)) {
        return { plsValue: amountIn, basePlsQuote: amountIn, hasQuote: true, source: 'reserves' }
      }
    }
  }

  // No usable pool data — zero value blocks the transaction.
  return { plsValue: BigInt(0), basePlsQuote: BigInt(0), hasQuote: false, source: 'none' }
}

export function usePlsQuote({
  morbiusCost,
  enabled = true,
}: UsePlsQuoteParams): UsePlsQuoteReturn {
  const { data: token0 } = useReadContract({
    address: WPLS_MORBIUS_PAIR as Address,
    abi: PAIR_ABI,
    functionName: 'token0',
    query: { enabled, staleTime: Infinity, retry: 5, retryDelay: 1500 },
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

  const result = useMemo(() => {
    const sel = selectPlsQuote({
      reserves: reserves as readonly [bigint, bigint, number] | undefined,
      // Fall back to the deterministic sorted token0 so a failed token0 read never
      // strands the quote — reserves alone are then enough to price the deposit.
      token0: (token0 as string | undefined) ?? SORTED_TOKEN0,
      morbiusCost,
      wplsAddress: WPLS_TOKEN_ADDRESS,
    })

    return {
      plsValue: sel.plsValue,
      basePlsQuote: sel.basePlsQuote,
      // Only report loading while we genuinely have no quote to show — a
      // background refetch of an existing quote must not disable the CTA.
      isLoading: !sel.hasQuote && isLoadingReserves,
      error: (reservesError as Error | null) ?? null,
      hasQuote: sel.hasQuote,
    }
  }, [morbiusCost, reserves, token0, isLoadingReserves, reservesError])

  return result
}
