/**
 * Central place for API and WebSocket base URLs.
 * Set in your deployment (e.g. Vercel project settings, Railway variables).
 *   NEXT_PUBLIC_API_URL — required for core Blackjack; optional for Top Players (getApiUrlOptional).
 *   NEXT_PUBLIC_WEBSOCKET_URL
 *   NEXT_PUBLIC_BLACKJACK_SERVER_URL
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing ${name}. Add it in Vercel (frontend): Settings → Environment Variables. Then redeploy — Next.js embeds NEXT_PUBLIC_* at build time, so a new build is required after adding it. Railway env does not apply to the Next.js app.`
    );
  }
  return value.trim();
}

export function getApiUrl(): string {
  return requireEnv('NEXT_PUBLIC_API_URL');
}

/** Returns API base URL or null if not set. Use for features that can degrade when backend is unavailable (e.g. Top Players). */
export function getApiUrlOptional(): string | null {
  const value = process.env.NEXT_PUBLIC_API_URL;
  if (!value || value.trim() === '') return null;
  return value.trim();
}

export function getWebSocketUrl(): string {
  return requireEnv('NEXT_PUBLIC_WEBSOCKET_URL');
}

/** Returns WebSocket URL or null if not set. Use when chat is optional so the app doesn't throw on load. */
export function getWebSocketUrlOptional(): string | null {
  const value = process.env.NEXT_PUBLIC_WEBSOCKET_URL;
  if (!value || value.trim() === '') return null;
  return value.trim();
}

/** Blackjack backend URL. Falls back to API URL when not set (same backend). */
export function getBlackjackServerUrl(): string {
  const v = process.env.NEXT_PUBLIC_BLACKJACK_SERVER_URL;
  if (v != null && v.trim() !== '') return v.trim();
  const api = getApiUrlOptional();
  if (api) return api;
  return requireEnv('NEXT_PUBLIC_API_URL');
}
