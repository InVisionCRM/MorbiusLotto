/** Default felt logo when no active paid sponsorship (must match server). */
export const POKER_DEFAULT_TABLE_LOGO_FILENAME = 'MorbiusLogo (3).png';

export const POKER_TABLE_LOGO_PUBLIC_PREFIX = '/Logos/';

/** Same asset as default table logo; URL-encoded for `<img src>` / share export. */
export const POKER_MORBIUS_SHARE_LOGO_PUBLIC_URL = `${POKER_TABLE_LOGO_PUBLIC_PREFIX}MorbiusLogo%20(3).png` as const;

/** Paid sponsorship window (must match server). */
export const POKER_TABLE_LOGO_SPONSOR_WINDOW_MS = 10 * 60 * 1000;
