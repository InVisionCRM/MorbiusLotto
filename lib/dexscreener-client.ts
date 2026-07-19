/**
 * Thin wrapper around the DexScreener public API. Centralizes URL construction
 * so all callers share the same endpoint shape; if we later move requests
 * server-side (CORS / rate-limit), only this file changes.
 *
 * Returns the raw `Response` — callers handle `.ok`, `.json()`, etc.
 */
export type DexScreenerKind = 'tokens' | 'pairs';

export interface DexScreenerProxyOptions {
  signal?: AbortSignal;
}

export function fetchDexScreenerProxy(
  kind: DexScreenerKind,
  address: string,
  opts: DexScreenerProxyOptions = {},
): Promise<Response> {
  // The pairs endpoint REQUIRES a chain segment (/latest/dex/pairs/{chain}/{pair});
  // without it DexScreener returns a 404 HTML page. Tokens does not take a chain.
  // All pair lookups in this app are PulseChain pairs.
  const url =
    kind === 'pairs'
      ? `https://api.dexscreener.com/latest/dex/pairs/pulsechain/${address}`
      : `https://api.dexscreener.com/latest/dex/tokens/${address}`;
  return fetch(url, { signal: opts.signal });
}
