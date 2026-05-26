/**
 * When NEXT_PUBLIC_WEBSOCKET_URL points at a different host than the frontend
 * (e.g. morbius.io → morbiuslotto-production.up.railway.app), httpOnly
 * morb_session cookies are not sent on the WS upgrade. After SIWE on the
 * same-origin proxy, fetch a session token and pass ?session= on the WS URL.
 */

function wsHost(serverUrl: string): string | null {
  try {
    const normalized = serverUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
    return new URL(normalized).host;
  } catch {
    return null;
  }
}

/** True when the WS server is on a different host than the page (Railway, etc.). */
export function wsUrlNeedsSessionQuery(serverUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  const host = wsHost(serverUrl);
  return !!host && host !== window.location.host;
}

/** Read morb_session via same-origin /api/auth/ws-token (cookie forwarded by proxy). */
export async function fetchWsSessionToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/auth/ws-token', { credentials: 'include' });
    if (!res.ok) return null;
    const j = (await res.json()) as { token?: string };
    return typeof j.token === 'string' && j.token.length > 0 ? j.token : null;
  } catch {
    return null;
  }
}

export async function buildWebSocketConnectUrl(
  serverUrl: string,
  playerAddress?: string,
): Promise<string> {
  const base = serverUrl.replace(/\/$/, '');
  const params = new URLSearchParams();
  if (playerAddress) params.set('address', playerAddress);

  if (wsUrlNeedsSessionQuery(serverUrl)) {
    const token = await fetchWsSessionToken();
    if (token) params.set('session', token);
  }

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
