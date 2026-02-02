/**
 * Central place for API and WebSocket base URLs.
 * No fallbacks: set these in your deployment environment or the app will throw.
 *   NEXT_PUBLIC_API_URL
 *   NEXT_PUBLIC_WEBSOCKET_URL
 *   NEXT_PUBLIC_BLACKJACK_SERVER_URL
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required env: ${name}. Set it in your deployment (e.g. Vercel / .env.local).`
    );
  }
  return value.trim();
}

export function getApiUrl(): string {
  return requireEnv('NEXT_PUBLIC_API_URL');
}

export function getWebSocketUrl(): string {
  return requireEnv('NEXT_PUBLIC_WEBSOCKET_URL');
}

export function getBlackjackServerUrl(): string {
  return requireEnv('NEXT_PUBLIC_BLACKJACK_SERVER_URL');
}
