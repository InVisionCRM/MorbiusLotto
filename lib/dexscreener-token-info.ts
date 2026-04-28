/**
 * Shared DexScreener fetcher for the poker token-spotlight feature.
 * Trust-the-client: results flow into a sponsorship purchase or render directly.
 */

import { fetchDexScreenerProxy } from '@/lib/dexscreener-client';

export interface DexscreenerSocials {
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
}

export interface DexscreenerTokenInfo {
  address: string;
  name: string;
  symbol: string;
  logoUrl: string | null;
  socials: DexscreenerSocials;
  websites: string[];
}

const ETH_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Build the canonical scan.morbius.io chart link for a given token address.
 */
export function buildScanMorbiusLink(address: string): string {
  return `https://scan.morbius.io/geicko?address=${address}&tab=chart`;
}

export async function fetchDexScreenerTokenInfo(
  rawAddress: string,
  signal?: AbortSignal,
): Promise<DexscreenerTokenInfo | null> {
  const address = rawAddress.trim().toLowerCase();
  if (!ETH_ADDR_RE.test(address)) return null;

  const res = await fetchDexScreenerProxy('tokens', address, { signal });
  if (!res.ok) return null;
  const data = await res.json();
  const pairs: any[] = Array.isArray(data?.pairs) ? data.pairs : [];
  if (pairs.length === 0) return null;

  // Pick the pair where our token is the base (matters for name/symbol accuracy).
  const pair =
    pairs.find((p) => String(p?.baseToken?.address ?? '').toLowerCase() === address) ?? pairs[0];

  const baseToken = pair?.baseToken ?? {};
  const info = pair?.info ?? {};

  const socials: DexscreenerSocials = { twitter: null, telegram: null, discord: null };
  if (Array.isArray(info?.socials)) {
    for (const s of info.socials) {
      const type = String(s?.type ?? '').toLowerCase();
      const url = typeof s?.url === 'string' ? s.url : null;
      if (!url) continue;
      if (type === 'twitter' && !socials.twitter) socials.twitter = url;
      else if (type === 'telegram' && !socials.telegram) socials.telegram = url;
      else if (type === 'discord' && !socials.discord) socials.discord = url;
    }
  }

  const websites: string[] = Array.isArray(info?.websites)
    ? info.websites.map((w: any) => (typeof w?.url === 'string' ? w.url : '')).filter(Boolean)
    : [];

  return {
    address,
    name: String(baseToken.name ?? 'Unknown').trim() || 'Unknown',
    symbol: String(baseToken.symbol ?? '???').trim() || '???',
    logoUrl: typeof info.imageUrl === 'string' ? info.imageUrl : null,
    socials,
    websites,
  };
}
