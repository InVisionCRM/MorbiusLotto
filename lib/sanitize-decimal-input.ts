/**
 * Strip locale grouping / invisible separators so viem `parseEther` / `parseUnits` accept the string.
 * `toLocaleString()` may insert: comma, apostrophe, regular spaces, NBSP, narrow NBSP, thin space, etc.
 */
export function sanitizeDecimalStringForParseEther(raw: string): string {
  return raw
    .trim()
    .replace(/[\s\u00a0\u202f\u2007\u2009\u2008\u2003,\u0027\u2019'`_]/g, '');
}
