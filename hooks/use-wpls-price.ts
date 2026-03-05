'use client'

import { useState, useEffect, useRef } from 'react'
import { useReadContract } from 'wagmi'
import { WPLS_MORBIUS_PAIR, WPLS_TOKEN_ADDRESS, MORBIUS_TOKEN_ADDRESS, TOKEN_DECIMALS } from '@/lib/contracts'

// PulseX Pair ABI (V1/V2 compatible) - only the functions we need
const PAIR_ABI = [
  {
    inputs: [],
    name: 'getReserves',
    outputs: [
      { internalType: 'uint112', name: '_reserve0', type: 'uint112' },
      { internalType: 'uint112', name: '_reserve1', type: 'uint112' },
      { internalType: 'uint32', name: '_blockTimestampLast', type: 'uint32' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token0',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token1',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// WPLS/token Pair Address on PulseX (MORBIUS)
const WPLS_ADDRESS = WPLS_TOKEN_ADDRESS
const MORBIUS_ADDRESS = MORBIUS_TOKEN_ADDRESS

interface DexScreenerPair {
  priceUsd?: string
  priceNative?: string
  liquidity?: {
    usd?: number
    base?: number
    quote?: number
  }
  volume?: {
    h24?: number
  }
}

interface DexScreenerResponse {
  pairs?: DexScreenerPair[]
}

/**
 * Hook to fetch WPLS/MORBIUS price
 * Primary: Uses PulseX V1 liquidity pool reserves (MORBIUS is on V1)
 * Fallback: DexScreener API
 */
export function useWplsPrice() {
  const [priceFromDex, setPriceFromDex] = useState<bigint | null>(null)
  const [isLoadingDex, setIsLoadingDex] = useState(false)
  const [dexError, setDexError] = useState<string | null>(null)

  // Fetch token0 address
  const { data: token0 } = useReadContract({
    address: WPLS_MORBIUS_PAIR as `0x${string}`,
    abi: PAIR_ABI,
    functionName: 'token0',
  })

  // Fetch reserves from the pair
  const { data: reserves, isLoading: isLoadingReserves, error: reservesError, dataUpdatedAt } = useReadContract({
    address: WPLS_MORBIUS_PAIR as `0x${string}`,
    abi: PAIR_ABI,
    functionName: 'getReserves',
    query: {
      refetchInterval: 10000, // Refetch every 10 seconds for fresher prices
    },
  })

  // Fetch from DexScreener as fallback
  useEffect(() => {
    const fetchDexScreenerPrice = async () => {
      setIsLoadingDex(true)
      setDexError(null)
      try {
        const response = await fetch(
          `https://api.dexscreener.com/latest/dex/pairs/pulsechain/${WPLS_MORBIUS_PAIR}`
        )
        if (!response.ok) {
          throw new Error(`DexScreener API error: ${response.status}`)
        }
        const data: DexScreenerResponse = await response.json()
        if (data.pairs && data.pairs.length > 0 && data.pairs[0].priceNative) {
          // priceNative is the price in terms of the quote token
          // We need to calculate WPLS amount needed for 1 MORBIUS
          const price = parseFloat(data.pairs[0].priceNative)
          // Convert to bigint (with 18 decimals for WPLS)
          const priceInWei = BigInt(Math.floor(price * 1e18))
          setPriceFromDex(priceInWei)
        } else {
          setDexError('No price data available from DexScreener')
        }
      } catch (error) {
        console.error('Error fetching from DexScreener:', error)
        setDexError(error instanceof Error ? error.message : 'Unknown error')
      } finally {
        setIsLoadingDex(false)
      }
    }

    // Only fetch from DexScreener if we don't have reserves or there's an error
    if (reservesError || !reserves) {
      fetchDexScreenerPrice()
    }
  }, [reserves, reservesError])

  // Calculate price from reserves
  let wplsPerMORBIUS: bigint | null = null
  let source: 'pulsex' | 'dexscreener' | null = null

  if (reserves && token0) {
    const reserve0 = reserves[0]
    const reserve1 = reserves[1]

    // Determine which reserve is which token
    const isToken0Wpls = token0.toLowerCase() === WPLS_ADDRESS.toLowerCase()

    const wplsReserve = isToken0Wpls ? reserve0 : reserve1
    const MORBIUSReserve = isToken0Wpls ? reserve1 : reserve0

    if (MORBIUSReserve > BigInt(0)) {
      // Calculate WPLS per MORBIUS token (wei per base unit)
      const decimalFactor = BigInt(10) ** BigInt(TOKEN_DECIMALS)
      wplsPerMORBIUS = (BigInt(wplsReserve) * decimalFactor) / BigInt(MORBIUSReserve)
      source = 'pulsex'
    }
  }

  // Fallback to DexScreener if no reserves available
  if (!wplsPerMORBIUS && priceFromDex) {
    wplsPerMORBIUS = priceFromDex
    source = 'dexscreener'
  }

  // Human-readable rate: how many MORBIUS you get per 1 PLS
  const morbiusPerPLS = wplsPerMORBIUS && wplsPerMORBIUS > BigInt(0)
    ? Number(BigInt(10) ** BigInt(36) / wplsPerMORBIUS) / 1e18
    : null

  return {
    wplsPerMORBIUS, // Amount of WPLS (in wei) needed to get 1 MORBIUS (in base units)
    morbiusPerPLS,  // Human-readable: how many MORBIUS per 1 PLS
    isLoading: isLoadingReserves || isLoadingDex,
    error: reservesError || dexError,
    source,
    lastUpdated: dataUpdatedAt || 0,
  }
}

/**
 * Calculate WPLS amount needed for a given MORBIUS amount
 * Includes tax and slippage buffer
 */
export function calculateWplsAmount(
  tokenAmount: bigint,
  wplsPerToken: bigint | null,
  bufferPercent: number = 11.1, // tax + slippage + buffer
  tokenDecimals: number = TOKEN_DECIMALS
): bigint {
  if (!wplsPerToken) {
    // No price available — return 0 to block the transaction rather than guess
    return BigInt(0)
  }

  // Convert token amount (tokenDecimals) to WPLS amount (18 decimals)
  const divisor = BigInt(10) ** BigInt(tokenDecimals)
  const baseWpls = (tokenAmount * wplsPerToken) / divisor

  // Add buffer for tax and slippage
  const buffer = BigInt(Math.floor(bufferPercent * 100)) // 1110 for 11.1%
  const wplsWithBuffer = (baseWpls * (BigInt(10000) + buffer)) / BigInt(10000)

  return wplsWithBuffer
}
