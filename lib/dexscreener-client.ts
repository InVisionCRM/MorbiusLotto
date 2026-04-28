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
  const url = `https://api.dexscreener.com/latest/dex/${kind}/${address}`;
  return fetch(url, { signal: opts.signal });
}
