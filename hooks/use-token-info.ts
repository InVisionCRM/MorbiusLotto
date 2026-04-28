'use client';

import { useEffect, useState } from 'react';
import { fetchDexScreenerProxy } from '@/lib/dexscreener-client';

export interface TokenInfo {
  name: string;
  symbol: string;
  logoUrl: string | null;
}

const tokenInfoCache: Record<string, TokenInfo> = {};

/**
 * Fetch token name, symbol, and logo from PulseScan API (with DexScreener fallback for logo).
 * Same logic used when displaying tournaments with custom prize tokens.
 */
export function useTokenInfo(address?: string | null): TokenInfo | null {
  const [info, setInfo] = useState<TokenInfo | null>(
    address ? tokenInfoCache[address] ?? null : null
  );

  useEffect(() => {
    if (!address) return;
    if (tokenInfoCache[address]) {
      setInfo(tokenInfoCache[address]);
      return;
    }
    let cancelled = false;
    (async () => {
      let name = 'Unknown';
      let symbol = '???';
      let logoUrl: string | null = null;
      try {
        const res = await fetch(`https://api.scan.pulsechain.com/api/v2/tokens/${address}`);
        const data = await res.json();
        if (data.name) name = data.name;
        if (data.symbol) symbol = data.symbol;
        if (data.icon_url) logoUrl = data.icon_url;
      } catch { /* ignore */ }
      if (!logoUrl) {
        try {
          const res = await fetchDexScreenerProxy('tokens', address);
          const data = await res.json();
          const img = data.pairs?.[0]?.info?.imageUrl;
          if (img) logoUrl = img;
        } catch { /* ignore */ }
      }
      const result = { name, symbol, logoUrl };
      tokenInfoCache[address] = result;
      if (!cancelled) setInfo(result);
    })();
    return () => { cancelled = true; };
  }, [address]);

  return info;
}
