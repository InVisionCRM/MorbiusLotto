'use client';

import { useEffect, useState } from 'react';
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';

interface DexScreenerPair {
  baseToken?: { address?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
}

interface DexScreenerResponse {
  pairs?: DexScreenerPair[];
}

const priceCache: Record<string, number | null> = {};

/**
 * Fetch token price in USD from DexScreener API.
 * Uses the pair with highest liquidity where baseToken matches the token.
 */
export function useTokenPriceUsd(address?: string | null): number | null {
  const tokenAddress = address ?? MORBIUS_TOKEN_ADDRESS;
  const [price, setPrice] = useState<number | null>(
    priceCache[tokenAddress.toLowerCase()] ?? null
  );

  useEffect(() => {
    if (!tokenAddress) {
      setPrice(null);
      return;
    }
    const key = tokenAddress.toLowerCase();
    if (priceCache[key] !== undefined) {
      setPrice(priceCache[key]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
        );
        const data: DexScreenerResponse = await res.json();
        const pairs = data.pairs ?? [];
        const normalizedAddr = tokenAddress.toLowerCase();
        const tokenPairs = pairs
          .filter(
            (p) =>
              p.baseToken?.address?.toLowerCase() === normalizedAddr &&
              p.priceUsd
          )
          .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
        const best = tokenPairs[0];
        const priceUsd = best ? parseFloat(best.priceUsd!) : null;
        priceCache[key] = priceUsd;
        if (!cancelled) setPrice(priceUsd);
      } catch {
        priceCache[key] = null;
        if (!cancelled) setPrice(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenAddress]);

  return price;
}

/** Fetch prices for multiple tokens. Returns map of address (lowercase) -> priceUsd */
export function useTokenPrices(addresses: (string | null | undefined)[]): Record<string, number | null> {
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const addressesKey =
    addresses.length === 0
      ? ''
      : [...new Set(addresses.filter(Boolean).map((a) => (a as string).toLowerCase()))].sort().join(',');

  useEffect(() => {
    const unique = [...new Set(addresses.filter(Boolean))] as string[];
    if (unique.length === 0) {
      setPrices({});
      return;
    }
    let cancelled = false;
    const result: Record<string, number | null> = {};
    Promise.all(
      unique.map(async (addr) => {
        const key = addr.toLowerCase();
        if (priceCache[key] !== undefined) {
          result[key] = priceCache[key];
          return;
        }
        try {
          const res = await fetch(
            `https://api.dexscreener.com/latest/dex/tokens/${addr}`
          );
          const data: DexScreenerResponse = await res.json();
          const pairs = data.pairs ?? [];
          const normalizedAddr = addr.toLowerCase();
          const tokenPairs = pairs
            .filter(
              (p) =>
                p.baseToken?.address?.toLowerCase() === normalizedAddr &&
                p.priceUsd
            )
            .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
          const best = tokenPairs[0];
          const priceUsd = best ? parseFloat(best.priceUsd!) : null;
          priceCache[key] = priceUsd;
          result[key] = priceUsd;
        } catch {
          priceCache[key] = null;
          result[key] = null;
        }
      })
    ).then(() => {
      if (!cancelled) setPrices(result);
    });
    return () => {
      cancelled = true;
    };
  }, [addressesKey]);

  return prices;
}
